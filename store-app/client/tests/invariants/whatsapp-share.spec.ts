import { test, expect } from '@playwright/test';
import { gotoApp } from '../helpers';

/**
 * Share on WhatsApp opens wa.me with the message typed; QuadERP sends nothing.
 * Receipts can carry a private link, opened at /r/:token without an account.
 */
test.use({ viewport: { width: 1440, height: 900 } });

const decodedText = (href: string | null) => decodeURIComponent(new URL(href || 'https://x/').searchParams.get('text') || '');

test('a receipt is shared on WhatsApp with or without a private link', async ({ page }) => {
  await gotoApp(page, '/sales-record');
  await page.getByRole('row', { name: /DEMO-00412/ }).first().getByRole('button').first().click();
  const share = page.getByRole('group', { name: 'Share receipt on WhatsApp' });
  await expect(share).toBeVisible();

  await share.getByRole('button', { name: 'Share on WhatsApp' }).click();
  const open = share.getByRole('link', { name: 'Open WhatsApp to send' });
  const href = await open.getAttribute('href');
  expect(href).toMatch(/^https:\/\/wa\.me\/233203334455\?text=/);
  const text = decodedText(href);
  expect(text).toContain('Hi Adwoa, thank you for shopping at');
  expect(text).toContain('Receipt DEMO-00412');
  expect(text).toContain('2 × Gino Tomato Paste 400g');
  expect(text).toMatch(/\/r\/MockReceiptLinkToken_0123456789a$/);
  await expect(open).toHaveAttribute('target', '_blank');
  await expect(open).toHaveAttribute('rel', /noopener/);

  await share.getByRole('button', { name: 'Withdraw receipt links' }).click();
  await expect(share.getByRole('status')).toContainText('no longer open');
  await share.getByLabel(/Include a private link/).uncheck();
  await share.getByRole('button', { name: 'Share on WhatsApp' }).click();
  expect(decodedText(await share.getByRole('link', { name: 'Open WhatsApp to send' }).getAttribute('href'))).not.toContain('/r/');
});

test('the public receipt shows lines and totals, and a dead link says so', async ({ page }) => {
  await page.route('**/api/public/receipts/**', (route) => {
    const token = route.request().url().split('/').pop();
    if (token === 'GoneGoneGoneGoneGoneGoneGoneGone')
      return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'This receipt link has expired or was withdrawn.' }) });
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        business: { name: 'Omek Gigs', phone: '+233 20 000 0000', currency: 'GHS' },
        receipt: { receipt_number: 'DEMO-00412', created_at: '2026-10-07T10:42:00Z', status: 'completed', payment_method: 'mobile', subtotal: 248.5, tax_amount: 0, tax_label: null, total_amount: 248.5, amount_paid: 248.5, change_due: 0, rewards_applied: 0, items: [{ name: 'Gino Tomato Paste 400g', quantity: 2, unit_price: 124.25 }] },
        expires_at: '2026-11-07T10:42:00Z',
      }),
    });
  });
  const sent: string[] = [];
  page.on('request', (r) => { if (r.url().includes('/public/receipts/')) sent.push(r.headers()['authorization'] || ''); });

  await page.goto('/r/MockReceiptLinkToken_0123456789a');
  await expect(page.getByRole('heading', { name: 'Omek Gigs' })).toBeVisible();
  await expect(page.getByRole('row', { name: /Gino Tomato Paste 400g/ })).toContainText('2');
  await expect(page.getByText('Mobile Money')).toBeVisible();
  await expect(page.getByText(/stops working on/)).toBeVisible();
  await expect(page.locator('.sidebar-nav')).toHaveCount(0);
  expect(sent.every((auth) => auth === '')).toBe(true);

  await page.goto('/r/GoneGoneGoneGoneGoneGoneGoneGone');
  await expect(page.getByRole('heading', { name: 'Receipt unavailable' })).toBeVisible();
  await expect(page.getByText('This receipt link has expired or was withdrawn.')).toBeVisible();
});

test('an unpaid invoice offers a WhatsApp payment reminder with its balance', async ({ page }) => {
  await gotoApp(page, '/accounts-receivable');
  const reminder = page.getByRole('link', { name: 'Send Adwoa Nyarko a payment reminder on WhatsApp' });
  const text = decodedText(await reminder.getAttribute('href'));
  expect(await reminder.getAttribute('href')).toMatch(/^https:\/\/wa\.me\/233203334455\?text=/);
  expect(text).toContain('Invoice INV-201 has');
  expect(text).toMatch(/1,640\.00 outstanding/);
  // No phone on file, no button.
  await expect(page.getByRole('link', { name: /Yaw Owusu a payment reminder/ })).toHaveCount(0);
});
