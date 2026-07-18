export const Colors = {
  // Brand — Glow rose gold
  brand:         '#B76E79',   // rose gold
  brandDark:     '#9C5560',
  brandLight:    '#FDF2F4',
  brandAccent:   '#D48A94',   // lighter rose accent

  // System
  systemBlue:    '#1B6CA8',
  systemBlueDark:'#14527F',
  systemGreen:   '#059669',
  systemRed:     '#DC2626',
  systemOrange:  '#D97706',
  systemYellow:  '#CA8A04',
  systemPurple:  '#7C3AED',
  systemTeal:    '#0D9488',

  // Grays
  systemGray:  '#64748B',
  systemGray2: '#94A3B8',
  systemGray3: '#CBD5E1',
  systemGray4: '#E2E8F0',
  systemGray5: '#F1F5F9',
  systemGray6: '#F8FAFC',

  // Labels
  label:          '#1F1215',
  secondaryLabel: '#5B4A4E',
  tertiaryLabel:  '#A08C90',

  // Backgrounds
  systemBackground:                  '#FFFFFF',
  secondarySystemBackground:         '#FBF7F8',
  tertiarySystemBackground:          '#FFFFFF',
  systemGroupedBackground:           '#FDF2F4',
  secondarySystemGroupedBackground:  '#FFFFFF',

  // Separators
  separator:       '#F0E4E6',
  opaqueSeparator: '#DBC9CC',

  // Hero/header
  heroNavy:      '#B76E79',
  heroNavyLight: '#CA8490',

  // Status / semantic
  trustGreen:   '#059669',
  onlineGreen:  '#10B981',
  offlineGray:  '#94A3B8',
  urgentOrange: '#D97706',
  earningsGold: '#CA8A04',
  accentGold:   '#E3B23C',

  // Cards
  cardShadow:       '#B76E79',
  cardBackground:   '#FFFFFF',
  cardBorder:       '#F0E4E6',
  cardShadowLight:  'rgba(183,110,121,0.06)',
  cardShadowMedium: 'rgba(183,110,121,0.10)',

  // Service pastels
  servicePersonal:   '#FDF2F4',
  serviceCompanion:  '#F5F3FF',
  serviceMeal:       '#FFF7ED',
  serviceMedication: '#ECFDF5',
  serviceHousing:    '#FEF3C7',
  serviceMobility:   '#E0F2FE',
  serviceSurgery:    '#FFF1F2',

  // Accent service colors
  servicePersonalAccent:   '#B76E79',
  serviceCompanionAccent:  '#7C3AED',
  serviceMealAccent:       '#D97706',
  serviceMedicationAccent: '#059669',
  serviceHousingAccent:    '#CA8A04',
  serviceMobilityAccent:   '#0284C7',
  serviceSurgeryAccent:    '#DC2626',

  // Primary action
  primaryButton:     '#B76E79',
  primaryButtonText: '#FFFFFF',

  // Map overlay
  mapOverlay: 'rgba(31,18,21,0.7)',
  mapPill:    'rgba(31,18,21,0.65)',
};

export const StatusColors: Record<string, string> = {
  REQUESTED: '#D97706',
  ACCEPTED:  '#B76E79',
  ON_MY_WAY: '#0284C7',
  STARTED:   '#7C3AED',
  COMPLETED: '#059669',
  CANCELLED: '#DC2626',
};

export const ServiceColors: Record<string, string> = {
  'Makeup':        '#FDF2F4',
  'Bridal Makeup': '#FFF1F2',
  'Party Makeup':  '#F5F3FF',
  'Threading':     '#ECFDF5',
  'Hair Styling':  '#FFF7ED',
  'Hair Coloring': '#FEF3C7',
  'Facial':        '#E0F2FE',
  'Waxing':        '#F0FDF4',
  'Nails':         '#FDF2F8',
  'Mehendi':       '#FEF9C3',
  'Massage':       '#EEF2FF',
};

export const ServiceAccentColors: Record<string, string> = {
  'Makeup':        '#B76E79',
  'Bridal Makeup': '#DC2666',
  'Party Makeup':  '#7C3AED',
  'Threading':     '#059669',
  'Hair Styling':  '#D97706',
  'Hair Coloring': '#CA8A04',
  'Facial':        '#0284C7',
  'Waxing':        '#16A34A',
  'Nails':         '#DB2777',
  'Mehendi':       '#A16207',
  'Massage':       '#6366F1',
};

// Plus Jakarta Sans — loaded in App.tsx. Use these for branded headings/labels.
// Falls back to system font until fonts finish loading (App gates render on it).
export const Fonts = {
  light:    'PlusJakartaSans_300Light',
  regular:  'PlusJakartaSans_400Regular',
  medium:   'PlusJakartaSans_500Medium',
  semibold: 'PlusJakartaSans_600SemiBold',
  bold:     'PlusJakartaSans_700Bold',
  extrabold:'PlusJakartaSans_800ExtraBold',
} as const;
