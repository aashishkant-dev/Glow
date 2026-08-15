// src/utils/photoFilters.js
'use strict';

// Instagram-style filter presets, baked into the actual pixels server-side via
// sharp rather than a client-side CSS overlay — that way the effect is real
// and identical regardless of which platform (native/web) uploaded it, and
// whoever later views the photo sees the same result the artist chose.
// Shared between posts.js (post photos) and provider.js (look photos) — ids
// must match the client-side PHOTO_FILTERS list (mobile/src/data/photoFilters.ts).
const PHOTO_FILTERS = {
  original: (img) => img,
  vivid:    (img) => img.modulate({ saturation: 1.35, brightness: 1.05 }).linear(1.06, -8),
  warm:     (img) => img.modulate({ hue: 8, saturation: 1.15, brightness: 1.03 }),
  cool:     (img) => img.modulate({ hue: -10, saturation: 1.05, brightness: 1.02 }),
  mono:     (img) => img.grayscale().linear(1.1, -10),
  fade:     (img) => img.modulate({ saturation: 0.75, brightness: 1.08 }).linear(0.9, 15),
  vintage:  (img) => img.modulate({ hue: 6, saturation: 0.85, brightness: 1.02 }).linear(0.95, 8),
};

module.exports = { PHOTO_FILTERS };
