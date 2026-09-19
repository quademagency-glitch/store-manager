"""Chromium screen acceptance with controlled responses; SQL invariants run separately."""
import json, os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
BASE=os.environ.get('CHECKOUT_TEST_URL','http://127.0.0.1:5189')
OUT=Path('/private/tmp/quaderp-wallet-receiving');OUT.mkdir(exist_ok=True)
results=[]
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True)
 page=browser.new_page(viewport={'width':1440,'height':1000})
 page.goto(BASE+'/loyalty',wait_until='networkidle')
 page.evaluate("""async()=>{
   const {api}=await import('/src/lib/api.js');const original=api.post;window.walletRequests=[];
   api.post=async(endpoint,body)=>{if(endpoint==='/loyalty/gift-cards'){window.walletRequests.push(structuredClone(body));throw new Error('Controlled lost response');}return original(endpoint,body);};
 }""")
 page.get_by_role('tab',name='Gift Cards',exact=True).click()
 page.get_by_label('Funding',exact=True).select_option('cash')
 page.get_by_label('Amount',exact=True).fill('25')
 page.get_by_role('button',name='Issue Card',exact=True).click()
 expect(page.get_by_role('button',name='Resume saved financial action (25)',exact=True)).to_be_visible()
 payload=page.evaluate('JSON.parse(JSON.stringify(window.walletRequests[0]))')
 assert payload['funding']=='cash' and payload['amount']==25 and payload['operation_id']
 results.append('Gift purchase captures funding and a durable operation reference')
 page.reload(wait_until='networkidle')
 expect(page.get_by_role('button',name='Resume saved financial action (25)',exact=True)).to_be_visible()
 results.append('Unconfirmed wallet operation remains visible after reload')
 page.screenshot(path=str(OUT/'wallet-recovery.png'),full_page=True)
 # Verify the resumed payload before the component reloads to refresh balances.
 page.evaluate("""async()=>{const {api}=await import('/src/lib/api.js');api.post=async(endpoint,body)=>{sessionStorage.setItem('wallet-resumed',JSON.stringify(body));return {card:{code:'TEST-GIFT',current_balance:25}};};}""")
 page.get_by_role('button',name='Resume saved financial action (25)',exact=True).click()
 page.wait_for_function("sessionStorage.getItem('wallet-resumed') !== null")
 expect(page.get_by_role('button',name='Resume saved financial action (25)',exact=True)).to_have_count(0)
 assert json.loads(page.evaluate("sessionStorage.getItem('wallet-resumed')"))==payload
 results.append('Wallet retry after reload submits exactly the original amount and reference')
 page.goto(BASE+'/purchase-orders',wait_until='networkidle')
 page.evaluate("""async()=>{
   const {api}=await import('/src/lib/api.js');const get=api.get,post=api.post;
   const po={id:'10000000-0000-4000-8000-000000000010',po_number:'PO-TEST-RECEIVE',status:'sent',created_at:'2026-09-19T12:00:00Z',supplier:{name:'Local Test Supplier'},items:[{id:'10000000-0000-4000-8000-000000000011',product_id:'p1',quantity:4,received_quantity:0,unit_cost:20,product:{name:'Test goods',sku:'TEST'}}]};
   window.receivingRequests=[];sessionStorage.setItem('receiving-po',JSON.stringify(po));
   api.get=async endpoint=>endpoint.startsWith('/purchase-orders?')?{data:[po],total:1,page:1,totalPages:1}:endpoint===`/purchase-orders/${po.id}`?po:get(endpoint);
   api.post=async(endpoint,body)=>{if(endpoint.endsWith('/receive')){window.receivingRequests.push(structuredClone(body));sessionStorage.setItem('receiving-original',JSON.stringify(body));if(window.receivingRequests.length===1)throw new Error('Controlled delivery response loss');return {message:'Goods received',purchase_order:{...po,status:'received'},received_items:[{product_id:'p1',quantity:4,unit_cost:20}],grn_data:{po_number:po.po_number,supplier_name:po.supplier.name}};}return post(endpoint,body);};
 }""")
 page.get_by_role('button',name='Sent',exact=True).click()
 page.get_by_role('button',name='Receive',exact=True).first.click()
 expect(page.get_by_role('heading',name='Receive Goods: PO-TEST-RECEIVE')).to_be_visible()
 quantity=page.get_by_label('Receive quantity for Test goods',exact=True)
 expect(quantity).to_have_value('4')
 expect(page.get_by_label('Receive to Location',exact=False)).to_have_value('mock-loc')
 page.get_by_role('button',name='Receive 1 Item(s)',exact=True).click()
 expect(page.get_by_role('button',name='Retry same delivery',exact=True)).to_be_visible()
 expect(quantity).to_be_disabled()
 results.append('Unconfirmed delivery locks quantities and selected branch for an exact retry')
 page.screenshot(path=str(OUT/'receiving-retry.png'),full_page=True)
 page.reload(wait_until='networkidle')
 page.evaluate("""async()=>{
   const {api}=await import('/src/lib/api.js');const get=api.get;
   const po=JSON.parse(sessionStorage.getItem('receiving-po'));po.status='received';po.items[0].received_quantity=4;
   api.get=async endpoint=>endpoint===`/purchase-orders/${po.id}`?po:get(endpoint);
   api.post=async(endpoint,body)=>{sessionStorage.setItem('receiving-resumed',JSON.stringify(body));return {message:'Goods received',purchase_order:po,received_items:[{product_id:'p1',quantity:4,unit_cost:20}],grn_data:{po_number:po.po_number,supplier_name:po.supplier.name}};};
 }""")
 page.get_by_role('button',name='Resume delivery',exact=False).click()
 expect(page.get_by_role('heading',name='Receive Goods: PO-TEST-RECEIVE')).to_be_visible()
 results.append('Saved delivery remains resumable after reload when its order is already received')
 page.get_by_role('button',name='Retry same delivery',exact=True).click()
 expect(page.get_by_role('heading',name='Receive Goods: PO-TEST-RECEIVE')).to_have_count(0)
 calls=page.evaluate("[JSON.parse(sessionStorage.getItem('receiving-original')),JSON.parse(sessionStorage.getItem('receiving-resumed'))]")
 assert calls[0]==calls[1] and calls[0]['operation_id']
 results.append('Receiving retry keeps one delivery reference and identical quantities')
 page.screenshot(path=str(OUT/'receiving-confirmed.png'),full_page=True)
 page.evaluate("""async()=>{
   const {api}=await import('/src/lib/api.js');const get=api.get;
   window.reviewRows=[{kind:'cost',record_id:'10000000-0000-4000-8000-000000000021',location_id:'mock-loc',reference:'RCPT-TEST-COST',reason:'Historical unit cost is missing or estimated',amount:15}];
   api.get=async endpoint=>endpoint.startsWith('/financial-reviews?')?{data:window.reviewRows,total:window.reviewRows.length,totalPages:1}:endpoint.startsWith('/financial-reviews/cost/')?[]:get(endpoint);
   api.post=async(endpoint,body)=>{window.reviewSaved=structuredClone(body);window.reviewRows=[];return {id:'documented-review',action:body.action};};
 }""")
 page.get_by_role('button',name='Close',exact=True).last.click()
 page.get_by_role('button',name='Accounting',exact=True).click()
 page.get_by_role('button',name='Reconciliation',exact=True).click()
 expect(page.get_by_text('RCPT-TEST-COST',exact=True)).to_be_visible()
 page.get_by_role('button',name='Review',exact=True).click()
 page.get_by_label('Review action',exact=True).select_option('confirm_cost')
 page.get_by_label('Actual unit cost',exact=True).fill('20')
 page.get_by_label('Evidence reference',exact=True).fill('TEST-PO-RECEIPT')
 page.get_by_label('What was verified or remains missing?',exact=True).fill('Verified against the original purchase receipt.')
 page.screenshot(path=str(OUT/'cost-evidence-review.png'),full_page=True)
 page.get_by_role('button',name='Save documented review',exact=True).click()
 expect(page.get_by_role('heading',name='Review financial evidence',exact=True)).to_have_count(0)
 review=page.evaluate('window.reviewSaved')
 assert review['values']['unit_cost']==20 and review['evidence']=='TEST-PO-RECEIPT' and review['operation_id']
 expect(page.get_by_text('RCPT-TEST-COST',exact=True)).to_have_count(0)
 results.append('Historical cost review records evidence and an identified correction, then refreshes exceptions')
 browser.close()
print(json.dumps({'browser':'Chromium','passed':len(results),'checks':results,'evidence':str(OUT)},indent=2))
