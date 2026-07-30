import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors } from '../utils/colors';

// ── Types ──────────────────────────────────────────────────────────────────────
export interface ProviderProfileShape {
  approvedByAdmin: boolean;
  availability: boolean;
  certifications: string[];
  experienceYears: number;
  bio?: string;
  languages?: string[];
  photoUrl?: string;
  specialties?: string[];
  policeCheckCleared?: boolean;
  photos?: string[];
}

interface CheckItem {
  key: string;
  label: string;
  hint: string;
  done: boolean;
  /** Called when the user taps the item to fix it */
  onFix?: () => void;
}

interface ProfileStrengthProps {
  providerProfile: ProviderProfileShape | undefined | null;
  hasPhoto: boolean;
  phoneVerified: boolean;
  // Jump-to callbacks — ProfileScreen passes these in
  onFixBio: () => void;
  onFixLanguages: () => void;
  onFixSpecialties: () => void;
  onFixDocuments: () => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────────
// Was CareNearby-era green — this card now anchors the top of the
// reorganized "Your public profile" group, making the stale color more
// visible, so it's switched to the real Glow rose tokens here.
const BRAND = Colors.brand;
const BRAND_LIGHT = Colors.brandLight;
const BRAND_DARK = Colors.brandDark;

function computeStrength(
  providerP: ProviderProfileShape | undefined | null,
  hasPhoto: boolean,
  phoneVerified: boolean,
  onFixBio: () => void,
  onFixLanguages: () => void,
  onFixSpecialties: () => void,
  onFixDocuments: () => void,
): CheckItem[] {
  return [
    {
      key: 'photo',
      label: 'Profile photo',
      hint: 'Clients trust Providers with a clear headshot',
      done: hasPhoto,
      onFix: undefined, // photo picker is on the avatar itself
    },
    {
      key: 'phone',
      label: 'Phone verified',
      hint: 'Required for receiving bookings',
      done: phoneVerified,
      onFix: undefined,
    },
    {
      key: 'bio',
      label: 'About you (bio)',
      hint: 'A personal intro improves match rate',
      done: !!(providerP?.bio?.trim()),
      onFix: onFixBio,
    },
    {
      key: 'languages',
      label: 'Languages spoken',
      hint: 'Clients filter by language preference',
      done: (providerP?.languages?.length ?? 0) > 0,
      onFix: onFixLanguages,
    },
    {
      key: 'specialties',
      label: 'Care specialties',
      hint: 'Highlights your training to matching clients',
      done: (providerP?.specialties?.length ?? 0) > 0,
      onFix: onFixSpecialties,
    },
    {
      key: 'gallery',
      label: 'Gallery photos',
      hint: 'Show at least 3 photos of your work',
      done: (providerP?.photos?.length ?? 0) >= 3,
      onFix: undefined, // no jump-to callback — gallery has its own dedicated section now (Task 2)
    },
    {
      key: 'documents',
      label: 'Credential documents',
      hint: 'Police check & certificates unlock full approval',
      done: providerP?.approvedByAdmin ?? false,
      onFix: onFixDocuments,
    },
  ];
}

// ── Thin arc/bar progress indicator (pure RN, no SVG) ─────────────────────────
function ProgressRing({ pct }: { pct: number }) {
  // We simulate a ring via two concentric circles + a rotating mask arc.
  // On RN/web, true SVG arc would be cleaner but we keep this dependency-free.
  // Instead: gradient-coloured thick border with a clip approach via two half-circles.
  const size = 76;
  const stroke = 7;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const filled = circumference * (pct / 100);

  // Colour: red → amber → green based on pct
  const color = pct >= 80 ? BRAND : pct >= 50 ? '#F59E0B' : '#EF4444';
  const label = pct >= 80 ? 'Strong' : pct >= 50 ? 'Good' : 'Needs work';

  return (
    <View style={[ringStyles.wrap, { width: size, height: size }]}>
      {/* Track */}
      <View
        style={[
          ringStyles.track,
          { width: size, height: size, borderRadius: size / 2, borderWidth: stroke, borderColor: '#E5E7EB' },
        ]}
      />
      {/* Progress overlay — half-circle technique */}
      {/* Left half */}
      <View style={[ringStyles.halfWrap, { width: size / 2, height: size, left: 0, overflow: 'hidden' }]}>
        <View
          style={[
            ringStyles.halfCircle,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              borderWidth: stroke,
              borderColor: pct > 50 ? color : 'transparent',
            },
          ]}
        />
      </View>
      {/* Right half */}
      <View style={[ringStyles.halfWrap, { width: size / 2, height: size, right: 0, overflow: 'hidden' }]}>
        <View
          style={[
            ringStyles.halfCircle,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              borderWidth: stroke,
              borderColor: pct > 0 ? color : 'transparent',
              left: -(size / 2),
            },
          ]}
        />
      </View>
      {/* Centre text */}
      <View style={ringStyles.centre}>
        <Text style={[ringStyles.pctText, { color }]}>{pct}%</Text>
        <Text style={[ringStyles.labelText, { color }]}>{label}</Text>
      </View>
    </View>
  );
}

