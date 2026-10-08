// Synthetic UI fixtures. Transaction and authorization behavior is tested separately.
const time = "2026-10-07T10:42:00Z";
const unit = {
  id: "unit-1",
  status: "in_stock",
  product_name: "LG 43-inch Television",
  item_code: "QD-004821",
  serial_number: "LG-2026-4821",
  location_id: "mock-loc",
};
const inspections = [
  {
    id: "inspection-1",
    status: "awaiting_inspection",
    created_at: time,
    item: {
      quantity: 1,
      product: { name: "LG 43-inch Television" },
      return: { reason: "Screen flickers", original_sale_id: "sale1" },
    },
  },
];
const cases = [
  {
    id: "case-1",
    title: "Transfer count discrepancy",
    status: "investigating",
    assignee_id: "u1",
    assignee: { name: "Ama Mensah" },
    due_date: "2026-10-09",
    notes: [
      {
        id: "note-1",
        actor: { name: "Ama Mensah" },
        note: "Checked dispatch list. One unit remains outstanding.",
        created_at: time,
      },
    ],
  },
];
const customers = [
  {
    id: "c1",
    name: "Adwoa Nyarko",
    phone: "0203334455",
    spent: 1200,
    last_purchase: time,
    allowed: true,
    eligible: true,
    preference: "Allowed",
  },
  {
    id: "c2",
    name: "Yaw Owusu",
    spent: 650,
    last_purchase: time,
    allowed: false,
    eligible: false,
    preference: "Opted out",
  },
];
const ownerSummary = { enabled: false, eligible: true };
const whatsapp = {
  receipts: false,
  reminders: false,
  gateway: null,
  recent: [
    { id: "wm1", kind: "receipt", status: "accepted", attempts: 1, detail: null, created_at: time, customer: { name: "Adwoa Nyarko" } },
    { id: "wm2", kind: "reminder", status: "skipped", attempts: 1, detail: "The customer has not given WhatsApp permission.", created_at: time, customer: { name: "Yaw Owusu" } },
  ],
};
const campaigns = [],
  followups = [],
  drafts = [],
  lines = [],
  labels = [];
