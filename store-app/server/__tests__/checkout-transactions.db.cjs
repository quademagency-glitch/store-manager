// Destructive only inside an explicitly named, loopback-only disposable DB.
// TRANSACTION_TEST_DATABASE_URL=postgresql://.../quaderp_test_transactions node --test __tests__/checkout-transactions.db.cjs
const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID: uuid } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');
const connectionString = process.env.TRANSACTION_TEST_DATABASE_URL;
if (!connectionString) throw new Error('Set TRANSACTION_TEST_DATABASE_URL to an isolated loopback PostgreSQL database.');
const url = new URL(connectionString);
if (!['127.0.0.1','localhost','[::1]'].includes(url.hostname) || !url.pathname.startsWith('/quaderp_test_')) throw new Error('Refusing a non-local or non-test database.');
let db, ids;
const connect = async () => { const c = new Client({ connectionString }); await c.connect(); await c.query("SET statement_timeout='8s'"); return c; };
const q = (sql,args=[]) => db.query(sql,args);
const one = async (sql,args) => (await q(sql,args)).rows[0];
const num = async (sql,args) => Number(Object.values(await one(sql,args))[0]);
async function sale({ total=90, tax=10, qty=2, tracked=false, customer=true }={}) {
  const id=uuid(), item=uuid(), units=[];
  await q("INSERT INTO sales(id,business_id,location_id,salesperson_id,customer_id,total_amount,tax_amount,payment_method,status,receipt_number) VALUES($1,$2,$3,$4,$5,$6,$7,'cash','pending',$8)",[id,ids.biz,ids.loc,ids.user,customer?ids.customer:null,total,tax,'TEST-'+id]);
  await q('INSERT INTO sale_items(id,sale_id,product_id,business_id,quantity,unit_price) VALUES($1,$2,$3,$4,$5,50)',[item,id,ids.product,ids.biz,qty]);
  if (tracked) for(let i=0;i<qty;i++) { const unit=uuid(); units.push(unit); await q("INSERT INTO inventory_units(id,business_id,location_id,product_id,assigned_by,status,sold_in_sale_id) VALUES($1,$2,$3,$4,$5,'pending_sale',$6)",[unit,ids.biz,ids.loc,ids.product,ids.user,id]); }
  return {id,item,units};
}
function final(s, opts={}, c=db) {
  return c.query('SELECT finalize_sale_transaction($1,$2,$3,$4,$5,$6,$7,$8,$9) AS result',[
    opts.biz||ids.biz,opts.loc||ids.loc,ids.user,s.id,opts.key||s.id,opts.method||'cash',opts.paid??90,opts.credit??0,opts.points??0,
  ]).then(r=>r.rows[0].result);
}
function refund(s, opts={}, c=db) {
  return c.query('SELECT process_return_transaction($1,$2,$3,$4,$5,$6,$7) AS result',[
    opts.biz||ids.biz,opts.loc||ids.loc,ids.user,s.id,opts.key||uuid(),JSON.stringify(opts.items||[{sale_item_id:s.item,quantity:opts.qty??1,unit_ids:opts.units||[]}]),opts.reason||'Test return',
  ]).then(r=>r.rows[0].result);
}
const cancel=(s,c=db)=>c.query('SELECT cancel_pending_sale($1) AS result',[s.id]).then(r=>r.rows[0].result);
async function race(table,id,first,second) {
  const lock=await connect(),a=await connect(),b=await connect();
  try {
    await lock.query('BEGIN'); await lock.query(`SELECT id FROM ${table} WHERE id=$1 FOR UPDATE`,[id]);
    const p1=first(a).then(value=>({ok:true,value}),error=>({ok:false,error}));
    const p2=second(b).then(value=>({ok:true,value}),error=>({ok:false,error}));
    let blocked=0;
    for(let i=0;i<100;i++) {
      blocked=await num('SELECT count(*) FROM pg_stat_activity WHERE pid=ANY($1) AND cardinality(pg_blocking_pids(pid))>0',[[a.processID,b.processID]]);
      if(blocked===2) break;
      await new Promise(r=>setTimeout(r,20));
    }
    assert.equal(blocked,2,'Both calls must really contend for a database row lock');
    await lock.query('COMMIT'); return await Promise.all([p1,p2]);
  } finally { await lock.query('ROLLBACK'); await Promise.all([lock.end(),a.end(),b.end()]); }
}
before(async()=>{
  db=await connect();
  await q('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  for(const role of ['anon','authenticated','service_role']) await q(`DO $$ BEGIN CREATE ROLE ${role}; EXCEPTION WHEN duplicate_object THEN NULL; END $$;`);
  for(const file of ['__tests__/fixtures/transaction-schema.sql','db/migrations/083_atomic_checkout.sql','db/migrations/084_atomic_returns.sql','__tests__/fixtures/reservation-schema.sql','db/migrations/085_atomic_reservations.sql','db/migrations/086_atomic_receiving.sql','db/migrations/087_atomic_customer_wallets.sql','db/migrations/088_historical_reconciliation.sql']) await q(fs.readFileSync(path.join(__dirname,'..',file),'utf8'));
});
beforeEach(async()=>{
  await q('TRUNCATE businesses CASCADE; TRUNCATE qr_code_pool CASCADE;');
  ids=Object.fromEntries(['biz','otherBiz','loc','otherLoc','user','customer','product','otherProduct','rule'].map(k=>[k,uuid()]));
  await q("INSERT INTO businesses(id,name,slug) VALUES($1,'Test','test'),($2,'Other','other')",[ids.biz,ids.otherBiz]);
  await q("INSERT INTO locations(id,business_id,name) VALUES($1,$2,'Test branch'),($3,$2,'Other branch')",[ids.loc,ids.biz,ids.otherLoc]);
  await q("INSERT INTO users(id,business_id,name,email,role_id) VALUES($1,$2,'Test operator','test@example.invalid',$3)",[ids.user,ids.biz,uuid()]);
  await q("INSERT INTO customers(id,business_id,name,phone) VALUES($1,$2,'Test customer','+233200000001')",[ids.customer,ids.biz]);
  await q("INSERT INTO products(id,business_id,name,sku,category) VALUES($1,$2,'Test tool','TOOL','Tools'),($3,$2,'Other item','OTHER','Other')",[ids.product,ids.biz,ids.otherProduct]);
  await q('INSERT INTO product_inventory(product_id,location_id,quantity) VALUES($1,$2,10),($3,$2,10)',[ids.product,ids.loc,ids.otherProduct]);
  await q('INSERT INTO loyalty_rules(business_id,points_per_currency_unit,min_points_to_redeem,point_value) VALUES($1,1,1,0.1)',[ids.biz]);
  await q("INSERT INTO commission_rules(id,business_id,type,value,product_category) VALUES($1,$2,'percentage',10,'Tools')",[ids.rule,ids.biz]);
  await q("INSERT INTO store_credit_ledger(customer_id,business_id,type,amount) VALUES($1,$2,'issue',30)",[ids.customer,ids.biz]);
  await q("INSERT INTO loyalty_ledger(customer_id,business_id,type,points) VALUES($1,$2,'adjust',100)",[ids.customer,ids.biz]);
});
after(async()=>{if(db) await db.end();});

test('underpayment, invalid tender and wrong branch leave the pending sale untouched',async()=>{
  const s=await sale({tracked:true});
  await assert.rejects(final(s,{paid:89}),/below/);
  await assert.rejects(final(s,{paid:91,method:'card'}),/equal/);
  await assert.rejects(final(s,{paid:'NaN'}),/Invalid payment/);
  await assert.rejects(final(s,{loc:ids.otherLoc}),/not found/);
  await assert.rejects(final(s,{biz:ids.otherBiz}),/authorized/);
  assert.equal((await one('SELECT status FROM sales WHERE id=$1',[s.id])).status,'pending');
  assert.equal(await num('SELECT count(*) FROM commission_ledger'),0);
  assert.equal(await num('SELECT count(*) FROM loyalty_ledger WHERE sale_id=$1',[s.id]),0);
});
test('cash stores net received and change; retries return exactly one committed receipt',async()=>{
  const s=await sale({tracked:true});const opts={paid:100,credit:20,points:100};
  const result=await final(s,opts); assert.equal(result.sale.amount_paid,100); assert.equal(result.sale.change_due,40); assert.equal(result.sale.cash_received,60); assert.equal(result.sale.rewards_applied,30);
  assert.deepEqual(await final(s,opts),result);
  await assert.rejects(final(s,{...opts,paid:99}),/already settled/);
  assert.equal(await num('SELECT count(*) FROM inventory_units WHERE status=\'sold\''),2);
  assert.equal(await num('SELECT sum(amount) FROM store_credit_ledger'),10);
  assert.equal(await num('SELECT sum(points) FROM loyalty_ledger'),80);
  assert.equal(await num('SELECT sum(amount) FROM commission_ledger'),8);
});
test('final chosen non-cash method persists with zero drawer receipt',async()=>{
  const s=await sale();const {sale:receipt}=await final(s,{method:'transfer'});
  assert.equal(receipt.payment_method,'transfer');assert.equal(receipt.cash_received,0);assert.equal(receipt.change_due,0);
});
test('insufficient points roll back credit, units and sale settlement together',async()=>{
  const s=await sale({tracked:true});
  await assert.rejects(final(s,{paid:45,credit:25,points:200}),/Insufficient/);
  assert.equal(await num('SELECT sum(amount) FROM store_credit_ledger'),30);
  assert.equal(await num('SELECT count(*) FROM inventory_units WHERE status=\'pending_sale\''),2);
  assert.equal(await num('SELECT count(*) FROM sales WHERE settlement_id IS NOT NULL'),0);
});
test('an internal commission failure rolls back the entire checkout',async()=>{
  const s=await sale({tracked:true});
  await q("CREATE FUNCTION fail_commission() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected failure'; END $$; CREATE TRIGGER fail_commission BEFORE INSERT ON commission_ledger FOR EACH ROW EXECUTE FUNCTION fail_commission();");
  try { await assert.rejects(final(s,{paid:60,credit:20,points:100}),/injected/); }
  finally { await q('DROP TRIGGER fail_commission ON commission_ledger; DROP FUNCTION fail_commission()'); }
  assert.equal(await num('SELECT sum(amount) FROM store_credit_ledger'),30);
  assert.equal((await one('SELECT status FROM sales WHERE id=$1',[s.id])).status,'pending');
});
test('commission category applies only to eligible net revenue',async()=>{
  const s=await sale({total:180,tax:20});
  await q('INSERT INTO sale_items(sale_id,product_id,business_id,quantity,unit_price) VALUES($1,$2,$3,2,50)',[s.id,ids.otherProduct,ids.biz]);
  await final(s,{paid:180});assert.equal(await num('SELECT sum(amount) FROM commission_ledger'),8);
});
test('simultaneous settlement retries debit and earn once',async()=>{
  const s=await sale();const opts={paid:60,credit:20,points:100};
  const results=await race('sales',s.id,c=>final(s,opts,c),c=>final(s,opts,c));
  assert(results.every(r=>r.ok));assert.deepEqual(results[0].value,results[1].value);
  assert.equal(await num("SELECT count(*) FROM loyalty_ledger WHERE type='earn'"),1);
  assert.equal(await num('SELECT sum(amount) FROM store_credit_ledger'),10);
});
test('two different sales cannot spend the same store credit',async()=>{
  const a=await sale(),b=await sale();
  const results=await race('customers',ids.customer,c=>final(a,{paid:65,credit:25},c),c=>final(b,{paid:65,credit:25},c));
  assert.equal(results.filter(r=>r.ok).length,1);assert.match(results.find(r=>!r.ok).error.message,/Insufficient/);
  assert.equal(await num('SELECT sum(amount) FROM store_credit_ledger'),5);
});
test('finalization racing cancellation produces one coherent outcome',async()=>{
  const s=await sale({tracked:true});const results=await race('sales',s.id,c=>final(s,{},c),c=>cancel(s,c));
  const row=await one('SELECT status FROM sales WHERE id=$1',[s.id]);
  const stock=await num('SELECT quantity FROM product_inventory WHERE product_id=$1',[ids.product]);
  if(row.status==='completed') { assert.equal(stock,10);assert.equal(results[1].value.reversed,false); }
  else { assert.equal(row.status,'voided');assert.equal(stock,12);assert.equal(results[0].ok,false); }
});
test('duplicate cancellation restores units and provisional rewards once',async()=>{
  const s=await sale({tracked:true});
  await q("INSERT INTO loyalty_ledger(customer_id,business_id,sale_id,type,points) VALUES($1,$2,$3,'earn',80),($1,$2,$3,'redeem',-20)",[ids.customer,ids.biz,s.id]);
  await q("INSERT INTO store_credit_ledger(customer_id,business_id,sale_id,type,amount) VALUES($1,$2,$3,'redeem',-10)",[ids.customer,ids.biz,s.id]);
  const results=await race('sales',s.id,c=>cancel(s,c),c=>cancel(s,c));assert.equal(results.filter(r=>r.value.reversed).length,1);
  assert.equal(await num('SELECT quantity FROM product_inventory WHERE product_id=$1',[ids.product]),12);
  assert.equal(await num('SELECT sum(points) FROM loyalty_ledger'),100);assert.equal(await num('SELECT sum(amount) FROM store_credit_ledger'),30);
  assert.equal(await num("SELECT count(*) FROM inventory_units WHERE status='in_stock' AND sold_in_sale_id IS NULL"),2);
});
test('partial then full return conserves discounted gross, tax and original payment sources',async()=>{
  const s=await sale({tracked:true});await final(s,{paid:60,credit:20,points:100});
  const key=uuid(),opts={key,units:[s.units[0]]};const first=await refund(s,opts);
  assert.equal(first.refund.total_refund_amount,45);assert.equal(first.refund.tax_refund_amount,5);assert.equal(first.refund.cash_refund_amount,30);assert.equal(first.refund.credit_refund_amount,10);assert.equal(first.refund.points_refund,50);
  assert.deepEqual(await refund(s,opts),first);await assert.rejects(refund(s,{...opts,qty:2}),/already used/);
  const second=await refund(s,{units:[s.units[1]]});assert.equal(second.refund.total_refund_amount,45);
  assert.equal((await one('SELECT return_status FROM sales WHERE id=$1',[s.id])).return_status,'full');
  assert.equal(await num('SELECT sum(amount) FROM store_credit_ledger'),30);assert.equal(await num('SELECT sum(points) FROM loyalty_ledger'),100);
  assert.equal(await num('SELECT sum(amount) FROM commission_ledger'),0);assert.equal(await num('SELECT quantity FROM product_inventory WHERE product_id=$1',[ids.product]),12);
  await assert.rejects(refund(s,{units:[s.units[1]]}),/remaining quantity/);
});
test('return rejects wrong lines, missing scans, foreign units and excess quantity',async()=>{
  const s=await sale({tracked:true});await final(s);
  await assert.rejects(refund(s),/Scan exactly/);
  await assert.rejects(refund(s,{qty:3,units:s.units}),/remaining quantity/);
  await assert.rejects(refund(s,{units:[uuid()]}),/not returnable/);
  await assert.rejects(refund(s,{items:[{sale_item_id:uuid(),quantity:1}]}),/does not belong/);
  await assert.rejects(refund(s,{loc:ids.otherLoc}),/not found/);
  assert.equal(await num('SELECT count(*) FROM returns'),0);
});
test('two competing returns cannot refund the same last quantity',async()=>{
  const s=await sale({qty:1});await final(s);
  const results=await race('sales',s.id,c=>refund(s,{},c),c=>refund(s,{},c));assert.equal(results.filter(r=>r.ok).length,1);
  assert.equal(await num('SELECT sum(total_refund_amount) FROM returns'),90);assert.equal(await num('SELECT quantity FROM product_inventory WHERE product_id=$1',[ids.product]),11);
});
test('inventory failure rolls back return header, refund ledgers and return items',async()=>{
  const s=await sale();await final(s,{paid:60,credit:20,points:100});await q('DELETE FROM product_inventory WHERE product_id=$1',[ids.product]);
  await assert.rejects(refund(s),/Inventory record/);
  assert.equal(await num('SELECT count(*) FROM returns'),0);assert.equal(await num('SELECT count(*) FROM return_items'),0);assert.equal(await num('SELECT sum(amount) FROM store_credit_ledger'),10);
});
test('paid commission stays auditable and carries its returned portion for reconciliation',async()=>{
  const s=await sale();await final(s);await q('UPDATE commission_ledger SET paid_at=now()');await refund(s);
  const row=await one('SELECT amount,reversed_amount FROM commission_ledger');assert.equal(Number(row.amount),8);assert.equal(Number(row.reversed_amount),4);
});
test('one-cent partial refunds never overallocate reward sources',async()=>{
  const s=await sale({total:0.03,tax:0,qty:3});await q('UPDATE loyalty_rules SET point_value=0.01');await final(s,{paid:0.01,credit:0.01,points:1});
  for(let i=0;i<3;i++) {const {refund:r}=await refund(s);assert.equal(r.total_refund_amount,0.01);assert(r.payment_refund_amount>=0);}
  assert.equal(await num('SELECT sum(payment_refund_amount) FROM returns'),0.01);assert.equal(await num('SELECT sum(credit_refund_amount) FROM returns'),0.01);assert.equal(await num('SELECT sum(points_refund_value) FROM returns'),0.01);assert.equal(await num('SELECT sum(points_refund) FROM returns'),1);
});
test('historical reward settlements and existing legacy returns require reconciliation',async()=>{
  const s=await sale();await q("UPDATE sales SET status='completed' WHERE id=$1",[s.id]);await q("INSERT INTO store_credit_ledger(customer_id,business_id,sale_id,type,amount) VALUES($1,$2,$3,'redeem',-10)",[ids.customer,ids.biz,s.id]);
  await assert.rejects(refund(s),/reconcile/);
  await q('DELETE FROM store_credit_ledger WHERE sale_id=$1',[s.id]);await q('INSERT INTO returns(business_id,location_id,original_sale_id,processed_by,total_refund_amount) VALUES($1,$2,$3,$4,1)',[ids.biz,ids.loc,s.id,ids.user]);
  await assert.rejects(refund(s),/older return/);
});
test('transaction services cannot be called by browser roles',async()=>{
  const rows=(await q("SELECT p.oid::regprocedure::text AS name,has_function_privilege('anon',p.oid,'EXECUTE') AS anon,has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated,has_function_privilege('service_role',p.oid,'EXECUTE') AS service FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('finalize_sale_transaction','cancel_pending_sale','process_return_transaction','sale_receipt','sale_return_lines','returnable_sale','customer_reward_balances')")).rows;
  assert.equal(rows.length,7);for(const row of rows){assert.equal(row.anon,false,row.name);assert.equal(row.authenticated,false,row.name);assert.equal(row.service,true,row.name);}
});

test('a settled tracked item still requires its units if another process removes their sale link',async()=>{
  const s=await sale({tracked:true});await final(s);
  await q('UPDATE inventory_units SET sold_in_sale_id=NULL');
  await assert.rejects(refund(s),/Scan exactly/);
  assert.equal(await num('SELECT count(*) FROM returns'),0);
});
test('competing returns from different receipts atomically add to the same stock row',async()=>{
  const a=await sale({customer:false}),b=await sale({customer:false});await final(a);await final(b);
  const stock=await one('SELECT id FROM product_inventory WHERE product_id=$1',[ids.product]);
  const results=await race('product_inventory',stock.id,c=>refund(a,{qty:2},c),c=>refund(b,{qty:2},c));
  assert(results.every(r=>r.ok));assert.equal(await num('SELECT quantity FROM product_inventory WHERE id=$1',[stock.id]),14);
});
test('multiple discounted lines conserve total gross and tax across all returns',async()=>{
  const s=await sale({total:101.01,tax:9.01,qty:3});const other=uuid();
  await q('INSERT INTO sale_items(id,sale_id,product_id,business_id,quantity,unit_price) VALUES($1,$2,$3,$4,2,13)',[other,s.id,ids.otherProduct,ids.biz]);
  await final(s,{paid:71.01,credit:20,points:100});
  for(let i=0;i<3;i++) await refund(s);
  for(let i=0;i<2;i++) await refund(s,{items:[{sale_item_id:other,quantity:1,unit_ids:[]}]});
  assert.equal(await num('SELECT sum(total_refund_amount) FROM returns'),101.01);assert.equal(await num('SELECT sum(tax_refund_amount) FROM returns'),9.01);
  assert.equal(await num('SELECT sum(cash_refund_amount) FROM returns'),71.01);assert.equal(await num('SELECT sum(points_refund) FROM returns'),100);
});

test('cross-business sale lines and null return items cannot commit',async()=>{
  const s=await sale();await q('UPDATE products SET business_id=$1 WHERE id=$2',[ids.otherBiz,ids.product]);
  await assert.rejects(final(s),/Sale lines do not belong/);
  await q('UPDATE products SET business_id=$1 WHERE id=$2',[ids.biz,ids.product]);await final(s);
  await assert.rejects(q('SELECT process_return_transaction($1,$2,$3,$4,$5,NULL,$6)',[ids.biz,ids.loc,ids.user,s.id,uuid(),'Test']),/Select return items/);
  assert.equal(await num('SELECT count(*) FROM returns'),0);
});

function reservation(overrides={}) {
  return { operation_id:uuid(),expected_total:0,total_amount:0,discount:0,payment_method:'cash',customer_id:ids.customer,
    items:[{product_id:ids.product,quantity:2,unit_price:0}],...overrides };
}
const reserve=(payload,c=db,loc=ids.loc)=>c.query('SELECT reserve_sale_transaction($1,$2,$3,$4) AS result',[ids.biz,loc,ids.user,payload]).then(r=>r.rows[0].result);
test('reservation retries survive lost responses without a duplicate sale or stock decrement',async()=>{
  const payload=reservation();const a=await reserve(payload),b=await reserve(payload);assert.equal(a.sale.id,b.sale.id);assert.equal(b.replayed,true);
  assert.equal(await num('SELECT quantity FROM product_inventory WHERE product_id=$1',[ids.product]),8);
  assert.equal(await num('SELECT count(*) FROM sales'),1);await assert.rejects(reserve({...payload,customer_id:null}),/another request/);
  await assert.rejects(reserve(payload,db,ids.otherLoc),/another request/);
});
test('reservation derives authoritative price and tax, refusing stale or forged totals',async()=>{
  await q('UPDATE products SET price=50 WHERE id=$1',[ids.product]);
  await q('UPDATE businesses SET tax_enabled=true,tax_inclusive=false,tax_rate=10 WHERE id=$1',[ids.biz]);
  const payload=reservation({total_amount:100,expected_total:110,items:[{product_id:ids.product,quantity:2,unit_price:50}]});
  await assert.rejects(reserve({...payload,total_amount:1}),/Cart total/);
  await assert.rejects(reserve({...payload,expected_total:100}),/Tax or total/);
  await assert.rejects(reserve({...payload,items:[{product_id:ids.product,quantity:2,unit_price:1}]}),/price changed/);
  const result=await reserve(payload);assert.equal(result.sale.total_amount,110);assert.equal(result.sale.tax_amount,10);
});
test('concurrent reservations cannot oversell or lose stock decrements',async()=>{
  const row=await one('SELECT id FROM product_inventory WHERE product_id=$1',[ids.product]);
  const payload=()=>reservation({items:[{product_id:ids.product,quantity:7,unit_price:0}]});
  // Product lock precedes inventory lock; the competing call waits on product.
  const results=await race('products',ids.product,c=>reserve(payload(),c),c=>reserve(payload(),c));
  assert.equal(results.filter(r=>r.ok).length,1);assert.equal(await num('SELECT quantity FROM product_inventory WHERE id=$1',[row.id]),3);
});
test('QR assignment and all reservations roll back when a later scan fails',async()=>{
  await q("UPDATE businesses SET qr_tracking_mode='double' WHERE id=$1",[ids.biz]);
  const pack=uuid(),code=uuid(),unit=uuid();
  await q("INSERT INTO qr_code_pool(id,code,status) VALUES($1,'PACK','assigned'),($2,'ITEM','unassigned')",[pack,code]);
  await q("INSERT INTO inventory_units(id,business_id,location_id,product_id,assigned_by,pack_code_id,serial_number) VALUES($1,$2,$3,$4,$5,$6,'SERIAL')",[unit,ids.biz,ids.loc,ids.product,ids.user,pack]);
  const payload=reservation({items:[{product_id:ids.product,quantity:2,unit_price:0,scans:[{pack_code:'PACK',item_code:'ITEM',serial_number:'SERIAL'},{pack_code:'PACK',item_code:'MISSING',serial_number:'OTHER'}]}]});
  await assert.rejects(reserve(payload),/Item code/);
  assert.equal((await one('SELECT qr_code_id FROM inventory_units WHERE id=$1',[unit])).qr_code_id,null);
  assert.equal((await one('SELECT status FROM qr_code_pool WHERE id=$1',[code])).status,'unassigned');
  assert.equal(await num('SELECT count(*) FROM sales'),0);
  assert.equal(await num('SELECT quantity FROM product_inventory WHERE product_id=$1',[ids.product]),10);
});
test('offline creation and settlement are atomic and exactly replayable',async()=>{
  await q('UPDATE products SET price=50 WHERE id=$1',[ids.product]);
  const payload=reservation({total_amount:100,expected_total:100,items:[{product_id:ids.product,quantity:2,unit_price:50}]});
  const payment={settlement_id:uuid(),payment_method:'cash',amount_paid:100};
  const sync=p=>q('SELECT sync_offline_sale($1,$2,$3,$4,$5) AS result',[ids.biz,ids.loc,ids.user,payload,p]).then(r=>r.rows[0].result);
  await assert.rejects(sync({...payment,amount_paid:1}),/below/);assert.equal(await num('SELECT count(*) FROM sales'),0);
  const a=await sync(payment),b=await sync(payment);assert.deepEqual(a,b);assert.equal(await num('SELECT count(*) FROM sales'),1);
  assert.equal(await num('SELECT quantity FROM product_inventory WHERE product_id=$1',[ids.product]),8);
});
async function po() {
  const id=uuid(),item=uuid();await q("INSERT INTO purchase_orders(id,business_id,po_number,status) VALUES($1,$2,'PO-TEST','sent')",[id,ids.biz]);
  await q('INSERT INTO purchase_order_items(id,purchase_order_id,product_id,quantity,unit_cost) VALUES($1,$2,$3,5,30)',[item,id,ids.product]);
  return {id,item};
}
const receive=(p,request,c=db,loc=ids.loc)=>c.query('SELECT receive_purchase_transaction($1,$2,$3,$4,$5) AS result',[ids.biz,loc,ids.user,p.id,request]).then(r=>r.rows[0].result);
test('receiving saves cost, stock, movement and status once across retries',async()=>{
  const p=await po(),req={operation_id:uuid(),items:[{item_id:p.item,received_qty:3}],notes:'First delivery'};
  const a=await receive(p,req),b=await receive(p,req);assert.deepEqual(a,b);assert.equal(a.purchase_order.status,'partial');
  assert.equal(await num('SELECT quantity FROM product_inventory WHERE product_id=$1',[ids.product]),13);
  assert.equal(await num('SELECT cost_price FROM products WHERE id=$1',[ids.product]),30);
  assert.equal(await num('SELECT count(*) FROM stock_movements'),1);
  await assert.rejects(receive(p,{...req,notes:'Different'}),/another delivery/);
});
test('over-receiving and cross-order items roll back the entire receipt',async()=>{
  const p=await po(),other=await po();
  await assert.rejects(receive(p,{operation_id:uuid(),items:[{item_id:p.item,received_qty:6}]}),/exceeds/);
  await assert.rejects(receive(p,{operation_id:uuid(),items:[{item_id:other.item,received_qty:1}]}),/does not belong/);
  assert.equal(await num('SELECT count(*) FROM purchase_receipts'),0);assert.equal(await num('SELECT sum(received_quantity) FROM purchase_order_items'),0);
});
test('concurrent deliveries cannot over-receive the same order',async()=>{
  const p=await po();const req=()=>({operation_id:uuid(),items:[{item_id:p.item,received_qty:4}]});
  const results=await race('purchase_orders',p.id,c=>receive(p,req(),c),c=>receive(p,req(),c));
  assert.equal(results.filter(r=>r.ok).length,1);assert.equal(await num('SELECT received_quantity FROM purchase_order_items WHERE id=$1',[p.item]),4);
});
test('receiving rollback restores cost and stock after an injected movement error',async()=>{
  const p=await po();await q("CREATE FUNCTION fail_receiving() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected receipt failure'; END $$; CREATE TRIGGER fail_receiving BEFORE INSERT ON stock_movements FOR EACH ROW EXECUTE FUNCTION fail_receiving();");
  try { await assert.rejects(receive(p,{operation_id:uuid(),items:[{item_id:p.item,received_qty:5}]}),/injected receipt failure/); }
  finally { await q('DROP TRIGGER fail_receiving ON stock_movements; DROP FUNCTION fail_receiving()'); }
  assert.equal(await num('SELECT received_quantity FROM purchase_order_items WHERE id=$1',[p.item]),0);
  assert.equal(await num('SELECT quantity FROM product_inventory WHERE product_id=$1',[ids.product]),10);
  assert.equal(await num('SELECT cost_price FROM products WHERE id=$1',[ids.product]),0);
});

function wallet(kind, request={}, c=db) {
  return c.query('SELECT process_wallet_transaction($1,$2,$3,$4,$5) AS result',[ids.biz,ids.loc,ids.user,kind,JSON.stringify({operation_id:uuid(),customer_id:ids.customer,amount:10,...request})]).then(r=>r.rows[0].result);
}
test('cash deposit records customer credit and till receipt once across retries',async()=>{
  const op={operation_id:uuid()}; const result=await wallet('deposit',op);
  assert.deepEqual(await wallet('deposit',op),result);
  assert.equal(await num('SELECT sum(amount) FROM store_credit_ledger'),40);
  assert.equal(await num("SELECT sum(amount) FROM business_ledger WHERE type='pay_in'"),10);
  assert.equal(await num('SELECT count(*) FROM wallet_operations'),1);
  await assert.rejects(wallet('deposit',{...op,amount:11}),/reference already used/);
});
test('withdrawal checks expiry and balance before consuming the code; retry is safe after consumption',async()=>{
  const op={operation_id:uuid(),code:'1234',amount:20};
  await q("UPDATE customers SET verification_code='1234',otp_expires_at=now()-interval '1 minute'");
  await assert.rejects(wallet('withdrawal',op),/expired/);
  await q("UPDATE customers SET otp_expires_at=now()+interval '5 minutes'");
  await assert.rejects(wallet('withdrawal',{...op,amount:40}),/Insufficient/);
  assert.equal((await one('SELECT verification_code FROM customers')).verification_code,'1234');
  const result=await wallet('withdrawal',op); assert.deepEqual(await wallet('withdrawal',op),result);
  assert.equal(await num('SELECT sum(amount) FROM store_credit_ledger'),10);
  assert.equal(await num("SELECT sum(amount) FROM business_ledger WHERE type='expense' AND metadata->>'liability_movement'='true'"),20);
  assert.equal((await one('SELECT verification_code FROM customers')).verification_code,null);
  assert.equal(await num("SELECT count(*) FROM wallet_operations WHERE result::text LIKE '%1234%' OR request_hash LIKE '%1234%'"),0);
});
test('failed cash ledger write rolls back the wallet debit and verification code',async()=>{
  await q("UPDATE customers SET verification_code='1234',otp_expires_at=now()+interval '5 minutes'");
  await q("CREATE FUNCTION fail_wallet_cash() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected failure'; END $$; CREATE TRIGGER fail_wallet_cash BEFORE INSERT ON business_ledger FOR EACH ROW EXECUTE FUNCTION fail_wallet_cash();");
  try { await assert.rejects(wallet('withdrawal',{code:'1234'}),/injected/); }
  finally { await q('DROP TRIGGER fail_wallet_cash ON business_ledger; DROP FUNCTION fail_wallet_cash()'); }
  assert.equal(await num('SELECT sum(amount) FROM store_credit_ledger'),30);
  assert.equal((await one('SELECT verification_code FROM customers')).verification_code,'1234');
  assert.equal(await num('SELECT count(*) FROM wallet_operations'),0);
});
test('gift card purchase and transfer conserve value, support retries and reject another customer',async()=>{
  const op={operation_id:uuid(),funding:'cash',amount:20};const issued=await wallet('gift_issue',op);
  assert.deepEqual(await wallet('gift_issue',op),issued);
  const transfer={operation_id:uuid(),code:issued.card.code,amount:15};
  const result=await wallet('gift_transfer',transfer);assert.deepEqual(await wallet('gift_transfer',transfer),result);
  assert.equal(await num('SELECT current_balance FROM gift_cards'),5);
  assert.equal(await num('SELECT sum(amount) FROM store_credit_ledger'),45);
  await assert.rejects(wallet('gift_transfer',{code:issued.card.code,amount:6}),/Insufficient/);
  const other=uuid(); await q("INSERT INTO customers(id,business_id,name,phone) VALUES($1,$2,'Other','+233200000002')",[other,ids.biz]);
  await assert.rejects(wallet('gift_transfer',{code:issued.card.code,customer_id:other,amount:1}),/another customer/);
});
test('competing gift transfers cannot spend the same last balance',async()=>{
  const {card}=await wallet('gift_issue',{amount:10,funding:'promotional',note:'Test promotion'});
  const results=await race('customers',ids.customer,c=>wallet('gift_transfer',{code:card.code,amount:8},c),c=>wallet('gift_transfer',{code:card.code,amount:8},c));
  assert.equal(results.filter(r=>r.ok).length,1);assert.equal(await num('SELECT current_balance FROM gift_cards'),2);
  assert.equal(await num('SELECT count(*) FROM business_ledger'),0);
});
test('wallet RPC rejects foreign customer and invalid precision; browser roles cannot call it',async()=>{
  const other=uuid(); await q("INSERT INTO customers(id,business_id,name,phone) VALUES($1,$2,'Foreign','+233200000003')",[other,ids.otherBiz]);
  await assert.rejects(wallet('deposit',{customer_id:other}),/Customer not found/);
  await assert.rejects(wallet('deposit',{amount:0.001}),/decimal/);
  const permissions=await one("SELECT has_function_privilege('authenticated','process_wallet_transaction(uuid,uuid,uuid,text,jsonb)','execute') AS auth, has_table_privilege('authenticated','wallet_operations','select') AS tbl");
  assert.equal(permissions.auth,false);assert.equal(permissions.tbl,false);
});

const cancelReservation=(operation_id,c=db)=>c.query('SELECT cancel_checkout_reservation($1,$2,$3,$4) AS result',[ids.biz,ids.loc,ids.user,operation_id]).then(r=>r.rows[0].result);
test('cancellation before a delayed creation prevents orphan stock reservations',async()=>{
  const body=reservation();await cancelReservation(body.operation_id);
  await assert.rejects(reserve(body),/cancelled/);assert.equal(await num('SELECT count(*) FROM sales'),0);
  assert.equal(await num('SELECT quantity FROM product_inventory WHERE product_id=$1',[ids.product]),10);
});
test('cancelling a lost-response reservation releases stock only once',async()=>{
  const body=reservation();const result=await reserve(body);
  await cancelReservation(body.operation_id);await cancelReservation(body.operation_id);
  assert.equal((await one('SELECT status FROM sales WHERE id=$1',[result.sale.id])).status,'voided');
  assert.equal(await num('SELECT quantity FROM product_inventory WHERE product_id=$1',[ids.product]),10);
});
function review(kind,record,action,values={},extra={}) {
  return q('SELECT reconcile_financial_record($1,$2,$3,$4) AS result',[ids.biz,ids.loc,ids.user,JSON.stringify({operation_id:uuid(),kind,record_id:record,action,values,note:'Verified against original evidence',evidence:'TEST-RECEIPT-001',...extra})]).then(r=>r.rows[0].result);
}
test('historical receipt confirmation records evidence and enables safe refunds without repeating rewards',async()=>{
  const s=await sale();await q("UPDATE sales SET status='void_pending' WHERE id=$1",[s.id]);
  await q("INSERT INTO store_credit_ledger(customer_id,business_id,sale_id,type,amount) VALUES($1,$2,$3,'redeem',-20)",[ids.customer,ids.biz,s.id]);
  const values={amount_paid:80,store_credit:20,points:0,points_value:0,payment_method:'cash',settled_at:'2026-01-01T12:00:00Z'},op={operation_id:uuid()};
  const result=await review('sale',s.id,'confirm_settlement',values,op);assert.deepEqual(await review('sale',s.id,'confirm_settlement',values,op),result);
  const saved=await one('SELECT status,cash_received,change_due FROM sales WHERE id=$1',[s.id]);assert.equal(saved.status,'completed');assert.equal(Number(saved.cash_received),70);assert.equal(Number(saved.change_due),10);
  assert.equal(await num('SELECT sum(amount) FROM store_credit_ledger'),10);
  const returned=await refund(s);assert.equal(returned.refund.cash_refund_amount,35);assert.equal(returned.refund.credit_refund_amount,10);
  assert.equal(await num('SELECT count(*) FROM financial_reviews'),1);
});
test('historical cost changes require their evidence journal in the same transaction; recorded costs stay immutable',async()=>{
  const s=await sale();
  await q('ALTER TABLE sale_items DISABLE TRIGGER preserve_sale_item_cost');
  await q("UPDATE sale_items SET unit_cost=0,cost_basis='estimated' WHERE id=$1",[s.item]);
  await q('ALTER TABLE sale_items ENABLE TRIGGER preserve_sale_item_cost');
  await assert.rejects(q("UPDATE sale_items SET unit_cost=12,cost_basis='recorded' WHERE id=$1",[s.item]),/immutable/);
  await review('cost',s.item,'confirm_cost',{unit_cost:12});
  assert.equal(await num('SELECT unit_cost FROM sale_items WHERE id=$1',[s.item]),12);
  const audit=await one('SELECT before_record,after_record FROM financial_reviews');assert.equal(audit.before_record.unit_cost,0);assert.equal(audit.after_record.unit_cost,12);
  await assert.rejects(review('cost',s.item,'confirm_cost',{unit_cost:13}),/already recorded/);
});
test('joint historical refund evidence stays open and cannot accidentally rewrite payment history',async()=>{
  const s=await sale();await q("UPDATE sales SET status='completed' WHERE id=$1",[s.id]);
  await q('INSERT INTO returns(business_id,location_id,original_sale_id,processed_by,total_refund_amount) VALUES($1,$2,$3,$4,10)',[ids.biz,ids.loc,s.id,ids.user]);
  await assert.rejects(review('sale',s.id,'confirm_settlement',{amount_paid:90,store_credit:0,points:0,points_value:0,payment_method:'cash',settled_at:'2026-01-01T12:00:00Z'}),/joint/);
  await review('sale',s.id,'record_evidence');assert.equal(await num("SELECT count(*) FROM financial_exceptions WHERE kind='sale'"),1);
});
test('matching a historical commission expense never creates a second cash payout',async()=>{
  const s=await sale();await final(s);await q('UPDATE commission_ledger SET paid_at=now()');
  const comm=await one('SELECT id FROM commission_ledger'), ledger=uuid();
  await q("INSERT INTO business_ledger(id,business_id,location_id,user_id,type,amount,ref_number) VALUES($1,$2,$3,$4,'expense',8,'EXP-001')",[ledger,ids.biz,ids.loc,ids.user]);
  await review('commission',comm.id,'link_payout',{ledger_reference:'EXP-001'});
  assert.equal((await one('SELECT payout_ledger_id FROM commission_ledger')).payout_ledger_id,ledger);
  assert.equal(await num('SELECT count(*) FROM business_ledger'),1);
});

const savePO=(id,body,c=db)=>c.query('SELECT save_purchase_order($1,$2,$3,$4) AS result',[ids.biz,ids.user,id,body]).then(r=>r.rows[0].result);
const transitionPO=(id,status,c=db)=>c.query('SELECT transition_purchase_order($1,$2,$3,$4) AS result',[ids.biz,ids.user,id,status]).then(r=>r.rows[0].result);
test('draft edit failures preserve old lines and sending prevents further edits',async()=>{
  const supplier=uuid();await q("INSERT INTO suppliers(id,business_id,name) VALUES($1,$2,'Test supplier')",[supplier,ids.biz]);
  const body={supplier_id:supplier,items:[{product_id:ids.product,quantity:4,unit_cost:20}]};
  const {purchase_order:po}=await savePO(null,body);assert.equal(po.total_amount,80);
  await assert.rejects(savePO(po.id,{...body,items:[{product_id:uuid(),quantity:1,unit_cost:5}]}),/Product does not belong/);
  assert.equal(await num('SELECT count(*) FROM purchase_order_items WHERE purchase_order_id=$1',[po.id]),1);
  await transitionPO(po.id,'sent');await assert.rejects(savePO(po.id,body),/Only draft/);
});
test('cancellation racing receipt cannot overwrite a received purchase order',async()=>{
  const order=await po();
  const results=await race('purchase_orders',order.id,c=>transitionPO(order.id,'cancelled',c),c=>receive(order,{operation_id:uuid(),items:[{item_id:order.item,received_qty:5}]},c));
  const row=await one('SELECT status FROM purchase_orders WHERE id=$1',[order.id]);
  if(row.status==='cancelled') {assert.equal(results[1].ok,false);assert.equal(await num('SELECT count(*) FROM purchase_receipts'),0);}
  else {assert.equal(row.status,'received');assert.equal(results[0].ok,false);assert.equal(await num('SELECT count(*) FROM purchase_receipts'),1);}
});
test('coherent isolated business lifecycle: procurement, deposit, gift, checkout, payout, return and reports',async()=>{
  await q('DELETE FROM store_credit_ledger; DELETE FROM loyalty_ledger;');
  await q('UPDATE product_inventory SET quantity=0 WHERE product_id=$1',[ids.product]);await q('UPDATE products SET price=50 WHERE id=$1',[ids.product]);
  const supplier=uuid();await q("INSERT INTO suppliers(id,business_id,name) VALUES($1,$2,'Lifecycle supplier')",[supplier,ids.biz]);
  const {purchase_order:po}=await savePO(null,{supplier_id:supplier,items:[{product_id:ids.product,quantity:4,unit_cost:20}]});
  await transitionPO(po.id,'sent');const line=await one('SELECT id FROM purchase_order_items WHERE purchase_order_id=$1',[po.id]);
  await receive(po,{operation_id:uuid(),items:[{item_id:line.id,received_qty:4}]});
  await wallet('deposit',{amount:30});const {card}=await wallet('gift_issue',{amount:10,funding:'cash'});await wallet('gift_transfer',{amount:10,code:card.code});
  const body=reservation({total_amount:100,expected_total:100,items:[{product_id:ids.product,quantity:2,unit_price:50}]});
  const {sale:held}=await reserve(body),s={id:held.id,item:(await one('SELECT id FROM sale_items WHERE sale_id=$1',[held.id])).id};
  await final(s,{paid:80,credit:20});
  const comm=await one('SELECT id FROM commission_ledger WHERE sale_id=$1',[s.id]);
  await q('SELECT pay_commissions($1,$2,$3,$4,$5)',[ids.biz,ids.loc,ids.user,ids.user,[comm.id]]);
  const {refund:r}=await refund(s);assert.equal(r.cash_refund_amount,40);assert.equal(r.credit_refund_amount,10);
  assert.equal(await num('SELECT quantity FROM product_inventory WHERE product_id=$1',[ids.product]),3);
  assert.equal(await num('SELECT sum(amount) FROM store_credit_ledger'),30);
  const cash=await num("SELECT (SELECT sum(cash_received) FROM sales WHERE status='completed')-(SELECT sum(cash_refund_amount) FROM returns)+(SELECT sum(CASE WHEN type='pay_in' THEN amount ELSE -amount END) FROM business_ledger WHERE status='approved')");assert.equal(cash,70);
  assert.equal(await num('SELECT reversed_amount FROM commission_ledger'),5);
  const {saleRevenue,refundRevenue}=require('../utils/settledMoney');
  const saleRow=await one('SELECT total_amount,tax_amount FROM sales WHERE id=$1',[s.id]);assert.equal(saleRevenue(saleRow)-refundRevenue(r),50);
  assert.equal(await num('SELECT sum(unit_cost*(quantity-1)) FROM sale_items WHERE sale_id=$1',[s.id]),20);
  assert.equal(await num("SELECT count(*) FROM financial_exceptions WHERE kind='cost' OR kind='sale'"),0);
});
test('new financial and stock services remain inaccessible to direct browser calls',async()=>{
  const names=['reserve_sale_transaction','sync_offline_sale','cancel_checkout_reservation','receive_purchase_transaction','save_purchase_order','transition_purchase_order','process_wallet_transaction','reconcile_financial_record'];
  const rows=(await q("SELECT proname,has_function_privilege('anon',p.oid,'EXECUTE') AS anon,has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated,has_function_privilege('service_role',p.oid,'EXECUTE') AS service FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND proname=ANY($1)",[names])).rows;
  assert.equal(rows.length,names.length);for(const row of rows){assert.equal(row.anon,false,row.proname);assert.equal(row.authenticated,false,row.proname);assert.equal(row.service,true,row.proname);}
  for(const table of ['wallet_operations','purchase_receipts','cancelled_checkouts','financial_reviews','financial_exceptions']){
    const r=await one("SELECT has_table_privilege('anon',$1,'SELECT') AS anon,has_table_privilege('authenticated',$1,'SELECT') AS authenticated",[table]);assert.equal(r.anon,false);assert.equal(r.authenticated,false);
  }
});
