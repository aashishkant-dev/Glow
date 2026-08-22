// src/utils/geminiSkinAnalysis.js
'use strict';

// Real vision-model skin analysis via Google's Gemini API — opt-in upgrade
// over the free pixel-math heuristic in skinAnalysis.js. Returns null (never
// throws for "not configured") when GEMINI_API_KEY isn't set, so every call
// site can simply fall back to the free heuristic without special-casing
// "is this feature even turned on." Real API errors (bad key, network,
// malformed response) DO throw — the caller decides whether to fall back or
// surface them, since a silent failure there would be harder to debug.

// gemini-2.0-flash was retired (confirmed directly against the live API,
// which now 404s it and points here) — gemini-3.6-flash is current as of
// this writing. Kept as an env var specifically because that turnover
// happens: swap it without a code change if this one retires too.
const MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash';

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    faceDetected: { type: 'BOOLEAN' },
    skinTone: { type: 'STRING', enum: ['FAIR', 'LIGHT', 'MEDIUM', 'TAN', 'DEEP', 'RICH'] },
    skinType: { type: 'STRING', enum: ['DRY', 'OILY', 'COMBINATION', 'NORMAL', 'SENSITIVE'] },
    // Genuinely observable from a photo, unlike a medical hydration
    // reading — dullness/flaking reads LOW, a dewy/plump look reads HIGH.
    hydrationLevel: { type: 'STRING', enum: ['LOW', 'MODERATE', 'HIGH'] },
    // Zone-specific notes — the thing a real in-person consultation does
    // that a single "your skin is X" verdict doesn't: different areas of
    // the face often read differently (oily T-zone, drier cheeks, etc.).
    // Empty string for a zone with nothing notable, never invented detail.
    tZoneNote: { type: 'STRING' },
    cheeksNote: { type: 'STRING' },
    underEyeNote: { type: 'STRING' },
    concerns: { type: 'ARRAY', items: { type: 'STRING' } },
    // A warm, specific, encouraging one-liner a real person would actually
    // want to read — the app's own headline for the result, not a clinical
    // readout. Written by the model per-photo, not a template.
    summary: { type: 'STRING' },
    // Only meaningful when a previous scan was provided in the prompt — null
    // otherwise. Compares THIS scan to that one in plain, specific terms.
    progressNote: { type: 'STRING', nullable: true },
    recommendations: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          category: { type: 'STRING' },
          title: { type: 'STRING' },
          note: { type: 'STRING' },
        },
        required: ['category', 'title', 'note'],
      },
    },
  },
  required: [
    'faceDetected', 'skinTone', 'skinType', 'hydrationLevel',
    'tZoneNote', 'cheeksNote', 'underEyeNote', 'concerns', 'summary', 'recommendations',
  ],
};

function buildPrompt({ sensitivityHint, previousScan }) {
  const sensitivityLine = sensitivityHint
    ? `\nThe user self-reports how their skin reacts to new products: "${sensitivityHint}". A single photo can't reliably show sensitivity — weigh this alongside what you actually see.`
    : '';

  const progressLine = previousScan
    ? `\nThe user's previous scan (${previousScan.daysAgo} day${previousScan.daysAgo === 1 ? '' : 's'} ago) found: ${previousScan.skinTone.toLowerCase()} tone, ${previousScan.skinType.toLowerCase()} skin, concerns: ${previousScan.concerns.join(', ') || 'none noted'}. Compare THIS photo to that description and fill progressNote with one specific, honest, encouraging sentence about what's changed (better, worse, or steady) — never invent a change you can't actually see. If nothing meaningfully changed, say so plainly rather than manufacturing praise.`
    : '\nThis is the user\'s first scan — set progressNote to null, there is nothing to compare yet.';

  return `You are a warm, knowledgeable skin-analysis assistant inside a beauty app, giving the kind of thorough, zone-by-zone read a good in-person consultation would — but you are NOT a medical professional and must never diagnose a medical skin condition, only general cosmetic guidance.

Look closely at this selfie — really examine it, don't default to generic answers — and:
1. Set faceDetected to true only if a human face is clearly visible and well-lit enough to actually assess.
2. Classify the apparent skin tone as exactly one of: FAIR, LIGHT, MEDIUM, TAN, DEEP, RICH (lightest to darkest).
3. Classify the apparent skin type as exactly one of: DRY, OILY, COMBINATION, NORMAL, SENSITIVE, based on visible cues — shine/texture, visible pores, flaking, redness.${sensitivityLine}
4. Rate apparent hydration as LOW, MODERATE, or HIGH — dull, tight, or flaking skin reads LOW; a healthy dewy/plump look reads HIGH.
5. Look at three zones separately, the way an in-person consultation actually would, and write one short plain-language note per zone — texture, oiliness, tone, anything specifically visible there. Leave a zone's note as an empty string if there's genuinely nothing notable — never invent detail to fill the field:
   - tZoneNote: forehead, nose, chin
   - cheeksNote: cheeks
   - underEyeNote: under-eye area
6. List 2-5 specific visible cosmetic concerns, as concrete as what you actually see (e.g. "Enlarged pores on nose", "Mild hyperpigmentation on cheeks", "Fine dryness around mouth" — not vague catch-alls like "some concerns").
7. Write a warm, specific, one-sentence summary of what you see — genuinely observational (mention something real about the photo), encouraging in tone, never generic filler like "Great skin!". This is the first thing the user reads.${progressLine}
8. Give 3-5 general cosmetic product-category recommendations, each with a category, a short title, and a one-sentence note — generic categories only (e.g. "gentle cleanser"), never a specific brand, and never a medical claim or treatment instruction.

If no face is clearly visible, set faceDetected to false and fill the other fields with reasonable placeholder defaults (they will be ignored).`;
}

