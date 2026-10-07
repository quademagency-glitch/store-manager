// Synthetic workflow fixtures only. Database tests validate the actual transaction rules.
const date = '2026-07-31T12:00:00.000Z';
const sessions=[];
const results=new Map();
const cash={cash_sales:0,cash_in:0,cash_out:0,cash_refunds:0,card_recorded:0,momo_recorded:0};
const bills=[];
export function resolveRetailMock(path,method,body={},fixtures) {
  if (path==='/till-sessions') {
    if(method==='GET') return {sessions:structuredClone(sessions),snapshot:{...cash}};
    if(results.has(body.operation_id)) return results.get(body.operation_id);
    let row=sessions.find(session=>session.id===body.session_id);
    if(body.action==='open') {row={id:crypto.randomUUID(),register_name:body.register_name,opening_float:body.opening_float,opening_snapshot:{...cash},status:'open',opened_at:date,opener:{name:'Ama Mensah'}};sessions.unshift(row);}
    if(body.action==='cash_in') cash.cash_in+=body.amount;
    if(body.action==='cash_out') cash.cash_out+=body.amount;
    if(body.action==='close' && row) {const expected=row.opening_float+cash.cash_sales-row.opening_snapshot.cash_sales+cash.cash_in-row.opening_snapshot.cash_in-cash.cash_out+row.opening_snapshot.cash_out-cash.cash_refunds+row.opening_snapshot.cash_refunds;Object.assign(row,{status:'closed',closed_at:date,counted_cash:body.counted_cash,expected_cash:expected,variance:body.counted_cash-expected,closing_note:body.note,closer:{name:'Ama Mensah'}});}
    if(body.action==='review' && row) Object.assign(row,{status:'reviewed',review_note:body.note,reviewed_at:date,reviewer:{name:'Ama Mensah'}});
    results.set(body.operation_id,structuredClone(row));return row;
  }
  if(path==='/inventory-analytics/summary') return {total_skus:6,total_inventory_value:5800,uncosted_count:0,below_reorder_count:1,stockout_count:0,by_category:[]};
  if(path==='/inventory-analytics/valuation') return {by_category:[],by_location:[],total_value:5800};
  if(path==='/inventory-analytics/turnover') return {products:[],period_days:30};
  if(path==='/inventory-analytics/dead-stock') return {products:[],count:0,total_value:0};
  if(path==='/inventory-analytics/reorder-suggestions') return {count:1,suggestions:[{product_id:'p6',name:'Gino Tomato Paste 400g',sku:'DEMO-009',current_stock:7,reorder_point:24,daily_sales_rate:2,suggested_quantity:45,unit_cost:12,estimated_cost:540,location:'Osu Branch',location_id:'mock-loc',preferred_supplier:{id:'s1',name:'Accra Wholesale Ltd'},urgency:'high'}]};
  const match=path.match(/^\/purchase-orders\/([^/]+)(?:\/(billing|bills))?$/);
  if(match && method==='GET') {
    if(match[2]==='billing') return {bills,received:3400,billed:bills.reduce((sum,bill)=>sum+bill.amount,0),paid:0,unbilled:3400-bills.reduce((sum,bill)=>sum+bill.amount,0)};
    return {...fixtures['/purchase-orders'].data.find(order=>order.id===match[1]),supplier_id:'s1',items:[{id:'poi1',product_id:'p6',product:{name:'Gino Tomato Paste 400g',sku:'DEMO-009'},quantity:10,received_quantity:10,unit_cost:340,total:3400}]};
  }
  if(match?.[2]==='bills' && method==='POST') {if(results.has(body.operation_id))return results.get(body.operation_id);const bill={id:crypto.randomUUID(),bill_number:`BILL-${bills.length+1}`,amount:body.amount,amount_paid:0,status:'open',purchase_order_id:match[1]};bills.push(bill);results.set(body.operation_id,bill);return bill;}
  if((path==='/purchase-orders' && method==='POST') || (match && method==='PUT')) {if(results.has(body.operation_id))return results.get(body.operation_id);const order={...body,id:match?.[1] || crypto.randomUUID(),po_number:'PO-TEST',status:'draft',created_at:date,total_amount:body.items.reduce((sum,item)=>sum+item.quantity*item.unit_cost,0),supplier:{name:'Accra Wholesale Ltd'}};fixtures['/purchase-orders'].data.unshift(order);const result={purchase_order:order};results.set(body.operation_id,result);return result;}
  return undefined;
}
