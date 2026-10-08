// Real PostgreSQL execution in an isolated in-memory PGlite instance; no live data.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID: uuid } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { PGlite } = require("@electric-sql/pglite");
const db = new PGlite();
const ids = Object.fromEntries(
  [
    "biz",
    "other",
    "loc",
    "loc2",
    "user",
    "otherUser",
    "supplier",
    "product",
  ].map((key) => [key, uuid()]),
);
const q = (sql, args = []) => db.query(sql, args);
const one = async (sql, args) => (await q(sql, args)).rows[0];
const read = (file) =>
  fs.readFileSync(path.join(__dirname, "..", file), "utf8");
before(async () => {
  await db.exec(
    "CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;",
  );
  for (const file of [
    "__tests__/fixtures/transaction-schema.sql",
    "db/migrations/083_atomic_checkout.sql",
    "db/migrations/084_atomic_returns.sql",
    "__tests__/fixtures/reservation-schema.sql",
    "db/migrations/085_atomic_reservations.sql",
    "db/migrations/086_atomic_receiving.sql",
  ])
    await db.exec(read(file));
  // Use the real AP contract (unrelated import FK omitted), plus numbering functions.
  const core = read("db/migrations/044_ar_ap_core.sql");
  const ap = core
    .slice(
      core.indexOf("CREATE TABLE IF NOT EXISTS public.ap_bills"),
      core.indexOf("-- ============== business_ledger"),
    )
    .replace(/ REFERENCES public.import_batches\(id\) ON DELETE SET NULL/g, "");
  await db.exec(ap);
  await db.exec(
    "CREATE TABLE ar_payments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),ledger_entry_id uuid,payment_method text);",
  );
  await db.exec(read("db/migrations/045_ar_ap_numbering.sql"));
  await db.exec(read("db/migrations/046_ar_ap_payment_rpc.sql"));
  await db.exec(read("db/migrations/089_retail_workflows.sql"));
  await db.exec(
    "CREATE TABLE alerts(id uuid PRIMARY KEY,business_id uuid,location_id uuid);",
  );
  await db.exec(read("db/migrations/090_traceability_operations.sql"));
  await db.exec(read("db/migrations/091_customer_work_and_settlements.sql"));
  await db.exec(read("db/migrations/092_bulk_customer_consent.sql"));
  await db.exec(read("db/migrations/093_receipt_links.sql"));
  await q(
    "INSERT INTO businesses(id,name,slug) VALUES($1,'Retail test','retail-test'),($2,'Other','other-test')",
    [ids.biz, ids.other],
  );
  await q(
    "INSERT INTO locations(id,business_id,name) VALUES($1,$2,'Branch'),($3,$2,'Branch two')",
    [ids.loc, ids.biz, ids.loc2],
  );
  await q(
    "INSERT INTO users(id,business_id,name,email,role_id) VALUES($1,$2,'Operator','test@example.invalid',$3),($4,$5,'Other','other@example.invalid',$6)",
    [ids.user, ids.biz, uuid(), ids.otherUser, ids.other, uuid()],
  );
  await q(
    "INSERT INTO suppliers(id,business_id,name) VALUES($1,$2,'Supplier')",
    [ids.supplier, ids.biz],
  );
  await q(
    "INSERT INTO products(id,business_id,name,sku) VALUES($1,$2,'Stock','STOCK')",
    [ids.product, ids.biz],
  );
});
after(() => db.close());
const action = async (request, loc = ids.loc, user = ids.user, biz = ids.biz) =>
  (
    await one("SELECT traceability_action($1,$2,$3,$4) AS result", [
      biz,
      loc,
      user,
      JSON.stringify(request),
    ])
  ).result;