/**
 * @param {string} base64Jpeg - the photo, base64-encoded, no data: prefix.
 * @param {object} [context]
 * @param {string} [context.sensitivityHint] - plain-language answer to the
 *   app's one remaining quiz question ("often"/"sometimes"/"rarely" reworded
 *   to a sentence by the caller) — everything else the old 4-question quiz
 *   asked, Gemini now reads directly from the photo instead.
 * @param {{skinTone:string, skinType:string, concerns:string[], daysAgo:number}} [context.previousScan]
 * @returns {Promise<{faceDetected:boolean, skinTone:string, skinType:string, concerns:string[], summary:string, progressNote:string|null, recommendations:{category:string,title:string,note:string}[]}|null>}
 *   null when GEMINI_API_KEY isn't configured. Throws on a real API failure.
 */
async function analyzeWithGemini(base64Jpeg, context = {}) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;
  const body = {
    contents: [{
      parts: [
        { text: buildPrompt(context) },
        { inline_data: { mime_type: 'image/jpeg', data: base64Jpeg } },
      ],
    }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
      temperature: 0.4,
    },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Gemini API error ${res.status}: ${errText.slice(0, 300)}`);
  }

  const json = await res.json();
  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini returned no usable content');

  const parsed = JSON.parse(text);
  if (typeof parsed.faceDetected !== 'boolean') throw new Error('Gemini response missing faceDetected');
  return parsed;
}

const MATCH_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    // 1-based index into the reference photos supplied, in the order given —
    // null when the new photo doesn't clearly match any of them. Never guess
    // when unsure: a wrongly-merged match mixes one person's skin history
    // into another's, which is worse than over-splitting into an extra profile.
    matchedIndex: { type: 'INTEGER', nullable: true },
    confidence: { type: 'STRING', enum: ['HIGH', 'MEDIUM', 'LOW'] },
  },
  required: ['matchedIndex', 'confidence'],
};

function buildMatchPrompt(count) {
  return `This is a shared-device skincare app — more than one family member may use the same account. Image 1 is a selfie just taken. Images 2 through ${count + 1} are reference photos of ${count} different previously-known people on this account, in order.

Compare Image 1 against each reference image and decide whether it shows the SAME PERSON as one of them. Judge by facial structure — bone structure, eye/nose/mouth shape and spacing, jawline — NOT by lighting, filters, makeup, or skin tone/texture, which can genuinely differ between two photos of the same person and must not be mistaken for a different person.

Return matchedIndex as the 1-based position of the matching reference image, or null if Image 1 doesn't clearly match any of them (a new person). Set confidence to HIGH only when you're genuinely certain — when in doubt, prefer LOW confidence or null over a wrong guess.`;
}

/**
 * Compares a new scan photo against up to a handful of reference photos (one
 * per existing SkinProfile on the account) to decide which person this scan
 * belongs to — the thing that keeps two family members sharing one phone
 * from having their skin histories folded together. Returns null (never
 * throws for "not configured") when GEMINI_API_KEY isn't set; a real API
 * failure throws, same convention as analyzeWithGemini.
 *
 * @param {string} newPhotoBase64
 * @param {{id:string, photoBase64:string}[]} referencePhotos - in order; the
 *   returned matchedIndex is 1-based into this array.
 * @returns {Promise<{matchedIndex:number|null, confidence:'HIGH'|'MEDIUM'|'LOW'}|null>}
 */
async function matchFaceProfile(newPhotoBase64, referencePhotos) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || referencePhotos.length === 0) return null;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;
  const body = {
    contents: [{
      parts: [
        { text: buildMatchPrompt(referencePhotos.length) },
        { inline_data: { mime_type: 'image/jpeg', data: newPhotoBase64 } },
        ...referencePhotos.map(p => ({ inline_data: { mime_type: 'image/jpeg', data: p.photoBase64 } })),
      ],
    }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: MATCH_RESPONSE_SCHEMA,
      temperature: 0.1,
    },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Gemini face-match API error ${res.status}: ${errText.slice(0, 300)}`);
  }

  const json = await res.json();
  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini face-match returned no usable content');

  const parsed = JSON.parse(text);
  const idx = parsed.matchedIndex;
  if (idx != null && (typeof idx !== 'number' || idx < 1 || idx > referencePhotos.length)) {
    return { matchedIndex: null, confidence: 'LOW' };
  }
  return { matchedIndex: idx ?? null, confidence: parsed.confidence || 'LOW' };
}

module.exports = { analyzeWithGemini, matchFaceProfile };