const shipments = [
  {
    id: "transfer-1",
    source: { name: "Accra" },
    destination: { name: "Main Branch" },
    to_location_id: "mock-loc",
    from_location_id: "loc2",
    status: "partial",
    dispatched_at: time,
    dispatcher: { name: "Esi Owusu" },
    items: [{ unit_id: "unit-1", received_at: null }],
  },
];
const resultCache = new Map();
export function resolveOperationsMock(path, method, body = {}, query = {}) {
  const ownerSummaryPath = path === "/owner-summary" || path === "/owner-summary/preview";
  const whatsappPath =
    path.startsWith("/crm-communications/whatsapp") ||
    (path.startsWith("/crm-communications/gateways") && method !== "GET" && body?.type === "whatsapp");
  const billingPath = ["/subscriptions/mine", "/subscriptions/price", "/subscriptions/initialize-paystack"].includes(path);
  if (!path.startsWith("/operations/") && !path.startsWith("/traceability/") && path !== "/search" && path !== "/receipt-links" && !whatsappPath && !ownerSummaryPath && !billingPath)
    return undefined;
  if (
    method !== "GET" &&
    body.operation_id &&
    resultCache.has(body.operation_id)
  )
    return structuredClone(resultCache.get(body.operation_id));
  let result;
  if (path === "/operations/daily-work")
    result = {
      items: [
        {
          id: "inspection-1",
          title: "Inspect returned goods",
          detail: "1 unit awaiting inspection",
          category: "Stock",
          path: "/return-inspections",
        },
        {
          id: "transfer-1",
          title: "Complete a partial transfer",
          detail: "1 unit outstanding",
          category: "Stock",
          path: "/unit-transfers",
        },
      ],
      errors: [],
      updated_at: time,
      limited: true,
    };
  if (
    path === "/traceability/lookup" ||
    path === "/traceability/shipment-lookup"
  )
    result = query.code?.includes("UNKNOWN") ? [] : [unit];
  if (path.startsWith("/traceability/units/"))
    result = {
      unit: {
        ...unit,
        product: { name: unit.product_name, sku: "LG-43" },
        location: { name: "Main Branch" },
        qr: { code: unit.item_code },
        pack: { code: "PKG-4821" },
      },
      events: [
        {
          id: "ev-1",
          event_type: "history_started",
          created_at: time,
          details: { status: "in_stock" },
          location: { name: "Main Branch" },
        },
        {
          id: "ev-2",
          event_type: "changed",
          created_at: time,
          details: {
            before: { status: "in_transit" },
            after: { status: "in_stock" },
          },
          actor: { name: "Ama Mensah" },
          location: { name: "Main Branch" },
        },
      ],
      sales: [
        {
          id: "sale1",
          receipt_number: "DEMO-00412",
          created_at: time,
          customer: { name: "Adwoa Nyarko" },
        },
      ],
      returns: [],
      labels: [],
      batch: null,
    };
  if (path === "/traceability/receiving-records") result = [];
  if (path === "/traceability/shipments") result = shipments;
  if (path === "/traceability/inspections") result = inspections;
  if (path === "/traceability/cases") result = cases;
  if (path === "/traceability/labels") result = labels;
  if (path === "/traceability/staff")
    result = [{ id: "u1", name: "Ama Mensah" }];
  if (path.startsWith("/traceability/evidence/")) result = [];
  if (path === "/traceability/actions") {
    if (body.action === "inspect") {
      result = inspections.find((r) => r.id === body.inspection_id);
      Object.assign(result, {
        status: body.disposition,
        note: body.note,
        condition: body.condition,
      });
    }
    if (body.action === "open_case") {
      result = {
        id: crypto.randomUUID(),
        title: body.title,
        status: "open",
        notes: [],
      };
      cases.unshift(result);
    }
    if (body.action === "update_case") {
      result = cases.find((r) => r.id === body.case_id);
      Object.assign(result, { status: body.status, resolution: body.note });
      result.notes.push({
        id: crypto.randomUUID(),
        note: body.note,
        actor: { name: "Ama Mensah" },
        created_at: time,
      });
    }
    if (body.action === "dispatch") {
      result = {
        id: crypto.randomUUID(),
        status: "in_transit",
        source: { name: "Main Branch" },
        destination: { name: "Accra" },
        items: body.unit_ids.map((id) => ({ unit_id: id })),
        dispatched_at: time,
      };
      shipments.unshift(result);
    }
    if (body.action === "receive") {
      result = shipments.find((r) => r.id === body.shipment_id);
      result.items.forEach((i) => {
        if (body.unit_ids.includes(i.unit_id)) i.received_at = time;
      });
      result.status = "received";
    }
    if (body.action === "request_label") {
      result = {
        id: crypto.randomUUID(),
        old_code: { code: unit.item_code },
        new_code: { code: body.new_code },
        reason: body.note,
        requested_by: "mock-user",
        requester: { name: "Ama Mensah" },
      };
      labels.push(result);
    }
  }
  if (path === "/owner-summary") {
    if (method === "PUT") ownerSummary.enabled = body.enabled;
    result = { ...ownerSummary };
  }
  if (path === "/owner-summary/preview")
    result = {
      business: { name: "Omek Gigs", currency: "GHS" }, date: time.slice(0, 10),
      sales: { count: 14, gross: 3820, refunds: 120, refundCount: 1, net: 3700 },
      branches: [{ name: "Osu", sales: 2600, count: 9, refunds: 120 }, { name: "Tema", sales: 1220, count: 5, refunds: 0 }],
      tills: [{ branch: "Osu", register: "Main", expected: 1450, counted: 1440, variance: -10, reviewed: false }],
      openTills: [{ branch: "Tema", register: "Front" }],
      lowStock: { count: 3, items: [{ name: "Gino Tomato Paste 400g", branch: "Osu", quantity: 2 }] },
      pending: { tillReviews: 1, returnInspections: 1, investigations: 0, deliveries: 2, billsDue: 0 },
    };
  // One plan, paid before use (server/utils/subscriptionCharge.js prices these).
  if (path === "/subscriptions/price") result = { name: "QuadERP", currency: "GHS", price_yearly: 1000, setup_fee: 1000, price_per_extra_location: 200 };
  if (path === "/subscriptions/mine") {
    let status = "active";
    try { status = localStorage.getItem("mock_business_status") || "active"; } catch { /* default */ }
    const plan = { id: "plan-q", name: "QuadERP", currency: "GHS", price_yearly: 1000, setup_fee: 1000, price_per_extra_location: 200 };
    const paidBefore = status !== "unpaid";
    result = {
      status, is_demo: false, paid_before: paidBefore, paid_locations: paidBefore ? 2 : 1, locations_used: paidBefore ? 2 : 0,
      subscription: paidBefore ? { status: status === "expired" ? "expired" : "active", current_period_start: "2026-10-08T00:00:00Z", current_period_end: status === "expired" ? "2026-10-01T00:00:00Z" : "2027-10-08T00:00:00Z" } : null,
      plan,
      offers: paidBefore
        ? { start: null, renew: { kind: "renew", branches: 2, amount: 1200, lines: [] }, branch: { kind: "branches", branches: 1, amount: 200, lines: [] } }
        : { start: { kind: "start", branches: 1, amount: 2000, lines: [] }, renew: null, branch: null },
    };
  }
  if (path === "/subscriptions/initialize-paystack") {
    const branches = Number(body.branches || 1);
    const amount = { start: 1000 + 1000 + 200 * (branches - 1), renew: 1200, branches: 200 * branches }[body.kind];
    if (!amount) throw Object.assign(new Error("Unknown payment."), { status: 400 });
    result = { authorization_url: "about:blank#paystack-mock", reference: "mock-ref", amount, currency: "GHS" };
  }
  if (path === "/crm-communications/whatsapp") result = whatsapp;
  if (path === "/crm-communications/whatsapp/settings") {
    // Mirrors the server: a kind switches on only with the account and its template.
    if ((body.receipts || body.reminders) && !whatsapp.gateway)
      throw Object.assign(new Error("Connect your WhatsApp Business account first."), { status: 409 });
    for (const [key, template, label] of [["receipts", "receipt_template", "receipt"], ["reminders", "reminder_template", "reminder"]])
      if (body[key] && !whatsapp.gateway.config?.[template])
        throw Object.assign(new Error(`Add the approved ${label} template name first.`), { status: 409 });
    Object.assign(whatsapp, { receipts: body.receipts, reminders: body.reminders });
    result = { receipts: body.receipts, reminders: body.reminders };
  }
  if (path === "/crm-communications/whatsapp/test") {
    // Mirrors the server: account, then the template for that kind, then a number.
    if (!whatsapp.gateway) throw Object.assign(new Error("Connect your WhatsApp Business account first."), { status: 409 });
    const template = whatsapp.gateway.config?.[`${body.kind}_template`];
    if (!template) throw Object.assign(new Error(`Add the approved ${body.kind} template name first.`), { status: 409 });
    const digits = String(body.phone || "").replace(/\D/g, "").replace(/^0/, "");
    if (digits.length < 9) throw Object.assign(new Error("Enter the phone number to send the test to."), { status: 400 });
    result = { accepted: true, to: `+233${digits.slice(-9)}`, template };
  }
  if (path.startsWith("/crm-communications/gateways") && body?.type === "whatsapp") {
    whatsapp.gateway = { id: "wg1", display_name: body.display_name, sender_id: body.sender_id, is_active: true, config: body.config };
    result = { ...whatsapp.gateway, api_key: "••••••••" + String(body.api_key || "0000").slice(-4) };
  }
  if (path === "/receipt-links")
    result = method === "DELETE" ? { revoked: 1 } : { token: "MockReceiptLinkToken_0123456789a", expires_at: "2026-11-07T10:42:00Z" };
  if (path === "/search") {
    const q = String(query.q || "").trim().toLowerCase();
    const day = time.slice(0, 10);
    const all = [
      { type: "customer", id: "c1", label: "Adwoa Nyarko", detail: "0203334455", path: "/customers/c1" },
      { type: "receipt", id: "sale1", label: "DEMO-00412", detail: day, path: `/sales-record?date=${day}&highlight=sale1` },
      { type: "item", id: unit.id, label: unit.item_code, detail: unit.product_name, path: `/item-history?code=${unit.item_code}&unit=${unit.id}` },
    ];
    result = { results: q.length < 2 ? [] : all.filter((r) => `${r.label} ${r.detail}`.toLowerCase().includes(q)) };
  }
  if (path === "/operations/customers/consent-preview") {
    const tail = (v) => String(v || "").replace(/\D/g, "").slice(-9);
    const matched = [], unmatched = [], invalid = [];
    for (const raw of body.phones || []) {
      if (tail(raw).length < 9) { invalid.push(raw); continue; }
      const hit = customers.find((c) => c.phone && tail(c.phone) === tail(raw));
      if (!hit) unmatched.push(raw);
      else if (!matched.some((m) => m.id === hit.id)) matched.push({ id: hit.id, name: hit.name, phone: hit.phone });
    }
    result = { matched, unmatched, invalid };
  }
  if (path === "/operations/customers/consent") {
    for (const row of customers.filter((r) => body.customer_ids.includes(r.id)))
      Object.assign(row, {
        allowed: body.allowed,
        eligible: body.allowed && !!row.phone,
        preference: !body.allowed ? "Opted out" : row.phone ? "Allowed" : "Contact detail missing",
      });
    result = { recorded: body.customer_ids.length, channel: body.channel, allowed: body.allowed };
  }
  if (path === "/operations/customers/segment")
    result = {
      rows: customers,
      total: customers.length,
      eligible: customers.filter((r) => r.eligible).length,
      offset: 0,
    };
  if (path === "/operations/customers/campaigns") result = campaigns;
  if (path === "/operations/customers/followups") result = followups;
  if (path === "/operations/customers/actions") {
    if (body.action === "preference") {
      result = customers.find((r) => r.id === body.customer_id);
      Object.assign(result, {
        allowed: body.allowed,
        eligible: body.allowed,
        preference: body.allowed ? "Allowed" : "Opted out",
      });
    }
    if (body.action === "campaign") {
      result = {
        ...body,
        id: body.campaign_id || crypto.randomUUID(),
        status: "draft",
        version: 1,
        updated_at: time,
      };
      campaigns.unshift(result);
    }
    if (body.action === "review_campaign") {
      result = campaigns.find((r) => r.id === body.campaign_id);
      Object.assign(result, { status: "reviewed", version: 2 });
    }
    if (body.action === "followup") {
      result = { ...body, id: crypto.randomUUID(), created_at: time };
      followups.unshift(result);
    }
  }
  if (path === "/operations/drafts")
    result = drafts.filter((r) => !r.closed_at);
  if (path === "/operations/drafts/actions") {
    if (body.action === "create") {
      result = {
        ...body,
        id: crypto.randomUUID(),
        version: 1,
        updated_at: time,
        claimed_until: "2030-01-01T00:00:00Z",
      };
      drafts.unshift(result);
    } else {
      result = drafts.find((r) => r.id === body.draft_id);
      Object.assign(result, { ...body, version: result.version + 1 });
      if (body.action === "release")
        Object.assign(result, { device_id: null, claimed_until: null });
      if (body.action === "close") result.closed_at = time;
    }
  }
  if (path === "/operations/statements/preview")
    result = {
      lines: [
        {
          reference: "TEST-1",
          date: "2026-10-07",
          direction: "payment",
          currency: "GHS",
          gross: 100,
          fee: 1,
          net: 99,
        },
      ],
    };
  if (path === "/operations/statements")
    result = {
      lines,
      sales: [
        {
          id: "sale1",
          receipt_number: "REC-00842",
          amount_paid: 100,
          payment_method: "mobile",
          settled_at: time,
        },
      ],
      refunds: [],
      limit: 500,
    };
  if (path === "/operations/statements/actions") {
    if (body.action === "import") {
      lines.push(
        ...body.lines.map((r) => ({
          ...r,
          id: crypto.randomUUID(),
          provider: body.provider,
          account_label: body.account_label,
          payment_method: body.payment_method,
          statement_date: r.date,
        })),
      );
      result = { imported: body.lines.length, duplicates: 0 };
    } else {
      result = lines.find((r) => r.id === body.line_id);
      Object.assign(result, {
        matched_at: time,
        matched_sale_id: body.target_id,
      });
    }
  }
  if (result === undefined)
    throw new Error(`Missing operations UI fixture: ${method} ${path}`);
  if (body.operation_id)
    resultCache.set(body.operation_id, structuredClone(result));
  return structuredClone(result);
}