async function makeUnit(code) {
  const qr = uuid(),
    unit = uuid();
  await q("INSERT INTO qr_code_pool(id,code) VALUES($1,$2)", [qr, code]);
  await q(
    "INSERT INTO inventory_units(id,business_id,product_id,location_id,assigned_by,qr_code_id) VALUES($1,$2,$3,$4,$5,$6)",
    [unit, ids.biz, ids.product, ids.loc, ids.user, qr],
  );
  return unit;
}
test("scanned transfer removes available stock; partial receipts conserve quantity and unit identity", async () => {
  await q(
    "INSERT INTO product_inventory(product_id,location_id,quantity) VALUES($1,$2,4)",
    [ids.product, ids.loc],
  );
  const a = await makeUnit("QA-A"),
    b = await makeUnit("QA-B");
  const request = {
    operation_id: uuid(),
    action: "dispatch",
    destination_id: ids.loc2,
    unit_ids: [a, b],
    note: "Named handover",
  };
  const transfer = await action(request);
  assert.deepEqual(await action(request), transfer);
  assert.equal(
    (
      await one(
        "SELECT quantity FROM product_inventory WHERE product_id=$1 AND location_id=$2",
        [ids.product, ids.loc],
      )
    ).quantity,
    2,
  );
  assert.equal(
    (await one("SELECT status FROM inventory_units WHERE id=$1", [a])).status,
    "in_transit",
  );
  await assert.rejects(
    action({ ...request, operation_id: uuid() }),
    /available/,
  );
  await assert.rejects(
    action({
      action: "receive",
      operation_id: uuid(),
      shipment_id: transfer.id,
      unit_ids: [a],
    }),
    /receiving branch/,
  );
  const receive = {
    operation_id: uuid(),
    action: "receive",
    shipment_id: transfer.id,
    unit_ids: [a],
    note: "One received",
  };
  const partial = await action(receive, ids.loc2);
  assert.equal(partial.status, "partial");
  assert.deepEqual(await action(receive, ids.loc2), partial);
  assert.equal(
    (
      await one(
        "SELECT quantity FROM product_inventory WHERE product_id=$1 AND location_id=$2",
        [ids.product, ids.loc2],
      )
    ).quantity,
    1,
  );
  await assert.rejects(
    action({ ...receive, operation_id: uuid() }, ids.loc2),
    /unexpected/,
  );
  assert.equal(
    (
      await action(
        { ...receive, operation_id: uuid(), unit_ids: [b] },
        ids.loc2,
      )
    ).status,
    "received",
  );
  assert.equal(
    (
      await one(
        "SELECT sum(quantity)::int n FROM product_inventory WHERE product_id=$1",
        [ids.product],
      )
    ).n,
    4,
  );
});
test("cross-business requests and changed retry bodies are rejected without stock writes", async () => {
  const a = await makeUnit("QA-C");
  await assert.rejects(
    action(
      {
        action: "dispatch",
        operation_id: uuid(),
        unit_ids: [a],
        destination_id: ids.loc2,
      },
      ids.loc,
      ids.otherUser,
    ),
    /Invalid operator/,
  );
  const request = {
    action: "dispatch",
    operation_id: uuid(),
    unit_ids: [a],
    destination_id: ids.loc2,
    note: "First",
  };
  await action(request);
  await assert.rejects(
    action({ ...request, note: "Changed" }),
    /Reference already used/,
  );
  const events = (
    await q(
      "SELECT event_type,actor_id FROM unit_events WHERE unit_id=$1 ORDER BY created_at",
      [a],
    )
  ).rows;
  assert.equal(events.length, 2);
  assert.equal(events[1].actor_id, ids.user);
});
test("label replacement requires a second person, voids old code, and preserves history", async () => {
  const a = await makeUnit("QA-D"),
    otherOperator = uuid();
  await q(
    "INSERT INTO users(id,business_id,name,email,role_id) VALUES($1,$2,'Reviewer','reviewer@example.invalid',$3)",
    [otherOperator, ids.biz, uuid()],
  );
  await q("INSERT INTO qr_code_pool(code) VALUES('QA-NEW')");
  const req = await action({
    action: "request_label",
    operation_id: uuid(),
    unit_id: a,
    new_code: "QA-NEW",
    note: "Label damaged",
  });
  await assert.rejects(
    action({ action: "approve_label", operation_id: uuid(), label_id: req.id }),
    /different manager/,
  );
  const approved = await action(
    { action: "approve_label", operation_id: uuid(), label_id: req.id },
    ids.loc,
    otherOperator,
  );
  assert.equal(approved.approved_by, otherOperator);
  assert.equal(
    (await one("SELECT status FROM qr_code_pool WHERE code='QA-D'")).status,
    "voided",
  );
  assert.equal(
    (await one("SELECT qr_code_id FROM inventory_units WHERE id=$1", [a]))
      .qr_code_id,
    req.new_code_id,
  );
});
test("inspection rejects damaged restock, releases good stock exactly once, and retains investigation notes", async () => {
  const unit = await makeUnit("QA-E"),
    sale = uuid(),
    line = uuid(),
    ret = uuid(),
    item = uuid(),
    inspection = uuid();
  await q(
    "INSERT INTO sales(id,business_id,location_id,salesperson_id,total_amount,payment_method) VALUES($1,$2,$3,$4,10,'cash')",
    [sale, ids.biz, ids.loc, ids.user],
  );
  await q(
    "INSERT INTO sale_items(id,sale_id,business_id,product_id,quantity,unit_price) VALUES($1,$2,$3,$4,1,10)",
    [line, sale, ids.biz, ids.product],
  );
  await q(
    "INSERT INTO returns(id,business_id,location_id,original_sale_id,processed_by) VALUES($1,$2,$3,$4,$5)",
    [ret, ids.biz, ids.loc, sale, ids.user],
  );
  await q(
    "INSERT INTO return_items(id,return_id,sale_item_id,product_id,quantity,unit_price,returned_unit_ids) VALUES($1,$2,$3,$4,1,10,$5)",
    [item, ret, line, ids.product, [unit]],
  );
  await q(
    "INSERT INTO return_inspections(id,business_id,location_id,return_item_id) VALUES($1,$2,$3,$4)",
    [inspection, ids.biz, ids.loc, item],
  );
  await q("UPDATE inventory_units SET status='quarantine' WHERE id=$1", [unit]);
  const before = (
    await one(
      "SELECT quantity FROM product_inventory WHERE product_id=$1 AND location_id=$2",
      [ids.product, ids.loc],
    )
  ).quantity;
  const request = {
    action: "inspect",
    operation_id: uuid(),
    inspection_id: inspection,
    condition: "damaged",
    disposition: "restock",
    note: "Screen cracked",
  };
  await assert.rejects(action(request), /Damaged/);
  assert.equal(
    (await action({ ...request, disposition: "repair" })).status,
    "repair",
  );
  const release = {
    ...request,
    operation_id: uuid(),
    condition: "working",
    note: "Repair checked and tested",
  };
  const released = await action(release);
  assert.deepEqual(await action(release), released);
  assert.equal(
    (
      await one(
        "SELECT quantity FROM product_inventory WHERE product_id=$1 AND location_id=$2",
        [ids.product, ids.loc],
      )
    ).quantity,
    before + 1,
  );
  await assert.rejects(action({ ...release, operation_id: uuid() }), /final/);
  const c = await action({
    action: "open_case",
    operation_id: uuid(),
    title: "Count discrepancy",
    unit_id: unit,
  });
  await action({
    action: "update_case",
    operation_id: uuid(),
    case_id: c.id,
    assignee_id: ids.user,
    status: "investigating",
    note: "Checked receipt",
  });
  await action({
    action: "update_case",
    operation_id: uuid(),
    case_id: c.id,
    assignee_id: ids.user,
    status: "resolved",
    note: "Count verified against receipt",
  });
  assert.equal(
    (
      await one(
        "SELECT count(*)::int n FROM loss_case_notes WHERE case_id=$1",
        [c.id],
      )
    ).n,
    2,
  );
  await assert.rejects(
    action({
      action: "update_case",
      operation_id: uuid(),
      case_id: c.id,
      status: "open",
      note: "Rewrite",
    }),
    /cannot be rewritten/,
  );
});
test("browser roles cannot modify new workflow tables or execute transaction functions", async () => {
  for (const role of ["anon", "authenticated"]) {
    for (const table of [
      "unit_events",
      "unit_shipments",
      "unit_shipment_items",
      "return_inspections",
      "loss_cases",
      "loss_case_notes",
      "label_requests",
      "workflow_evidence",
      "customer_contact_preferences",
      "customer_campaigns",
      "customer_followups",
      "shared_work_drafts",
      "provider_statement_lines",
    ]) {
      assert.equal(
        (
          await one("SELECT has_table_privilege($1,$2,'INSERT') AS allowed", [
            role,
            table,
          ])
        ).allowed,
        false,
      );
      assert.equal(
        (
          await one(
            "SELECT relrowsecurity FROM pg_class WHERE oid=$1::regclass",
            [table],
          )
        ).relrowsecurity,
        true,
      );
    }
    assert.equal(
      (
        await one(
          "SELECT has_function_privilege($1,'traceability_action(uuid,uuid,uuid,jsonb)','EXECUTE') allowed",
          [role],
        )
      ).allowed,
      false,
    );
  }
});
test("shared drafts enforce owner, revision and device claims, including response-loss retries", async () => {
  const draft = async (request) =>
    (
      await one("SELECT shared_draft_action($1,$2,$3,$4) result", [
        ids.biz,
        ids.loc,
        ids.user,
        JSON.stringify(request),
      ])
    ).result;
  const device = uuid(),
    other = uuid();
  const create = {
    action: "create",
    operation_id: uuid(),
    device_id: device,
    kind: "basket",
    title: "Customer purchase",
    payload: { items: [] },
  };
  const created = await draft(create);
  assert.deepEqual(await draft(create), created);
  await assert.rejects(
    draft({
      action: "claim",
      operation_id: uuid(),
      device_id: other,
      draft_id: created.id,
      version: 1,
    }),
    /another device/,
  );
  const save = {
    action: "save",
    operation_id: uuid(),
    device_id: device,
    draft_id: created.id,
    version: 1,
    title: "Updated",
    payload: { items: [{ id: ids.product }] },
  };
  const saved = await draft(save);
  assert.equal(saved.version, 2);
  assert.deepEqual(await draft(save), saved);
  await assert.rejects(
    draft({ ...save, operation_id: uuid() }),
    /changed on another/,
  );
  const released = await draft({
    action: "release",
    operation_id: uuid(),
    device_id: device,
    draft_id: saved.id,
    version: 2,
  });
  const claimed = await draft({
    action: "claim",
    operation_id: uuid(),
    device_id: other,
    draft_id: saved.id,
    version: released.version,
  });
  assert.equal(claimed.device_id, other);
  assert.deepEqual(claimed.payload, save.payload);
  await assert.rejects(
    one("SELECT shared_draft_action($1,$2,$3,$4)", [
      ids.other,
      ids.loc,
      ids.otherUser,
      JSON.stringify({ ...save, operation_id: uuid() }),
    ]),
    /Invalid draft/,
  );
});
test("customer audience excludes unknown and opted-out channels and preserves campaign revisions", async () => {
  const customer = uuid();
  await q(
    "INSERT INTO customers(id,business_id,name,phone,email) VALUES($1,$2,'Audience example','+233000000000','test@example.invalid')",
    [customer, ids.biz],
  );
  const audience = async () =>
    (await one("SELECT customer_segment($1,'{}','sms',0) result", [ids.biz]))
      .result;
  assert.equal((await audience()).eligible, 0);
  const act = async (request) =>
    (
      await one("SELECT customer_work_action($1,$2,$3) result", [
        ids.biz,
        ids.user,
        JSON.stringify(request),
      ])
    ).result;
  await act({
    action: "preference",
    operation_id: uuid(),
    customer_id: customer,
    channel: "sms",
    allowed: true,
    source: "Customer requested SMS in store",
  });
  assert.equal((await audience()).eligible, 1);
  const campaign = await act({
    action: "campaign",
    operation_id: uuid(),
    name: "Service follow-up",
    channel: "sms",
    subject: "",
    message: "How is your purchase?",
    criteria: {},
  });
  await act({
    action: "preference",
    operation_id: uuid(),
    customer_id: customer,
    channel: "sms",
    allowed: false,
    source: "Customer opted out",
  });
  assert.equal((await audience()).eligible, 0);
  await assert.rejects(
    act({
      action: "followup",
      operation_id: uuid(),
      campaign_id: campaign.id,
      customer_id: customer,
      status: "planned",
      note: "Call later",
    }),
    /has not allowed/,
  );
  await assert.rejects(
    act({
      action: "followup",
      operation_id: uuid(),
      campaign_id: campaign.id,
      customer_id: customer,
      status: "delivered",
      note: "Unknown",
    }),
    /provider reference/,
  );
});
test("statement import is duplicate safe and rejects changed references, wrong amounts, and double matching", async () => {
  const act = async (request) =>
    (
      await one("SELECT statement_action($1,$2,$3,$4) result", [
        ids.biz,
        ids.loc,
        ids.user,
        JSON.stringify(request),
      ])
    ).result;
  const request = {
    action: "import",
    operation_id: uuid(),
    provider: "Test provider",
    account_label: "Business merchant",
    payment_method: "mobile",
    lines: [
      {
        reference: "PAY-1",
        date: "2026-10-07",
        direction: "payment",
        currency: "GHS",
        gross: 50,
        fee: 1,
        net: 49,
      },
    ],
  };
  assert.equal((await act(request)).imported, 1);
  assert.equal((await act(request)).imported, 1);
  assert.equal((await act({ ...request, operation_id: uuid() })).duplicates, 1);
  await assert.rejects(
    act({
      ...request,
      operation_id: uuid(),
      lines: [{ ...request.lines[0], gross: 51, net: 50 }],
    }),
    /different details/,
  );
  const line = await one(
    "SELECT id FROM provider_statement_lines WHERE reference='PAY-1'",
  );
  const sale = uuid();
  await q(
    "INSERT INTO sales(id,business_id,location_id,salesperson_id,total_amount,amount_paid,payment_method) VALUES($1,$2,$3,$4,50,50,'mobile')",
    [sale, ids.biz, ids.loc, ids.user],
  );
  await act({
    action: "match",
    operation_id: uuid(),
    line_id: line.id,
    target_id: sale,
    note: "Reviewed receipt and provider reference",
  });
  await assert.rejects(
    act({
      action: "match",
      operation_id: uuid(),
      line_id: line.id,
      target_id: sale,
      note: "Repeat",
    }),
    /already matched/,
  );
  assert.equal(
    (await one("SELECT amount_paid FROM sales WHERE id=$1", [sale]))
      .amount_paid,
    "50.00",
  );
});

