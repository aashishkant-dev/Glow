import { StyleSheet } from 'react-native';
import { Colors } from './colors';

export const Spacing = {
  xs:  4,
  sm:  8,
  md:  12,
  lg:  16,
  xl:  20,
  xxl: 24,
  xxxl: 32,
};

export const Radius = {
  sm:  8,
  md:  12,
  lg:  16,
  xl:  20,
  xxl: 24,
  full: 9999,
};

export const Typography = {
  largeTitle:  { fontSize: 34, fontWeight: '700' as const, color: Colors.label },
  title1:      { fontSize: 28, fontWeight: '700' as const, color: Colors.label },
  title2:      { fontSize: 22, fontWeight: '700' as const, color: Colors.label },
  title3:      { fontSize: 20, fontWeight: '600' as const, color: Colors.label },
  headline:    { fontSize: 17, fontWeight: '600' as const, color: Colors.label },
  body:        { fontSize: 17, fontWeight: '400' as const, color: Colors.label },
  callout:     { fontSize: 16, fontWeight: '400' as const, color: Colors.label },
  subheadline: { fontSize: 15, fontWeight: '400' as const, color: Colors.label },
  footnote:    { fontSize: 13, fontWeight: '400' as const, color: Colors.secondaryLabel },
  caption1:    { fontSize: 12, fontWeight: '400' as const, color: Colors.tertiaryLabel },
  caption2:    { fontSize: 11, fontWeight: '400' as const, color: Colors.tertiaryLabel },
};

export const Shadow = {
  sm: {
    shadowColor: Colors.cardShadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  md: {
    shadowColor: Colors.cardShadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  lg: {
    shadowColor: Colors.cardShadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
  },
  brand: {
    shadowColor: Colors.brand,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
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