const ringStyles = StyleSheet.create({
  wrap:       { position: 'relative', alignItems: 'center', justifyContent: 'center' },
  track:      { position: 'absolute', top: 0, left: 0 },
  halfWrap:   { position: 'absolute', top: 0 },
  halfCircle: { position: 'absolute', top: 0, left: 0 },
  centre:     { alignItems: 'center', justifyContent: 'center' },
  pctText:    { fontSize: 18, fontWeight: '800', lineHeight: 22, letterSpacing: -0.5 },
  labelText:  { fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 1 },
});

// ── Checklist item ─────────────────────────────────────────────────────────────
function CheckRow({ item }: { item: CheckItem }) {
  const Wrap = item.done || !item.onFix ? View : Pressable;
  return (
    <Wrap
      style={[cStyles.row, !item.done && item.onFix ? cStyles.rowTappable : undefined]}
      {...(!item.done && item.onFix ? { onPress: item.onFix } : {})}
    >
      <View style={[cStyles.dot, item.done ? cStyles.dotDone : cStyles.dotMissing]}>
        {item.done
          ? <Text style={cStyles.dotCheckmark}>✓</Text>
          : <Text style={cStyles.dotX}>+</Text>
        }
      </View>
      <View style={cStyles.textWrap}>
        <Text style={[cStyles.itemLabel, item.done && cStyles.itemLabelDone]}>{item.label}</Text>
        {!item.done && (
          <Text style={cStyles.itemHint}>{item.hint}</Text>
        )}
      </View>
      {!item.done && item.onFix && (
        <Text style={cStyles.fixBtn}>Add ›</Text>
      )}
    </Wrap>
  );
}

const cStyles = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 7,
  },
  rowTappable: {
    // subtle press affordance handled by Pressable opacity at component level
  },
  dot: {
    width: 24, height: 24, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  dotDone:    { backgroundColor: '#D1FAE5' },
  dotMissing: { backgroundColor: '#FEF3C7' },
  dotCheckmark: { fontSize: 13, color: '#16A34A', fontWeight: '800' },
  dotX:         { fontSize: 15, color: '#D97706', fontWeight: '800', lineHeight: 18 },
  textWrap:   { flex: 1 },
  itemLabel:  { fontSize: 13, fontWeight: '600', color: '#111827' },
  itemLabelDone: { color: '#6B7280', textDecorationLine: 'line-through' },
  itemHint:   { fontSize: 11, color: '#9CA3AF', marginTop: 1, lineHeight: 15 },
  fixBtn:     { fontSize: 12, fontWeight: '700', color: BRAND, flexShrink: 0 },
});

// ── Main component ─────────────────────────────────────────────────────────────
export function ProfileStrength({
  providerProfile,
  hasPhoto,
  phoneVerified,
  onFixBio,
  onFixLanguages,
  onFixSpecialties,
  onFixDocuments,
}: ProfileStrengthProps) {
  const items = computeStrength(
    providerProfile, hasPhoto, phoneVerified,
    onFixBio, onFixLanguages, onFixSpecialties, onFixDocuments,
  );
  const doneCount = items.filter(i => i.done).length;
  const pct = Math.round((doneCount / items.length) * 100);
  const missing = items.filter(i => !i.done);
  const done = items.filter(i => i.done);

  return (
    <View style={s.card}>
      {/* Header row: ring + text */}
      <View style={s.header}>
        <ProgressRing pct={pct} />
        <View style={s.headerText}>
          <Text style={s.title}>Profile Strength</Text>
          <Text style={s.subtitle}>
            {doneCount} of {items.length} sections complete
          </Text>
          {pct < 100 && (
            <View style={s.pillWrap}>
              <Text style={s.pill}>
                {pct >= 80
                  ? 'You\'re almost there!'
                  : pct >= 50
                  ? 'A stronger profile gets more clients'
                  : 'Complete your profile to get hired'}
              </Text>
            </View>
          )}
          {pct === 100 && (
            <View style={[s.pillWrap, { backgroundColor: '#D1FAE5', borderColor: '#A7F3D0' }]}>
              <Text style={[s.pill, { color: '#065F46' }]}>Your profile is 100% complete!</Text>
            </View>
          )}
        </View>
      </View>

      {/* Missing items first */}
      {missing.length > 0 && (
        <>
          <View style={s.divider} />
          <Text style={s.sectionHead}>Still needed</Text>
          {missing.map(item => (
            <CheckRow key={item.key} item={item} />
          ))}
        </>
      )}

      {/* Completed items */}
      {done.length > 0 && (
        <>
          <View style={s.divider} />
          <Text style={s.sectionHead}>Done</Text>
          {done.map(item => (
            <CheckRow key={item.key} item={item} />
          ))}
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
    borderWidth: 1.5,
    borderColor: BRAND_LIGHT,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  headerText: {
    flex: 1,
    gap: 3,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
    letterSpacing: -0.2,
  },
  subtitle: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '500',
  },
  pillWrap: {
    marginTop: 4,
    alignSelf: 'flex-start',
    backgroundColor: BRAND_LIGHT,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  pill: {
    fontSize: 11,
    fontWeight: '700',
    color: BRAND_DARK,
  },
  divider: {
    height: 1,
    backgroundColor: '#F0F1F3',
    marginVertical: 10,
  },
  sectionHead: {
    fontSize: 10,
    fontWeight: '700',
    color: '#9CA3AF',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
});
