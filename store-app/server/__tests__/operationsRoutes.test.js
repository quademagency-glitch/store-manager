const express = require("express");
const request = require("supertest");
const { randomUUID: uuid } = require("crypto");
const mockUser = {
  id: uuid(),
  business_id: uuid(),
  role: "Staff",
  permissions: [],
  active_location_id: uuid(),
  location_ids: [],
};
const mockDb = { rpc: jest.fn(), from: jest.fn() };
let mockBranch = true;
jest.mock("../db/supabase", () => ({ supabaseAdmin: mockDb }));
jest.mock("../middleware/authGuard", () => (req, res, next) => {
  req.user = mockUser;
  next();
});
jest.mock("../middleware/apiCache", () => ({
  invalidateCachePrefix: jest.fn(),
}));
const app = express();
app.use(express.json());
app.use("/traceability", require("../routes/traceability"));
app.use("/operations", require("../routes/operations"));
beforeEach(() => {
  mockUser.role = "Staff";
  mockUser.permissions = [];
  mockUser.location_ids = [mockUser.active_location_id];
  mockBranch = true;
  mockDb.rpc.mockReset().mockResolvedValue({ data: { ok: true } });
  mockDb.from.mockReset().mockImplementation((table) => {
    const query = {};
    for (const name of [
      "select",
      "eq",
      "order",
      "limit",
      "is",
      "in",
      "or",
      "contains",
      "neq",
      "not",
      "lte",
    ])
      query[name] = jest.fn(() => query);
    query.maybeSingle = jest.fn(async () => ({
      data:
        table === "locations"
          ? mockBranch
            ? { id: mockUser.active_location_id }
            : null
          : null,
    }));
    query.then = (resolve, reject) =>
      Promise.resolve({ data: [] }).then(resolve, reject);
    return query;
  });
});
const post = (path, body) =>
  request(app)
    .post(path)
    .send({ operation_id: uuid(), ...body });
test("operators cannot use an unassigned branch or a branch outside their business", async () => {
  mockUser.permissions = ["manage_inventory"];
  mockUser.location_ids = [];
  expect(
    (
      await post("/traceability/actions", {
        action: "dispatch",
        destination_id: uuid(),
        unit_ids: [uuid()],
      })
    ).status,
  ).toBe(403);
  mockUser.role = "Business Admin";
  mockBranch = false;
  expect((await request(app).get("/operations/daily-work")).status).toBe(403);
  expect(mockDb.rpc).not.toHaveBeenCalled();
});
test.each([
  [
    "inspect",
    "manage_returns",
    { inspection_id: uuid(), condition: "damaged", disposition: "quarantine" },
  ],
  ["approve_label", "manage_business", { label_id: uuid() }],
  [
    "update_case",
    "manage_business",
    { case_id: uuid(), status: "resolved", note: "Reviewed" },
  ],
  [
    "dispatch",
    "manage_inventory",
    { destination_id: uuid(), unit_ids: [uuid()] },
  ],
  [
    "link_receipt",
    "receive_goods",
    { unit_id: uuid(), receipt_id: uuid(), note: "Verified delivery" },
  ],
])(
  "%s requires its specific permission and uses the authenticated scope",
  async (action, permission, body) => {
    expect(
      (await post("/traceability/actions", { action, ...body })).status,
    ).toBe(403);
    expect(mockDb.rpc).not.toHaveBeenCalled();
    mockUser.permissions = [permission];
    expect(
      (
        await post("/traceability/actions", {
          action,
          ...body,
          business_id: uuid(),
          location_id: uuid(),
          actor_id: uuid(),
        })
      ).status,
    ).toBe(200);
    expect(mockDb.rpc).toHaveBeenLastCalledWith(
      "traceability_action",
      expect.objectContaining({
        p_business_id: mockUser.business_id,
        p_location_id: mockUser.active_location_id,
        p_actor_id: mockUser.id,
      }),
    );
    expect(mockDb.rpc.mock.calls.at(-1)[1].p_request).not.toHaveProperty(
      "business_id",
    );
  },
);
test("marketing and settlement writes are permission protected", async () => {
  const campaign = {
    action: "campaign",
    name: "Review",
    message: "Follow-up",
    channel: "sms",
    criteria: {},
  };
  expect((await post("/operations/customers/actions", campaign)).status).toBe(
    403,
  );
  mockUser.permissions = ["manage_marketing"];
  expect((await post("/operations/customers/actions", campaign)).status).toBe(
    200,
  );
  expect(
    (
      await post("/operations/statements/actions", {
        action: "match",
        line_id: uuid(),
        target_id: uuid(),
        note: "Evidence",
      })
    ).status,
  ).toBe(403);
});
test("CSV preview rejects blanks, precision loss and fee discrepancies", async () => {
  mockUser.permissions = ["manage_reconciliation"];
  for (const amounts of ["10,,10", "10,1,10", "10.001,0,10.001"]) {
    const r = await request(app)
      .post("/operations/statements/preview")
      .send({
        csv:
          "reference,date,direction,currency,gross,fee,net\nR-1,2026-10-07,payment,GHS," +
          amounts +
          "\n",
      });
    expect(r.status).toBe(400);
  }
  const r = await request(app)
    .post("/operations/statements/preview")
    .send({
      csv: "reference,date,direction,currency,gross,fee,net\nR-1,2026-10-07,payment,GHS,10,1,9\n",
    });
  expect(r.status).toBe(200);
  expect(r.body.lines[0].net).toBe(9);
});
test("cloud drafts reject malformed contents before they can corrupt another device", async () => {
  mockUser.permissions = ["create_sales"];
  const body = {
    action: "create",
    device_id: uuid(),
    kind: "basket",
    title: "Draft",
    payload: { items: [{ id: "bad" }] },
  };
  expect((await post("/operations/drafts/actions", body)).status).toBe(400);
  expect(mockDb.rpc).not.toHaveBeenCalled();
  expect(
    (
      await post("/operations/drafts/actions", {
        ...body,
        payload: { items: [], customer: null },
      })
    ).status,
  ).toBe(200);
});
test("daily work returns no unauthorized queues", async () => {
  const r = await request(app).get("/operations/daily-work");
  expect(r.status).toBe(200);
  expect(r.body.items).toEqual([]);
  expect(mockDb.from.mock.calls.map((c) => c[0])).toEqual(["locations"]);
});
