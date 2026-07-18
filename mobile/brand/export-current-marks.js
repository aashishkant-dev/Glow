/**
 * Export the CURRENT Glow mark set (Client / Provider / Admin) + main logo as
 * clean SVG + PNG reference files into mobile/brand/. These are the "before" —
 * hand them to Claude Design as the starting point for a refreshed brand kit.
 *
 * Run from mobile/:  node brand/export-current-marks.js
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const OUT = __dirname;
const BRAND = '#057A55';
const WHITE = '#FFFFFF';
const PIN = 'M56 6 C32 6 13 25 13 48.5 C13 66 26 80 44 97 L52.5 104.6 C54.5 106.4 57.5 106.4 59.5 104.6 L68 97 C86 80 99 66 99 48.5 C99 25 80 6 56 6 Z';

const marks = {
  'mark-client': `
    <path d="${PIN}" fill="${BRAND}"/>
    <path d="M56 66 C54.9 66 53.8 65.6 53 64.9 C44.4 58 38.5 51.9 38.5 44.3 C38.5 38.2 43 34 48.2 34 C51.3 34 54.1 35.5 56 38 C57.9 35.5 60.7 34 63.8 34 C69 34 73.5 38.2 73.5 44.3 C73.5 51.9 67.6 58 59 64.9 C58.2 65.6 57.1 66 56 66 Z" fill="${WHITE}"/>`,
  'mark-provider': `
    <path d="${PIN}" fill="${BRAND}"/>
    <rect x="35" y="29" width="42" height="42" rx="11" fill="${WHITE}"/>
    <rect x="51" y="35" width="10" height="30" rx="3" fill="${BRAND}"/>
    <rect x="41" y="45" width="30" height="10" rx="3" fill="${BRAND}"/>`,
  'mark-admin': `
    <path d="${PIN}" fill="${BRAND}"/>
    <path d="M56 29 L38 37 L38 51 C38 62 46 71 56 74 C66 71 74 62 74 51 L74 37 Z" fill="${WHITE}"/>
    <path d="M47 51 L53 58 L66 44" stroke="${BRAND}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,
};

function wrap(inner, bg) {
  const rect = bg ? `<rect width="112" height="112" fill="${bg}"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 112 112" width="112" height="112">${rect}${inner}\n</svg>`;
}

async function main() {
  const sheet = [];
  for (const [name, inner] of Object.entries(marks)) {
    // SVG source (transparent)
    fs.writeFileSync(path.join(OUT, `${name}.svg`), wrap(inner) + '\n');
    // PNG on white + on green tile
    await sharp(Buffer.from(wrap(inner, WHITE)), { density: 600 }).resize(512, 512).png().toFile(path.join(OUT, `${name}-512.png`));
    // Tile on a light grey card (like the app's role cards) so the green pin shows.
    const tile = await sharp(Buffer.from(wrap(inner, '#F2F4F5')), { density: 600 }).resize(220, 220).toBuffer();
    sheet.push({ name, tile });
    console.log('  ✓', `${name}.svg`, '+', `${name}-512.png`);
  }
  // Contact sheet: all marks on light cards, labelled by order.
  const W = 220 * sheet.length + 20 * (sheet.length + 1);
  await sharp({ create: { width: W, height: 260, channels: 4, background: '#ffffff' } })
    .composite(sheet.map((s, i) => ({ input: s.tile, left: 20 + i * (220 + 20), top: 20 })))
    .png()
    .toFile(path.join(OUT, 'marks-contact-sheet.png'));
  console.log('  ✓ marks-contact-sheet.png  (order: client, provider, admin)');
}

main().catch(e => { console.error(e); process.exit(1); });