test("new refunds quarantine once; old refunds and released inspections remain unchanged on retry", async () => {
  async function sold(code) {
    const unit = await makeUnit(code),
      sale = uuid(),
      line = uuid();
    await q(
      "INSERT INTO sales(id,business_id,location_id,salesperson_id,total_amount,payment_method) VALUES($1,$2,$3,$4,10,'cash')",
      [sale, ids.biz, ids.loc, ids.user],
    );
    await q(
      "INSERT INTO sale_items(id,sale_id,business_id,product_id,quantity,unit_price,tracked_quantity) VALUES($1,$2,$3,$4,1,10,1)",
      [line, sale, ids.biz, ids.product],
    );
    await q(
      "UPDATE inventory_units SET status='sold',sold_in_sale_id=$2 WHERE id=$1",
      [unit, sale],
    );
    return { unit, sale, line, op: uuid() };
  }
  const refund = async (record, func = "process_return_transaction") =>
    (
      await one(`SELECT ${func}($1,$2,$3,$4,$5,$6,$7) result`, [
        ids.biz,
        ids.loc,
        ids.user,
        record.sale,
        record.op,
        JSON.stringify([
          { sale_item_id: record.line, quantity: 1, unit_ids: [record.unit] },
        ]),
        "Customer return",
      ])
    ).result;
  const a = await sold("QA-NEW-RETURN");
  const stock = async () =>
    (
      await one(
        "SELECT quantity FROM product_inventory WHERE product_id=$1 AND location_id=$2",
        [ids.product, ids.loc],
      )
    ).quantity;
  const before = await stock(),
    result = await refund(a);
  assert.equal(result.inspection_required, true);
  assert.equal(await stock(), before);
  assert.equal(
    (await one("SELECT status FROM inventory_units WHERE id=$1", [a.unit]))
      .status,
    "quarantine",
  );
  assert.deepEqual(await refund(a), result);
  assert.equal(await stock(), before);
  const inspection = await one(
    "SELECT i.id FROM return_inspections i JOIN return_items r ON r.id=i.return_item_id WHERE r.return_id=$1",
    [result.return_id],
  );
  await action({
    action: "inspect",
    operation_id: uuid(),
    inspection_id: inspection.id,
    condition: "working",
    disposition: "restock",
    note: "Checked and tested",
  });
  assert.equal(await stock(), before + 1);
  await refund(a);
  assert.equal(await stock(), before + 1);
  assert.equal(
    (await one("SELECT status FROM inventory_units WHERE id=$1", [a.unit]))
      .status,
    "in_stock",
  );
  const old = await sold("QA-OLD-RETURN");
  await refund(old, "process_return_accounting");
  const historicalStock = await stock();
  const retry = await refund(old);
  assert.equal(retry.inspection_required, false);
  assert.equal(await stock(), historicalStock);
  assert.equal(
    (await one("SELECT status FROM inventory_units WHERE id=$1", [old.unit]))
      .status,
    "in_stock",
  );
});

