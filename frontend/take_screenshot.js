import { chromium } from 'playwright';

async function run() {
  console.log('Launching browser...');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  // Set viewport to a typical mobile device screen size (since it's a mobile app)
  await page.setViewportSize({ width: 390, height: 844 });
  
  console.log('Navigating to app...');
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
  
  console.log('Waiting for 3D model and animation...');
  await page.waitForTimeout(3000); // Wait 3s for GLB load and animation to settle
  
  console.log('Taking screenshot...');
  await page.screenshot({ path: '/home/runner/work/DaZhugong/DaZhugong/piggy_bank_screenshot.png' });
  
  console.log('Done!');
  await browser.close();
}

run().catch(console.error);
