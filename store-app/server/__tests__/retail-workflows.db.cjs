// Real PostgreSQL execution in an isolated in-memory PGlite instance; no live data.
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID:uuid}=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const db=new PGlite();
const ids=Object.fromEntries(['biz','other','loc','loc2','user','otherUser','supplier','product'].map(key=>[key,uuid()]));
const q=(sql,args=[])=>db.query(sql,args);
const one=async(sql,args)=>(await q(sql,args)).rows[0];
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
before(async()=>{
 await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;');
 for(const file of ['__tests__/fixtures/transaction-schema.sql','db/migrations/083_atomic_checkout.sql','db/migrations/084_atomic_returns.sql','__tests__/fixtures/reservation-schema.sql','db/migrations/085_atomic_reservations.sql','db/migrations/086_atomic_receiving.sql']) await db.exec(read(file));
 // Use the real AP contract (unrelated import FK omitted), plus numbering functions.
 const core=read('db/migrations/044_ar_ap_core.sql');
 const ap=core.slice(core.indexOf('CREATE TABLE IF NOT EXISTS public.ap_bills'),core.indexOf('-- ============== business_ledger')).replace(/ REFERENCES public.import_batches\(id\) ON DELETE SET NULL/g,'');
 await db.exec(ap);
 await db.exec('CREATE TABLE ar_payments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),ledger_entry_id uuid,payment_method text);');
 await db.exec(read('db/migrations/045_ar_ap_numbering.sql'));
 await db.exec(read('db/migrations/046_ar_ap_payment_rpc.sql'));
 await db.exec(read('db/migrations/089_retail_workflows.sql'));
 await q("INSERT INTO businesses(id,name,slug) VALUES($1,'Retail test','retail-test'),($2,'Other','other-test')",[ids.biz,ids.other]);
 await q("INSERT INTO locations(id,business_id,name) VALUES($1,$2,'Branch'),($3,$2,'Branch two')",[ids.loc,ids.biz,ids.loc2]);
 await q("INSERT INTO users(id,business_id,name,email,role_id) VALUES($1,$2,'Operator','test@example.invalid',$3),($4,$5,'Other','other@example.invalid',$6)",[ids.user,ids.biz,uuid(),ids.otherUser,ids.other,uuid()]);
 await q("INSERT INTO suppliers(id,business_id,name) VALUES($1,$2,'Supplier')",[ids.supplier,ids.biz]);
 await q("INSERT INTO products(id,business_id,name,sku) VALUES($1,$2,'Stock','STOCK')",[ids.product,ids.biz]);
});
after(()=>db.close());
const till=async(request,overrides={})=>(await one('SELECT manage_till_session($1,$2,$3,$4) AS result',[overrides.biz||ids.biz,overrides.loc||ids.loc,overrides.user||ids.user,JSON.stringify(request)])).result;
const bill=async(po,request,overrides={})=>(await one('SELECT bill_received_purchase($1,$2,$3,$4) AS result',[overrides.biz||ids.biz,overrides.user||ids.user,po,JSON.stringify(request)])).result;
const snapshot=async()=>(await one('SELECT branch_cash_snapshot($1,$2) AS result',[ids.biz,ids.loc])).result;
test('open/retry/close/review record one immutable operation and enforce branch isolation',async()=>{
 const request={action:'open',operation_id:uuid(),register_name:'Test drawer',opening_float:100};
 const opened=await till(request);
 assert.deepEqual(await till(request),opened);
 await assert.rejects(till({...request,opening_float:101}),/Reference already used/);
 await assert.rejects(till({...request,operation_id:uuid()}),/already has an open/);
 await assert.rejects(till({action:'close',session_id:opened.id,operation_id:uuid(),counted_cash:100},{loc:ids.loc2}),/not found/);
 await assert.rejects(till(request,{user:ids.otherUser}),/Invalid till/);
 const close={action:'close',operation_id:uuid(),session_id:opened.id,counted_cash:95,note:'Five cedis missing'};
 await assert.rejects(till({...close,note:''}),/Explain/);
 await assert.rejects(till({...close,denominations:{'5':20}}),/Denomination total/);
 const closed=await till(close);
 assert.equal(closed.expected_cash,100); assert.equal(closed.variance,-5);
 assert.deepEqual(await till(close),closed);
 const reviewed=await till({action:'review',operation_id:uuid(),session_id:opened.id,note:'Manager checked the handover'});
 assert.equal(reviewed.status,'reviewed');
});
test('physical cash excludes MoMo AR/AP movements and includes cash movements exactly once',async()=>{
 const opened=await till({action:'open',operation_id:uuid(),register_name:'Next shift',opening_float:50});
 const move={action:'cash_in',operation_id:uuid(),session_id:opened.id,amount:20,note:'Extra float'};
 await till(move);await till(move);
 const momoIn=uuid(),momoOut=uuid(),cashOut=uuid();
 await q("INSERT INTO business_ledger(id,business_id,location_id,user_id,type,amount,status) VALUES($1,$4,$5,$6,'pay_in',300,'approved'),($2,$4,$5,$6,'ap_payment',200,'approved'),($3,$4,$5,$6,'expense',10,'approved')",[momoIn,momoOut,cashOut,ids.biz,ids.loc,ids.user]);
 await q("INSERT INTO ar_payments(ledger_entry_id,payment_method) VALUES($1,'mobile_money')",[momoIn]);
 // Link a real AP payment to its ledger entry, as the existing payment RPC does.
 const po=uuid(),bid=uuid();
 await q("INSERT INTO purchase_orders(id,business_id,supplier_id,po_number,status) VALUES($1,$2,$3,'PO-PAY','received')",[po,ids.biz,ids.supplier]);
 await q("INSERT INTO ap_bills(id,business_id,supplier_id,bill_number,purchase_order_id,amount,created_by) VALUES($1,$2,$3,'B-PAY',$4,200,$5)",[bid,ids.biz,ids.supplier,po,ids.user]);
 await q("INSERT INTO ap_payments(business_id,bill_id,amount,payment_method,location_id,ledger_entry_id,created_by) VALUES($1,$2,200,'mobile_money',$3,$4,$5)",[ids.biz,bid,ids.loc,momoOut,ids.user]);
 const snap=await snapshot();assert.equal(snap.cash_in,20);assert.equal(snap.cash_out,10);
 const closed=await till({action:'close',operation_id:uuid(),session_id:opened.id,counted_cash:60,denominations:{'20':3}});
 assert.equal(closed.expected_cash,60);assert.equal(closed.variance,0);
});
test('received bills cannot exceed accepted value and retries do not duplicate liability',async()=>{
 const po=uuid();
 await q("INSERT INTO purchase_orders(id,business_id,supplier_id,po_number,status,currency) VALUES($1,$2,$3,'PO-BILL','partial','GHS')",[po,ids.biz,ids.supplier]);
 await q('INSERT INTO purchase_order_items(purchase_order_id,product_id,quantity,received_quantity,unit_cost) VALUES($1,$2,10,4,25)',[po,ids.product]);
 const request={operation_id:uuid(),amount:60,description:'Supplier invoice 1'};
 const created=await bill(po,request);assert.equal(created.amount,60);
 assert.deepEqual(await bill(po,request),created);
 await assert.rejects(bill(po,{...request,amount:50}),/Reference already used/);
 await assert.rejects(bill(po,{...request,operation_id:uuid(),amount:41}),/exceeds/);
 await assert.rejects(bill(po,{...request,operation_id:uuid()},{user:ids.otherUser}),/Invalid billing/);
 await assert.rejects(bill(po,{...request,operation_id:uuid()},{biz:ids.other,user:ids.otherUser}),/not found/);
 const last=await bill(po,{operation_id:uuid(),amount:40});assert.equal(last.amount,40);
 assert.equal(Number((await one("SELECT sum(amount) AS total FROM ap_bills WHERE purchase_order_id=$1 AND status<>'void'",[po])).total),100);
});
test('purchase save retry preserves one order and a failed journal write rolls all changes back',async()=>{
 const request={operation_id:uuid(),supplier_id:ids.supplier,items:[{product_id:ids.product,quantity:3,unit_cost:8}],notes:'Test draft'};
 const save=async body=>(await one('SELECT save_purchase_order_once($1,$2,NULL,$3) AS result',[ids.biz,ids.user,JSON.stringify(body)])).result;
 await db.exec("ALTER TABLE retail_operations ADD CONSTRAINT injected_failure CHECK (NOT (request ? 'save'))");
 await assert.rejects(save(request),/injected_failure/);
 assert.equal(Number((await one("SELECT count(*) AS n FROM purchase_orders WHERE notes='Test draft'")).n),0);
 await db.exec('ALTER TABLE retail_operations DROP CONSTRAINT injected_failure');
 const result=await save(request);assert.deepEqual(await save(request),result);
 assert.equal(Number((await one("SELECT count(*) AS n FROM purchase_orders WHERE notes='Test draft'")).n),1);
});
test('supplier payment retry creates one cash movement and one payment',async()=>{
 const target=await one("SELECT id FROM ap_bills WHERE bill_number<>'B-PAY' AND amount=60 LIMIT 1");
 const body={operation_id:uuid(),amount:20,payment_method:'cash',location_id:ids.loc,payment_date:'2026-10-07',notes:'Test supplier payment'};
 const pay=async data=>(await one('SELECT record_ap_payment_once($1,$2,$3,$4,$5) AS result',[ids.biz,ids.user,target.id,JSON.stringify(data),'approved'])).result;
 const paid=await pay(body);assert.deepEqual(await pay(body),paid);
 assert.equal(Number((await one('SELECT amount_paid FROM ap_bills WHERE id=$1',[target.id])).amount_paid),20);
 assert.equal(Number((await one('SELECT count(*) AS n FROM ap_payments WHERE bill_id=$1',[target.id])).n),1);
 await assert.rejects(pay({...body,amount:21}),/Reference already used/);
 await assert.rejects(pay({...body,operation_id:uuid(),amount:41}),/exceeds/);
});
test('browser roles have no table access or execution rights for the new financial RPCs',async()=>{
 for(const role of ['anon','authenticated']) {
  for(const signature of ['branch_cash_snapshot(uuid,uuid)','manage_till_session(uuid,uuid,uuid,jsonb)','bill_received_purchase(uuid,uuid,uuid,jsonb)','save_purchase_order_once(uuid,uuid,uuid,jsonb)','record_ap_payment_once(uuid,uuid,uuid,jsonb,text)']) assert.equal((await one('SELECT has_function_privilege($1,$2,\'EXECUTE\') AS allowed',[role,signature])).allowed,false);
  assert.equal((await one('SELECT has_table_privilege($1,\'till_sessions\',\'SELECT\') AS allowed',[role])).allowed,false);
 }
});

