#!/usr/bin/env node
/**
 * Post-web-build script — runs after `npx expo export -p web`.
 *
 * Expo's web export does NOT include our PWA assets (manifest, service worker,
 * icons) or inject the install meta tags. This script layers the contents of
 * `mobile/web/` on top of `mobile/dist/` and patches dist/index.html so the
 * exported site is installable (Add to Home Screen) on iOS + Android.
 *
 * `mobile/web/` is the source of truth for all static PWA assets.
 */
const fs = require('fs');
const path = require('path');

const DIST = path.join(__dirname, '..', 'dist');
const WEB = path.join(__dirname, '..', 'web');

if (!fs.existsSync(DIST)) {
  console.error('✘ dist/ not found. Run `npx expo export -p web` first.');
  process.exit(1);
}

// ── 1. Copy every static asset from web/ into dist/ ───────────────────────────
// (manifest.json, sw.js, favicons, icons, _headers, _redirects, etc.)
// Skip index.html here — it is the template we merge from, not a straight copy.
let copied = 0;
for (const name of fs.readdirSync(WEB)) {
  if (name === 'index.html') continue;
  const src = path.join(WEB, name);
  if (!fs.statSync(src).isFile()) continue;
  fs.copyFileSync(src, path.join(DIST, name));
  copied++;
}
console.log(`✔ Copied ${copied} PWA asset(s) from web/ → dist/`);

// ── 1b. Relocate vendor fonts out of any `node_modules` path ──────────────────
// Expo exports @expo/vector-icons fonts to `dist/assets/node_modules/@expo/...`.
// Vercel ALWAYS ignores anything under a `node_modules` directory when uploading,
// so those .ttf files 404 in production and every vector icon renders blank.
// Move them to `dist/assets/vendor/` and rewrite all references in the JS + html.
function moveRecursive(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) moveRecursive(s, d);
    else fs.renameSync(s, d);
  }
}
const nmAssets = path.join(DIST, 'assets', 'node_modules');
if (fs.existsSync(nmAssets)) {
  const vendorDir = path.join(DIST, 'assets', 'vendor');
  moveRecursive(nmAssets, vendorDir);
  fs.rmSync(nmAssets, { recursive: true, force: true });

  // Rewrite every reference: /assets/node_modules/ → /assets/vendor/
  // (in the JS bundles + index.html + metadata.json)
  const rewriteIn = (file) => {
    if (!fs.existsSync(file)) return;
    const before = fs.readFileSync(file, 'utf8');
    const after = before.split('assets/node_modules/').join('assets/vendor/');
    if (after !== before) fs.writeFileSync(file, after);
  };
  const jsDir = path.join(DIST, '_expo', 'static', 'js', 'web');
  if (fs.existsSync(jsDir)) {
    for (const f of fs.readdirSync(jsDir)) if (f.endsWith('.js')) rewriteIn(path.join(jsDir, f));
  }
  rewriteIn(path.join(DIST, 'index.html'));
  rewriteIn(path.join(DIST, 'metadata.json'));
  console.log('✔ Relocated vendor fonts assets/node_modules → assets/vendor (Vercel ignores node_modules)');
}

// ── 2. Inject PWA meta tags + service-worker registration into dist/index.html ─
const indexPath = path.join(DIST, 'index.html');
let html = fs.readFileSync(indexPath, 'utf8');

const PWA_TAGS = `
  <!-- PWA: manifest + install support (injected by post-web-build.js) -->
  <link rel="manifest" href="/manifest.json" />
  <meta name="theme-color" content="#057A55" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="default" />
  <meta name="apple-mobile-web-app-title" content="Glow" />
  <meta name="mobile-web-app-capable" content="yes" />
  <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
  <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png" />
  <link rel="icon" type="image/png" sizes="512x512" href="/icon-512.png" />`;

// NO_SW=1 (dev builds): don't cache at all. Inject a kill-switch that unregisters
// any existing service worker and clears caches, so dev always serves fresh.
const NO_SW = process.env.NO_SW === '1' || process.env.NO_SW === 'true';

const SW_REGISTER = `
  <script>
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('/sw.js').catch(function (e) {
          console.warn('SW registration failed:', e);
        });
      });
    }
  </script>`;

const SW_KILL = `
  <script>
    // Dev build: no service worker. Unregister any prior SW + clear caches.
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(function (rs) {
        rs.forEach(function (r) { r.unregister(); });
      });
    }
    if (window.caches && caches.keys) {
      caches.keys().then(function (ks) { ks.forEach(function (k) { caches.delete(k); }); });
    }
  </script>`;

if (!html.includes('rel="manifest"')) {
  html = html.replace('</head>', `${PWA_TAGS}\n</head>`);
  console.log('✔ Injected PWA meta tags into index.html');
} else {
  console.log('ℹ  PWA meta tags already present — skipped');
}

if (NO_SW) {
  // Ship a SELF-DESTRUCT sw.js (don't just delete it). A prior dev build may have
  // installed a CACHING sw.js on the user's device; that old SW keeps serving stale
  // assets and the in-page kill-switch never runs (old SW serves the old index.html).
  // Browsers re-fetch sw.js on navigation/update — so when the old SW revalidates
  // and gets THIS self-destruct version, it unregisters itself + wipes caches,
  // breaking the deadlock without the user manually clearing site data.
  const SELF_DESTRUCT_SW = `// Dev build: self-destruct SW. Unregister + clear all caches so no stale assets persist.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    try { const ks = await caches.keys(); await Promise.all(ks.map(k => caches.delete(k))); } catch (_) {}
    try { await self.registration.unregister(); } catch (_) {}
    try { const cs = await self.clients.matchAll(); cs.forEach(c => c.navigate(c.url)); } catch (_) {}
  })());
});
`;
  fs.writeFileSync(path.join(DIST, 'sw.js'), SELF_DESTRUCT_SW);
  if (!html.includes('Unregister any prior SW')) {
    html = html.replace('</body>', `${SW_KILL}\n</body>`);
  }
  console.log('✔ NO_SW: self-destruct sw.js shipped + kill-switch injected');
} else if (fs.existsSync(path.join(WEB, 'sw.js')) && !html.includes("serviceWorker'")) {
  html = html.replace('</body>', `${SW_REGISTER}\n</body>`);
  console.log('✔ Injected service-worker registration into index.html');
}

fs.writeFileSync(indexPath, html);

console.log(`\n✅ Post-web-build complete — dist/ is ${NO_SW ? 'no-cache (dev)' : 'PWA-ready'}.`);
