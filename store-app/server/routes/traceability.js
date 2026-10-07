const express = require("express");
const { z } = require("zod");
const { supabaseAdmin: db } = require("../db/supabase");
const authGuard = require("../middleware/authGuard");
const permissionCheck = require("../middleware/permissionCheck");
const { transactionError } = require("../utils/transactionError");
const { invalidateCachePrefix } = require("../middleware/apiCache");
const router = express.Router();
const id = z.uuid();
const note = z.string().trim().max(2000).default("");
const fields = { operation_id: id, note };
const actions = z.discriminatedUnion("action", [
  z.object({
    ...fields,
    action: z.literal("dispatch"),
    destination_id: id,
    unit_ids: z.array(id).min(1).max(200),
  }),
  z.object({
    ...fields,
    action: z.literal("receive"),
    shipment_id: id,
    unit_ids: z.array(id).min(1).max(200),
  }),
  z.object({
    ...fields,
    action: z.literal("inspect"),
    inspection_id: id,
    condition: z.enum(["unopened", "working", "damaged"]),
    disposition: z.enum(["restock", "quarantine", "repair", "supplier_return"]),
    warranty_until: z.iso.date().nullable().optional(),
    warranty_reference: z.string().trim().max(200).optional(),
  }),
  z.object({
    ...fields,
    action: z.literal("open_case"),
    title: z.string().trim().min(1).max(200),
    alert_id: id.optional(),
    unit_id: id.optional(),
  }),
  z.object({
    ...fields,
    action: z.literal("update_case"),
    case_id: id,
    status: z.enum(["open", "investigating", "resolved"]),
    assignee_id: id.nullable().optional(),
    due_date: z.iso.date().nullable().optional(),
  }),
  z.object({
    ...fields,
    action: z.literal("request_label"),
    unit_id: id,
    new_code: z.string().trim().min(1).max(250),
  }),
  z.object({ ...fields, action: z.literal("approve_label"), label_id: id }),
  z.object({
    ...fields,
    action: z.literal("link_receipt"),
    unit_id: id,
    receipt_id: id,
  }),
]);
const can = (user, permission) =>
  ["Business Admin", "Platform Admin"].includes(user.role) ||
  user.permissions?.includes(permission);
const fail = (res, error) =>
  transactionError(
    res,
    error,
    "These records could not be loaded. Please retry.",
  );
const data = async (query) => {
  const result = await query;
  if (result.error) throw result.error;
  return result.data;
};
const branchQuery = (table, req, select = "*") =>
  db
    .from(table)
    .select(select)
    .eq("business_id", req.user.business_id)
    .eq("location_id", req.user.active_location_id);

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
    const branch = await data(
      db
        .from("locations")
        .select("id")
        .eq("id", req.user.active_location_id)
        .eq("business_id", req.user.business_id)
        .maybeSingle(),
    );
    if (!branch)
      return res.status(403).json({ error: "Branch access denied." });
    next();
  } catch (error) {
    fail(res, error);
  }
});

router.post(
  "/actions",
  async (req, res, next) => {
    const parsed = actions.safeParse(req.body);
    if (!parsed.success)
      return res
        .status(400)
        .json({ error: parsed.error.issues[0].message, requestRejected: true });
    req.action = parsed.data;
    const permission =
      req.action.action === "inspect"
        ? "manage_returns"
        : req.action.action === "link_receipt"
          ? "receive_goods"
          : req.action.action === "approve_label" ||
              (req.action.action === "update_case" &&
                req.action.status === "resolved")
            ? "manage_business"
            : "manage_inventory";
    permissionCheck(permission)(req, res, next);
  },
  async (req, res) => {
    const { data: result, error } = await db.rpc("traceability_action", {
      p_business_id: req.user.business_id,
      p_location_id: req.user.active_location_id,
      p_actor_id: req.user.id,
      p_request: req.action,
    });
    if (error)
      return transactionError(
        res,
        error,
        "The result could not be confirmed. Retry the saved request.",
        true,
      );
    for (const prefix of [
      "/api/products",
      "/api/stock",
      "/api/units",
      "/api/inventory",
      "/api/analytics",
    ])
      invalidateCachePrefix(prefix);
    res.json(result);
  },
);

