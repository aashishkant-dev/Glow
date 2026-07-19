/**
 * Artist profile — Airbnb-inspired: huge photography, highlight chips, one
 * premium Glow Trust card (never an admin checklist), signature packages,
 * full-bleed portfolio, warm reviews, a single Book CTA.
 */
import React, { useEffect, useState } from 'react';
import { Image } from 'expo-image';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
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
import { Colors, Fonts } from '../../utils/colors';
import { CloseCircleIcon, StarIcon, CheckCircleIcon, ChevronForwardIcon } from '../../components/TabIcons';
import { ShieldCheckIcon, CheckDecagramIcon } from '../../components/CareIcons';
import { GlowMark } from '../../components/GlowLogo';
import { ServiceIcon } from '../../components/ServiceIcon';
import { tapLight } from '../../utils/haptics';

const { width: SCREEN_W } = Dimensions.get('window');
const PHOTO_H = 380;

function StarRow({ rating, size = 14 }: { rating: number; size?: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
      {[1, 2, 3, 4, 5].map(i => (
        <StarIcon key={i} size={size} color={i <= Math.round(rating) ? Colors.gold : Colors.systemGray4} filled={i <= Math.round(rating)} />
      ))}
    </View>
  );
}

function PhotoCarousel({ photos, name, photoUrl }: { photos: string[]; name: string; photoUrl?: string }) {
  const [active, setActive] = useState(0);
  const slides = photos.length > 0 ? photos : photoUrl ? [photoUrl] : [];
  const initials = name.split(' ').slice(0, 2).map(s => s[0]?.toUpperCase() ?? '').join('');

  if (slides.length === 0) {
    return (
      <View style={[styles.carouselContainer, styles.carouselFallback]}>
        {Platform.OS === 'web' && (
          <View style={[StyleSheet.absoluteFill, { background: 'linear-gradient(160deg, #E9A0B1, #A34D63)' } as any]} />
        )}
        <Text style={styles.fallbackInitials}>{initials}</Text>
      </View>
    );
  }
  if (slides.length === 1) {
    return (
      <View style={styles.carouselContainer}>
        <Image source={{ uri: slides[0] }} style={styles.carouselImage} contentFit="cover" cachePolicy="memory-disk" />
        <LinearGradient colors={['transparent', 'rgba(20,8,12,0.72)']} style={styles.carouselGradient} />
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
      <LinearGradient colors={['transparent', 'rgba(20,8,12,0.72)']} style={styles.carouselGradient} pointerEvents="none" />
      <View style={styles.dotRow}>
        {slides.map((_, i) => (
          <View key={i} style={[styles.dot, i === active && styles.dotActive]} />
        ))}
      </View>
    </View>
  );
}

export function ProviderPublicProfileScreen() {
  const nav    = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const route  = useRoute<any>();
  const { providerId } = route.params ?? {};
  const [provider, setProvider] = useState<ProviderPublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  useEffect(() => {
    if (!providerId) { setError('No artist selected'); setLoading(false); return; }
    apiGetProviderPublicProfile(providerId)
      .then(res => setProvider(res.provider))
      .catch(err => setError(err.message ?? 'Could not load this artist'))
      .finally(() => setLoading(false));
  }, [providerId]);

  function book(serviceType?: string) {
    if (!provider) return;
    tapLight();
    nav.navigate('NewBooking', {
      bookingMode: 'scheduled',
      providerId: provider.id,
      ...(serviceType ? { serviceType } : null),
      _t: Date.now(),
    });
  }

  if (loading) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top + 60 }]}>
        <ActivityIndicator color={Colors.brand} size="large" />
        <Text style={styles.loadingText}>Loading profile…</Text>
      </View>
    );
  }
  if (error || !provider) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top + 60 }]}>
        <CloseCircleIcon size={32} color={Colors.systemRed} />
        <Text style={styles.errorText}>{error || 'Profile not found'}</Text>
        <Pressable onPress={() => nav.goBack()} style={styles.retryBtn}>
          <Text style={styles.retryBtnText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  const p = provider;
  const rating = Number(p.rating) || 0;
  const fromPrice = p.services?.length ? Math.min(...p.services.map(s => s.price)) : p.hourlyRate;

  // Highlight chips — every one backed by a real profile field.
  const highlights: string[] = [];
  if (rating >= 4.8 && p.ratingCount >= 5) highlights.push('Top Rated');
  if (p.completedBookings > 0) highlights.push(`${p.completedBookings} ${p.completedBookings === 1 ? 'session' : 'sessions'}`);
  if ((p.experienceYears ?? 0) > 0) highlights.push(`${p.experienceYears} yrs experience`);
  highlights.push('Travels to you');
  if (p.policeCheckCleared) highlights.push('Background checked');

  const trustRows: string[] = [
    'Identity verified by Glow',
    ...(p.policeCheckCleared ? ['Background checked'] : []),
    ...(p.qualificationType ? [`${p.qualificationType} — certificate verified`] : []),
    ...(p.photos.length > 0 ? ['Portfolio reviewed'] : []),
    ...(p.firstAidCertified ? ['First aid certified'] : []),
  ];

  return (
    <View style={{ flex: 1, backgroundColor: Colors.systemGroupedBackground }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: insets.bottom + 118 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Hero ── */}
        <View>
          <PhotoCarousel photos={p.photos ?? []} name={p.name} photoUrl={p.photoUrl} />
          <Pressable style={[styles.floatBack, { top: insets.top + 8 }]} onPress={() => nav.goBack()} hitSlop={12}>
            <Text style={styles.floatBackText}>‹</Text>
          </Pressable>
          <View style={styles.nameOverlay}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <Text style={styles.overlayName}>{p.name}</Text>
              {p.policeCheckCleared && <CheckDecagramIcon size={18} color={Colors.gold} />}
            </View>
            <Text style={styles.overlayQual}>
              {p.specialties.length ? p.specialties.slice(0, 2).join(' · ') : p.qualificationType}
            </Text>
            {rating > 0 && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 5 }}>
                <StarRow rating={rating} size={13} />
                <Text style={styles.overlayRating}>{rating.toFixed(1)} · {p.ratingCount} reviews</Text>
              </View>
            )}
          </View>
        </View>

        {/* ── Highlights ── */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ width: '100%' }} contentContainerStyle={styles.highlightRow}>
          {highlights.map(h => (
            <View key={h} style={styles.highlightChip}>
              <Text style={styles.highlightText}>{h}</Text>
            </View>
          ))}
        </ScrollView>

        {/* ── About ── */}
        {!!p.bio && (
          <View style={styles.section}>
            <Text style={styles.bioText}>{p.bio}</Text>
          </View>
        )}

        {/* ── Glow Trust — one premium card, never an admin checklist ── */}
        <View style={styles.section}>
          <View style={styles.trustCard}>
            {Platform.OS === 'web' && (
              <View style={[StyleSheet.absoluteFill, { background: 'linear-gradient(140deg, #3B1520 0%, #8E4257 100%)', borderRadius: 26 } as any]} />
            )}
            <View style={styles.trustGlow} pointerEvents="none" />
            <View style={styles.trustHeader}>
              <GlowMark size={30} petal="#FFFFFF" petalInner="rgba(255,255,255,0.4)" core={Colors.gold} />
              <View>
                <Text style={styles.trustTitle}>Glow Trust</Text>
                <Text style={styles.trustSub}>Glow Certified Artist</Text>
              </View>
              <View style={styles.trustBadge}>
                <ShieldCheckIcon size={13} color={Colors.gold} />
              </View>
            </View>
            <View style={styles.trustRows}>
              {trustRows.map(r => (
                <View key={r} style={styles.trustRow}>
                  <CheckCircleIcon size={15} color={Colors.gold} />
                  <Text style={styles.trustRowText}>{r}</Text>
                </View>
              ))}
            </View>
            {p.completedBookings > 0 && (
              <Text style={styles.trustFooter}>
                Trusted by Glow · {p.completedBookings} happy {p.completedBookings === 1 ? 'client' : 'clients'}
              </Text>
            )}
          </View>
        </View>

        {/* ── Signature packages ── */}
        {p.services?.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Signature packages</Text>
            {p.services.map(s => (
              <Pressable
                key={s.name}
                style={({ pressed }) => [styles.pkgRow, pressed && { backgroundColor: Colors.brandLight }]}
                onPress={() => book(s.name)}
              >
                <ServiceIcon serviceType={s.name} size={20} bubbleSize={44} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.pkgName}>{s.name}</Text>
                  <Text style={styles.pkgMeta}>
                    {s.durationMin ? `${Math.round(s.durationMin / 60 * 10) / 10}h session` : 'Session length varies'}
                  </Text>
                </View>
                <Text style={styles.pkgPrice}>${Math.round(s.price)}</Text>
                <ChevronForwardIcon size={16} color={Colors.tertiaryLabel} />
              </Pressable>
            ))}
            {p.priceNegotiable && (
              <Text style={styles.negotiable}>Prices are open to discussion for larger events</Text>
            )}
          </View>
        )}

        {/* ── Portfolio — huge images, no thumbnails ── */}
        {p.photos.length > 1 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Portfolio</Text>
            {p.photos.slice(0, 6).map((uri, i) => (
              <Image
                key={`${uri}-${i}`}
                source={{ uri }}
                style={styles.portfolioImage}
                contentFit="cover"
                cachePolicy="memory-disk"
                transition={200}
              />
            ))}
          </View>
        )}

        {/* ── Specialties ── */}
        {p.specialties.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Specialties</Text>
            <View style={styles.tagRow}>
              {p.specialties.map(sp => (
                <View key={sp} style={styles.tag}>
                  <Text style={styles.tagText}>{sp}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ── Reviews ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Reviews</Text>
          {rating > 0 && (
            <View style={styles.ratingSummary}>
              <Text style={styles.ratingBig}>{rating.toFixed(1)}</Text>
              <View>
                <StarRow rating={rating} size={16} />
                <Text style={styles.ratingCount}>{p.ratingCount} client {p.ratingCount === 1 ? 'review' : 'reviews'}</Text>
              </View>
            </View>
          )}
          {p.recentRatings.length === 0 ? (
            <View style={styles.emptyReviews}>
              <Text style={styles.emptyReviewsText}>No reviews yet — be the first ✨</Text>
            </View>
          ) : (
            p.recentRatings.map(r => (
              <View key={r.id} style={styles.reviewCard}>
                <View style={styles.reviewHead}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
                    <View style={styles.reviewAvatar}>
                      <Text style={styles.reviewAvatarText}>{r.customerName[0]}</Text>
                    </View>
                    <View>
                      <Text style={styles.reviewName}>{r.customerName}</Text>
                      <Text style={styles.reviewDate}>
                        {new Date(r.createdAt).toLocaleDateString('en-CA', { month: 'short', year: 'numeric' })}
                      </Text>
                    </View>
                  </View>
                  <StarRow rating={r.rating} size={12} />
                </View>
                {!!r.comment && <Text style={styles.reviewComment}>{r.comment}</Text>}
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {/* ── One Book CTA ── */}
      <View style={[styles.bottomCTA, { paddingBottom: insets.bottom + 12 }]}>
        <View style={{ flex: 1 }}>
          {fromPrice != null ? (
            <>
              <Text style={styles.priceText}>From ${Math.round(fromPrice)}</Text>
              <Text style={styles.priceSub}>complete look</Text>
            </>
          ) : (
            <Text style={styles.priceText}>Custom pricing</Text>
          )}
        </View>
        <Pressable
          style={({ pressed }) => [styles.bookBtn, pressed && { opacity: 0.9, transform: [{ scale: 0.97 }] }]}
          onPress={() => book()}
        >
          <Text style={styles.bookBtnText}>Book {p.name.split(' ')[0]}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12, backgroundColor: Colors.systemGroupedBackground },
  loadingText: { fontSize: 15, color: Colors.secondaryLabel, marginTop: 8, fontFamily: Fonts.regular },
  errorText: { fontSize: 15, color: Colors.systemRed, textAlign: 'center', fontFamily: Fonts.regular },
  retryBtn: { backgroundColor: Colors.brand, borderRadius: 100, paddingVertical: 12, paddingHorizontal: 26, marginTop: 8 },
  retryBtnText: { color: '#fff', fontFamily: Fonts.semibold, fontSize: 15 },

  carouselContainer: { width: SCREEN_W, height: PHOTO_H, overflow: 'hidden' },
  carouselImage: { width: SCREEN_W, height: PHOTO_H },
  carouselGradient: { position: 'absolute', left: 0, right: 0, bottom: 0, height: PHOTO_H * 0.55 },
  carouselFallback: { backgroundColor: Colors.brand, alignItems: 'center', justifyContent: 'center' },
  fallbackInitials: { color: 'rgba(255,255,255,0.75)', fontSize: 68, fontFamily: Fonts.bold },
  dotRow: { position: 'absolute', bottom: 14, alignSelf: 'center', flexDirection: 'row', gap: 5 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.45)' },
  dotActive: { backgroundColor: '#fff', width: 18, borderRadius: 3 },

  floatBack: {
    position: 'absolute', left: 16, width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(20,8,12,0.4)', alignItems: 'center', justifyContent: 'center',
  },
  floatBackText: { color: '#fff', fontSize: 24, fontFamily: Fonts.semibold, marginTop: -2 },

  nameOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 24, paddingBottom: 26 },
  overlayName: { fontSize: 30, fontFamily: Fonts.bold, color: '#fff', letterSpacing: -0.6 },
  overlayQual: { fontSize: 14, color: 'rgba(255,255,255,0.88)', marginTop: 3, fontFamily: Fonts.regular },
  overlayRating: { fontSize: 12.5, color: 'rgba(255,255,255,0.92)', fontFamily: Fonts.medium },

  highlightRow: { paddingHorizontal: 24, gap: 8, paddingVertical: 18 },
  highlightChip: {
    backgroundColor: '#fff', borderRadius: 100,
    borderWidth: 1, borderColor: Colors.separator,
    paddingHorizontal: 14, paddingVertical: 8,
  },
  highlightText: { fontSize: 12.5, fontFamily: Fonts.medium, color: Colors.label },

  section: { paddingHorizontal: 24, marginBottom: 26 },
  sectionTitle: { fontSize: 20, fontFamily: Fonts.semibold, color: Colors.label, letterSpacing: -0.4, marginBottom: 14 },

  bioText: { fontSize: 15, color: Colors.label, lineHeight: 24, fontFamily: Fonts.regular },

  trustCard: {
    backgroundColor: '#3B1520', borderRadius: 26, padding: 22, overflow: 'hidden',
    shadowColor: '#3B1520', shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3, shadowRadius: 22, elevation: 7,
  },
  trustGlow: {
    position: 'absolute', top: -60, right: -40,
    width: 180, height: 180, borderRadius: 90,
    backgroundColor: 'rgba(212,175,55,0.16)',
  },
  trustHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  trustTitle: { color: '#fff', fontSize: 19, fontFamily: Fonts.bold, letterSpacing: -0.3 },
  trustSub: { color: 'rgba(255,255,255,0.75)', fontSize: 12, marginTop: 1, fontFamily: Fonts.regular },
  trustBadge: {
    marginLeft: 'auto',
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  trustRows: { marginTop: 18, gap: 11 },
  trustRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  trustRowText: { color: 'rgba(255,255,255,0.94)', fontSize: 14, fontFamily: Fonts.regular },
  trustFooter: {
    color: Colors.gold, fontSize: 12.5, fontFamily: Fonts.medium,
    marginTop: 18, letterSpacing: 0.2,
  },

  pkgRow: {
    flexDirection: 'row', alignItems: 'center', gap: 13,
    backgroundColor: '#fff', borderRadius: 20, padding: 14,
    borderWidth: 1, borderColor: Colors.separator, marginBottom: 10,
  },
  pkgName: { fontSize: 15, fontFamily: Fonts.semibold, color: Colors.label },
  pkgMeta: { fontSize: 12, color: Colors.secondaryLabel, marginTop: 2, fontFamily: Fonts.regular },
  pkgPrice: { fontSize: 16, fontFamily: Fonts.bold, color: Colors.brandDeep },
  negotiable: { fontSize: 12.5, color: Colors.secondaryLabel, marginTop: 4, fontFamily: Fonts.regular },

  portfolioImage: {
    width: '100%', height: 260, borderRadius: 24, marginBottom: 12,
    backgroundColor: Colors.brandLight,
  },

  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: { backgroundColor: Colors.brandLight, borderRadius: 100, paddingHorizontal: 13, paddingVertical: 7 },
  tagText: { fontSize: 12.5, color: Colors.brandDark, fontFamily: Fonts.semibold },

  ratingSummary: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 },
  ratingBig: { fontSize: 44, fontFamily: Fonts.bold, color: Colors.label, letterSpacing: -1 },
  ratingCount: { fontSize: 12.5, color: Colors.secondaryLabel, marginTop: 4, fontFamily: Fonts.regular },

  emptyReviews: {
    backgroundColor: '#fff', borderRadius: 18, padding: 20,
    borderWidth: 1, borderColor: Colors.separator, alignItems: 'center',
  },
  emptyReviewsText: { fontSize: 13.5, color: Colors.secondaryLabel, fontFamily: Fonts.regular },

  reviewCard: {
    backgroundColor: '#fff', borderRadius: 18, padding: 16, marginBottom: 10,
    borderWidth: 1, borderColor: Colors.separator,
  },
  reviewHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  reviewAvatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: Colors.brandLight, alignItems: 'center', justifyContent: 'center' },
  reviewAvatarText: { color: Colors.brandDark, fontSize: 14, fontFamily: Fonts.bold },
  reviewName: { fontSize: 13.5, fontFamily: Fonts.semibold, color: Colors.label },
  reviewDate: { fontSize: 11, color: Colors.tertiaryLabel, marginTop: 1, fontFamily: Fonts.regular },
  reviewComment: { fontSize: 14, color: Colors.label, lineHeight: 21, fontFamily: Fonts.regular },

  bottomCTA: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', gap: 16,
    backgroundColor: '#fff', paddingHorizontal: 24, paddingTop: 14,
    borderTopWidth: 1, borderTopColor: Colors.separator,
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 12,
  },
  priceText: { fontSize: 21, fontFamily: Fonts.bold, color: Colors.label, letterSpacing: -0.4 },
  priceSub: { fontSize: 12, color: Colors.secondaryLabel, fontFamily: Fonts.regular },
  bookBtn: {
    backgroundColor: Colors.brand, borderRadius: 100,
    paddingVertical: 16, paddingHorizontal: 34,
    shadowColor: Colors.brand, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 6,
  },
  bookBtnText: { color: '#fff', fontSize: 16, fontFamily: Fonts.semibold, letterSpacing: 0.2 },
});