test('an invoice paid from a deposit debits the deposit and pays the invoice together, or neither',async()=>{
 await db.exec(`CREATE TABLE IF NOT EXISTS ar_invoices(id uuid PRIMARY KEY,business_id uuid NOT NULL,customer_id uuid,invoice_number text,total_amount numeric NOT NULL,amount_paid numeric NOT NULL DEFAULT 0,status text NOT NULL DEFAULT 'open',updated_at timestamptz);
  ALTER TABLE ar_payments ADD COLUMN IF NOT EXISTS business_id uuid, ADD COLUMN IF NOT EXISTS invoice_id uuid, ADD COLUMN IF NOT EXISTS amount numeric,
   ADD COLUMN IF NOT EXISTS payment_date date, ADD COLUMN IF NOT EXISTS location_id uuid, ADD COLUMN IF NOT EXISTS notes text, ADD COLUMN IF NOT EXISTS created_by uuid;`);
 // record_ar_payment as production runs it (056), then the new wrapper.
 const m056=read('db/migrations/056_fix_ar_invoices_column_names.sql');
 await db.exec(m056.slice(m056.indexOf('CREATE OR REPLACE FUNCTION public.record_ar_payment(')));
 await db.exec(read('db/migrations/097_atomic_ar_deposit_payment.sql'));
 const customer=uuid(),inv=uuid(),big=uuid();
 await q("INSERT INTO customers(id,business_id,name,phone) VALUES($1,$2,'Depositor','+233200000097')",[customer,ids.biz]);
 await q("INSERT INTO store_credit_ledger(customer_id,business_id,type,amount) VALUES($1,$2,'issue',50)",[customer,ids.biz]);
 await q("INSERT INTO ar_invoices(id,business_id,customer_id,invoice_number,total_amount) VALUES($1,$3,$4,'INV-D1',40),($2,$3,$4,'INV-D2',100)",[inv,big,ids.biz,customer]);
 const pay=(invoice,amount)=>one('SELECT record_ar_deposit_payment($1,$2,CURRENT_DATE,NULL,$3,$4) AS r',[invoice,amount,ids.user,ids.biz]);
 const credit=async()=>Number((await one('SELECT coalesce(sum(amount),0) AS s FROM store_credit_ledger WHERE customer_id=$1',[customer])).s);
 // Production as found on 2026-10-08: 044's check did not allow the method. The payment fails and the debit goes with it.
 await db.exec("ALTER TABLE ar_payments ADD CONSTRAINT ar_payments_payment_method_check CHECK (payment_method IN ('cash','mobile_money','bank_transfer','card','other'))");
 await assert.rejects(pay(inv,30),/ar_payments_payment_method_check/);
 assert.equal(await credit(),50);
 await db.exec(read('db/migrations/101_ar_payment_customer_deposit.sql'));
 assert.equal((await pay(inv,30)).r.new_status,'partial');
 assert.equal(await credit(),20);
 // More than is outstanding: the invoice step fails, and the debit goes with it.
 await assert.rejects(pay(inv,15),/exceeds outstanding/);
 assert.equal(await credit(),20);
 // More than the deposit holds.
 await assert.rejects(pay(big,25),/Insufficient/);
 assert.equal(await credit(),20);
 assert.equal(Number((await one('SELECT amount_paid FROM ar_invoices WHERE id=$1',[big])).amount_paid),0);
 // Another business cannot draw on this customer's deposit through its own id.
 await assert.rejects(one('SELECT record_ar_deposit_payment($1,1,CURRENT_DATE,NULL,$2,$3)',[inv,ids.otherUser,ids.other]),/Invoice not found/);
});
test('SKUs are unique per business, and one QR code marks one unit',async()=>{
 // Production carries 018's platform-wide index on qr_code_data, which the fixture omits.
 await db.exec('ALTER TABLE products ADD COLUMN IF NOT EXISTS qr_code_data text; CREATE UNIQUE INDEX IF NOT EXISTS idx_products_qr_code_data ON products(qr_code_data) WHERE qr_code_data IS NOT NULL;');
 await db.exec(read('db/migrations/098_products_sku_per_business.sql'));
 await db.exec(read('db/migrations/100_products_qr_code_data_per_business.sql'));
 await db.exec(read('db/migrations/099_unique_unit_qr_code.sql'));
 // The same manufacturer code in two shops; never twice in one.
 // As routes/products.js writes them: qr_code_data defaults to the SKU.
 await q("INSERT INTO products(id,business_id,name,sku,qr_code_data) VALUES($1,$2,'TV','SAM-55','SAM-55')",[uuid(),ids.biz]);
 await q("INSERT INTO products(id,business_id,name,sku,qr_code_data) VALUES($1,$2,'TV','SAM-55','SAM-55')",[uuid(),ids.other]);
 await assert.rejects(q("INSERT INTO products(id,business_id,name,sku,qr_code_data) VALUES($1,$2,'TV again','SAM-56','SAM-55')",[uuid(),ids.biz]),/duplicate key/);
 await assert.rejects(q("INSERT INTO products(id,business_id,name,sku) VALUES($1,$2,'TV again','SAM-55')",[uuid(),ids.biz]),/duplicate key/);
 const code=uuid(),unit=()=>q("INSERT INTO inventory_units(business_id,product_id,location_id,qr_code_id,assigned_by) VALUES($1,$2,$3,$4,$5)",[ids.biz,ids.product,ids.loc,code,ids.user]);
 await unit();
 await assert.rejects(unit(),/duplicate key/);
 // Units without a single code (double-QR packs) are unaffected.
 await q("INSERT INTO inventory_units(business_id,product_id,location_id,assigned_by) VALUES($1,$2,$3,$4),($1,$2,$3,$4)",[ids.biz,ids.product,ids.loc,ids.user]);
});
test('scanner tokens move to a hash the server computes identically',async()=>{
 await db.exec('ALTER TABLE users ADD COLUMN IF NOT EXISTS scanner_session_token uuid, ADD COLUMN IF NOT EXISTS scanner_linked_at timestamptz');
 const linked=uuid(),fresh=uuid(),linkedUser=uuid(),freshUser=uuid();
 await q("INSERT INTO users(id,business_id,name,email,role_id,scanner_session_token,scanner_linked_at) VALUES($1,$2,'Linked','l@example.invalid',$3,$4,now()-interval '2 days'),($5,$2,'Fresh','f@example.invalid',$3,$6,NULL)",[linkedUser,ids.biz,uuid(),linked,freshUser,fresh]);
 await db.exec(read('db/migrations/102_scanner_token_hash.sql'));
 const row=async(id)=>one('SELECT scanner_token_hash h,scanner_token_issued_at i,scanner_last_used_at u,scanner_linked_at l FROM users WHERE id=$1',[id]);
 const node=(t)=>require('node:crypto').createHash('sha256').update(t.toLowerCase()).digest('hex');
 assert.equal((await row(linkedUser)).h,node(linked));
 assert.equal((await row(freshUser)).h,node(fresh.toUpperCase()));
 // A linked scanner counts as used when it was linked; an unredeemed code is issued now.
 assert.deepEqual((await row(linkedUser)).u,(await row(linkedUser)).l);
 assert.ok((await row(freshUser)).i);
 // Re-running is harmless, and one hash cannot belong to two people.
 await db.exec(read('db/migrations/102_scanner_token_hash.sql'));
 await assert.rejects(q("UPDATE users SET scanner_token_hash=$1 WHERE id=$2",[node(linked),freshUser]),/duplicate key/);
});
