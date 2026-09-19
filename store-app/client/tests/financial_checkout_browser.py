"""Chromium UI integration with controlled API replies; no live tenant writes.
Start Vite with VITE_USE_MOCKS=true on 5189, then run this file with Python.
Real SQL transaction behavior is covered by checkout-transactions.db.cjs.
"""
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get('CHECKOUT_TEST_URL', 'http://127.0.0.1:5189')
OUT = Path(os.environ.get('CHECKOUT_EVIDENCE_DIR', '/private/tmp/quaderp-checkout-browser'))
OUT.mkdir(parents=True, exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width': 1440, 'height': 1000})
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(BASE + '/sales')
    page.wait_for_load_state('networkidle')
    expect(page.get_by_text('POS Terminal', exact=True)).to_be_visible()
    page.evaluate("""async () => {
      const {api}=await import('/src/lib/api.js');
      const get=api.get,post=api.post;
      const sale={id:'10000000-0000-4000-8000-000000000004',receipt_number:'TEST-SETTLED',status:'completed',
        settlement_id:'10000000-0000-4000-8000-000000000004',total_amount:90,tax_amount:10,created_at:'2026-09-19T12:00:00Z',
        customer:{name:'Adwoa Nyarko'},sale_items:[{id:'10000000-0000-4000-8000-000000000007',quantity:2,unit_price:50,product:{name:'Test item',sku:'TEST'}}],
        amount_paid:100,payment_method:'cash',cash_received:60,change_due:40,rewards_applied:30,store_credit_used:20,loyalty_value_used:10,return_status:'partial'};
      window.testRequests=[];window.testSale=sale;let settlements=0,returns=0;
      api.get=async endpoint=>{
        if(endpoint==='/loyalty/rules') return {active:true,point_value:0.1,min_points_to_redeem:1};
        if(endpoint.startsWith('/loyalty/store-credit/')) return {balance:20};
        if(endpoint.startsWith('/loyalty/balance/')) return {points:100};
        if(endpoint.startsWith('/sales/history')) return {data:[sale],total:1,totalPages:1};
        if(endpoint.startsWith('/returns/sale/')) return {...sale,sale_items:sale.sale_items.map(i=>({...i,line_total:90,line_tax:10,returned_quantity:1,returnable_quantity:1,tracked:true}))};
        return get(endpoint);
      };
      api.post=async (endpoint,body)=>{
        window.testRequests.push({endpoint,body:structuredClone(body)});
        if(endpoint==='/sales') return {sale:{id:sale.id,total_amount:90,status:'pending'}};
        if(endpoint.endsWith('/finalize')) {if(++settlements===1) throw new Error('Response lost after commit');return {sale};}
        if(endpoint==='/returns') {
          if(++returns===1) throw new Error('Return response lost after commit');
          return {return_id:'return-test',refund:{total_refund_amount:45,tax_refund_amount:5,payment_refund_amount:30,cash_refund_amount:30,
            credit_refund_amount:10,points_refund:50,points_refund_value:5,refund_method:'cash',reason:body.reason,created_at:'2026-09-19T13:00:00Z'},
            items:[{id:'returned-item',quantity:1,unit_price:50,refund_amount:45,product:{name:'Test item'}}]};
        }
        return post(endpoint,body);
      };
    }""")
    page.locator('.product-card').first.click()
    page.get_by_role('button', name='+ Customer', exact=True).click()
    page.get_by_placeholder('Search by phone or name...').fill('Adwoa')
    page.get_by_text('Adwoa Nyarko', exact=True).click()
    page.get_by_role('button', name='Scan QR', exact=True).click()
    page.get_by_role('button', name='[DEV] Simulate Scan', exact=True).click()
    page.get_by_role('button', name='Checkout', exact=True).click()
    expect(page.get_by_role('heading', name='Complete Payment', exact=True)).to_be_visible()
    page.get_by_label('Deposit Balance', exact=False).fill('20')
    page.get_by_label('Loyalty Points', exact=False).fill('100')
    tender=page.get_by_label('Amount Tendered', exact=False)
    tender.fill('59')
    expect(page.get_by_role('button', name='Finalize Sale')).to_be_disabled()
    page.get_by_text('Mobile money', exact=True).click()
    tender.fill('100')
    expect(page.get_by_role('button', name='Finalize Sale')).to_be_disabled()
    page.get_by_text('cash', exact=True).click()
    expect(page.get_by_role('button', name='Finalize Sale')).to_be_enabled()
    page.screenshot(path=str(OUT/'01-payment-rewards.png'), full_page=True, animations='disabled')
    page.get_by_role('button', name='Finalize Sale').click()
    expect(page.get_by_role('button', name='Retry same payment')).to_be_visible()
    expect(tender).to_be_disabled()
    page.screenshot(path=str(OUT/'02-payment-retry.png'), full_page=True, animations='disabled')
    page.get_by_role('button', name='Retry same payment').click()
    expect(page.get_by_role('heading', name='Transaction Details')).to_be_visible()
    expect(page.locator('#printable-receipt')).to_contain_text('40.00')
    expect(page.locator('#printable-receipt')).to_contain_text('60.00')
    page.screenshot(path=str(OUT/'03-settled-receipt.png'), full_page=True, animations='disabled')
    page.get_by_role('button', name='Close', exact=True).click()
    page.get_by_role('button', name='Sales Record', exact=True).click()
    page.get_by_role('button', name='TEST-SETTLED', exact=True).click()
    page.get_by_role('button', name='Process Return', exact=True).click()
    expect(page).to_have_url(BASE+'/returns?sale=10000000-0000-4000-8000-000000000004')
    expect(page.get_by_role('heading', name='Process Return')).to_be_visible()
    expect(page.get_by_text('2 purchased · 1 already returned · 1 remaining')).to_be_visible()
    quantity=page.get_by_label('Return quantity', exact=True)
    quantity.fill('9')
    expect(quantity).to_have_value('1')
    page.get_by_label('Test item unit 1 item code', exact=True).fill('ITEM-TEST-001')
    page.get_by_label('Reason for return', exact=True).fill('Wrong size')
    page.screenshot(path=str(OUT/'04-return-remaining.png'), full_page=True, animations='disabled')
    page.get_by_role('button', name='Record Return', exact=True).click()
    expect(page.get_by_role('button', name='Retry same return')).to_be_visible()
    expect(quantity).to_be_disabled()
    page.get_by_role('button', name='Retry same return').click()
    expect(page.get_by_text('Total refund: GH₵45.00')).to_be_visible()
    expect(page.get_by_text('Refund via cash: GH₵30.00')).to_be_visible()
    expect(page.get_by_text('Store credit restored: GH₵10.00', exact=False)).to_be_visible()
    page.screenshot(path=str(OUT/'05-refund-note.png'), full_page=True, animations='disabled')
    requests=page.evaluate('window.testRequests')
    settlements=[r for r in requests if r['endpoint'].endswith('/finalize')]
    returns=[r for r in requests if r['endpoint']=='/returns']
    assert len(settlements)==2 and settlements[0]==settlements[1]
    assert len(returns)==2 and returns[0]==returns[1]
    assert settlements[0]['body']['payment_method']=='cash'
    assert settlements[0]['body']['amount_paid']==100
    assert settlements[0]['body']['store_credit']==20
    assert settlements[0]['body']['points']==100
    assert not any(r['endpoint'].startswith('/loyalty') for r in requests)
    assert 'unit_price' not in returns[0]['body']['items'][0]
    assert returns[0]['body']['items'][0]['quantity']==1
    assert not errors, errors
    result={'checks': ['underpayment blocked','noncash overpayment blocked','final payment method submitted','atomic reward payload','same payment retried','committed receipt amounts','Sales Record return link','remaining return quantity','editable tracked scan','same return retried','committed refund breakdown','no runtime errors'], 'requests':requests,'errors':errors}
    (OUT/'results.json').write_text(json.dumps(result,indent=2))
    print(json.dumps({'passed':len(result['checks']),'evidence':str(OUT)}),flush=True)
    browser.close()