router.get(
  "/lookup",
  permissionCheck("manage_inventory", "manage_returns"),
  async (req, res) => {
    const code = String(req.query.code || "").trim();
    if (!code || code.length > 250)
      return res
        .status(400)
        .json({ error: "Scan an item code, pack code or serial number." });
    try {
      const { data: matches, error } = await db.rpc("find_tracked_units", {
        p_business_id: req.user.business_id,
        p_location_id: req.user.active_location_id,
        p_code: code,
      });
      if (error) throw error;
      res.json(matches);
    } catch (error) {
      fail(res, error);
    }
  },
);

router.get(
  "/units/:id",
  permissionCheck("manage_inventory", "manage_returns"),
  async (req, res) => {
    if (!id.safeParse(req.params.id).success)
      return res.status(400).json({ error: "Invalid unit reference." });
    try {
      const unit = await data(
        branchQuery(
          "inventory_units",
          req,
          "*,product:products!product_id(id,name,sku),location:locations!location_id(id,name),qr:qr_code_pool!qr_code_id(code),pack:qr_code_pool!pack_code_id(code)",
        )
          .eq("id", req.params.id)
          .maybeSingle(),
      );
      if (!unit)
        return res
          .status(404)
          .json({ error: "Item not found in this branch." });
      const [events, returns, labels] = await Promise.all([
        data(
          db
            .from("unit_events")
            .select(
              "id,event_type,details,created_at,actor:users!actor_id(name),location:locations!location_id(name)",
            )
            .eq("business_id", req.user.business_id)
            .eq("unit_id", unit.id)
            .order("created_at")
            .limit(500),
        ),
        data(
          db
            .from("return_items")
            .select(
              "id,return_id,returns!inner(id,business_id,original_sale_id,reason,created_at)",
            )
            .contains("returned_unit_ids", [unit.id])
            .eq("returns.business_id", req.user.business_id)
            .limit(100),
        ),
        data(
          branchQuery("label_requests", req)
            .eq("unit_id", unit.id)
            .order("requested_at", { ascending: false })
            .limit(50),
        ),
      ]);
      const saleIds = [
        ...new Set(
          [
            unit.sold_in_sale_id,
            ...events.flatMap((e) => [
              e.details?.before?.sale_id,
              e.details?.after?.sale_id,
              e.details?.sale_id,
            ]),
            ...returns.map((r) => r.returns?.original_sale_id),
          ].filter(Boolean),
        ),
      ];
      let saleQuery = saleIds.length ? db
              .from("sales")
              .select(
                "id,receipt_number,created_at,location_id,customer:customers(id,name,customer_code)",
              )
              .eq("business_id", req.user.business_id)
              .in("id", saleIds) : null;
      if(saleQuery && !['Business Admin','Platform Admin'].includes(req.user.role))saleQuery=saleQuery.in('location_id',req.user.location_ids || []);
      const sales=saleQuery ? await data(saleQuery) : [];
      if (!can(req.user, "manage_sales") && !can(req.user, "manage_returns"))
        for (const sale of sales)
          if (sale.customer) {
            delete sale.customer.name;
            delete sale.customer.id;
          }
      // A preferred supplier is not proof of where a specific unit was received.
      let batch = null;
      if (unit.batch_id)
        batch = await data(
          db
            .from("product_batches")
            .select("id,batch_number,received_at,notes")
            .eq("business_id", req.user.business_id)
            .eq("id", unit.batch_id)
            .maybeSingle(),
        );
      let receiving = null;
      if (unit.purchase_receipt_id) {
        const record = await data(
          db
            .from("purchase_receipts")
            .select("id,created_at,purchase_order_id,result")
            .eq("business_id", req.user.business_id)
            .eq("id", unit.purchase_receipt_id)
            .maybeSingle(),
        );
        if (record)
          receiving = {
            id: record.id,
            created_at: record.created_at,
            purchase_order_id: record.purchase_order_id,
            po_number: record.result?.grn_data?.po_number,
            supplier_name: record.result?.grn_data?.supplier_name,
          };
      }
      res.json({
        unit,
        events,
        returns,
        sales,
        labels,
        batch,
        receiving,
        historyLimit: 500,
      });
    } catch (error) {
      fail(res, error);
    }
  },
);

