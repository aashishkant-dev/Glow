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

// Face-matching (which of an account's existing SkinProfiles this photo
// belongs to) used to be a SEPARATE Gemini call from the main analysis —
// two requests per scan instead of one. On the free tier that doubled how
// often a scan hit the per-minute quota, and every 429 meant a silent
// fallback to the zero-detail free heuristic (no zone notes, no
// progressNote) — which is exactly why the result screen's zone markers
// were intermittently just... missing. Both tasks now happen in ONE
// request: the reference photos (if any) go in as extra inline images, and
// the response schema carries both the match decision AND the analysis.
const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    faceDetected: { type: 'BOOLEAN' },
    // 1-based index into the reference photos supplied (in prompt order),
    // or null when nothing matches / no reference photos were given. Never
    // a guess: a wrongly-merged match mixes one person's skin history into
    // another's, worse than over-splitting into an extra profile.
    matchedProfileIndex: { type: 'INTEGER', nullable: true },
    matchConfidence: { type: 'STRING', enum: ['HIGH', 'MEDIUM', 'LOW', 'NONE'] },
    skinTone: { type: 'STRING', enum: ['FAIR', 'LIGHT', 'MEDIUM', 'TAN', 'DEEP', 'RICH'] },
    skinType: { type: 'STRING', enum: ['DRY', 'OILY', 'COMBINATION', 'NORMAL', 'SENSITIVE'] },
    // Genuinely observable from a photo, unlike a medical hydration
    // reading — dullness/flaking reads LOW, a dewy/plump look reads HIGH.
    hydrationLevel: { type: 'STRING', enum: ['LOW', 'MODERATE', 'HIGH'] },
    // Zone-specific notes — the thing a real in-person consultation does
    // that a single "your skin is X" verdict doesn't: different areas of
    // the face often read differently (oily forehead, drier cheeks, visible
    // pore size, texture). Eight zones (not a coarse tZone/cheeks/underEye
    // three-way split) so how MANY notes come back tracks how much a given
    // photo actually shows — a clear-skinned photo might only fill 2-3 of
    // these, a more textured one most of them. Empty string for a zone with
    // nothing notable, never invented detail to fill the field.
    foreheadNote: { type: 'STRING' },
    noseNote: { type: 'STRING' },
    chinNote: { type: 'STRING' },
    cheekLNote: { type: 'STRING' },
    cheekRNote: { type: 'STRING' },
    underEyeLNote: { type: 'STRING' },
    underEyeRNote: { type: 'STRING' },
    jawlineNote: { type: 'STRING' },
    concerns: { type: 'ARRAY', items: { type: 'STRING' } },
    // A warm, specific, encouraging one-liner a real person would actually
    // want to read — the app's own headline for the result, not a clinical
    // readout. Written by the model per-photo, not a template.
    summary: { type: 'STRING' },
    // Only meaningful when a matched reference profile carried prior data —
    // null otherwise (first scan, or no match). Compares THIS photo to that
    // profile's last reading in plain, specific terms.
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
    'faceDetected', 'matchConfidence', 'skinTone', 'skinType', 'hydrationLevel',
    'foreheadNote', 'noseNote', 'chinNote', 'cheekLNote', 'cheekRNote', 'underEyeLNote', 'underEyeRNote', 'jawlineNote',
    'concerns', 'summary', 'recommendations',
  ],
};

