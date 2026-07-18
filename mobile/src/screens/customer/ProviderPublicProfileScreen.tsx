import React, { useEffect, useState } from 'react';
import { Image } from 'expo-image';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { apiGetProviderPublicProfile, ProviderPublicProfile } from '../../api/client';
import { Colors } from '../../utils/colors';
import { CloseCircleIcon } from '../../components/TabIcons';
import { ShieldCheckIcon } from '../../components/CareIcons';

const { width: SCREEN_W } = Dimensions.get('window');
const PHOTO_H = 300;

function StarDisplay({ rating, size = 14 }: { rating: number; size?: number }) {
  const full  = Math.floor(rating);
  const half  = rating - full >= 0.5 ? 1 : 0;
  const empty = 5 - full - half;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
      {Array.from({ length: full  }).map((_, i) => <Text key={`f${i}`} style={{ fontSize: size, color: '#F59E0B' }}>★</Text>)}
      {half === 1 && <Text style={{ fontSize: size, color: '#F59E0B' }}>⯨</Text>}
      {Array.from({ length: empty }).map((_, i) => <Text key={`e${i}`} style={{ fontSize: size, color: '#D1D5DB' }}>★</Text>)}
    </View>
  );
}

function PhotoCarousel({ photos, name, photoUrl }: { photos: string[]; name: string; photoUrl?: string }) {
  const [active, setActive] = useState(0);
  const slides = photos.length > 0 ? photos : photoUrl ? [photoUrl] : [];
  const initials = name.split(' ').slice(0, 2).map(s => s[0]?.toUpperCase() ?? '').join('');

  if (slides.length === 0) {
    return (
      <View style={[styles.carouselContainer, { backgroundColor: Colors.brand, alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={{ color: '#fff', fontSize: 64, fontWeight: '800', opacity: 0.5 }}>{initials}</Text>
      </View>
    );
  }
  if (slides.length === 1) {
    return (
      <View style={styles.carouselContainer}>
        <Image source={{ uri: slides[0] }} style={styles.carouselImage} contentFit="cover" cachePolicy="memory-disk" />
        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.6)']} style={styles.carouselGradient} />
      </View>
    );
  }
  return (
    <View style={styles.carouselContainer}>
      <FlatList
        data={slides}
        horizontal pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(_, i) => String(i)}
        onScroll={(e: NativeSyntheticEvent<NativeScrollEvent>) => {
          setActive(Math.round(e.nativeEvent.contentOffset.x / SCREEN_W));
        }}
        scrollEventThrottle={16}
        renderItem={({ item }) => (
          <Image source={{ uri: item }} style={{ width: SCREEN_W, height: PHOTO_H }} contentFit="cover" cachePolicy="memory-disk" />
        )}
      />
      <LinearGradient colors={['transparent', 'rgba(0,0,0,0.6)']} style={styles.carouselGradient} />
      <View style={styles.dotRow}>
        {slides.map((_, i) => (
          <View key={i} style={[styles.dot, i === active && styles.dotActive]} />
        ))}
      </View>
      <View style={styles.photoBadge}>
        <Text style={styles.photoBadgeText}>📷 {active + 1} / {slides.length}</Text>
      </View>
    </View>
  );
}

export function ProviderPublicProfileScreen() {
  const nav    = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const route  = useRoute<any>();
  const { providerId } = route.params ?? {};
  const [provider,     setProvider]     = useState<ProviderPublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  useEffect(() => {
    if (!providerId) { setError('No Provider ID provided'); setLoading(false); return; }
    apiGetProviderPublicProfile(providerId)
      .then(res => setProvider(res.provider))
      .catch(err => setError(err.message ?? 'Could not load Provider profile'))
      .finally(() => setLoading(false));
  }, [providerId]);

  return (
    <View style={{ flex: 1, backgroundColor: '#F8FAFC' }}>
      {loading ? (
        <View style={[styles.centered, { paddingTop: insets.top + 60 }]}>
          <ActivityIndicator color={Colors.brand} size="large" />
          <Text style={styles.loadingText}>Loading profile…</Text>
        </View>
      ) : error || !provider ? (
        <View style={[styles.centered, { paddingTop: insets.top + 60 }]}>
          <CloseCircleIcon size={32} color={Colors.systemRed} />
          <Text style={styles.errorText}>{error || 'Profile not found'}</Text>
          <Pressable onPress={() => nav.goBack()} style={styles.retryBtn}>
            <Text style={styles.retryBtnText}>Go Back</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingBottom: insets.bottom + 110 }}
            showsVerticalScrollIndicator={false}
          >
            {/* Photo carousel hero */}
            <View>
              <PhotoCarousel photos={provider.photos ?? []} name={provider.name} photoUrl={provider.photoUrl} />
              {/* Floating back */}
              <Pressable style={[styles.floatBack, { top: insets.top + 8 }]} onPress={() => nav.goBack()} hitSlop={12}>
                <Text style={styles.floatBackText}>‹</Text>
              </Pressable>
              {/* Name + rating overlay */}
              <View style={styles.nameOverlay}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <Text style={styles.overlayName}>{provider.name}</Text>
                  {provider.policeCheckCleared && (
                    <View style={styles.verifiedBadge}>
                      <ShieldCheckIcon size={11} color="#166534" />
                      <Text style={styles.verifiedBadgeText}> Verified</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.overlayQual}>{provider.qualificationType}</Text>
                {(provider.rating ?? 0) > 0 && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
                    <StarDisplay rating={provider.rating} size={13} />
                    <Text style={styles.overlayRating}>{provider.rating.toFixed(1)} · {provider.ratingCount} reviews</Text>
                  </View>
                )}
              </View>
            </View>

            {/* Stats */}
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{provider.completedBookings}</Text>
                <Text style={styles.statLabel}>Sessions</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{provider.rating > 0 ? provider.rating.toFixed(1) : '—'}</Text>
                <Text style={styles.statLabel}>Rating</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{provider.experienceYears ?? 0}yr</Text>
                <Text style={styles.statLabel}>Experience</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: '#22C55E', fontSize: 18 }]}>
                  {provider.policeCheckCleared ? '✓' : '—'}
                </Text>
                <Text style={styles.statLabel}>Police</Text>
              </View>
            </View>

            {/* Bio */}
            {!!provider.bio && (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>ABOUT</Text>
                <View style={styles.card}>
                  <Text style={styles.bioText}>{provider.bio}</Text>
                </View>
              </View>
            )}

            {/* Specialties */}
            {provider.specialties.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>SPECIALTIES</Text>
                <View style={styles.card}>
                  <View style={styles.tagRow}>
                    {provider.specialties.map(sp => (
                      <View key={sp} style={styles.tag}>
                        <Text style={styles.tagText}>{sp}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              </View>
            )}

            {/* Certifications */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>CERTIFICATIONS</Text>
              <View style={styles.card}>
                {[
                  { label: 'Police Check Cleared', ok: provider.policeCheckCleared },
                  { label: 'Provider Certificate',       ok: true },
                  { label: 'First Aid / CPR',       ok: provider.firstAidCertified },
                ].map(c => (
                  <View key={c.label} style={styles.certItem}>
                    <View style={[styles.certIcon, { backgroundColor: c.ok ? '#DCFCE7' : '#F3F4F6' }]}>
                      <Text style={{ fontSize: 12, color: c.ok ? '#166534' : '#9CA3AF', fontWeight: '700' }}>
                        {c.ok ? '✓' : '✕'}
                      </Text>
                    </View>
                    <Text style={[styles.certLabel, !c.ok && { color: '#9CA3AF' }]}>{c.label}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Credentials */}
            {(!!provider.collegeName || !!provider.licenseNumber) && (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>CREDENTIALS</Text>
                <View style={styles.card}>
                  <View style={styles.credRow}>
                    <Text style={styles.credLabel}>Qualification</Text>
                    <Text style={styles.credValue}>{provider.qualificationType}</Text>
                  </View>
                  {!!provider.collegeName && (
                    <View style={[styles.credRow, styles.credBorder]}>
                      <Text style={styles.credLabel}>College / Training</Text>
                      <Text style={styles.credValue}>{provider.collegeName}</Text>
                    </View>
                  )}
                  {!!provider.licenseNumber && (
                    <View style={[styles.credRow, styles.credBorder]}>
                      <Text style={styles.credLabel}>Registration #</Text>
                      <Text style={styles.credValue}>{provider.licenseNumber}</Text>
                    </View>
                  )}
                </View>
              </View>
            )}

            {/* Reviews */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>REVIEWS ({provider.recentRatings.length})</Text>
              {provider.recentRatings.length === 0 ? (
                <View style={styles.card}>
                  <Text style={{ fontSize: 14, color: Colors.secondaryLabel, textAlign: 'center', paddingVertical: 8 }}>
                    No reviews yet — be the first!
                  </Text>
                </View>
              ) : (
                provider.recentRatings.map(r => (
                  <View key={r.id} style={styles.reviewCard}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <View style={styles.reviewAvatar}>
                          <Text style={styles.reviewAvatarText}>{r.customerName[0]}</Text>
                        </View>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: Colors.label }}>{r.customerName}</Text>
                      </View>
                      <StarDisplay rating={r.rating} size={13} />
                    </View>
                    {!!r.comment && <Text style={styles.reviewComment}>{r.comment}</Text>}
                    <Text style={styles.reviewDate}>
                      {new Date(r.createdAt).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </Text>
                  </View>
                ))
              )}
            </View>
          </ScrollView>

          {/* Fixed bottom Book CTA */}
          <View style={[styles.bottomCTA, { paddingBottom: insets.bottom + 12 }]}>
            <View style={styles.priceLine}>
              <Text style={styles.priceText}>$25 / hr</Text>
              <Text style={styles.minText}>· 3 hr minimum</Text>
            </View>
            <Pressable
              style={({ pressed }) => [styles.bookBtn, pressed && { opacity: 0.88, transform: [{ scale: 0.97 }] }]}
              onPress={() => nav.navigate('NewBooking', { bookingMode: 'scheduled', providerId: provider.id })}
            >
              <LinearGradient colors={[Colors.brand, Colors.brandDark]} style={styles.bookBtnGrad}>
                <Text style={styles.bookBtnText}>Book {provider.name.split(' ')[0]} →</Text>
              </LinearGradient>
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  loadingText: { fontSize: 15, color: Colors.secondaryLabel, marginTop: 8 },
  errorText: { fontSize: 15, color: Colors.systemRed, textAlign: 'center' },
  retryBtn: { backgroundColor: Colors.brand, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 24, marginTop: 8 },
  retryBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  carouselContainer: { width: SCREEN_W, height: PHOTO_H, overflow: 'hidden' },
  carouselImage: { width: SCREEN_W, height: PHOTO_H },
  carouselGradient: { position: 'absolute', left: 0, right: 0, bottom: 0, height: PHOTO_H * 0.6 },
  dotRow: { position: 'absolute', bottom: 60, alignSelf: 'center', flexDirection: 'row', gap: 5 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.4)' },
  dotActive: { backgroundColor: '#fff', width: 18, borderRadius: 3 },
  photoBadge: { position: 'absolute', top: 12, right: 12, backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  photoBadgeText: { color: '#fff', fontSize: 11, fontWeight: '600' },

  floatBack: { position: 'absolute', left: 16, width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center' },
  floatBackText: { color: '#fff', fontSize: 22, fontWeight: '700', marginTop: -2 },

  nameOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 20, paddingBottom: 16, paddingTop: 12 },
  overlayName: { fontSize: 24, fontWeight: '800', color: '#fff', letterSpacing: -0.3 },
  overlayQual: { fontSize: 13, color: 'rgba(255,255,255,0.82)', marginTop: 2 },
  overlayRating: { fontSize: 12, color: 'rgba(255,255,255,0.9)', fontWeight: '600' },

  verifiedBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#DCFCE7', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },
  verifiedBadgeText: { fontSize: 11, color: '#166534', fontWeight: '700' },

  statsRow: {
    flexDirection: 'row', backgroundColor: '#fff',
    marginHorizontal: 16, marginTop: 16, borderRadius: 18, paddingVertical: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 3,
    borderWidth: 1, borderColor: Colors.separator,
  },
  statItem: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 20, fontWeight: '800', color: Colors.brand },
  statLabel: { fontSize: 10, color: Colors.secondaryLabel, marginTop: 2, fontWeight: '600', textTransform: 'uppercase' },
  statDivider: { width: 1, backgroundColor: Colors.separator, alignSelf: 'stretch' },

  section: { paddingHorizontal: 16, marginBottom: 4 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: Colors.secondaryLabel, letterSpacing: 0.8, textTransform: 'uppercase', paddingHorizontal: 4, marginBottom: 8, marginTop: 20 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2, borderWidth: 1, borderColor: Colors.separator },

  bioText: { fontSize: 14, color: '#374151', lineHeight: 22 },

  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: { backgroundColor: '#EEF2FF', borderRadius: 8, paddingHorizontal: 11, paddingVertical: 6 },
  tagText: { fontSize: 12, color: '#4338CA', fontWeight: '700' },

  certItem: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  certIcon: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  certLabel: { fontSize: 14, color: '#374151', fontWeight: '500' },

  credRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10 },
  credBorder: { borderTopWidth: 1, borderTopColor: Colors.separator },
  credLabel: { fontSize: 13, color: Colors.secondaryLabel, fontWeight: '500' },
  credValue: { fontSize: 14, color: Colors.label, fontWeight: '700', flexShrink: 1, textAlign: 'right', marginLeft: 12 },

  reviewCard: { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1, borderWidth: 1, borderColor: Colors.separator },
  reviewAvatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.brand, alignItems: 'center', justifyContent: 'center' },
  reviewAvatarText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  reviewComment: { fontSize: 14, color: '#374151', lineHeight: 20, marginBottom: 4 },
  reviewDate: { fontSize: 11, color: Colors.tertiaryLabel },

  bottomCTA: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#fff', paddingHorizontal: 20, paddingTop: 14, borderTopWidth: 1, borderTopColor: Colors.separator, shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 12 },
  priceLine: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginBottom: 10 },
  priceText: { fontSize: 22, fontWeight: '800', color: Colors.label },
  minText: { fontSize: 13, color: Colors.secondaryLabel },
  bookBtn: { borderRadius: 16, overflow: 'hidden', shadowColor: Colors.brand, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 6 },
  bookBtnGrad: { paddingVertical: 18, alignItems: 'center' },
  bookBtnText: { color: '#fff', fontSize: 17, fontWeight: '800', letterSpacing: 0.2 },
});
