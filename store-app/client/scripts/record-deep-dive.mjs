/**
 * QuadERP Deep Dive Video Recorder
 *
 * Records a highly interactive, animated walkthrough of the app's key pages
 * synchronized with generated TTS audio.
 *
 * Usage:  node scripts/record-deep-dive.mjs
 * Prereq: VITE_USE_MOCKS=true npm run dev  (on port 5173)
 */

import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, '..', 'walkthrough-recordings');
const AUDIO_DIR = path.join(OUTPUT_DIR, 'audio');
const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:5173';

const PAUSE = (ms) => new Promise((r) => setTimeout(r, ms));

// Get audio duration using ffprobe
function getAudioDuration(filename) {
  try {
    const filePath = path.join(AUDIO_DIR, filename);
    if (!fs.existsSync(filePath)) return 8000; // default 8s if missing
    const out = execSync(`ffprobe -i "${filePath}" -show_entries format=duration -v quiet -of csv="p=0"`);
    return parseFloat(out.toString().trim()) * 1000;
  } catch (e) {
    console.error(`Warning: Could not get duration for ${filename}, defaulting to 8s`);
    return 8000;
  }
}

// Global scene durations based on audio length
const SCENES = {
  dashboard: getAudioDuration('01_dashboard.mp3') + 2000,
  sales: getAudioDuration('02_sales.mp3') + 2000,
  products: getAudioDuration('03_products.mp3') + 1500,
  inventory: getAudioDuration('04_inventory.mp3') + 1500,
  salesRecord: getAudioDuration('05_sales_record.mp3') + 1500,
  alerts: getAudioDuration('06_alerts.mp3') + 1500,
  crm: getAudioDuration('07_crm.mp3') + 1500,
  suppliers: getAudioDuration('08_suppliers.mp3') + 1500,
  accounting: getAudioDuration('09_accounting.mp3') + 1500,
  hr: getAudioDuration('10_hr.mp3') + 1500,
  admin: getAudioDuration('11_admin.mp3') + 1500,
  closing: getAudioDuration('12_closing.mp3') + 2000,
};

async function injectCursor(page) {
  await page.evaluate(() => {
    const cursor = document.createElement('div');
    cursor.id = 'demo-cursor';
    cursor.style.width = '24px';
    cursor.style.height = '24px';
    cursor.style.borderRadius = '50%';
    cursor.style.backgroundColor = 'rgba(59, 130, 246, 0.6)';
    cursor.style.border = '2px solid rgba(255, 255, 255, 0.8)';
    cursor.style.position = 'fixed';
    cursor.style.top = '0';
    cursor.style.left = '0';
    cursor.style.pointerEvents = 'none';
    cursor.style.zIndex = '999999';
    cursor.style.transform = 'translate(-50%, -50%)';
    cursor.style.transition = 'top 0.15s ease-out, left 0.15s ease-out, transform 0.1s';
    cursor.style.boxShadow = '0 0 10px rgba(59,130,246,0.5)';
    document.body.appendChild(cursor);

    window.addEventListener('mousemove', (e) => {
      cursor.style.left = e.clientX + 'px';
      cursor.style.top = e.clientY + 'px';
    });

    window.addEventListener('mousedown', () => {
      cursor.style.transform = 'translate(-50%, -50%) scale(0.7)';
      cursor.style.backgroundColor = 'rgba(59, 130, 246, 0.9)';
      
      // Ripple effect
      const ripple = document.createElement('div');
      ripple.style.position = 'fixed';
      ripple.style.left = cursor.style.left;
      ripple.style.top = cursor.style.top;
      ripple.style.width = '24px';
      ripple.style.height = '24px';
      ripple.style.borderRadius = '50%';
      ripple.style.border = '2px solid rgba(59, 130, 246, 0.8)';
      ripple.style.transform = 'translate(-50%, -50%) scale(1)';
      ripple.style.transition = 'all 0.4s ease-out';
      ripple.style.pointerEvents = 'none';
      ripple.style.zIndex = '999998';
      document.body.appendChild(ripple);
      
      requestAnimationFrame(() => {
        ripple.style.transform = 'translate(-50%, -50%) scale(3)';
        ripple.style.opacity = '0';
      });
      setTimeout(() => ripple.remove(), 400);
    });

    window.addEventListener('mouseup', () => {
      cursor.style.transform = 'translate(-50%, -50%) scale(1)';
      cursor.style.backgroundColor = 'rgba(59, 130, 246, 0.6)';
    });
  });
}