function buildPrompt({ sensitivityHint, referenceProfiles = [] }) {
  const sensitivityLine = sensitivityHint
    ? `\nThe user self-reports how their skin reacts to new products: "${sensitivityHint}". A single photo can't reliably show sensitivity — weigh this alongside what you actually see.`
    : '';

  const formatTrend = (trend = []) => trend
    .map((t, i) => `    ${i === 0 ? 'Most recent' : `${i + 1} scans ago`} (${t.daysAgo} day${t.daysAgo === 1 ? '' : 's'} ago): ${t.skinTone.toLowerCase()} tone, ${t.skinType.toLowerCase()} skin, concerns: ${t.concerns.join(', ') || 'none noted'}${t.summary ? ` — "${t.summary}"` : ''}`)
    .join('\n');

  const matchSection = referenceProfiles.length > 0
    ? `\nThis is a shared-device skincare app — more than one family member may use the same account. Image 1 (below, first) is today's new selfie. Images 2 through ${referenceProfiles.length + 1} are reference photos of ${referenceProfiles.length} previously-known people on this account, in order, each with their recent scan history (most recent first):
${referenceProfiles.map((p, i) => `  Reference ${i + 1}:\n${formatTrend(p.trend?.length ? p.trend : [p])}`).join('\n')}

First, decide whether Image 1 shows the SAME PERSON as one of the reference images — judge by facial structure (bone structure, eye/nose/mouth shape and spacing, jawline) only, NOT by lighting, filters, makeup, or skin tone/texture, which can genuinely differ between two photos of the same person. Set matchedProfileIndex to the 1-based reference number if so, or null if Image 1 is someone not among them. Set matchConfidence to HIGH only when genuinely certain — prefer LOW or NONE over a wrong guess, since a wrong merge is worse than starting a new profile.

If matchedProfileIndex is set with HIGH or MEDIUM confidence, compare Image 1 to that reference's scan history (given above) and fill progressNote with one specific, honest, encouraging sentence about what's changed. When that reference has more than one prior scan, look for a genuine TREND across them ("your redness has eased over your last 3 scans"), not just a single step back — a real multi-scan pattern is more useful and more convincing than a one-off comparison. Never invent a change you can't actually see; if nothing meaningfully changed, say so plainly rather than manufacturing praise. Otherwise (no match, or low/no confidence) set progressNote to null.`
    : '\nThis is the account\'s first-ever scan (no reference photos to compare against) — set matchedProfileIndex to null, matchConfidence to NONE, and progressNote to null.';

  return `You are a warm, knowledgeable skin-analysis assistant inside a beauty app, giving the kind of thorough, zone-by-zone read a good in-person consultation would — but you are NOT a medical professional and must never diagnose a medical skin condition, only general cosmetic guidance.
${matchSection}

Now look closely at Image 1 (the new selfie) — really examine it at full detail, texture and pores included, don't default to generic answers — and:
1. Set faceDetected to true only if a human face is clearly visible and well-lit enough to actually assess.
2. Classify the apparent skin tone as exactly one of: FAIR, LIGHT, MEDIUM, TAN, DEEP, RICH (lightest to darkest) — a dermatologist doing a real in-person read, not a first glance:
   - FAIR: very pale, porcelain — often pink/rosy undertone, burns easily, little visible melanin.
   - LIGHT: light beige/ivory — still fair but with more warmth than FAIR, mild olive or golden undertone possible.
   - MEDIUM: light-to-mid olive or beige-tan — a genuine middle, not a default guess (see below).
   - TAN: golden-to-brown, clearly tanned/olive-deep — visibly more pigmented than MEDIUM.
   - DEEP: deep brown skin, rich melanin visible, clearly darker than TAN.
   - RICH: the deepest brown/near-ebony tones.
   Sample at LEAST three separate points before deciding — forehead, one cheek, and the jawline — each away from shadow, flush, redness, or specular shine, then judge the tone those points actually converge on, not a single glance at whichever looked easiest. Mentally correct for the photo's own white balance/lighting warmth first (a warm indoor light or a cool flash can shift how tone reads, but the underlying skin color is what matters). MEDIUM is a real category, not a safe fallback — if you're mentally reaching for it because you're unsure, that's a signal to look again at your three sample points rather than default to it; commit to whichever of the six the evidence actually points to across the full FAIR–RICH range.
3. Classify the apparent skin type as exactly one of: DRY, OILY, COMBINATION, NORMAL, SENSITIVE, based on visible cues — shine/texture, pore size and visibility, flaking, redness.${sensitivityLine}
4. Rate apparent hydration as LOW, MODERATE, or HIGH — dull, tight, or flaking skin reads LOW; a healthy dewy/plump look reads HIGH.
5. Look at eight zones SEPARATELY, the way an in-person consultation actually would — close, clinical-grade inspection of each one in turn, not one glance at the whole face. For each zone below that genuinely shows something, write 1-2 specific, plain-language sentences covering whichever of these are actually visible there: texture, pore size/density, oiliness or shine, tone evenness, fine lines, redness, or hyperpigmentation. A thin one-liner like "Looks fine" or "Some oiliness" is not acceptable when the zone has more to see — describe it the way you'd actually describe it to the person's face. Left and right sides are SEPARATE zones now specifically so real asymmetry shows up as different notes on each side, not a single merged comment — real dermatological observations are rarely perfectly symmetric. Leave a zone's note as an empty string when there's truly nothing to observe there — never invent detail to fill it — but don't leave a zone empty just because you're being economical: how many of these 8 end up with real notes should genuinely track how much this specific photo shows, from just 2-3 on a very clear, even-toned face up to most of them on one with more visible texture or variation:
   - foreheadNote: forehead (pore size/density, oiliness/shine, fine lines)
   - noseNote: nose (pore size/density, oiliness, blackhead-prone texture)
   - chinNote: chin (texture, oiliness, breakout-prone signs)
   - cheekLNote: LEFT cheek only (texture uniformity, pore visibility, sun-exposure signs like fine pigmentation)
   - cheekRNote: RIGHT cheek only (same, independent of the left — note it plainly if one side differs from the other)
   - underEyeLNote: LEFT under-eye (fine lines, puffiness, darkness/discoloration, skin thinness)
   - underEyeRNote: RIGHT under-eye (same, independent of the left)
   - jawlineNote: jawline and along the chin's edge (texture, breakout-prone signs, any redness)
6. List 2-6 specific visible cosmetic concerns, as concrete as what you actually see (e.g. "Enlarged pores on nose", "Mild hyperpigmentation on left cheek", "Fine dryness around mouth", "Slight asymmetry in tone between cheeks" — not vague catch-alls like "some concerns"). More than 4 only when the photo genuinely shows that much — don't pad the list to hit a number.
7. Write a warm, specific, one-sentence summary of what you see — genuinely observational (mention something real about the photo), encouraging in tone, never generic filler like "Great skin!". This is the first thing the user reads.
8. Give 3-5 general cosmetic product-category recommendations, each with a category, a short title, and a one-sentence note. Each one should visibly connect to something you actually observed — a specific zone note or concern from above, not a generic catch-all list disconnected from this particular photo (e.g. if the nose or forehead note flagged oiliness, one recommendation should plainly address that; if an under-eye note flagged darkness, another should). Generic product categories only (e.g. "gentle cleanser"), never a specific brand, and never a medical claim or treatment instruction.

If no face is clearly visible, set faceDetected to false and fill the other fields with reasonable placeholder defaults (they will be ignored).`;
}

