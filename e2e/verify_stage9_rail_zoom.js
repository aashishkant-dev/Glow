const { chromium, devices } = require('playwright-core');
const { execSync } = require('child_process');
(async () => {
  const browser = await chromium.launch({
    executablePath: '/home/aassh/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome',
    args: ['--no-sandbox'],
  });
  const context = await browser.newContext({ ...devices['iPhone 13'] });
  const page = await context.newPage();

  const SEED = JSON.parse(execSync('node e2e/seed_stage9_verification.js').toString().trim().split('\n').pop());

  await page.goto('http://localhost:8081', { waitUntil: 'load', timeout: 30000 });
  await page.evaluate(({ token, user }) => {
    localStorage.setItem('@glow/token', token);
    localStorage.setItem('@glow/user', JSON.stringify(user));
  }, { token: SEED.token, user: SEED.user });
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(3000);
  await page.getByText('Space', { exact: true }).first().click({ timeout: 10000 });
  await page.waitForTimeout(2000);
  const gotItBtn = page.getByText('Got it', { exact: true }).first();
  if (await gotItBtn.count() > 0) { await gotItBtn.click(); await page.waitForTimeout(1000); }

  const progressHeading = page.getByText('Your progress', { exact: true });
  await progressHeading.scrollIntoViewIfNeeded({ timeout: 10000 });
  // Push the heading further up so the fixed bottom tab bar (~90px) doesn't
  // cover the tile row directly below it.
  await page.mouse.wheel(0, 150);
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'e2e/shots/s89-07-progress-rail-clean.png' });

  const railBox = await progressHeading.boundingBox();
  if (railBox) {
    await page.screenshot({
      path: 'e2e/shots/s89-08-progress-rail-tight.png',
      clip: { x: Math.max(0, railBox.x - 10), y: Math.max(0, railBox.y - 5), width: 400, height: 190 },
    });
  }
  await browser.close();
})().catch(e => { console.error('FAILED:', e); process.exit(1); });
