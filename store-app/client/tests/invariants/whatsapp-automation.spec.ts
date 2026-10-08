import { test, expect } from '@playwright/test';
import { gotoApp } from '../helpers';

/**
 * Automatic WhatsApp messages stay off until the business's own account and
 * the template for that kind are set, and the log never claims more than
 * "Accepted by WhatsApp".
 */
test.use({ viewport: { width: 1440, height: 900 } });

test('connect an account, then switch on only what has a template', async ({ page }) => {
  await gotoApp(page, '/crm-communications');
  await page.getByRole('tab', { name: 'WhatsApp' }).click();

  // Before connecting: the Meta steps, open, with Meta's own links, and the templates to copy.
  await expect(page.getByRole('link', { name: 'Meta App Dashboard' })).toHaveAttribute('href', 'https://developers.facebook.com/apps');
  await expect(page.getByRole('button', { name: 'Copy receipt template text' })).toBeVisible();

  const receipts = page.getByLabel("Send a receipt when a customer's sale is completed");
  await receipts.click();
  await expect(page.getByRole('alert')).toHaveText('Connect your WhatsApp Business account first.');
  await expect(receipts).not.toBeChecked();

  await page.getByLabel('Phone number ID').fill('109876543210');
  await page.getByLabel('Permanent access token').fill('EAAG-test-token-0123456789');
  await page.getByLabel('Approved receipt template name').fill('order_receipt');
  await page.getByRole('button', { name: 'Save account' }).click();
  await expect(page.getByText(/Connected: WhatsApp Business · phone number ID 109876543210/)).toBeVisible();
  await expect(page.getByText('EAAG-test-token-0123456789')).toHaveCount(0);

  // A test before anything is switched on.
  await page.getByLabel('Send the test to').fill('024 123 4567');
  await page.getByRole('button', { name: 'Send test message' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Accepted by WhatsApp for +233241234567, using order_receipt.' })).toBeVisible();

  await receipts.click();
  await expect(page.getByRole('status').filter({ hasText: 'Automatic receipts switched on.' })).toBeVisible();
  await expect(receipts).toBeChecked();

  const reminders = page.getByLabel(/Remind customers two days before an invoice is due/);
  await reminders.click();
  await expect(page.getByRole('alert')).toHaveText('Add the approved reminder template name first.');
  await expect(reminders).not.toBeChecked();

  const log = page.getByRole('table');
  await expect(log.getByRole('row', { name: /Adwoa Nyarko/ })).toContainText('Accepted by WhatsApp');
  await expect(log.getByRole('row', { name: /Yaw Owusu/ })).toContainText('The customer has not given WhatsApp permission.');
  await expect(page.getByText(/not proof that it was delivered or read/)).toBeVisible();
});

test('WhatsApp permission can be recorded, and campaign drafts stay SMS or email', async ({ page }) => {
  await gotoApp(page, '/customer-segments');
  await page.getByLabel('Contact channel').selectOption('whatsapp');
  await expect(page.getByText(/WhatsApp permission is used for automatic receipts and payment reminders/)).toBeVisible();
  await expect(page.getByLabel('Campaign name')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Import a permission list' })).toBeVisible();
});
