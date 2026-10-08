import { test, expect } from '@playwright/test';
import { gotoApp } from '../helpers';

/** The end-of-day summary is off until an owner switches it on, and the preview matches the email's sections. */
test.use({ viewport: { width: 1440, height: 900 } });

test('an owner switches on the end-of-day summary and previews today', async ({ page }) => {
  await gotoApp(page, '/dashboard');
  const toggle = page.getByRole('switch', { name: 'Email me an end-of-day summary at 20:00' });
  await expect(toggle).not.toBeChecked();
  await toggle.click();
  await expect(toggle).toBeChecked();

  await page.getByRole('button', { name: "Preview today's summary" }).click();
  const dialog = page.getByRole('dialog', { name: 'Today at Omek Gigs' });
  await expect(dialog).toContainText(/Net GH₵\s?3,700\.00/);
  await expect(dialog).toContainText(/short GH₵\s?10\.00/);
  await expect(dialog).toContainText('Still open: Tema');
  await expect(dialog).toContainText('Gino Tomato Paste 400g (Osu): 2 left');
  await expect(dialog).toContainText('2 deliveries expected');
  await expect(dialog).not.toContainText('investigations');
});
