const { chromium, devices } = require('playwright-core');
const { execSync } = require('child_process');
(async () => {
  const browser = await chromium.launch({
    executablePath: '/home/aassh/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome',
    args: ['--no-sandbox'],
  });
  const context = await browser.newContext({ ...devices['iPhone 13'] });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));

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
  const historyTileImg = progressHeading.locator('xpath=following::img[1]');
  await historyTileImg.click({ timeout: 10000 });
  await page.waitForTimeout(1500);

  const tabs = [
    { label: 'Redness', level: 'low', shot: 's89-10-redness-low-bar.png' },
    { label: 'Pores', level: 'medium', shot: 's89-11-pores-medium-bar.png' },
    { label: 'Blemishes', level: 'high', shot: 's89-12-blemishes-high-bar.png' },
  ];
  for (const t of tabs) {
    const tab = page.getByText(t.label, { exact: true }).first();
    await tab.click({ timeout: 10000 });
    await page.waitForTimeout(500);
    // The gradient bar lives inside the concern detail card, well below the
    // full-height photo — scroll it into view before shooting.
    const barHeading = page.getByText(t.label, { exact: true }).last();
    await barHeading.scrollIntoViewIfNeeded({ timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(700); // let the marker spring + card fade settle
    await page.screenshot({ path: `e2e/shots/${t.shot}` });
  }
  console.log('Errors:', JSON.stringify(errors));
  await browser.close();
})().catch(e => { console.error('FAILED:', e); process.exit(1); });
