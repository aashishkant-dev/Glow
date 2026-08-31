// src/utils/skinConcernContent.js
'use strict';

// Shared verdict/education/tips copy for the 7-concern results screen —
// the same copy regardless of which historical scan record it's read
// against (Perfect Corp has been removed; the free heuristic in
// skinHeatmaps.js is the only engine now). Keyed by pore/wrinkle/age_spot/
// texture/redness/moisture/acne — the naming this product settled on early
// on, unchanged so existing scan records/keys stay valid.
//
// Every concern here follows the same rules the original heatmap engine's
// copy did (see git history of skinHeatmaps.js's CONCERN_META): a real,
// once-written verdict per severity band (never a templated find/replace),
// a two-sentence education paragraph (what it is / what this scan actually
// measures), and tips that are ingredient CATEGORIES, never specific SKUs.

const CONCERN_CONTENT = {
  redness: {
    label: 'Redness',
    tabLabel: 'Redness',
    gradientLabels: { high: 'Flushed', low: 'Even Tone' },
    education: "Redness usually comes from surface irritation, broken capillaries, or inflammation — weather, new products, sun, or conditions like rosacea can all trigger it. This reads how red your skin appears against a calibrated baseline, not a single fixed cutoff, so it adjusts for natural tone rather than assuming one baseline for everyone.",
    tips: [
      'Look for centella asiatica, niacinamide, or azelaic acid — they help calm visible redness over time.',
      'Avoid hot water and harsh scrubs on flushed areas; both can make redness more visible, not less.',
      'A fragrance-free moisturizer with ceramides supports a barrier that redness-prone skin often has trouble with.',
      'Redness that persists or comes with stinging is worth a dermatologist visit to rule out rosacea or an allergy.',
    ],
    verdict: {
      clear: 'Your tone reads even, with no notable redness detected.',
      mild: 'A little redness shows in a few small areas — nothing that stands out.',
      moderate: 'Your skin shows moderate redness, concentrated in a few areas rather than all over.',
      notable: 'Noticeable redness is flagged across a larger area of your skin today.',
    },
  },
  texture: {
    label: 'Uneven Texture',
    tabLabel: 'Uneven Texture',
    gradientLabels: { high: 'Rough', low: 'Smooth' },
    education: 'Overall surface texture is driven by how much dead skin has built up and how much collagen support skin still has underneath — rougher skin scatters light less evenly than smooth skin. This looks at fine surface detail and contrast across the whole face, separately from pore size or fine lines.',
    tips: [
      'Chemical exfoliants (AHAs like glycolic or lactic acid) clear built-up dead skin more evenly than physical scrubs.',
      "Don't skip moisturizer — dehydrated skin often reads as MORE textured, not less.",
      'Retinoids are the most evidence-backed long-term option for smoother texture, introduced gradually.',
      'Give any new exfoliant 4-6 weeks before judging results — texture changes slowly, not overnight.',
    ],
    verdict: {
      clear: 'Your skin reads smooth, with fine and even texture.',
      mild: 'Minor texture is visible — fairly typical, nothing to be concerned about.',
      moderate: 'Some visible roughness is showing, especially compared to smoother areas nearby.',
      notable: 'More pronounced texture is visible across a larger area of your skin.',
    },
  },
  pore: {
    label: 'Pores',
    tabLabel: 'Pores',
    gradientLabels: { high: 'Enlarged', low: 'Refined' },
    education: "Pores don't actually change size — they LOOK larger when stretched by trapped oil, dead skin, or a natural loss of elasticity around them, most often in the T-zone and inner cheeks. On an occluded face (facial hair, hats, glasses) the API's own visibility signal for this reading is reduced — see the confidence note below when that applies, rather than a number presented with false certainty.",
    tips: [
      'Salicylic acid (BHA) is the most direct option — it dissolves the oil and debris that stretch pores open.',
      'A clay or charcoal mask once or twice a week can temporarily draw out buildup in oilier areas.',
      'Niacinamide, used consistently over several weeks, can visibly refine how pores read.',
      'Over-cleansing or scrubbing can trigger more oil production, making pores look worse, not better.',
    ],
    verdict: {
      clear: 'Pores read fine and minimally visible across your T-zone and cheeks.',
      mild: 'A few pores are slightly visible — fairly typical for this skin type.',
      moderate: 'Pores read visibly enlarged in parts of your T-zone or cheeks.',
      notable: 'Pores read as enlarged and dense across a larger area today.',
    },
  },
  wrinkle: {
    label: 'Fine Lines & Wrinkles',
    tabLabel: 'Fine Lines',
    gradientLabels: { high: 'Deep Lines', low: 'Smooth' },
    education: 'Fine lines form where skin creases repeatedly — smiling, squinting — combined with a natural drop in collagen and elastin over time; sun exposure speeds this up more than almost anything else. This traces edge patterns across the areas lines form most often: forehead, under-eye, and nasolabial region.',
    tips: [
      'Daily SPF is the single most effective way to slow new fine lines from forming.',
      'Retinoids remain the most evidence-backed ingredient for softening existing fine lines over time.',
      'Peptide or vitamin C serums can support collagen and improve how fine lines read.',
      'Consistent sleep and hydration visibly reduce how deep temporary expression lines look day to day.',
    ],
    verdict: {
      clear: 'No notable fine lines are detected in these areas.',
      mild: 'A few faint lines are visible — well within a normal range.',
      moderate: 'Your skin shows moderate lines in expression-prone areas like the forehead and under-eyes.',
      notable: 'More pronounced lines are flagged in these areas today.',
    },
  },
  age_spot: {
    label: 'Dark Spots',
    tabLabel: 'Dark Spots',
    gradientLabels: { high: 'Visible Spots', low: 'Clear' },
    education: 'Dark spots (hyperpigmentation) form when melanin production speeds up in one area — most often from past sun exposure, a healed blemish, or hormonal changes — and fades far slower than the event that caused it. This looks specifically for localized areas of deeper pigment against the rest of your skin tone, not overall tone or redness.',
    tips: [
      'Daily SPF is the single most effective way to stop existing spots from getting darker and new ones from forming.',
      'Vitamin C, alpha arbutin, or tranexamic acid are the most evidence-backed ingredients for fading existing spots.',
      'Retinoids speed up cell turnover, which helps pigment fade faster over consistent use.',
      'Dark spots fade over months, not weeks — consistency matters more than any single product.',
    ],
    verdict: {
      clear: 'No notable dark spots are detected — tone reads even.',
      mild: 'A few faint spots are visible — common and usually fades with consistent SPF use.',
      moderate: 'Some visible dark spots are showing in a few areas.',
      notable: 'More pronounced dark spots are flagged across a larger area today.',
    },
  },
  moisture: {
    label: 'Dryness',
    tabLabel: 'Dryness',
    gradientLabels: { high: 'Dehydrated', low: 'Hydrated' },
    education: "Hydration is about water content in skin's outer layer, not oil — dry, tight, or flaking skin has lost some of its natural moisture barrier, whether from weather, harsh cleansers, or genuinely dry skin type. This reads visible surface cues (dullness, fine flaking, tautness) rather than measuring water content directly, which no camera can do.",
    tips: [
      'A humectant like hyaluronic acid or glycerin, applied to damp skin, draws in and holds water most effectively.',
      'Ceramides help rebuild the barrier that actually keeps moisture from evaporating back out.',
      "Avoid over-exfoliating — it strips the same barrier you're trying to restore.",
      "A humidifier in dry indoor air makes a measurable difference skincare alone often can't.",
    ],
    verdict: {
      clear: 'Your skin reads well-hydrated, with a healthy moisture balance.',
      mild: 'A little dryness shows in a few small areas — nothing that stands out.',
      moderate: 'Your skin shows moderate dryness, concentrated in a few areas rather than all over.',
      notable: 'Noticeable dryness is flagged across a larger area of your skin today.',
    },
  },
  acne: {
    label: 'Blemishes',
    tabLabel: 'Blemishes',
    gradientLabels: { high: 'Breakout-Prone', low: 'Clear' },
    education: 'Blemishes form when a pore gets blocked by oil and dead skin, then inflamed by bacteria — hormones, stress, and certain products can all make an existing tendency worse. This looks for active blemishes and recent marks specifically, separately from pore size or general texture.',
    tips: [
      'Salicylic acid (BHA) or benzoyl peroxide are the most direct options for active blemishes.',
      "Don't pick or squeeze — it's the single biggest cause of blemishes leaving a lasting mark.",
      "Non-comedogenic (won't-clog-pores) labeled products matter most for moisturizer and sunscreen specifically.",
      "A dermatologist is worth seeing if breakouts are frequent, painful, or leaving deep marks — that's beyond what any skincare routine alone treats.",
    ],
    verdict: {
      clear: 'No active blemishes detected — skin reads clear.',
      mild: 'A few small blemishes are visible — fairly typical, nothing widespread.',
      moderate: 'Some active blemishes are showing in a few areas.',
      notable: 'More active blemishes are flagged across a larger area today.',
    },
  },
};