async function moveCursorTo(page, selector, click = false) {
  try {
    const loc = page.locator(selector).first();
    if (await loc.count() > 0) {
      const box = await loc.boundingBox();
      if (box) {
        // Move with smooth steps
        const targetX = box.x + box.width / 2;
        const targetY = box.y + box.height / 2;
        await page.mouse.move(targetX, targetY, { steps: 20 });
        await PAUSE(300);
        if (click) {
          await page.mouse.click(targetX, targetY);
          await PAUSE(500);
        }
      }
    }
  } catch (e) {
    console.log(`Failed to move cursor to ${selector}: ${e.message}`);
  }
}

async function smoothScroll(page, direction, pixels, durationMs = 2000) {
  const step = 40;
  const delta = direction === 'down' ? step : -step;
  const steps = Math.ceil(pixels / step);
  const delay = Math.floor(durationMs / steps);
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, delta);
    await PAUSE(delay);
  }
}

async function main() {
  console.log('🎬 Starting Deep Dive Walkthrough Recording...');

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
    await injectCursor(page);
    await PAUSE(1000);
  }

  try {
    // ── SCENE 1: Dashboard ──
    const s1Start = Date.now();
    await goTo('/dashboard', 'Scene 1: Dashboard');
    await moveCursorTo(page, '.stat-card:has-text("Revenue")');
    await PAUSE(1000);
    await smoothScroll(page, 'down', 600, 3000);
    await moveCursorTo(page, '.recharts-wrapper');
    await PAUSE(1000);
    await smoothScroll(page, 'down', 800, 4000);
    await moveCursorTo(page, '.activity-feed-item');
    const s1Elapsed = Date.now() - s1Start;
    if (s1Elapsed < SCENES.dashboard) await PAUSE(SCENES.dashboard - s1Elapsed);

    // ── SCENE 2: Sales POS ──
    const s2Start = Date.now();
    await goTo('/sales', 'Scene 2: Point of Sale');
    await moveCursorTo(page, '.product-card:has-text("Perfumed Rice")', true);
    await moveCursorTo(page, '.product-card:has-text("Milo Tin")', true);
    await moveCursorTo(page, '.product-card-qty-control .qty-btn:has-text("+")', true);
    await moveCursorTo(page, 'button:has-text("+ Customer")', true);
    await moveCursorTo(page, 'input[placeholder="Search by phone or name..."]');
    await page.keyboard.type('Ama Mensah', { delay: 100 });
    await PAUSE(500);
    await moveCursorTo(page, 'button:has-text("Select"):first-of-type', true);
    await PAUSE(1000);
    const s2Elapsed = Date.now() - s2Start;
    if (s2Elapsed < SCENES.sales) await PAUSE(SCENES.sales - s2Elapsed);

    // ── SCENE 3: Products Catalog ──
    const s3Start = Date.now();
    await goTo('/products', 'Scene 3: Products Catalog');
    await moveCursorTo(page, 'input[placeholder="Search products..."]');
    await smoothScroll(page, 'down', 800, 3000);
    await moveCursorTo(page, 'td:has-text("GH₵")');
    const s3Elapsed = Date.now() - s3Start;
    if (s3Elapsed < SCENES.products) await PAUSE(SCENES.products - s3Elapsed);

    // ── SCENE 4: Inventory Management ──
    const s4Start = Date.now();
    await goTo('/inventory', 'Scene 4: Inventory Management');
    await moveCursorTo(page, 'text="Inventory Health"');
    await PAUSE(1000);
    await smoothScroll(page, 'down', 400, 2000);
    await moveCursorTo(page, 'span:has-text("Low Stock")');
    await moveCursorTo(page, 'td:has-text("Gino Tomato Paste")');
    const s4Elapsed = Date.now() - s4Start;
    if (s4Elapsed < SCENES.inventory) await PAUSE(SCENES.inventory - s4Elapsed);

    // ── SCENE 5: Sales Record ──
    const s5Start = Date.now();
    await goTo('/sales-record', 'Scene 5: Sales Record');
    await moveCursorTo(page, 'button:has-text("Filters")');
    await smoothScroll(page, 'down', 800, 3000);
    await moveCursorTo(page, 'button:has-text("View"):first-of-type', true);
    await PAUSE(2000);
    await moveCursorTo(page, 'button.close-modal', true);
    const s5Elapsed = Date.now() - s5Start;
    if (s5Elapsed < SCENES.salesRecord) await PAUSE(SCENES.salesRecord - s5Elapsed);

    // ── SCENE 6: Alerts & Loss Prevention ──
    const s6Start = Date.now();
    await goTo('/alerts', 'Scene 6: Alerts');
    await moveCursorTo(page, '.alert-card.severity-high');
    await smoothScroll(page, 'down', 600, 3000);
    await moveCursorTo(page, 'button:has-text("Resolve"):first-of-type');
    const s6Elapsed = Date.now() - s6Start;
    if (s6Elapsed < SCENES.alerts) await PAUSE(SCENES.alerts - s6Elapsed);

    // ── SCENE 7: Customers (CRM) ──
    const s7Start = Date.now();
    await goTo('/customers', 'Scene 7: Customers (CRM)');
    await moveCursorTo(page, 'td:has-text("Ama Mensah")');
    await smoothScroll(page, 'down', 500, 2000);
    const s7Elapsed = Date.now() - s7Start;
    if (s7Elapsed < SCENES.crm) await PAUSE(SCENES.crm - s7Elapsed);

    // ── SCENE 8: Suppliers & POs ──
    const s8Start = Date.now();
    await goTo('/suppliers', 'Scene 8: Suppliers & POs');
    await moveCursorTo(page, 'button:has-text("+ New Supplier")');
    await goTo('/purchase-orders', 'Scene 8b: Purchase Orders');
    await moveCursorTo(page, 'button:has-text("+ Create PO")');
    const s8Elapsed = Date.now() - s8Start;
    if (s8Elapsed < SCENES.suppliers) await PAUSE(SCENES.suppliers - s8Elapsed);

    // ── SCENE 9: Accounting & Reports ──
    const s9Start = Date.now();
    await goTo('/reports/pnl', 'Scene 9: P&L Report');
    await moveCursorTo(page, 'text="Net Profit"');
    await smoothScroll(page, 'down', 800, 4000);
    await goTo('/accounts-receivable', 'Scene 9b: Accounts Receivable');
    await moveCursorTo(page, 'td:has-text("Overdue")');
    const s9Elapsed = Date.now() - s9Start;
    if (s9Elapsed < SCENES.accounting) await PAUSE(SCENES.accounting - s9Elapsed);

    // ── SCENE 10: HR & Team ──
    const s10Start = Date.now();
    await goTo('/settings', 'Scene 10: HR & Team'); // Roles/Team is usually in settings
    await moveCursorTo(page, 'text="Roles"');
    await smoothScroll(page, 'down', 600, 3000);
    const s10Elapsed = Date.now() - s10Start;
    if (s10Elapsed < SCENES.hr) await PAUSE(SCENES.hr - s10Elapsed);

    // ── SCENE 11: Business Admin ──
    const s11Start = Date.now();
    await goTo('/business-admin', 'Scene 11: Business Admin');
    await moveCursorTo(page, 'text="Store Setup Checklist"');
    await goTo('/business-admin/locations', 'Scene 11b: Locations');
    await moveCursorTo(page, 'button:has-text("+ Location")');
    const s11Elapsed = Date.now() - s11Start;
    if (s11Elapsed < SCENES.admin) await PAUSE(SCENES.admin - s11Elapsed);

    // ── SCENE 12: Closing ──
    const s12Start = Date.now();
    await goTo('/dashboard', 'Scene 12: Closing');
    await moveCursorTo(page, '.logo');
    const s12Elapsed = Date.now() - s12Start;
    if (s12Elapsed < SCENES.closing) await PAUSE(SCENES.closing - s12Elapsed);

    console.log('\n✅ Walkthrough complete!');

  } catch (err) {
    console.error('\n❌ Error during walkthrough:', err.message);
  }

  const videoPath = await page.video()?.path();
  await page.close();
  await context.close();
  await browser.close();

  // Rename to deterministic name
  const finalWebm = path.join(OUTPUT_DIR, 'deep-dive-raw.webm');
  if (fs.existsSync(finalWebm)) fs.unlinkSync(finalWebm);
  fs.renameSync(videoPath, finalWebm);

  console.log(`\n🎬 Video saved: ${finalWebm}`);
}

main().catch(console.error);
