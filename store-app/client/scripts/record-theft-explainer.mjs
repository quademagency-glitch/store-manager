/**
 * QuadERP Walkthrough Video Recorder - Theft Prevention
 *
 * Usage:  node scripts/record-theft-explainer.mjs
 * Prereq: VITE_USE_MOCKS=true npm run dev
 */

import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, '..', 'walkthrough-recordings');
const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:5173';

const PAUSE = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log('🎬 Starting QuadERP Theft Prevention Walkthrough...');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir: OUTPUT_DIR, size: { width: 1440, height: 900 } },
    colorScheme: 'dark',
  });
  const page = await context.newPage();

  async function goTo(route, label) {
    console.log(`\n📍 ${label}...`);
    await page.goto(`${BASE_URL}${route}`, { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
    await page.locator('.route-suspense-fallback').waitFor({ state: 'detached', timeout: 10000 }).catch(() => {});
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
    await PAUSE(2000);
  }

  try {
    // Scene 1 & 2: Inventory & Tracking Modal
    await goTo('/inventory', 'Step 1 & 2: Inventory & Unit-Level Tracking');
    await PAUSE(1500);
    
    console.log('   Opening Tracking Modal for first high-value item...');
    // Click the stock count to open TrackingModal
    const stockCounts = page.locator('.stock-count');
    if (await stockCounts.count() > 0) {
      await stockCounts.nth(0).click();
      await PAUSE(1500);
      
      console.log('   Clicking Assign Tracking...');
      await page.locator('button:has-text("Assign Tracking")').click();
      await PAUSE(1500);
      
      console.log('   Simulating internal scanner...');
      // Click the first [DEV] Simulate Scan button (the scanner icon button in the new UI layout)
      // Since it's an icon button, we'll click the button with title="Scan Codes"
      const scanButton = page.locator('button[title="Scan Codes"]').nth(0);
      if (await scanButton.count() > 0) {
        await scanButton.click();
        await PAUSE(2000); // Let the scanner simulate delay
      }
      
      console.log('   Saving Tracking...');
      await page.locator('button:has-text("Save Tracking")').click();
      await PAUSE(2000);
      
      // Close the modal
      await page.locator('.modal-close').first().click();
      await PAUSE(1000);
    }

    // Scene 3: POS Validation
    await goTo('/sales', 'Step 3: Point of Sale (Double Layer Validation)');
    console.log('   Ringing up item...');
    const productCards = page.locator('.product-card');
    if (await productCards.count() > 0) {
      await productCards.nth(0).click();
      await PAUSE(1500);
      
      console.log('   Simulating double-layer internal tag scan...');
      // Await the scanner modal to show up
      const simButton = page.locator('button:has-text("[DEV] Simulate Scan")');
      if (await simButton.isVisible()) {
        await simButton.click();
        await PAUSE(2000);
      }
    }
    await PAUSE(1500);

    // Scene 4: Alerts
    await goTo('/alerts', 'Step 4: Real-time Alerts');
    await PAUSE(1500);
    await smoothScroll(page, 'down', 800);
    await PAUSE(2500);
    await smoothScroll(page, 'up', 400);
    await PAUSE(2000);

    // Scene 5: Admin / Manager controls
    await goTo('/business-admin/shrinkage', 'Step 5: Shrinkage Report');
    await PAUSE(1500);
    await smoothScroll(page, 'down', 600);
    await PAUSE(3000);

    console.log('\n✅ Walkthrough complete!');

  } catch (err) {
    console.error('\n❌ Error during walkthrough:', err.message);
  }

  const videoPath = await page.video()?.path();
  await page.close();
  await context.close();
  await browser.close();

  // Rename to deep-dive-raw-theft.webm so it doesn't overwrite the generic one
  const fs = await import('fs');
  const finalWebm = path.join(OUTPUT_DIR, 'deep-dive-raw-theft.webm');
  if (fs.existsSync(finalWebm)) fs.unlinkSync(finalWebm);
  fs.renameSync(videoPath, finalWebm);

  console.log(`\n🎬 Video saved: ${finalWebm}`);
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
