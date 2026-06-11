require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  // Capture console messages
  page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
  
  // Capture page errors
  page.on('pageerror', err => console.error('BROWSER ERROR:', err.toString()));
  
  // Capture request failures
  page.on('requestfailed', req => console.error('REQUEST FAILED:', req.url(), req.failure()?.errorText));

  try {
    await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle2' });
    
    await page.type('#email', 'quadem.agency@gmail.com');
    await page.type('#password', 'Password123!');
    
    await Promise.all([
      page.click('#login-submit'),
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(e => {})
    ]);
    
    await new Promise(r => setTimeout(r, 2000));
    
    const stats = await page.evaluate(() => {
      const vals = document.querySelectorAll('.stat-value');
      return Array.from(vals).map(v => v.textContent);
    });
    console.log('STATS VALUES:', stats);
    
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await browser.close();
  }
})();