// Canonical display order for the results screen — Summary + one tab per
// concern, worst-first ordering (by severity) happens at render time, this
// is just the fixed tab-bar order. Matches the app's product spec exactly:
// Pores, Dryness, Fine Lines & Wrinkles, Blemishes, Uneven Texture, Dark
// Spots, Redness.
const CONCERN_ORDER = ['pore', 'moisture', 'wrinkle', 'acne', 'texture', 'age_spot', 'redness'];

function severityBand(severity) {
  if (severity < 0.15) return 'clear';
  if (severity < 0.35) return 'mild';
  if (severity < 0.6) return 'moderate';
  return 'notable';
}

// Real per-scan specificity for the verdict line, without a second set of
// templates to maintain or an LLM call to pay for: the band-level sentence
// (CONCERN_CONTENT[key].verdict[band], unchanged) already reads correctly
// on its own — this appends a clause naming the actual worst 1-2 zones
// FROM THIS SCAN'S OWN computed zoneBreakdown (skinHeatmaps.js — the same
// severity data driving the heatmap, not a separate guess), so "Pores read
// visibly enlarged" becomes "...especially around your nose and right
// cheek" when there's real zone data, and degrades gracefully to the
// original generic sentence when there isn't (the 'perfectcorp' path
// today, or a concern with too little assessable area for a per-zone
// breakdown) — never a fabricated location. No clause on the 'clear' band
// — there's nothing found to point to.
function zoneClause(zoneBreakdown) {
  if (!zoneBreakdown || zoneBreakdown.length === 0) return '';
  const top = zoneBreakdown.slice(0, 2).map((z) => z.label.toLowerCase());
  const names = top.length === 2 ? `${top[0]} and ${top[1]}` : top[0];
  return `, especially around your ${names}`;
}

