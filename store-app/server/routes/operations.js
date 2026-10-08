const express = require("express");
const { z } = require("zod");
const { parse } = require("csv-parse/sync");
const { supabaseAdmin: db } = require("../db/supabase");
const authGuard = require("../middleware/authGuard");
const permissionCheck = require("../middleware/permissionCheck");
const { transactionError } = require("../utils/transactionError");
const router = express.Router();
const id = z.uuid(),
  text = z.string().trim(),
  money = z.number().finite().nonnegative().max(9999999999).multipleOf(0.01);
const criteria = z.object({
  search: text.max(100).default(""),
  category: text.max(100).default(""),
  min_spend: money.default(0),
  inactive_days: z.number().int().min(0).max(3650).default(0),
});
const common = { operation_id: id };
const marketing = z.discriminatedUnion("action", [
  z.object({
    ...common,
    action: z.literal("preference"),
    customer_id: id,
    channel: z.enum(["sms", "email"]),
    allowed: z.boolean(),
    source: text.min(1).max(1000),
  }),
  z.object({
    ...common,
    action: z.literal("campaign"),
    campaign_id: id.optional(),
    version: z.number().int().positive().optional(),
    name: text.min(1).max(150),
    channel: z.enum(["sms", "email"]),
    subject: text.max(200).default(""),
    message: text.min(1).max(5000),
    criteria,
  }),
  z.object({
    ...common,
    action: z.literal("review_campaign"),
    campaign_id: id,
    version: z.number().int().positive(),
  }),
  z.object({
    ...common,
    action: z.literal("followup"),
    campaign_id: id,
    customer_id: id,
    status: z.enum([
      "planned",
      "accepted",
      "delivered",
      "failed",
      "opted_out",
      "unconfirmed",
    ]),
    provider_reference: text.max(250).optional(),
    note: text.min(1).max(2000),
  }),
]);
const draft = z
  .object({
    ...common,
    action: z.enum(["create", "claim", "save", "release", "close"]),
    device_id: id,
    draft_id: id.optional(),
    version: z.number().int().positive().optional(),
    kind: z.enum(["basket", "purchase"]).optional(),
    title: text.min(1).max(120).optional(),
    payload: z.record(z.string(), z.unknown()).optional(),
  })
  .superRefine((v, c) => {
    if (v.action !== "create" && (!v.draft_id || !v.version))
      c.addIssue({
        code: "custom",
        message: "Select the draft and its current revision.",
      });
    if (["create", "save"].includes(v.action) && (!v.title || !v.payload))
      c.addIssue({
        code: "custom",
        message: "Name the draft and provide its contents.",
      });
    if (v.action === "create" && !v.kind)
      c.addIssue({ code: "custom", message: "Choose the draft type." });
  });
const basketPayload = z
  .object({
    items: z
      .array(
        z
          .object({
            id: text.min(1),
            product: z
              .object({
                id,
                name: text,
                price: z.number().finite().nonnegative(),
              })
              .passthrough(),
            quantity: z.number().int().positive().max(100000),
            stock: z.number().finite().nonnegative(),
            scans: z.array(z.record(z.string(), z.unknown())).max(100000),
          })
          .passthrough(),
      )
      .max(200),
    customer: z.object({ id }).passthrough().nullable().optional(),
  })
  .passthrough();
const draftNumber = z.union([
  z.number().finite().nonnegative(),
  z.string().regex(/^\d*(\.\d*)?$/),
]);
const purchasePayload = z
  .object({
    supplier_id: z.union([id, z.literal("")]),
    expected_date: text,
    notes: text.max(2000),
    items: z
      .array(
        z
          .object({
            product_id: z.union([id, z.literal("")]),
            quantity: draftNumber,
            unit_cost: draftNumber,
            notes: text.max(2000).optional(),
          })
          .passthrough(),
      )
      .max(500),
  })
  .passthrough();
const statementLine = z
  .object({
    reference: text.min(1).max(200),
    date: z.iso.date(),
    direction: z.enum(["payment", "refund"]),
    currency: text.regex(/^[A-Z]{3}$/),
    gross: money,
    fee: money,
    net: z.number().finite().min(-9999999999).max(9999999999).multipleOf(0.01),
  })
  .refine(
    (v) =>
      Math.round(v.gross * 100) - Math.round(v.fee * 100) ===
      Math.round(v.net * 100),
    "Gross less fee must equal net.",
  );
