/**
 * Glow 2.0 design tokens — luxury beauty palette.
 *
 * Soft rose primary, warm gold accent, near-white rose backgrounds, Apple-ink
 * text. Calm, minimal, premium. No healthcare reds, no loud gradients.
 */
export const Colors = {
  // Brand
  brand:         '#D97A91',   // soft rose
  brandDark:     '#C4667E',   // pressed / emphasis rose
  brandDeep:     '#A34D63',   // deep rose (dark headers, gradient ends)
  brandLight:    '#FCECEF',   // highlight rose
  brandAccent:   '#E9A0B1',   // pale rose accent
  gold:          '#D4AF37',   // warm gold
  goldSoft:      '#F6EBC9',   // gold tint bg

  // System
  systemBlue:    '#0A84FF',
  systemBlueDark:'#0060DF',
  systemGreen:   '#3BA55D',
  systemRed:     '#D96C6C',
  systemOrange:  '#D99A6C',
  systemYellow:  '#D4AF37',
  systemPurple:  '#A78BFA',
  systemTeal:    '#5EAAA8',

  // Grays (warm, Apple-ish)
  systemGray:  '#6E6E73',
  systemGray2: '#8E8E93',
  systemGray3: '#C7C7CC',
  systemGray4: '#E5E5EA',
  systemGray5: '#F2F2F7',
  systemGray6: '#F9F9FB',

  // Labels
  label:          '#1D1D1F',
  secondaryLabel: '#5F5F66',
  tertiaryLabel:  '#8C8C93',

  // Backgrounds
  systemBackground:                  '#FFFFFF',
  secondarySystemBackground:         '#FFF9F8',
  tertiarySystemBackground:          '#FFFFFF',
  systemGroupedBackground:           '#FFF9F8',
  secondarySystemGroupedBackground:  '#FFFFFF',

  // Separators
  separator:       '#F2E7E7',
  opaqueSeparator: '#E8D9DA',

  // Hero/header (legacy key names kept for call sites)
  heroNavy:      '#D97A91',
  heroNavyLight: '#E9A0B1',

  // Status / semantic
  trustGreen:   '#3BA55D',
  onlineGreen:  '#3BA55D',
  offlineGray:  '#A6A6AB',
  urgentOrange: '#D99A6C',
  earningsGold: '#D4AF37',
  accentGold:   '#D4AF37',

  // Cards
  cardShadow:       '#A34D63',
  cardBackground:   '#FFFFFF',
  cardBorder:       '#F2E7E7',
  cardShadowLight:  'rgba(163,77,99,0.05)',
  cardShadowMedium: 'rgba(163,77,99,0.09)',

  // Soft shadow tint — a warm rose-brown rather than the near-black the old
  // cards used. Pinterest/Glossier-style lift: the shadow reads as the card
  // sitting on warm paper, not as a drop-shadow drawn under it.
  shadowSoft:  '#6B4049',
  // Cream/blush surfaces used INSTEAD of systemGray5/6 for inset wells
  // (inputs, muted icon chips). System gray on a warm cream page reads cold
  // and is the main "generated settings screen" tell.
  surfaceCream: '#FDF6F4',
  surfaceBlush: '#FBEEF0',
  // Hairline separator — lighter than `separator`, for dividers *inside* a
  // card where a full-strength rule chops the content into boxes.
  separatorSoft: '#F7EFEF',

  // Service pastels — calm rose-family tints only, no rainbow
  servicePersonal:   '#FCECEF',
  serviceCompanion:  '#F6EBC9',
  serviceMeal:       '#FCECEF',
  serviceMedication: '#EDF5EF',
  serviceHousing:    '#F6EBC9',
  serviceMobility:   '#FCECEF',
  serviceSurgery:    '#FCECEF',

  // Accent service colors — rose + gold only
  servicePersonalAccent:   '#D97A91',
  serviceCompanionAccent:  '#D4AF37',
  serviceMealAccent:       '#C4667E',
  serviceMedicationAccent: '#3BA55D',
  serviceHousingAccent:    '#D4AF37',
  serviceMobilityAccent:   '#A34D63',
  serviceSurgeryAccent:    '#D97A91',

  // Primary action
  primaryButton:     '#D97A91',
  primaryButtonText: '#FFFFFF',

  // Map overlay
  mapOverlay: 'rgba(29,29,31,0.62)',
  mapPill:    'rgba(29,29,31,0.55)',
};

export const StatusColors: Record<string, string> = {
  REQUESTED: '#D99A6C',
  ACCEPTED:  '#D97A91',
  ON_MY_WAY: '#A34D63',
  STARTED:   '#D4AF37',
  COMPLETED: '#3BA55D',
  CANCELLED: '#D96C6C',
};

// One calm family: rose tints with rose/gold accents. Deliberately quiet —
// the old rainbow map read as a healthcare app.
export const ServiceColors: Record<string, string> = {
  'Makeup':        '#FCECEF',
  'Bridal Makeup': '#F6EBC9',
  'Party Makeup':  '#FCECEF',
  'Threading':     '#FCECEF',
  'Hair Styling':  '#FCECEF',
  'Hair Coloring': '#F6EBC9',
  'Facial':        '#FCECEF',
  'Waxing':        '#FCECEF',
  'Nails':         '#FCECEF',
  'Mehendi':       '#F6EBC9',
  'Massage':       '#FCECEF',
};

export const ServiceAccentColors: Record<string, string> = {
  'Makeup':        '#D97A91',
  'Bridal Makeup': '#D4AF37',
  'Party Makeup':  '#C4667E',
  'Threading':     '#A34D63',
  'Hair Styling':  '#D97A91',
  'Hair Coloring': '#D4AF37',
  'Facial':        '#C4667E',
  'Waxing':        '#A34D63',
  'Nails':         '#D97A91',
  'Mehendi':       '#D4AF37',
  'Massage':       '#C4667E',
};

// Inter — loaded in App.tsx. Use these for branded headings/labels.
// Falls back to system font (SF Pro on iOS) until fonts finish loading.
export const Fonts = {
  light:    'Inter_300Light',
  regular:  'Inter_400Regular',
  medium:   'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold:     'Inter_700Bold',
  extrabold:'Inter_800ExtraBold',
  // Fraunces — an editorial display serif, italic for warm/romantic headline
  // moments (the hero banner's "Glow from the comfort of home"), matching
  // the Figma reference's Fraunces display font instead of bold sans everywhere.
  displayItalic: 'Fraunces_400Regular_Italic',
  display:       'Fraunces_700Bold',
} as const;
