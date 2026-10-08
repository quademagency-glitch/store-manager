import { test, expect } from "@playwright/test";
import path from "node:path";
import { gotoApp } from "../helpers";
const capture = async (page, name) => {
  if (process.env.QA_CAPTURE === "true") {
    if(page.viewportSize().width>600)await page.evaluate(()=>window.scrollTo({top:0,behavior:"instant"}));
    await page.screenshot({
      path: path.resolve(
        "../../output/QuadERP-Working-Screens-2026-10-07",
        name + ".png",
      ),
      fullPage: page.viewportSize().width>600,
      animations: "disabled",
    });
  }
};
test.skip(
  process.env.VITE_USE_MOCKS === "empty",
  "Populated workflow scenarios.",
);
test("item lookup exposes attributable history and original receipt without claiming invented movements", async ({
  page,
}) => {
  await gotoApp(page, "/item-history");
  await page
    .getByLabel("Item code, pack code or serial number")
    .fill("QD-004821");
  await page.getByRole("button", { name: "Find item", exact: true }).click();
  // A code that resolves to one item opens its history without a second click.
  await expect(
    page.getByRole("heading", { name: "Recorded history", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("History recording started", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "DEMO-00412" })).toHaveAttribute(
    "href",
    /highlight=sale1/,
  );
  await expect(
    page.getByRole("link", { name: "Start return from receipt" }),
  ).toHaveAttribute("href", "/returns?sale=sale1");
  await capture(page, "02-item-history");
});
test("phone inspection keeps damaged items out of restock and records a quarantine decision", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoApp(page, "/return-inspections");
  await page
    .getByRole("button", { name: "Inspect goods", exact: true })
    .click();
  await expect(
    page.getByRole("option", { name: "Release to sellable stock" }),
  ).toHaveJSProperty("disabled", true);
  await page
    .getByLabel("Inspection findings")
    .fill("Screen damage photographed; hold for supplier review.");
  await capture(page, "03-return-inspection-mobile");
  await page.getByRole("button", { name: "Save inspection" }).click();
  await expect(
    page.getByText("Screen damage photographed; hold for supplier review.", {
      exact: true,
    }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
test("receiving transfer requires scans and records the received unit", async ({
  page,
}) => {
  await gotoApp(page, "/unit-transfers");
  await page.getByRole("button", { name: "Scan delivery" }).click();
  await expect(
    page.getByRole("button", { name: "Receive 0 units" }),
  ).toBeDisabled();
  await page.getByLabel("Scan unique item code").fill("QD-004821");
  await page.getByRole("button", { name: "Add unit", exact: true }).click();
  await capture(page, "04-scanned-transfer");
  await page.getByRole("button", { name: "Receive 1 unit", exact: true }).click();
  await expect(
    page.getByText("1 dispatched · 1 received · 0 outstanding"),
  ).toBeVisible();
});
test("investigation notes append and a reviewed resolution remains visible", async ({
  page,
}) => {
  await gotoApp(page, "/investigations");
  await page
    .getByRole("button", { name: "Open evidence", exact: true })
    .click();
  await page.getByLabel("Status", { exact: true }).selectOption("resolved");
  await page
    .getByLabel("Evidence and findings")
    .fill("Receipt and stock count reconciled by manager.");
  await page.getByRole("button", { name: "Record findings" }).click();
  await page
    .getByRole("button", { name: "Open evidence", exact: true })
    .click();
  await expect(
    page.getByText("Resolved: Receipt and stock count reconciled by manager."),
  ).toBeVisible();
  await capture(page, "05-investigation");
});
test("a label replacement is never offered for approval to the person who requested it", async ({
  page,
}) => {
  await gotoApp(page, "/investigations");
  await page.getByLabel("Current item code").fill("QD-004821");
  await page.getByLabel("Unused replacement code").fill("QD-009999");
  await page.getByLabel("Reason for replacement").fill("Label torn in storage");
  await page.getByRole("button", { name: "Request replacement" }).click();
  await expect(
    page.getByText("Waiting for another manager to approve.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Approve and replace label" }),
  ).toHaveCount(0);
});
test("customer preference exclusion and reviewed campaign draft are visible in dark mode", async ({
  page,
}) => {
  await gotoApp(page, "/customer-segments", "dark");
  await expect(
    page.getByText("Opted out", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /^Record sms contact permission for / }).first(),
  ).toBeVisible();
  await page.getByLabel("Campaign name").fill("After-sales care");
  await page
    .getByLabel("Message", { exact: true })
    .fill("Contact your branch if you need help with your purchase.");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await page.getByRole("button", { name: "Mark saved draft reviewed" }).click();
  await expect(
    page.getByText("reviewed", { exact: true }).first(),
  ).toBeVisible();
  await capture(page, "06-customer-segments-dark");
});
test("provider statement can be previewed and matched only after selecting evidence", async ({
  page,
}) => {
  await gotoApp(page, "/payment-settlements");
  await page.getByLabel("Provider", { exact: true }).fill("Test provider");
  await page.getByLabel("Merchant account label").fill("Demo account");
  await page
    .getByLabel("CSV statement")
    .setInputFiles({
      name: "statement.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        "reference,date,direction,currency,gross,fee,net\nTEST-1,2026-10-07,payment,GHS,100,1,99\n",
      ),
    });
  await page.getByRole("button", { name: "Import reviewed statement" }).click();
  await page.getByRole("button", { name: "Review match", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Confirm reviewed match" }),
  ).toBeDisabled();
  await page
    .getByLabel("Recorded payment or refund with the same amount and channel")
    .selectOption("sale1");
  await page
    .getByLabel("Matching evidence")
    .fill("Reviewed original receipt and TEST-1 provider reference.");
  await capture(page, "07-provider-statement");
  await page.getByRole("button", { name: "Confirm reviewed match" }).click();
  await expect(page.getByText("Matched", { exact: true })).toBeVisible();
});
test("unpaid basket can be saved and released for another device without relaxing checkout", async ({
  page,
}) => {
  await gotoApp(page, "/sales");
  await page
    .getByRole("button", { name: "Add Perfumed Rice 5kg to cart" })
    .click();
  await page.getByText("Continue on another device", { exact: true }).click();
  await page.getByLabel("Saved draft name").fill("Customer collection");
  await page.getByRole("button", { name: "Save current draft" }).click();
  await expect(
    page.getByText("Saved to your account for this branch."),
  ).toBeVisible();
  await capture(page,"08-shared-basket");
  await page
    .getByRole("button", { name: "Release for another device" })
    .click();
  await expect(
    page.getByText("Released. You can now resume it on another device."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Select Customer First", exact: true }),
  ).toBeDisabled();
});

test("daily dashboard links to actual pending records", async ({ page }) => {
  await gotoApp(page, "/dashboard");
  await expect(
    page.getByRole("heading", { name: "Needs your attention" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Inspect returned goods/ }),
  ).toHaveAttribute("href", "/return-inspections");
  await capture(page, "01-dashboard");
});


test('purchase cloud draft preserves quantities and costs through release and resume',async({page})=>{
 await gotoApp(page,'/purchase-orders');
 await page.getByRole('button',{name:'Create PO',exact:true}).click();
 await page.getByRole('combobox',{name:'Supplier',exact:true}).selectOption({index:1});
 await page.getByRole('combobox',{name:'Product 1',exact:true}).selectOption({index:1});
 await page.getByLabel('Quantity',{exact:true}).fill('12');
 await page.getByLabel('Unit cost',{exact:true}).fill('7.50');
 await page.getByText('Continue on another device',{exact:true}).click();
 await page.getByLabel('Saved draft name').fill('Supplier replenishment');
 await page.getByRole('button',{name:'Save current draft'}).click();
 await expect(page.getByText('Saved to your account for this branch.')).toBeVisible();
 await capture(page,'09-shared-purchase-draft');
 await page.getByRole('button',{name:'Release for another device'}).click();
 await page.getByLabel('Unit cost',{exact:true}).fill('1.00');
 await page.getByRole('button',{name:'Resume saved draft',exact:true}).click();
 await page.getByRole('button',{name:'Resume draft',exact:true}).click();
 await expect(page.getByLabel('Unit cost',{exact:true})).toHaveValue('7.50');
 await expect(page.getByLabel('Quantity',{exact:true})).toHaveValue('12');
});
