/**
 * Regenerate all Glow app icons from the pin+heart brand mark.
 * Single source of truth = the SVG geometry below (kept identical to
 * GlowLogo.tsx / CareIcons CustomerMark). NO gradients — flat solids only.
 *
 * Run: node scripts/gen-icons.js   (from mobile/)
 * Requires: sharp (already a dep).
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const BRAND = '#057A55';
const BRAND_DARK = '#034E36';
const WHITE = '#FFFFFF';

const ASSETS = path.join(__dirname, '..', 'assets');
const WEB = path.join(__dirname, '..', 'web');

// ── Pin + heart mark, on a 112×112 viewBox (matches GlowLogo). ──
// `color` = pin body fill, `dot` = heart fill (knockout).
function mark(color, dot) {
  return `
    <path d="M56 6 C32 6 13 25 13 48.5 C13 66 26 80 44 97 L52.5 104.6 C54.5 106.4 57.5 106.4 59.5 104.6 L68 97 C86 80 99 66 99 48.5 C99 25 80 6 56 6 Z" fill="${color}"/>
    <path d="M56 66 C54.9 66 53.8 65.6 53 64.9 C44.4 58 38.5 51.9 38.5 44.3 C38.5 38.2 43 34 48.2 34 C51.3 34 54.1 35.5 56 38 C57.9 35.5 60.7 34 63.8 34 C69 34 73.5 38.2 73.5 44.3 C73.5 51.9 67.6 58 59 64.9 C58.2 65.6 57.1 66 56 66 Z" fill="${dot}"/>`;
}

// Full-bleed square icon: green field, white mark. `scale` = mark size vs canvas.
// `radius` rounds the green tile (iOS masks its own corners, so keep 0 for icon.png).
// NOTE: gradients/shadows are fine HERE — this SVG is rasterized to PNG by sharp,
// it is NOT rendered by react-native-svg. So the app icon can look premium even
// though the in-app marks must stay flat.
function fullBleedSvg({ scale = 0.6, radius = 0 } = {}) {
  const s = 112;
  const m = s * scale;
  const off = (s - m) / 2;
  const shape = radius
    ? `<rect width="${s}" height="${s}" rx="${radius}" fill="url(#bg)"/>`
    : `<rect width="${s}" height="${s}" fill="url(#bg)"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${s} ${s}">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="0.35" y2="1">
        <stop offset="0" stop-color="#0FB377"/>
        <stop offset="0.55" stop-color="#079060"/>
        <stop offset="1" stop-color="#02462F"/>
      </linearGradient>
      <radialGradient id="glow" cx="0.32" cy="0.26" r="0.85">
        <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.16"/>
        <stop offset="0.5" stop-color="#FFFFFF" stop-opacity="0"/>
      </radialGradient>
      <filter id="ds" x="-25%" y="-25%" width="150%" height="155%">
        <feDropShadow dx="0" dy="2" stdDeviation="2.2" flood-color="#00150D" flood-opacity="0.32"/>
      </filter>
    </defs>
    ${shape}
    <rect width="${s}" height="${s}" ${radius ? `rx="${radius}"` : ''} fill="url(#glow)"/>
    <g transform="translate(${off} ${off}) scale(${scale})" filter="url(#ds)">${mark(WHITE, '#0A7A52')}</g>
  </svg>`;
}

// Android adaptive FOREGROUND: transparent, mark inside the center safe zone
// (~66%). The OS supplies the colored background layer + masks to a shape.
function adaptiveFgSvg() {
  const s = 112;
  const scale = 0.44; // smaller so the mark survives circle/squircle masking
  const m = s * scale;
  const off = (s - m) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${s} ${s}">
    <g transform="translate(${off} ${off}) scale(${scale})">${mark(WHITE, BRAND_DARK)}</g>
  </svg>`;
}

// Android notification icon: white silhouette on transparent (OS tints it).
function notificationSvg() {
  const s = 112;
  const scale = 0.7;
  const m = s * scale;
  const off = (s - m) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${s} ${s}">
    <g transform="translate(${off} ${off}) scale(${scale})">${mark(WHITE, 'none')}</g>
  </svg>`;
}

// Splash: mark centered on the splash field, generous padding (portrait canvas).
// Background matches app.json's splash backgroundColor (#0A4A2E) so there's no
// seam if the image is letterboxed.
const SPLASH_BG = '#0A4A2E';
function splashSvg(w, h) {
  const markSize = Math.round(Math.min(w, h) * 0.26);
  const x = (w - markSize) / 2;
  const y = (h - markSize) / 2;
  const scale = markSize / 112;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">
    <rect width="${w}" height="${h}" fill="${SPLASH_BG}"/>
    <g transform="translate(${x} ${y}) scale(${scale})">${mark(WHITE, BRAND)}</g>
  </svg>`;
}

async function png(svg, outPath, width, height) {
  const buf = Buffer.from(svg);
  const img = sharp(buf, { density: 384 }).resize(width, height, {
    fit: 'fill',
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  });
  await img.png().toFile(outPath);
  console.log('  ✓', path.relative(path.join(__dirname, '..'), outPath), `${width}x${height}`);
}

async function main() {
  console.log('Regenerating Glow icons (pin+heart mark)…');

  // iOS / store icon — full bleed, no transparency, square (OS rounds it).
  await png(fullBleedSvg({ radius: 0 }), path.join(ASSETS, 'icon.png'), 1024, 1024);

  // Android adaptive foreground — transparent, safe-zone mark.
  await png(adaptiveFgSvg(), path.join(ASSETS, 'adaptive-icon.png'), 1024, 1024);

  // Notification — white silhouette, transparent.
  await png(notificationSvg(), path.join(ASSETS, 'notification-icon.png'), 96, 96);

  // Favicons / touch icons — full bleed green tile.
  await png(fullBleedSvg(), path.join(ASSETS, 'favicon.png'), 64, 64);
  await png(fullBleedSvg(), path.join(ASSETS, 'apple-touch-icon.png'), 180, 180);
  await png(fullBleedSvg(), path.join(ASSETS, 'icon-192.png'), 192, 192);
  await png(fullBleedSvg(), path.join(ASSETS, 'icon-512.png'), 512, 512);

  // Web PWA assets.
  await png(fullBleedSvg(), path.join(WEB, 'icon-192.png'), 192, 192);
  await png(fullBleedSvg(), path.join(WEB, 'icon-512.png'), 512, 512);
  await png(fullBleedSvg(), path.join(WEB, 'apple-touch-icon.png'), 180, 180);
  await png(fullBleedSvg(), path.join(WEB, 'favicon.ico'), 32, 32); // PNG-encoded .ico

  // Splash.
  await png(splashSvg(1284, 2778), path.join(ASSETS, 'splash.png'), 1284, 2778);

  // Web favicon.svg — replace the old gradient one with the flat mark.
  fs.writeFileSync(path.join(WEB, 'favicon.svg'), fullBleedSvg({ radius: 16 }).trim() + '\n');
  console.log('  ✓ web/favicon.svg (flat, no gradient)');

  console.log('Done.');
}

main().catch(e => { console.error(e); process.exit(1); });
