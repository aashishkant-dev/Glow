// Web-based verification pass for Stage 8 (confidence fog on the severity
// gradient bar) and Stage 9 (photoAligned corner-dot badge in My Space's
// progress rail). Runs against the real app (react-native-web) — Stages 2,
// 3+4, and 6 are native-camera/ML-Kit-only and cannot be exercised this
// way; not attempted here.
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
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  const SEED = JSON.parse(execSync('node e2e/seed_stage9_verification.js').toString().trim().split('\n').pop());

  await page.goto('http://localhost:8081', { waitUntil: 'load', timeout: 30000 });
  await page.evaluate(({ token, user }) => {
    localStorage.setItem('@glow/token', token);
    localStorage.setItem('@glow/user', JSON.stringify(user));
  }, { token: SEED.token, user: SEED.user });
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(3000);

  const myspaceTab = page.getByText('Space', { exact: true }).first();
  await myspaceTab.click({ timeout: 10000 });
  await page.waitForTimeout(2000);
  const gotItBtn = page.getByText('Got it', { exact: true }).first();
  if (await gotItBtn.count() > 0) { await gotItBtn.click(); await page.waitForTimeout(1000); }

  // ── Stage 9: progress rail — badge present on scan B (photoAligned=false), absent on scan A ──
  const progressHeading = page.getByText('Your progress', { exact: true });
  await progressHeading.scrollIntoViewIfNeeded({ timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'e2e/shots/s89-01-myspace-full.png' });
  const railBox = await progressHeading.boundingBox();
  if (railBox) {
    await page.screenshot({
      path: 'e2e/shots/s89-02-progress-rail-zoom.png',
      clip: { x: Math.max(0, railBox.x - 10), y: railBox.y, width: 400, height: 180 },
    });
  }
  console.log('MySpace body snippet:', (await page.evaluate(() => document.body.innerText)).slice(0, 400));
  console.log('Errors after My Space:', JSON.stringify(errors));

  // ── Stage 8: open scan A (newest — the one with real heatmaps/confidence levels) ──
  const historyTileImg = progressHeading.locator('xpath=following::img[1]');
  await historyTileImg.click({ timeout: 10000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'e2e/shots/s89-03-scanresult-summary.png' });
  console.log('ScanResult body snippet:', (await page.evaluate(() => document.body.innerText)).slice(0, 400));

  const tabs = [
    { label: 'Redness', level: 'low', shot: 's89-04-redness-low.png' },
    { label: 'Pores', level: 'medium', shot: 's89-05-pores-medium.png' },
    { label: 'Blemishes', level: 'high', shot: 's89-06-blemishes-high.png' },
  ];
  for (const t of tabs) {
    const tab = page.getByText(t.label, { exact: true }).first();
    const tabCount = await tab.count();
    console.log(`Tab "${t.label}" found:`, tabCount > 0);
    if (tabCount === 0) continue;
    await tab.click({ timeout: 10000 });
    await page.waitForTimeout(900); // let the ~220ms marker spring + ~180ms card fade settle
    await page.screenshot({ path: `e2e/shots/${t.shot}` });
    const bodyText = await page.evaluate(() => document.body.innerText);
    console.log(`${t.label} (${t.level}) body snippet:`, bodyText.slice(0, 250));
  }

  console.log('Final errors:', JSON.stringify(errors));
  await browser.close();
})().catch(e => { console.error('FAILED:', e); process.exit(1); });
