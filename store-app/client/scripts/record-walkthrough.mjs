/**
 * QuadERP Walkthrough Video Recorder
 *
 * Records a polished walkthrough of the app's key pages using direct URL
 * navigation (more reliable than clicking sidebar links which can be hidden
 * behind modals/overlays).
 *
 * Usage:  node scripts/record-walkthrough.mjs
 * Prereq: VITE_USE_MOCKS=true npm run dev  (on port 5173)
 */

import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, '..', 'walkthrough-recordings');
const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:5173';

const PAUSE = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log('🎬 Starting QuadERP Walkthrough Recording...');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir: OUTPUT_DIR, size: { width: 1440, height: 900 } },
    colorScheme: 'dark',
  });
  const page = await context.newPage();

  // Helper: navigate and wait for the page to settle
  async function goTo(route, label) {
    console.log(`\n📍 ${label}...`);
    await page.goto(`${BASE_URL}${route}`, { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
    // Wait for code-split chunk + animations
    await page.locator('.route-suspense-fallback').waitFor({ state: 'detached', timeout: 10000 }).catch(() => {});
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
    await PAUSE(2500);
  }

  try {
    // ── STEP 1: Dashboard ──
    await goTo('/dashboard', 'Step 1: Dashboard');
    // Wait extra for Recharts animations (default 1500ms)
    await PAUSE(1500);
    console.log('   Scrolling through dashboard...');
    await smoothScroll(page, 'down', 1200);
    await PAUSE(2500);
    await smoothScroll(page, 'down', 800);
    await PAUSE(2500);
    await smoothScroll(page, 'up', 2000);
    await PAUSE(2000);

    // ── STEP 2: Sales / POS ──
    await goTo('/sales', 'Step 2: Point of Sale');
    console.log('   Adding products to cart...');

    // Click products in the product grid
    const productCards = page.locator('.product-card');
    const pcCount = await productCards.count();
    console.log(`   Found ${pcCount} product cards`);
    if (pcCount > 0) {
      await productCards.nth(0).click();
      await PAUSE(1200);
    }
    if (pcCount > 1) {
      await productCards.nth(1).click();
      await PAUSE(1200);
    }
    if (pcCount > 2) {
      await productCards.nth(2).click();
      await PAUSE(1200);
    }

    // Increase quantity using the proper .qty-btn class
    const qtyPlusBtn = page.locator('.product-card-qty-control .qty-btn:has-text("+")').first();
    if (await qtyPlusBtn.count() > 0) {
      console.log('   Increasing quantity...');
      await qtyPlusBtn.click();
      await PAUSE(800);
      await qtyPlusBtn.click();
      await PAUSE(1200);
    }
    await PAUSE(2000);

    // ── STEP 3: Inventory ──
    await goTo('/inventory', 'Step 3: Inventory');
    console.log('   Scrolling through inventory...');
    await smoothScroll(page, 'down', 600);
    await PAUSE(2500);
    await smoothScroll(page, 'down', 600);
    await PAUSE(2500);
    await smoothScroll(page, 'up', 1200);
    await PAUSE(2000);

    // ── STEP 4: Products ──
    await goTo('/products', 'Step 4: Products');
    await smoothScroll(page, 'down', 600);
    await PAUSE(2500);
    await smoothScroll(page, 'up', 600);
    await PAUSE(2000);

    // ── STEP 5: Sales Record ──
    await goTo('/sales-record', 'Step 5: Sales Record');
    await smoothScroll(page, 'down', 600);
    await PAUSE(2500);

    // ── STEP 6: Alerts / Loss Prevention ──
    await goTo('/alerts', 'Step 6: Alerts / Loss Prevention');
    await smoothScroll(page, 'down', 600);
    await PAUSE(2500);

    // ── STEP 7: Customers ──
    await goTo('/customer-orders', 'Step 7: Customer Orders');
    await PAUSE(2500);

    // ── STEP 8: Suppliers ──
    await goTo('/suppliers', 'Step 8: Suppliers');
    await PAUSE(2500);

    // ── STEP 9: Purchase Orders ──
    await goTo('/purchase-orders', 'Step 9: Purchase Orders');
    await PAUSE(2500);

    // ── STEP 10: Reports / P&L ──
    await goTo('/reports/pnl', 'Step 10: P&L Report');
    await PAUSE(1500);
    await smoothScroll(page, 'down', 800);
    await PAUSE(2500);

    // ── STEP 11: Business Admin ──
    await goTo('/business-admin', 'Step 11: Business Admin Settings');
    await PAUSE(2500);

    // Final pause
    await PAUSE(2000);
    console.log('\n✅ Walkthrough complete!');

  } catch (err) {
    console.error('\n❌ Error during walkthrough:', err.message);
  }

  // Close to flush video
  const videoPath = await page.video()?.path();
  await page.close();
  await context.close();
  await browser.close();

  console.log(`\n🎬 Video saved: ${videoPath || OUTPUT_DIR}`);
}

async function smoothScroll(page, direction, pixels) {
  const step = 80;
  const delta = direction === 'down' ? step : -step;
  const steps = Math.ceil(pixels / step);
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, delta);
    await PAUSE(40);
  }
}

main().catch(console.error);