/**
 * @param {string} base64Jpeg - the new selfie, base64-encoded, no data: prefix.
 * @param {object} [context]
 * @param {string} [context.sensitivityHint] - plain-language answer to the
 *   app's one remaining quiz question ("often"/"sometimes"/"rarely" reworded
 *   to a sentence by the caller) — everything else the old 4-question quiz
 *   asked, Gemini now reads directly from the photo instead.
 * @param {{photoBase64:string, daysAgo:number, skinTone:string, skinType:string, concerns:string[]}[]} [context.referenceProfiles]
 *   One entry per existing SkinProfile candidate on the account, in order —
 *   the returned matchedProfileIndex is 1-based into this array. Omit/empty
 *   on the account's first-ever scan.
 * @returns {Promise<{faceDetected:boolean, matchedProfileIndex:number|null, matchConfidence:'HIGH'|'MEDIUM'|'LOW'|'NONE', skinTone:string, skinType:string, hydrationLevel:string, foreheadNote:string, noseNote:string, chinNote:string, cheekLNote:string, cheekRNote:string, underEyeLNote:string, underEyeRNote:string, jawlineNote:string, concerns:string[], summary:string, progressNote:string|null, recommendations:{category:string,title:string,note:string}[]}|null>}
 *   null when GEMINI_API_KEY isn't configured. Throws on a real API failure.
 */
async function analyzeWithGemini(base64Jpeg, context = {}) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const referenceProfiles = context.referenceProfiles || [];
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;
  const body = {
    contents: [{
      parts: [
        { text: buildPrompt({ sensitivityHint: context.sensitivityHint, referenceProfiles }) },
        { inline_data: { mime_type: 'image/jpeg', data: base64Jpeg } },
        ...referenceProfiles.map(p => ({ inline_data: { mime_type: 'image/jpeg', data: p.photoBase64 } })),
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

  const idx = parsed.matchedProfileIndex;
  const validIdx = typeof idx === 'number' && idx >= 1 && idx <= referenceProfiles.length ? idx : null;
  return { ...parsed, matchedProfileIndex: validIdx };
}

module.exports = { analyzeWithGemini };
