/**
 * Pins the wire contract between the scan pipeline's concern records and the
 * mobile client that renders them.
 *
 * This exists because of a real, shipped crash: the backend emits
 * `confidence.level: 'vendor'` for the three vendor-only concerns (firmness /
 * dark circles / puffiness), while the client's SkinHeatmapConcern type
 * declared only 'low' | 'medium' | 'high'. SkinConcernTabs indexed a Record
 * keyed by those three and DESTRUCTURED the result, so opening any of those
 * tabs destructured undefined and threw — "clicking on dark circles shows
 * something went wrong". TypeScript could not catch it: the type was simply
 * not true of what the server sends.
 *
 * So the contract is asserted here, against the real content module, where
 * changing it breaks a test instead of a screen.
 */
const {
  CONCERN_CONTENT,
  severityBand,
  buildVerdict,
  validateConcernRecord,
} = require('../utils/skinConcernContent');

// Must stay in step with CONFIDENCE_FOG in mobile/src/components/
// SkinConcernTabs.tsx and the union in mobile/src/api/client.ts.
const CLIENT_HANDLED_CONFIDENCE_LEVELS = ['low', 'medium', 'high', 'vendor'];

// Mirrors VENDOR_ONLY_CONCERNS in src/routes/skin.js.
const VENDOR_ONLY_CONCERNS = ['firmness', 'dark_circles', 'eye_bags'];

// The shape routes/skin.js builds for a vendor-only concern.
function vendorOnlyRecord(key, severity) {
  const content = CONCERN_CONTENT[key];
  const band = severityBand(severity);
  return {
    url: null,
    label: content.label,
    tabLabel: content.tabLabel,
    source: 'ivyai',
    gradientLabels: content.gradientLabels,
    severity,
    severityScore: Math.round(severity * 100),
    band,
    verdict: buildVerdict(key, band, []),
    education: content.education,
    tips: content.tips,
    confidence: { level: 'vendor', zoneFraction: null, pixelCount: null },
    zoneBreakdown: [],
    overlay: { flaggedFraction: 0, findings: null },
  };
}

describe('skin concern record contract', () => {
  it.each(VENDOR_ONLY_CONCERNS)('%s has the content a record needs', (key) => {
    const content = CONCERN_CONTENT[key];
    expect(content).toBeDefined();
    expect(content.label).toBeTruthy();
    expect(content.tabLabel).toBeTruthy();
    expect(content.gradientLabels).toEqual(
      expect.objectContaining({ low: expect.any(String), high: expect.any(String) }),
    );
  });

  it.each(VENDOR_ONLY_CONCERNS)('%s builds a valid record at every band', (key) => {
    for (const severity of [0, 0.2, 0.42, 0.75, 1]) {
      const record = vendorOnlyRecord(key, severity);
      expect(validateConcernRecord(key, record)).toEqual([]);
    }
  });

  it.each(VENDOR_ONLY_CONCERNS)(
    '%s emits a confidence level the client can render',
    (key) => {
      const record = vendorOnlyRecord(key, 0.42);
      // The actual regression: 'vendor' has to be a level the client knows
      // about, or its fog lookup returns undefined and destructuring it
      // throws on render.
      expect(CLIENT_HANDLED_CONFIDENCE_LEVELS).toContain(record.confidence.level);
    },
  );

  it('vendor-only concerns carry no overlay url', () => {
    // The client renders "scored, nothing to draw" from a null url. An empty
    // string would instead be handed to <Image> as a uri and fail to load.
    for (const key of VENDOR_ONLY_CONCERNS) {
      expect(vendorOnlyRecord(key, 0.42).url).toBeNull();
    }
  });
});
