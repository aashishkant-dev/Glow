// src/utils/photoFilters.js
'use strict';

// Instagram-style filter presets, baked into the actual pixels server-side via
// sharp rather than a client-side CSS overlay — that way the effect is real
// and identical regardless of which platform (native/web) uploaded it, and
// whoever later views the photo sees the same result the artist chose.
// Shared between posts.js (post photos) and provider.js (look photos) — ids
// must match the client-side PHOTO_FILTERS list (mobile/src/data/photoFilters.ts).
//
// Per-channel .linear(a, b) — sharp applies output = input*a + b per
// channel when a/b are arrays ([r,g,b]) instead of one shared scalar — is
// what turns "uniform contrast bump" into an actual color grade (lift one
// channel in the shadows, pull another in the highlights), which reads as
// real filmic grading instead of a flat tint. Kept subtle (multipliers close
// to 1.0, single-digit-to-low-double-digit offsets) — the same magnitude the
// original scalar values already used, just split per channel.
const PHOTO_FILTERS = {
  original: (img) => img,
  vivid:    (img) => img.modulate({ saturation: 1.35, brightness: 1.05 }).linear(1.06, -8),
  warm:     (img) => img.modulate({ hue: 8, saturation: 1.15, brightness: 1.03 }).linear([1.05, 1.0, 0.93], [2, 0, 4]),
  cool:     (img) => img.modulate({ hue: -10, saturation: 1.05, brightness: 1.02 }).linear([0.95, 1.0, 1.06], [4, 1, 0]),
  mono:     (img) => img.grayscale().linear(1.1, -10),
  // A punchier true black-and-white, distinct from mono's softer gray —
  // heavier contrast, deeper blacks.
  noir:     (img) => img.grayscale().linear(1.32, -30),
  fade:     (img) => img.modulate({ saturation: 0.75, brightness: 1.08 }).linear(0.9, 15),
  vintage:  (img) => img.modulate({ hue: 6, saturation: 0.85, brightness: 1.02 }).linear(0.95, 8),
  // Soft, faded, slightly cool-toned highlights with warm shadows — a
  // washed-out film look distinct from vintage's warmer, denser cast.
  gingham:  (img) => img.modulate({ saturation: 0.8, brightness: 1.1 }).linear([0.93, 0.95, 0.99], [14, 12, 16]),
  // The three most consistently named as flattering for skin/selfies across
  // both editorial roundups and user discussion — Juno in particular is
  // backed by an actual study (participants picked it as the single most
  // flattering Instagram filter, ~69% over unfiltered). Named to match so
  // they're recognizable, not just another "warm"/"bright" preset.
  juno:      (img) => img.modulate({ hue: 5, saturation: 1.25, brightness: 1.06 }).linear([1.09, 1.03, 0.97], [-6, -4, -8]),
  clarendon: (img) => img.modulate({ saturation: 1.2, brightness: 1.08 }).linear([1.13, 1.1, 1.05], [-11, -8, -5]),
  lark:      (img) => img.modulate({ hue: -6, saturation: 1.1, brightness: 1.1 }).linear([1.0, 1.03, 1.06], [4, 5, 9]),
};

module.exports = { PHOTO_FILTERS };