test("settlement mismatch and wrong branch roll back without recording success", async () => {
  const act = async (request, location = ids.loc) =>
    (
      await one("SELECT statement_action($1,$2,$3,$4) result", [
        ids.biz,
        location,
        ids.user,
        JSON.stringify(request),
      ])
    ).result;
  await act({
    action: "import",
    operation_id: uuid(),
    provider: "Provider",
    account_label: "Mismatch test",
    payment_method: "card",
    lines: [
      {
        reference: "MISMATCH",
        date: "2026-10-07",
        direction: "payment",
        currency: "GHS",
        gross: 25,
        fee: 1,
        net: 24,
      },
    ],
  });
  const line = await one(
    "SELECT id FROM provider_statement_lines WHERE reference='MISMATCH'",
  );
  const sale = uuid();
  await q(
    "INSERT INTO sales(id,business_id,location_id,salesperson_id,total_amount,amount_paid,payment_method) VALUES($1,$2,$3,$4,26,26,'card')",
    [sale, ids.biz, ids.loc, ids.user],
  );
  const req = {
    action: "match",
    operation_id: uuid(),
    line_id: line.id,
    target_id: sale,
    note: "Wrong amount",
  };
  await assert.rejects(act(req), /Amount, channel and currency/);
  assert.equal(
    (
      await one(
        "SELECT count(*)::int n FROM retail_operations WHERE operation_id=$1",
        [req.operation_id],
      )
    ).n,
    0,
  );
  await assert.rejects(
    act({ ...req, operation_id: uuid() }, ids.loc2),
    /not found/,
  );
  assert.equal(
    (
      await one("SELECT matched_at FROM provider_statement_lines WHERE id=$1", [
        line.id,
      ])
    ).matched_at,
    null,
  );
});

