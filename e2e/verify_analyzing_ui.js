// Attempt to reach the real 'analyzing' step on the web build to observe
// the new stage-driven UI (STAGE_LABELS / scanStage) actually rendering
// from real polled backend state, not simulated. ML Kit face detection is
// native-only, so this may not get past capture on web with a fake camera
// stream — that's expected and reported honestly, not worked around.
const { chromium, devices } = require('playwright-core');
const { execSync } = require('child_process');
(async () => {
  const browser = await chromium.launch({
    executablePath: '/home/aassh/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome',
    args: ['--no-sandbox', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  });
  const context = await browser.newContext({ ...devices['iPhone 13'], permissions: ['camera'] });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errors.push('console: ' + m.text()); });

  const PHONE = '7055550411';
  await page.goto('http://localhost:8081', { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.getByPlaceholder(/name/i).fill('E2E Analyzing UI');
  await page.getByText('Select country').click();
  await page.waitForTimeout(400);
  await page.getByText('Canada', { exact: false }).click();
  await page.waitForTimeout(400);
  await page.getByPlaceholder('705-555-0100').fill(PHONE);
  await page.waitForTimeout(300);
  await page.getByText(/confirm I'm 18/i).click();
  await page.waitForTimeout(300);
  await page.getByText('Continue', { exact: true }).last().click();
  await page.waitForTimeout(2500);
  const otp = execSync(`grep -a '\\[OTP\\] +1${PHONE}' /home/aassh/Glow/Glow/.logs/backend.log | tail -1 | grep -oE '[0-9]{6}$'`).toString().trim();
  const otpInput = page.locator('input').first();
  await otpInput.click();
  await otpInput.type(otp, { delay: 80 });
  await page.waitForTimeout(3000);

  await page.getByText('Space', { exact: true }).first().click({ timeout: 10000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'e2e/shots/aui-01-myspace.png' });

  const scanBtn = page.getByText(/Scan now|Rescan/i).first();
  if (await scanBtn.count() === 0) { console.log('No scan entry point found on My Space — stopping.'); await browser.close(); return; }
  await scanBtn.click({ timeout: 10000 });
  await page.waitForTimeout(2000);
  const allowBtn = page.getByText('Allow Camera', { exact: true });
  if (await allowBtn.isVisible().catch(() => false)) { await allowBtn.click(); await page.waitForTimeout(2000); }
  await page.screenshot({ path: 'e2e/shots/aui-02-camera.png' });
  console.log('Camera step body:', (await page.evaluate(() => document.body.innerText)).slice(0, 300));

  // Try to trigger a capture — look for a shutter control. On web with a
  // synthetic fake video stream, vision-camera itself may not even mount
  // (it's a native module) — if no shutter is found or tapping it never
  // reaches 'analyzing', that's the expected native-only limitation, not a
  // bug to route around.
  const shutter = page.locator('[accessibilityLabel="Capture"], [aria-label="Capture"]').first();
  const shutterCount = await shutter.count();
  console.log('Shutter control found:', shutterCount > 0);
  if (shutterCount > 0) {
    await shutter.click({ timeout: 8000 }).catch((e) => console.log('shutter tap failed:', e.message));
    await page.waitForTimeout(2500);
    await page.screenshot({ path: 'e2e/shots/aui-03-after-shutter.png' });
    console.log('Post-shutter body:', (await page.evaluate(() => document.body.innerText)).slice(0, 400));
  }

  const bodyText = await page.evaluate(() => document.body.innerText);
  const reachedAnalyzing = /Checking sharpness|Preparing your photo|Reading your skin|Saving your results|Starting your scan/.test(bodyText);
  console.log('Reached the real analyzing step:', reachedAnalyzing);
  if (reachedAnalyzing) {
    for (let i = 0; i < 6; i++) {
      const t = await page.evaluate(() => document.body.innerText);
      const label = (t.match(/Checking sharpness…|Preparing your photo…|Reading your skin…|Saving your results…|Starting your scan…/) || [])[0];
      console.log(`  [t+${i * 2}s] stage label: ${label}`);
      await page.screenshot({ path: `e2e/shots/aui-04-analyzing-${i}.png` });
      await page.waitForTimeout(2000);
    }
  }
  console.log('Errors:', JSON.stringify(errors));
  await browser.close();
})().catch(e => { console.error('FAILED:', e); process.exit(1); });
