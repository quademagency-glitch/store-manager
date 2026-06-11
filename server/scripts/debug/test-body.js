const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  try {
    await page.goto('http://localhost:5173/dashboard', { waitUntil: 'networkidle2', timeout: 15000 });
    
    const rootHtml = await page.evaluate(() => {
      return document.getElementById('root') ? document.getElementById('root').innerHTML : 'NO_ROOT';
    });
    console.log('ROOT HTML:', rootHtml);
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await browser.close();
  }
})();
