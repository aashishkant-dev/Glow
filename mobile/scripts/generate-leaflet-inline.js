// Regenerates mobile/src/vendor/leafletInline.ts from the installed leaflet
// package. Run after bumping the leaflet dependency:
//   cd mobile && node scripts/generate-leaflet-inline.js
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const js = fs.readFileSync(path.join(root, 'node_modules/leaflet/dist/leaflet.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'node_modules/leaflet/dist/leaflet.css'), 'utf8');
const version = require(path.join(root, 'node_modules/leaflet/package.json')).version;
const out = `// AUTO-GENERATED — do not edit by hand.
// Regenerate with: node scripts/generate-leaflet-inline.js
//
// Leaflet ${version}, inlined as strings so the in-app map has NO runtime CDN
// dependency. See the committed file's header for why.

/* eslint-disable */
export const LEAFLET_CSS = ${JSON.stringify(css)};

export const LEAFLET_JS = ${JSON.stringify(js)};
`;
fs.writeFileSync(path.join(root, 'src/vendor/leafletInline.ts'), out);
console.log('wrote src/vendor/leafletInline.ts for leaflet', version);
