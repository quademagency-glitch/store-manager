const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  // Capture console messages
  page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
  
  // Capture page errors
  page.on('pageerror', err => console.log('BROWSER ERROR:', err.toString()));
  
  // Capture network errors
  page.on('requestfailed', request => {
    console.log('REQUEST FAILED:', request.url(), request.failure().errorText);
  });

  try {
    console.log('Navigating to http://localhost:5173/dashboard...');
    await page.goto('http://localhost:5173/dashboard', { waitUntil: 'networkidle2', timeout: 15000 });
    
    const content = await page.content();
    console.log('Page body length:', content.length);
    
    // Check if the loading screen is visible
    const hasLoadingScreen = await page.evaluate(() => {
      const loader = document.querySelector('.loading-screen');
      return loader ? loader.innerHTML : null;
    });
    
    if (hasLoadingScreen) {
      console.log('Loading screen detected. Content inside:', hasLoadingScreen);
    } else {
      console.log('No loading screen detected. Looking for dashboard...');
      const dashboard = await page.evaluate(() => {
        const db = document.querySelector('.dashboard-page');
        return db ? db.innerHTML.substring(0, 200) : null;
      });
      console.log('Dashboard content:', dashboard);
    }
  } catch (error) {
    console.error('Error during navigation:', error);
  } finally {
    await browser.close();
  }
})();
