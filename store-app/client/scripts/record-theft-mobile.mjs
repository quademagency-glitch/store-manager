import { chromium, devices } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, '..', 'walkthrough-recordings');
const AUDIO_DIR = path.join(OUTPUT_DIR, 'audio-theft-mobile');
const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:5173';

const PAUSE = (ms) => new Promise((r) => setTimeout(r, ms));

function getAudioDuration(filename) {
  try {
    const filePath = path.join(AUDIO_DIR, filename);
    if (!fs.existsSync(filePath)) return 8000;
    const out = execSync(`ffprobe -i "${filePath}" -show_entries format=duration -v quiet -of csv="p=0"`);
    return parseFloat(out.toString().trim()) * 1000;
  } catch (e) {
    return 8000;
  }
}

const SCENES = {
  intro: getAudioDuration('01_t_m_intro.mp3') + 1500,
  double: getAudioDuration('02_t_m_double.mp3') + 1500,
  alerts: getAudioDuration('03_t_m_alerts.mp3') + 2000,
};

async function injectCursor(page) {
  await page.evaluate(() => {
    if (document.getElementById('demo-cursor')) return;
    const cursor = document.createElement('div');
    cursor.id = 'demo-cursor';
    cursor.style.width = '30px'; 
    cursor.style.height = '30px';
    cursor.style.borderRadius = '50%';
    cursor.style.backgroundColor = 'rgba(255, 255, 255, 0.6)';
    cursor.style.border = '2px solid rgba(59, 130, 246, 0.9)';
    cursor.style.position = 'fixed';
    cursor.style.top = '50%';
    cursor.style.left = '50%';
    cursor.style.pointerEvents = 'none';
    cursor.style.zIndex = '999999';
    cursor.style.transform = 'translate(-50%, -50%)';
    cursor.style.transition = 'top 0.2s ease-out, left 0.2s ease-out, transform 0.1s';
    cursor.style.boxShadow = '0 0 15px rgba(0,0,0,0.3)';
    document.body.appendChild(cursor);

    window.addEventListener('mousemove', (e) => {
      cursor.style.left = e.clientX + 'px';
      cursor.style.top = e.clientY + 'px';
    });
    
    window.addEventListener('touchmove', (e) => {
      if (e.touches.length > 0) {
        cursor.style.left = e.touches[0].clientX + 'px';
        cursor.style.top = e.touches[0].clientY + 'px';
      }
    });

    const tap = (x, y) => {
      cursor.style.transform = 'translate(-50%, -50%) scale(0.7)';
      cursor.style.backgroundColor = 'rgba(59, 130, 246, 0.9)';
      
      const ripple = document.createElement('div');
      ripple.style.position = 'fixed';
      ripple.style.left = x + 'px';
      ripple.style.top = y + 'px';
      ripple.style.width = '30px';
      ripple.style.height = '30px';
      ripple.style.borderRadius = '50%';
      ripple.style.border = '2px solid rgba(59, 130, 246, 0.9)';
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
      
      setTimeout(() => {
        cursor.style.transform = 'translate(-50%, -50%) scale(1)';
        cursor.style.backgroundColor = 'rgba(255, 255, 255, 0.6)';
      }, 150);
    };

    window.addEventListener('mousedown', (e) => tap(e.clientX, e.clientY));
    window.addEventListener('touchstart', (e) => {
       if(e.touches.length > 0) tap(e.touches[0].clientX, e.touches[0].clientY);
    });
  });
}

async function moveCursorTo(page, selector, click = false) {
  try {
    const loc = page.locator(selector).first();
    if (await loc.count() > 0) {
      const box = await loc.boundingBox();
      if (box) {
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
  const step = 60;
  const delta = direction === 'down' ? step : -step;
  const steps = Math.ceil(pixels / step);
  const delay = Math.floor(durationMs / steps);
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, delta);
    await PAUSE(delay);
  }
}

async function main() {
  console.log('🎬 Starting Mobile Theft Explainer Recording...');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 540, height: 960 },
    deviceScaleFactor: 2, // 1080x1920
    isMobile: true,
    hasTouch: true,
    recordVideo: { dir: OUTPUT_DIR },
    colorScheme: 'dark',
  });
  const page = await context.newPage();

  async function goTo(route, label) {
    console.log(`\n📍 ${label}...`);
    await page.goto(`${BASE_URL}${route}`, { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
    await injectCursor(page);
    await PAUSE(1000);
  }

  try {
    // ── SCENE 1: Intro (Inventory) ──
    const s1Start = Date.now();
    await goTo('/inventory', 'Scene 1: Inventory (Unit-Level Tracking)');
    await moveCursorTo(page, '.m-card-amount', true); // Tap the stock count to open TrackingModal
    await PAUSE(1500);
    const s1Elapsed = Date.now() - s1Start;
    if (s1Elapsed < SCENES.intro) await PAUSE(SCENES.intro - s1Elapsed);

    // ── SCENE 2: Double Layer & POS Validation ──
    const s2Start = Date.now();
    console.log('   Assigning Tracking...');
    await moveCursorTo(page, 'button:has-text("Assign Tracking")', true);
    await PAUSE(1500);
    
    console.log('   Simulating Mobile Scanner...');
    await moveCursorTo(page, 'button[title="Scan Codes"]', true);
    await PAUSE(2000);
    
    await moveCursorTo(page, 'button:has-text("Save Tracking")', true);
    await PAUSE(2000);
    await moveCursorTo(page, '.modal-close', true);
    await PAUSE(1000);

    await goTo('/sales', 'Scene 2 (cont): POS Validation');
    console.log('   Ringing up item...');
    await moveCursorTo(page, '.product-card', true);
    await PAUSE(1500);
    
    console.log('   Simulating POS scan validation...');
    await moveCursorTo(page, 'button:has-text("[DEV] Simulate Scan")', true);
    await PAUSE(2000);
    const s2Elapsed = Date.now() - s2Start;
    if (s2Elapsed < SCENES.double) await PAUSE(SCENES.double - s2Elapsed);

    // ── SCENE 3: Alerts ──
    const s3Start = Date.now();
    await goTo('/alerts', 'Scene 3: Alerts');
    await smoothScroll(page, 'down', 800, 3500);
    const s3Elapsed = Date.now() - s3Start;
    if (s3Elapsed < SCENES.alerts) await PAUSE(SCENES.alerts - s3Elapsed);

    console.log('\n✅ Mobile Theft Walkthrough complete!');

  } catch (err) {
    console.error('\n❌ Error during walkthrough:', err.message);
  }

  const videoPath = await page.video()?.path();
  await page.close();
  await context.close();
  await browser.close();

  const finalWebm = path.join(OUTPUT_DIR, 'mobile-raw-theft.webm');
  if (fs.existsSync(finalWebm)) fs.unlinkSync(finalWebm);
  fs.renameSync(videoPath, finalWebm);

  console.log(`\n🎬 Video saved: ${finalWebm}`);
}

main().catch(console.error);
