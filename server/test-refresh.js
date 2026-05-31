require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const puppeteer = require('puppeteer');

(async () => {
  console.log('Launching browser...');
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('BROWSER LOG:', msg.text()));

  try {
    // 1. Log in
    await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle2' });
    await page.type('#email', 'quadem.agency@gmail.com');
    await page.type('#password', 'Password123!');
    
    await Promise.all([
      page.click('#login-submit'),
      page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 10000 }).catch(() => {})
    ]);
    console.log('Logged in. Current URL:', page.url());
    
    // 2. Refresh page to simulate user returning with active session
    console.log('Refreshing page on /dashboard...');
    await page.reload({ waitUntil: 'networkidle2' });
    
    // 3. Check what's rendered
    await new Promise(r => setTimeout(r, 2000));
    const rootHtml = await page.evaluate(() => document.getElementById('root').innerHTML);
    
    if (rootHtml.includes('loading-screen')) {
      console.log('BUG DETECTED: Still showing loading screen after 2 seconds!');
    } else {
      console.log('Dashboard rendered successfully after refresh.');
    }
    
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await browser.close();
  }
})();
