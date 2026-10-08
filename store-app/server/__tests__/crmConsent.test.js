const express = require("express"),
  request = require("supertest");
const mockDb = { from: jest.fn() };
const mockSms = { sendCustomSMS: jest.fn() },
  mockEmail = { sendCustomEmail: jest.fn(), buildBusinessMessageHtml: jest.fn(({ text }) => `<p>${text}</p>`) };
let mockPreferences = [];
jest.mock("../db/supabase", () => ({ supabaseAdmin: mockDb }));
jest.mock("../middleware/authGuard", () => (req, res, next) => {
  req.user = { business_id: "business-1", role: "Business Admin" };
  next();
});
jest.mock("../services/smsService", () => mockSms);
jest.mock("../services/emailService", () => mockEmail);
const app = express();
app.use(express.json());
app.use(require("../routes/crmCommunications"));
beforeEach(() => {
  mockPreferences = [];
  mockSms.sendCustomSMS.mockReset().mockResolvedValue({ success: true });
  mockEmail.sendCustomEmail.mockReset().mockResolvedValue({ success: true });
  mockDb.from.mockReset().mockImplementation((table) => {
    const query = {};
    for (const key of ["select", "eq", "in", "is"])
      query[key] = jest.fn(() => query);
    query.single = async () => ({ data: null });
    query.maybeSingle = async () => ({ data: null });
    query.then = (resolve, reject) =>
      Promise.resolve({
        data:
          table === "customers"
            ? [
                { id: "a", phone: "+233000000001", email: "a@example.invalid" },
                { id: "b", phone: "+233000000002", email: "b@example.invalid" },
              ]
            : table === "customer_contact_preferences"
              ? mockPreferences
              : [],
      }).then(resolve, reject);
    return query;
  });
});
const send = () =>
  request(app)
    .post("/send")
    .send({
      targetAudience: "all_customers",
      type: "both",
      message: "Service follow-up",
    });
test("unknown and opted-out customers cannot be dispatched through the legacy campaign screen", async () => {
  mockPreferences = [
    { customer_id: "a", channel: "sms", allowed: false },
    { customer_id: "b", channel: "email", allowed: false },
  ];
  expect((await send()).status).toBe(400);
  expect(mockSms.sendCustomSMS).not.toHaveBeenCalled();
  expect(mockEmail.sendCustomEmail).not.toHaveBeenCalled();
});
test("channel preferences are evaluated separately immediately before dispatch", async () => {
  mockPreferences = [
    { customer_id: "a", channel: "sms", allowed: true },
    { customer_id: "b", channel: "email", allowed: true },
  ];
  expect((await send()).status).toBe(200);
  expect(mockSms.sendCustomSMS).toHaveBeenCalledWith(
    ["+233000000001"],
    "Service follow-up",
    null,
  );
  expect(mockEmail.sendCustomEmail).toHaveBeenCalledWith(
    ["b@example.invalid"],
    "Message from Business",
    "<p>Service follow-up</p>",
    null,
  );
  // No email account of the business's own: framed as coming from the business.
  expect(mockEmail.buildBusinessMessageHtml).toHaveBeenCalledWith(expect.objectContaining({ text: "Service follow-up", viaPlatform: true }));
});
test("a simulated gateway response cannot be reported as sent", async () => {
  mockPreferences = [{ customer_id: "a", channel: "sms", allowed: true }];
  mockSms.sendCustomSMS.mockResolvedValue({ success: true, simulated: true });
  const res = await send();
  expect(res.status).toBe(200);
  expect(res.body.success).toBe(false);
  expect(res.body.smsResults.success).toBe(false);
});
