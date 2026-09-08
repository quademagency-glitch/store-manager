import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const recordingsDir = path.join(__dirname, '..', 'walkthrough-recordings');

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: {
      dir: recordingsDir,
      size: { width: 1280, height: 720 }
    }
  });

  // Mock authentication via localStorage
  await context.addInitScript(() => {
    localStorage.setItem('auth_token', 'mock-token');
    localStorage.setItem('user', JSON.stringify({ 
      id: 'usr_1', 
      email: 'admin@quaderp.com', 
      role: 'Business Admin',
      business_id: 'biz_1'
    }));
  });

  const page = await context.newPage();
  
  // Navigate directly to Cycle Counts tab
  await page.goto('http://localhost:5173/inventory?tab=audits');
  
  // Scene 1: Pause on the page
  await page.waitForTimeout(5000); 

  // Scene 2: Select location
  await page.waitForSelector('select[class="form-input"]');
  await page.selectOption('select[class="form-input"]', { index: 1 }); // Select first location
  await page.waitForTimeout(1000);
  
  // Scene 3: Interact with the grid
  await page.waitForSelector('.audit-row');
  const inputs = await page.$$('.audit-row input[type="number"]');
  
  if (inputs.length >= 3) {
    // Fill first item perfectly
    const expected1 = await page.$eval('.audit-row:nth-child(2) .expected-qty', el => el.textContent);
    await inputs[0].fill(expected1);
    await page.waitForTimeout(1000);
    
    // Fill second item perfectly
    const expected2 = await page.$eval('.audit-row:nth-child(3) .expected-qty', el => el.textContent);
    await inputs[1].fill(expected2);
    await page.waitForTimeout(1000);
    
    // Fill third item with discrepancy
    const expected3 = await page.$eval('.audit-row:nth-child(4) .expected-qty', el => el.textContent);
    const counted3 = Math.max(0, parseInt(expected3, 10) - 2); // 2 missing units
    await inputs[2].fill(counted3.toString());
    await page.waitForTimeout(1500);
  }

  // Click submit
  await page.click('button:has-text("Submit Cycle Count")');
  
  // Wait for results banner and linger
  await page.waitForTimeout(6000);

  const videoPath = await page.video().path();
  await context.close();
  await browser.close();

  // Rename video
  import('fs').then(fs => {
    fs.renameSync(videoPath, path.join(recordingsDir, 'raw-stocktake.webm'));
    console.log('Video recorded to raw-stocktake.webm');
  });
}

main().catch(console.error);
