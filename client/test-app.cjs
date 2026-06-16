const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
  page.on('requestfailed', request => console.log('REQUEST FAILED:', request.url(), request.failure().errorText));
  
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle0', timeout: 10000 });
  const content = await page.content();
  if (content.includes('Something went wrong')) {
    console.log("ERROR FOUND ON PAGE:");
    const text = await page.evaluate(() => document.body.innerText);
    console.log(text);
  } else {
    console.log("No error screen found.");
  }
  await browser.close();
})();