test("receiving provenance links only delivered quantities of the same product and branch", async () => {
  const a = await makeUnit("QA-RECEIPT-A"),
    b = await makeUnit("QA-RECEIPT-B"),
    po = uuid(),
    receipt = uuid();
  await q(
    "INSERT INTO purchase_orders(id,business_id,supplier_id,po_number,created_by) VALUES($1,$2,$3,'PO-ORIGIN',$4)",
    [po, ids.biz, ids.supplier, ids.user],
  );
  await q(
    "INSERT INTO purchase_receipts(id,business_id,operation_id,purchase_order_id,location_id,actor_id,request,result) VALUES($1,$2,$3,$4,$5,$6,'{}',$7)",
    [
      receipt,
      ids.biz,
      uuid(),
      po,
      ids.loc,
      ids.user,
      JSON.stringify({
        received_items: [{ product_id: ids.product, quantity: 1 }],
      }),
    ],
  );
  const req = {
    action: "link_receipt",
    operation_id: uuid(),
    unit_id: a,
    receipt_id: receipt,
    note: "Matched label to original delivery note",
  };
  const linked = await action(req);
  assert.deepEqual(await action(req), linked);
  assert.equal(
    (
      await one("SELECT purchase_receipt_id FROM inventory_units WHERE id=$1", [
        a,
      ])
    ).purchase_receipt_id,
    receipt,
  );
  await assert.rejects(
    action({ ...req, operation_id: uuid(), unit_id: b }),
    /already linked/,
  );
  await assert.rejects(
    action({ ...req, operation_id: uuid(), unit_id: b }, ids.loc2),
    /not found in this branch/,
  );
  assert.equal(
    (
      await one(
        "SELECT count(*)::int n FROM unit_events WHERE unit_id=$1 AND event_type='receiving_link'",
        [a],
      )
    ).n,
    1,
  );
});

