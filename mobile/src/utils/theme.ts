import { StyleSheet } from 'react-native';
import { Colors, Fonts } from './colors';

// Glow 2.0 — generous whitespace, big rounded corners, feather-soft shadows.

export const Spacing = {
  xs:  4,
  sm:  8,
  md:  14,
  lg:  20,
  xl:  24,
  xxl: 32,
  xxxl: 44,
};

export const Radius = {
  sm:  10,
  md:  16,
  lg:  20,
  xl:  24,
  xxl: 32,
  full: 9999,
};

export const Typography = {
  largeTitle:  { fontSize: 34, fontFamily: Fonts.bold,     color: Colors.label, letterSpacing: -0.8 },
  title1:      { fontSize: 28, fontFamily: Fonts.bold,     color: Colors.label, letterSpacing: -0.6 },
  title2:      { fontSize: 22, fontFamily: Fonts.semibold, color: Colors.label, letterSpacing: -0.4 },
  title3:      { fontSize: 20, fontFamily: Fonts.semibold, color: Colors.label, letterSpacing: -0.3 },
  headline:    { fontSize: 17, fontFamily: Fonts.semibold, color: Colors.label },
  body:        { fontSize: 17, fontFamily: Fonts.regular,  color: Colors.label },
  callout:     { fontSize: 16, fontFamily: Fonts.regular,  color: Colors.label },
  subheadline: { fontSize: 15, fontFamily: Fonts.regular,  color: Colors.label },
  footnote:    { fontSize: 13, fontFamily: Fonts.regular,  color: Colors.secondaryLabel },
  caption1:    { fontSize: 12, fontFamily: Fonts.regular,  color: Colors.tertiaryLabel },
  caption2:    { fontSize: 11, fontFamily: Fonts.medium,   color: Colors.tertiaryLabel },
};

export const Shadow = {
  sm: {
    shadowColor: Colors.cardShadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  md: {
    shadowColor: Colors.cardShadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 3,
  },
  lg: {
    shadowColor: Colors.cardShadow,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.10,
    shadowRadius: 28,
    elevation: 7,
  },
  brand: {
    shadowColor: Colors.brand,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 18,
    elevation: 6,
  },
};

export const CardStyle = StyleSheet.create({
  card: {
    backgroundColor: Colors.cardBackground,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    ...Shadow.md,
  },
});