function buildVerdict(key, band, zoneBreakdown) {
  const base = CONCERN_CONTENT[key].verdict[band];
  if (band === 'clear') return base;
  const clause = zoneClause(zoneBreakdown);
  if (!clause) return base;
  return base.endsWith('.') ? `${base.slice(0, -1)}${clause}.` : `${base}${clause}`;
}

// The one shape every concern-generating code path in this app must
// produce (currently just the heuristic engine, skinHeatmaps.js, via
// buildConcernRecord in routes/skin.js — the only other producer, Perfect
// Corp, has been removed). schemaVersion (on the SCAN as a whole, see
// serializeScan) is what a mobile client checks before assuming this exact
// shape — bump it here AND in mobile/src/api/client.ts's SkinScan.
// schemaVersion together, deliberately, whenever a field is added, renamed,
// or its meaning changes, so client/server drift is a version mismatch a
// client can detect, not silent corruption.
const CONCERN_RECORD_SCHEMA_VERSION = 1;
const VALID_BANDS = new Set(['clear', 'mild', 'moderate', 'notable']);
const VALID_SOURCES = new Set(['estimated', 'perfectcorp']); // 'perfectcorp' kept valid for reading pre-removal historical scans only — nothing writes it anymore

// Returns an array of human-readable problems, empty when the record is
// valid. Called at the ONE place every concern record is actually built
// (buildConcernRecord in routes/skin.js) — the boundary right after
// generation, before anything is stored or returned — so a malformed
// record is caught immediately at its source, not wherever it later
// happens to get rendered or crash. `record` may legitimately be null
// (this concern wasn't assessed at all) — that's valid, not an error.
function validateConcernRecord(key, record) {
  if (record == null) return [];
  const errors = [];
  if (!CONCERN_CONTENT[key]) errors.push(`unknown concern key: ${key}`);
  if (typeof record.url !== 'string' || !record.url) errors.push('url missing or not a string');
  if (typeof record.severity !== 'number' || Number.isNaN(record.severity) || record.severity < 0 || record.severity > 1) {
    errors.push(`severity out of range [0,1]: ${record.severity}`);
  }
  if (!VALID_BANDS.has(record.band)) errors.push(`invalid band: ${record.band}`);
  if (typeof record.verdict !== 'string' || !record.verdict) errors.push('verdict missing or empty');
  if (!VALID_SOURCES.has(record.source)) errors.push(`invalid source: ${record.source}`);
  if (!Array.isArray(record.zoneBreakdown)) errors.push('zoneBreakdown is not an array');
  if (!record.confidence || typeof record.confidence.level !== 'string') errors.push('confidence.level missing');
  return errors;
}

module.exports = { CONCERN_CONTENT, CONCERN_ORDER, severityBand, buildVerdict, CONCERN_RECORD_SCHEMA_VERSION, validateConcernRecord };