test('private evidence is tenant scoped, capped atomically and frozen after reviewed resolution',async()=>{
 const c=await action({action:'open_case',operation_id:uuid(),title:'Evidence boundary'});
 const put=async(subject=c.id,biz=ids.biz)=>q("INSERT INTO workflow_evidence(business_id,location_id,subject_type,subject_id,uploaded_by,filename,content_type,content_base64) VALUES($1,$2,'case',$3,$4,'evidence.png','image/png','aGVsbG8=')",[biz,ids.loc,subject,ids.user]);
 await assert.rejects(put(c.id,ids.other),/not found/);
 for(let i=0;i<10;i++)await put();await assert.rejects(put(),/ten photos/);
 await action({action:'update_case',operation_id:uuid(),case_id:c.id,status:'resolved',note:'Reviewed all evidence'});
 await assert.rejects(put(),/read-only/);
 assert.equal((await one('SELECT count(*)::int n FROM workflow_evidence WHERE subject_id=$1',[c.id])).n,10);
});

test("bulk consent is one journalled transaction, retry-safe, tenant-scoped and removed with the customer", async () => {
  const mine = [uuid(), uuid(), uuid()],
    theirs = uuid();
  for (const [i, c] of mine.entries())
    await q(
      "INSERT INTO customers(id,business_id,name,phone) VALUES($1,$2,$3,$4)",
      [c, ids.biz, "Bulk consent " + i, "+23320000010" + i],
    );
  await q(
    "INSERT INTO customers(id,business_id,name,phone) VALUES($1,$2,'Other tenant','+233200000199')",
    [theirs, ids.other],
  );
  const bulk = async (request) =>
    (
      await one("SELECT customer_consent_bulk($1,$2,$3) result", [
        ids.biz,
        ids.user,
        JSON.stringify(request),
      ])
    ).result;
  const allowedCount = async () =>
    (
      await one(
        "SELECT count(*)::int n FROM customer_contact_preferences WHERE business_id=$1 AND customer_id=ANY($2) AND channel='sms' AND allowed",
        [ids.biz, mine],
      )
    ).n;
  const request = {
    operation_id: uuid(),
    customer_ids: [...mine, mine[0]],
    channel: "sms",
    allowed: true,
    source: "Signed paper consent forms, October 2026",
  };
  const first = await bulk(request);
  assert.deepEqual(first, { recorded: 3, channel: "sms", allowed: true });
  assert.deepEqual(await bulk(request), first, "a retry returns the stored result");
  assert.equal(await allowedCount(), 3);
  await assert.rejects(bulk({ ...request, source: "Changed" }), /Reference already used/);
  await assert.rejects(
    bulk({ operation_id: uuid(), customer_ids: [mine[0], theirs], channel: "sms", allowed: false, source: "Opt-out list" }),
    /not found/,
  );
  assert.equal(await allowedCount(), 3, "a rejected batch writes nothing");
  await assert.rejects(
    bulk({ operation_id: uuid(), customer_ids: Array.from({ length: 501 }, uuid), channel: "sms", allowed: true, source: "List" }),
    /between 1 and 500/,
  );
  await assert.rejects(
    bulk({ operation_id: uuid(), customer_ids: mine, channel: "sms", allowed: true, source: "   " }),
    /how this permission was obtained/,
  );
  await q("DELETE FROM customers WHERE id=$1", [mine[1]]);
  assert.equal(
    (await one("SELECT count(*)::int n FROM customer_contact_preferences WHERE customer_id=$1", [mine[1]])).n,
    0,
    "deleting a customer removes their preferences instead of blocking",
  );
});

