import { chromium, devices } from '@playwright/test';

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    ...devices['Pixel 5'],
  });
  const page = await context.newPage();

  await page.clock.install({ time: new Date('2026-07-15T14:30:00Z') });
  await page.addInitScript(`
    try {
      localStorage.setItem('app-theme', '"dark"');
      localStorage.setItem('active_location_id', 'mock-loc');
      localStorage.setItem('tour_completed', 'true');
    } catch (e) {}
  `);

  const urls = [
    { url: 'http://localhost:5175/business-admin', name: 'dashboard-mobile' },
    { url: 'http://localhost:5175/sales', name: 'pos-mobile' },
    { url: 'http://localhost:5175/inventory', name: 'inventory-mobile' },
  ];

  for (const { url, name } of urls) {
    await page.goto(url);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000); 
    await page.screenshot({ path: `/Users/macbookpro/.gemini/antigravity-ide/brain/b999a9f0-cf41-4364-862a-3a579d508710/${name}-screenshot.png`, fullPage: false });
    console.log(`Captured ${name}`);
  }

  await browser.close();
})();
