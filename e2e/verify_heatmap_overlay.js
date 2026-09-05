// Visual verification that the real, server-generated heatmap PNGs actually
// render ON the photo in each concern tab AND inside the pinch-zoom
// magnifier — against a REAL scan produced by the real pipeline (real
// heatmap PNGs in blob storage), not seeded placeholder URLs.
const { jwtSecret, useDatabase } = require('./_env');
const { chromium, devices } = require('playwright-core');
const jwt = require('../node_modules/jsonwebtoken');
useDatabase();
const prisma = require('../src/lib/prisma');
const JWT_SECRET = jwtSecret();
const SCAN_ID = 'cmtjk3osq00017kftggqwddab';

(async () => {
  const scan = await prisma.skinScan.findUnique({ where: { id: SCAN_ID } });
  const user = await prisma.user.findUnique({ where: { id: scan.userId } });
  const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: '30d', algorithm: 'HS256' });
  const concerns = Object.keys(scan.heatmaps).filter((k) => scan.heatmaps[k]?.url);
  console.log('Real scan concerns with overlays:', concerns.join(', '));

  const browser = await chromium.launch({ executablePath: '/home/aassh/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome', args: ['--no-sandbox'] });
  const context = await browser.newContext({ ...devices['iPhone 13'] });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

  await page.goto('http://localhost:8081', { waitUntil: 'load', timeout: 30000 });
  await page.evaluate(({ token, user }) => {
    localStorage.setItem('@glow/token', token);
    localStorage.setItem('@glow/user', JSON.stringify(user));
  }, { token, user: { id: user.id, name: user.name, role: user.role, phone: user.phone, photoUrl: null, onboardingComplete: true, phoneVerified: true } });
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(3000);

  await page.getByText('Space', { exact: true }).first().click({ timeout: 10000 });
  await page.waitForTimeout(2500);
  const gotIt = page.getByText('Got it', { exact: true }).first();
  if (await gotIt.count() > 0) { await gotIt.click(); await page.waitForTimeout(800); }

  // Open the newest scan from the progress rail
  const heading = page.getByText('Your progress', { exact: true });
  await heading.scrollIntoViewIfNeeded({ timeout: 10000 });
  await heading.locator('xpath=following::img[1]').click({ timeout: 10000 });
  await page.waitForTimeout(2000);

  // Counts how many <img> on screen point at a heatmap PNG (blob storage,
  // .png) vs the base photo (.jpg) — real DOM proof the overlay layer is
  // actually mounted over the photo, independent of what the pixels look like.
  const overlayCount = async () => page.evaluate(() =>
    Array.from(document.querySelectorAll('img')).filter((i) => /\.png(\?|$)/.test(i.src) && /blob\.vercel-storage/.test(i.src)).length);

  const TABS = { pore: 'Pores', moisture: 'Dryness', wrinkle: 'Fine Lines', acne: 'Blemishes', texture: 'Uneven Texture', age_spot: 'Dark Spots', redness: 'Redness' };
  for (const key of concerns) {
    const label = TABS[key];
    if (!label) continue;
    const tab = page.getByText(label, { exact: true }).first();
    if (await tab.count() === 0) { console.log(`  ${label}: TAB NOT FOUND`); continue; }
    await tab.click({ timeout: 10000 });
    await page.waitForTimeout(1200);
    const n = await overlayCount();
    console.log(`  ${label.padEnd(16)} overlay <img> mounted over photo: ${n > 0 ? 'YES' : 'NO'} (${n})`);
    await page.screenshot({ path: `e2e/shots/hm-tab-${key}.png` });
  }

  // Zoom/magnifier — the specific place this was previously missing
  console.log('\nOpening pinch-zoom magnifier on the last-selected concern…');
  // styles.floatZoom is a 34x34 circular Pressable (borderRadius 17,
  // rgba(0,0,0,0.4)) holding an SVG SearchIcon — no text to select on, so
  // it's found by those exact computed-style dimensions instead.
  const zoomPt = await page.evaluate(() => {
    for (const el of Array.from(document.querySelectorAll('div'))) {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      if (Math.round(r.width) === 34 && Math.round(r.height) === 34 && cs.borderRadius.startsWith('17') && el.querySelector('svg')) {
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      }
    }
    return null;
  });
  if (!zoomPt) { console.log('  !! zoom control not found — cannot verify magnifier'); }
  else { await page.mouse.click(zoomPt.x, zoomPt.y); }
  await page.waitForTimeout(2000);
  const zoomN = await overlayCount();
  const zoomHint = await page.getByText('Pinch to zoom', { exact: false }).count();
  console.log(`  Magnifier open (hint visible): ${zoomHint > 0 ? 'YES' : 'NO'} | overlay <img> present while zoomed: ${zoomN > 0 ? 'YES' : 'NO'} (${zoomN})`);
  await page.screenshot({ path: 'e2e/shots/hm-zoom-magnifier.png' });

  console.log('\nErrors:', JSON.stringify(errors));
  await browser.close();
  await prisma.$disconnect();
})().catch((e) => { console.error('FAILED:', e); process.exit(1); });