router.get(
  "/receiving-records",
  permissionCheck("receive_goods"),
  async (req, res) => {
    if (!id.safeParse(req.query.unit_id).success)
      return res.status(400).json({ error: "Choose a tracked item." });
    try {
      const unit = await data(
        branchQuery("inventory_units", req, "product_id")
          .eq("id", req.query.unit_id)
          .maybeSingle(),
      );
      if (!unit)
        return res
          .status(404)
          .json({ error: "Item not found in this branch." });
      const rows = await data(
        branchQuery(
          "purchase_receipts",
          req,
          "id,created_at,purchase_order_id,result",
        )
          .contains("result", {
            received_items: [{ product_id: unit.product_id }],
          })
          .order("created_at", { ascending: false })
          .limit(100),
      );
      res.json(
        rows.map((r) => ({
          id: r.id,
          created_at: r.created_at,
          po_number: r.result?.grn_data?.po_number,
          supplier_name: r.result?.grn_data?.supplier_name,
        })),
      );
    } catch (error) {
      fail(res, error);
    }
  },
);

router.get(
  "/shipments",
  permissionCheck("manage_inventory"),
  async (req, res) => {
    try {
      const rows = await data(
        db
          .from("unit_shipments")
          .select(
            "*,source:locations!from_location_id(name),destination:locations!to_location_id(name),dispatcher:users!dispatched_by(name),items:unit_shipment_items(unit_id,received_at,received_by,receipt_note)",
          )
          .eq("business_id", req.user.business_id)
          .or(
            `from_location_id.eq.${req.user.active_location_id},to_location_id.eq.${req.user.active_location_id}`,
          )
          .order("dispatched_at", { ascending: false })
          .limit(100),
      );
      res.json(rows);
    } catch (error) {
      fail(res, error);
    }
  },
);
router.get(
  "/shipment-lookup",
  permissionCheck("manage_inventory"),
  async (req, res) => {
    if (
      !id.safeParse(req.query.shipment).success ||
      !String(req.query.code || "").trim() ||
      String(req.query.code).length > 250
    )
      return res
        .status(400)
        .json({ error: "Select a transfer and scan an item code." });
    try {
      const shipment = await data(
        db
          .from("unit_shipments")
          .select(
            "id,from_location_id,items:unit_shipment_items(unit_id,received_at)",
          )
          .eq("business_id", req.user.business_id)
          .eq("to_location_id", req.user.active_location_id)
          .eq("id", req.query.shipment)
          .maybeSingle(),
      );
      if (!shipment)
        return res
          .status(404)
          .json({ error: "Transfer not found for this branch." });
      const { data: matches, error } = await db.rpc("find_tracked_units", {
        p_business_id: req.user.business_id,
        p_location_id: shipment.from_location_id,
        p_code: String(req.query.code).trim(),
      });
      if (error) throw error;
      res.json(
        matches.filter((unit) =>
          shipment.items.some(
            (item) => item.unit_id === unit.id && !item.received_at,
          ),
        ),
      );
    } catch (error) {
      fail(res, error);
    }
  },
);
router.get(
  "/inspections",
  permissionCheck("manage_returns"),
  async (req, res) => {
    try {
      res.json(
        await data(
          branchQuery(
            "return_inspections",
            req,
            "*,item:return_items!return_item_id(quantity,returned_unit_ids,product:products!product_id(name),return:returns!return_id(original_sale_id,reason,created_at))",
          )
            .order("created_at", { ascending: false })
            .limit(100),
        ),
      );
    } catch (error) {
      fail(res, error);
    }
  },
);
router.get("/cases", permissionCheck("manage_inventory"), async (req, res) => {
  try {
    res.json(
      await data(
        branchQuery(
          "loss_cases",
          req,
          "*,assignee:users!assignee_id(name),notes:loss_case_notes(id,note,created_at,actor:users!actor_id(name))",
        )
          .order("created_at", { ascending: false })
          .limit(100),
      ),
    );
  } catch (error) {
    fail(res, error);
  }
});
router.get("/labels", permissionCheck("manage_inventory"), async (req, res) => {
  try {
    res.json(
      await data(
        branchQuery(
          "label_requests",
          req,
          "*,requester:users!requested_by(name),old_code:qr_code_pool!old_code_id(code),new_code:qr_code_pool!new_code_id(code)",
        )
          .order("requested_at", { ascending: false })
          .limit(100),
      ),
    );
  } catch (error) {
    fail(res, error);
  }
});
router.get("/staff", permissionCheck("manage_inventory"), async (req, res) => {
  try {
    res.json(
      await data(
        db
          .from("users")
          .select("id,name")
          .eq("business_id", req.user.business_id)
          .order("name")
          .limit(500),
      ),
    );
  } catch (error) {
    fail(res, error);
  }
});

