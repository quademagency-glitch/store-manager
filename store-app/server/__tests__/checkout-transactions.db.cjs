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
  for(const file of ['__tests__/fixtures/transaction-schema.sql','db/migrations/083_atomic_checkout.sql','db/migrations/084_atomic_returns.sql']) await q(fs.readFileSync(path.join(__dirname,'..',file),'utf8'));
});
beforeEach(async()=>{
  await q('TRUNCATE businesses CASCADE');
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