const statement = z.discriminatedUnion("action", [
  z.object({
    ...common,
    action: z.literal("import"),
    provider: text.min(1).max(80),
    account_label: text.min(1).max(80),
    payment_method: z.enum(["card", "mobile"]),
    lines: z.array(statementLine).min(1).max(500),
  }),
  z.object({
    ...common,
    action: z.literal("match"),
    line_id: id,
    target_id: id,
    note: text.min(1).max(2000),
  }),
]);
const can = (u, p) =>
  ["Business Admin", "Platform Admin"].includes(u.role) ||
  u.permissions?.includes(p);
const data = async (query) => {
  const r = await query;
  if (r.error) throw r.error;
  return r.data;
};
const list = (table, req, select = "*") =>
  db.from(table).select(select).eq("business_id", req.user.business_id);
const branch = (table, req, select = "*") =>
  list(table, req, select).eq("location_id", req.user.active_location_id);
const fail = (res, e) =>
  transactionError(res, e, "The records could not be loaded. Please retry.");
router.use(authGuard);
router.use(async (req, res, next) => {
  if (!req.user.business_id || !req.user.active_location_id)
    return res
      .status(400)
      .json({ error: "Choose a business and branch first." });
  if (
    !["Business Admin", "Platform Admin"].includes(req.user.role) &&
    !req.user.location_ids?.includes(req.user.active_location_id)
  )
    return res.status(403).json({ error: "Branch access denied." });
  try {
    if (
      !(await data(
        list("locations", req, "id")
          .eq("id", req.user.active_location_id)
          .maybeSingle(),
      ))
    )
      return res.status(403).json({ error: "Branch access denied." });
    next();
  } catch (e) {
    fail(res, e);
  }
});
function mutation(schema, rpc, withBranch = true) {
  return async (req, res) => {
    const p = schema.safeParse(req.body);
    if (!p.success)
      return res
        .status(400)
        .json({ error: p.error.issues[0].message, requestRejected: true });
    const args = {
      p_business_id: req.user.business_id,
      p_actor_id: req.user.id,
      p_request: p.data,
      ...(withBranch ? { p_location_id: req.user.active_location_id } : {}),
    };
    const { data: result, error } = await db.rpc(rpc, args);
    if (error)
      return transactionError(
        res,
        error,
        "The result could not be confirmed. Retry the saved request.",
        true,
      );
    res.json(result);
  };
}
router.post(
  "/customers/actions",
  permissionCheck("manage_marketing"),
  mutation(marketing, "customer_work_action", false),
);
router.get(
  "/customers/segment",
  permissionCheck("manage_marketing"),
  async (req, res) => {
    const parsed = criteria.safeParse({
      ...req.query,
      min_spend: Number(req.query.min_spend || 0),
      inactive_days: Number(req.query.inactive_days || 0),
    });
    const offset = Number(req.query.offset || 0),
      channel = req.query.channel || "sms";
    if (
      !parsed.success ||
      !["sms", "email"].includes(channel) ||
      !Number.isInteger(offset) ||
      offset < 0 ||
      offset > 1000000
    )
      return res.status(400).json({ error: "Check the audience filters." });
    const { data: result, error } = await db.rpc("customer_segment", {
      p_business_id: req.user.business_id,
      p_criteria: parsed.data,
      p_channel: channel,
      p_offset: offset,
    });
    if (error) return fail(res, error);
    res.json(result);
  },
);
router.get(
  "/customers/campaigns",
  permissionCheck("manage_marketing"),
  async (req, res) => {
    try {
      res.json(
        await data(
          list("customer_campaigns", req)
            .order("updated_at", { ascending: false })
            .limit(100),
        ),
      );
    } catch (e) {
      fail(res, e);
    }
  },
);
router.get(
  "/customers/followups",
  permissionCheck("manage_marketing"),
  async (req, res) => {
    try {
      res.json(
        await data(
          list(
            "customer_followups",
            req,
            "*,customer:customers!customer_id(name),campaign:customer_campaigns!campaign_id(name,channel)",
          )
            .order("created_at", { ascending: false })
            .limit(200),
        ),
      );
    } catch (e) {
      fail(res, e);
    }
  },
);
router.get("/drafts", async (req, res) => {
  if (!can(req.user, "create_sales") && !can(req.user, "manage_purchases"))
    return res.status(403).json({ error: "Draft access denied." });
  const kinds = ["basket", "purchase"].filter((k) =>
    can(req.user, k === "basket" ? "create_sales" : "manage_purchases"),
  );
  try {
    res.json(
      await data(
        branch(
          "shared_work_drafts",
          req,
          "id,kind,title,version,device_id,claimed_until,updated_at",
        )
          .eq("owner_id", req.user.id)
          .is("closed_at", null)
          .in("kind", kinds)
          .order("updated_at", { ascending: false })
          .limit(100),
      ),
    );
  } catch (e) {
    fail(res, e);
  }
});
router.post(
  "/drafts/actions",
  async (req, res, next) => {
    const parsed = draft.safeParse(req.body);
    if (!parsed.success)
      return res
        .status(400)
        .json({ error: parsed.error.issues[0].message, requestRejected: true });
    try {
      let kind = parsed.data.kind;
      if (parsed.data.draft_id) {
        const record = await data(
          branch("shared_work_drafts", req, "kind")
            .eq("id", parsed.data.draft_id)
            .eq("owner_id", req.user.id)
            .maybeSingle(),
        );
        if (!record) return res.status(404).json({ error: "Draft not found." });
        kind = record.kind;
      }
      if (["create", "save"].includes(parsed.data.action)) {
        const content = (
          kind === "basket" ? basketPayload : purchasePayload
        ).safeParse(parsed.data.payload);
        if (!content.success)
          return res
            .status(400)
            .json({
              error:
                "This saved draft has invalid items. Review it before saving.",
              requestRejected: true,
            });
      }
      permissionCheck(kind === "basket" ? "create_sales" : "manage_purchases")(
        req,
        res,
        next,
      );
    } catch (e) {
      fail(res, e);
    }
  },
  mutation(draft, "shared_draft_action"),
);
router.post(
  "/statements/actions",
  permissionCheck("manage_reconciliation"),
  mutation(statement, "statement_action"),
);
router.post(
  "/statements/preview",
  permissionCheck("manage_reconciliation"),
  (req, res) => {
    try {
      if (
        typeof req.body.csv !== "string" ||
        Buffer.byteLength(req.body.csv) > 250000
      )
        return res
          .status(400)
          .json({ error: "Choose a CSV file under 250 KB." });
      const rows = parse(req.body.csv, {
        columns: true,
        bom: true,
        skip_empty_lines: true,
        trim: true,
        max_record_size: 4000,
      });
      if (
        rows.some((r) =>
          ["gross", "fee", "net"].some(
            (k) =>
              typeof r[k] !== "string" ||
              !r[k].trim() ||
              !/^\-?\d+(\.\d{1,2})?$/.test(r[k]),
          ),
        )
      )
        return res
          .status(400)
          .json({
            error:
              "Each amount must contain a number with no more than two decimal places.",
          });
      const parsed = z
        .array(statementLine)
        .min(1)
        .max(500)
        .safeParse(
          rows.map((r) => ({
            ...r,
            gross: Number(r.gross),
            fee: Number(r.fee),
            net: Number(r.net),
          })),
        );
      if (!parsed.success)
        return res
          .status(400)
          .json({
            error: `Check CSV row ${(Number(parsed.error.issues[0].path[0]) || 0) + 2}: ${parsed.error.issues[0].message}. Required columns: reference,date,direction,currency,gross,fee,net.`,
          });
      res.json({ lines: parsed.data });
    } catch {
      return res
        .status(400)
        .json({
          error: "The CSV could not be read. Check its columns and quoting.",
        });
    }
  },
);
router.get(
  "/statements",
  permissionCheck("manage_reconciliation"),
  async (req, res) => {
    try {
      const [lines, sales, refunds] = await Promise.all([
        data(
          branch("provider_statement_lines", req)
            .order("statement_date", { ascending: false })
            .limit(500),
        ),
        data(
          branch(
            "sales",
            req,
            "id,receipt_number,amount_paid,payment_method,settled_at",
          )
            .in("payment_method", ["card", "mobile"])
            .in("status", ["completed", "void_pending"])
            .order("created_at", { ascending: false })
            .limit(500),
        ),
        data(
          branch(
            "returns",
            req,
            "id,original_sale_id,payment_refund_amount,refund_method,created_at,original_sale:sales!original_sale_id(receipt_number)",
          )
            .in("refund_method", ["card", "mobile"])
            .order("created_at", { ascending: false })
            .limit(500),
        ),
      ]);
      // Query matches for these candidates independently of the statement window.
      // Otherwise an older matched line would make a recent payment look unpaid.
      const [saleMatches, refundMatches] = await Promise.all([
        sales.length
          ? data(
              branch("provider_statement_lines", req, "matched_sale_id").in(
                "matched_sale_id",
                sales.map((r) => r.id),
              ),
            )
          : [],
        refunds.length
          ? data(
              branch("provider_statement_lines", req, "matched_return_id").in(
                "matched_return_id",
                refunds.map((r) => r.id),
              ),
            )
          : [],
      ]);
      const matchedSales = new Set(saleMatches.map((r) => r.matched_sale_id)),
        matchedRefunds = new Set(refundMatches.map((r) => r.matched_return_id));
      res.json({
        lines,
        sales: sales.filter((r) => !matchedSales.has(r.id)),
        refunds: refunds.filter((r) => !matchedRefunds.has(r.id)),
        limit: 500,
      });
    } catch (e) {
      fail(res, e);
    }
  },
);
router.get("/daily-work", async (req, res) => {
  const queues = [];
  function queue(name, permission, build, map) {
    if (can(req.user, permission)) queues.push({ name, query: build(), map });
  }
  queue(
    "Till reviews",
    "approve_accounting",
    () =>
      branch("till_sessions", req, "id,register_name,variance,closed_at")
        .eq("status", "closed")
        .order("closed_at")
        .limit(12),
    (r) => ({
      id: r.id,
      title: `Review ${r.register_name}`,
      detail: `Cash variance ${r.variance}`,
      path: "/till-account",
      category: "Cash",
    }),
  );
  queue(
    "Return inspections",
    "manage_returns",
    () =>
      branch("return_inspections", req, "id,created_at")
        .eq("status", "awaiting_inspection")
        .order("created_at")
        .limit(12),
    (r) => ({
      id: r.id,
      title: "Inspect returned goods",
      detail: new Date(r.created_at).toISOString().slice(0, 10),
      path: "/return-inspections",
      category: "Stock",
    }),
  );
  queue(
    "Incoming transfers",
    "manage_inventory",
    () =>
      list("unit_shipments", req, "id,status,dispatched_at")
        .eq("to_location_id", req.user.active_location_id)
        .in("status", ["in_transit", "partial"])
        .order("dispatched_at")
        .limit(12),
    (r) => ({
      id: r.id,
      title:
        r.status === "partial"
          ? "Complete a partial transfer"
          : "Receive scanned transfer",
      detail: new Date(r.dispatched_at).toISOString().slice(0, 10),
      path: "/unit-transfers",
      category: "Stock",
    }),
  );
  queue(
    "Investigations",
    "manage_inventory",
    () =>
      branch("loss_cases", req, "id,title,due_date")
        .neq("status", "resolved")
        .order("due_date")
        .limit(12),
    (r) => ({
      id: r.id,
      title: r.title,
      detail: r.due_date ? `Due ${r.due_date}` : "Investigation open",
      path: "/investigations",
      category: "Stock",
    }),
  );
  queue(
    "Supplier bills",
    "manage_financials",
    () =>
      list("ap_bills", req, "id,bill_number,amount,amount_paid,due_date")
        .not("status", "in", "(paid,void)")
        .lte("due_date", new Date().toISOString().slice(0, 10))
        .order("due_date")
        .limit(12),
    (r) => ({
      id: r.id,
      title: `Supplier bill ${r.bill_number}`,
      detail: `Business bill · Due ${r.due_date}`,
      path: `/accounts-payable?q=${encodeURIComponent(r.bill_number)}`,
      category: "Cash",
    }),
  );
  queue(
    "Deliveries",
    "receive_goods",
    () =>
      list("purchase_orders", req, "id,po_number,status")
        .in("status", ["sent", "partial"])
        .order("created_at")
        .limit(12),
    (r) => ({
      id: r.id,
      title: `Receive ${r.po_number}`,
      detail:
        r.status === "partial"
          ? "Business order · Partly received"
          : "Business order · Awaiting receipt",
      path: `/purchase-orders?status=${r.status}`,
      category: "Stock",
    }),
  );
  const results = await Promise.allSettled(queues.map((q) => data(q.query)));
  res.json({
    updated_at: new Date().toISOString(),
    items: results.flatMap((r, i) =>
      r.status === "fulfilled" ? r.value.map(queues[i].map) : [],
    ),
    errors: results.flatMap((r, i) =>
      r.status === "rejected" ? [`${queues[i].name} could not be loaded`] : [],
    ),
    limited: true,
  });
});
module.exports = router;