async function subject(req, res, next) {
  const kind = req.params.kind;
  if (
    !["inspection", "case"].includes(kind) ||
    !id.safeParse(req.params.id).success
  )
    return res.status(400).json({ error: "Invalid evidence reference." });
  if (
    !can(
      req.user,
      kind === "inspection" ? "manage_returns" : "manage_inventory",
    )
  )
    return res.status(403).json({ error: "Evidence access denied." });
  try {
    if (
      !(await data(
        branchQuery(
          kind === "inspection" ? "return_inspections" : "loss_cases",
          req,
          "id",
        )
          .eq("id", req.params.id)
          .maybeSingle(),
      ))
    )
      return res
        .status(404)
        .json({ error: "Record not found in this branch." });
    next();
  } catch (error) {
    fail(res, error);
  }
}
router.get("/evidence/:kind/:id", subject, async (req, res) => {
  try {
    res.json(
      await data(
        branchQuery(
          "workflow_evidence",
          req,
          "id,filename,content_type,created_at",
        )
          .eq("subject_type", req.params.kind)
          .eq("subject_id", req.params.id)
          .order("created_at"),
      ),
    );
  } catch (error) {
    fail(res, error);
  }
});
router.post("/evidence/:kind/:id", subject, async (req, res) => {
  const parsed = z
    .object({
      id,
      filename: z.string().trim().min(1).max(150),
      content_base64: z
        .string()
        .min(16)
        .max(2800000)
        .regex(/^[A-Za-z0-9+/]+={0,2}$/),
      content_type: z.enum(["image/jpeg", "image/png", "image/webp"]),
    })
    .safeParse(req.body);
  if (!parsed.success)
    return res
      .status(400)
      .json({ error: "Choose a JPEG, PNG or WebP image under 2 MB." });
  const file = parsed.data,
    bytes = Buffer.from(file.content_base64, "base64");
  const valid =
    file.content_type === "image/png"
      ? bytes
          .subarray(0, 8)
          .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : file.content_type === "image/jpeg"
        ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
        : bytes.subarray(0, 4).toString() === "RIFF" &&
          bytes.subarray(8, 12).toString() === "WEBP";
  if (!valid || bytes.length > 2 * 1024 * 1024)
    return res
      .status(400)
      .json({ error: "This file is not a supported image under 2 MB." });
  try {
    const existing = await data(
      branchQuery("workflow_evidence", req, "id")
        .eq("id", file.id)
        .eq("subject_type", req.params.kind)
        .eq("subject_id", req.params.id)
        .maybeSingle(),
    );
    if (existing) return res.json(existing);
    const rows = await data(
      branchQuery("workflow_evidence", req, "id")
        .eq("subject_type", req.params.kind)
        .eq("subject_id", req.params.id)
        .limit(10),
    );
    if (rows.length >= 10)
      return res
        .status(400)
        .json({ error: "This record already has ten photos." });
    res.status(201).json(
      await data(
        db
          .from("workflow_evidence")
          .insert({
            ...file,
            business_id: req.user.business_id,
            location_id: req.user.active_location_id,
            subject_type: req.params.kind,
            subject_id: req.params.id,
            uploaded_by: req.user.id,
          })
          .select("id,filename,created_at")
          .single(),
      ),
    );
  } catch (error) {
    fail(res, error);
  }
});
router.get("/evidence/:kind/:id/:file", subject, async (req, res) => {
  if (!id.safeParse(req.params.file).success)
    return res.status(400).json({ error: "Invalid photo." });
  try {
    const file = await data(
      branchQuery("workflow_evidence", req)
        .eq("subject_type", req.params.kind)
        .eq("subject_id", req.params.id)
        .eq("id", req.params.file)
        .maybeSingle(),
    );
    if (!file) return res.status(404).json({ error: "Photo not found." });
    res
      .set("Cache-Control", "private, no-store")
      .json({
        content_type: file.content_type,
        content_base64: file.content_base64,
      });
  } catch (error) {
    fail(res, error);
  }
});
module.exports = router;