test("receipt links store only a hash, expire after creation, go with their sale and deny browser roles", async () => {
  const sale = uuid();
  await q("INSERT INTO sales(id,business_id,location_id,salesperson_id,total_amount,payment_method) VALUES($1,$2,$3,$4,10,'cash')", [sale, ids.biz, ids.loc, ids.user]);
  const hash = "a".repeat(64);
  await q("INSERT INTO receipt_links(business_id,sale_id,token_hash,created_by,expires_at) VALUES($1,$2,$3,$4,now()+interval '30 days')", [ids.biz, sale, hash, ids.user]);
  await assert.rejects(q("INSERT INTO receipt_links(business_id,sale_id,token_hash,expires_at) VALUES($1,$2,'plain-token',now()+interval '1 day')", [ids.biz, sale]), /check/i);
  await assert.rejects(q("INSERT INTO receipt_links(business_id,sale_id,token_hash,expires_at) VALUES($1,$2,$3,now()-interval '1 day')", [ids.biz, sale, "b".repeat(64)]), /check/i);
  for (const role of ["anon", "authenticated"])
    assert.equal((await one("SELECT has_table_privilege($1,'receipt_links','SELECT') allowed", [role])).allowed, false);
  await q("DELETE FROM sales WHERE id=$1", [sale]);
  assert.equal((await one("SELECT count(*)::int n FROM receipt_links WHERE sale_id=$1", [sale])).n, 0);
});
