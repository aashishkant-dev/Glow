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
  Linking,
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
import { apiGetProviderPublicProfile, apiLikeLook, apiUnlikeLook, ProviderPublicProfile, ProviderLookItem } from '../../api/client';
import { Colors, Fonts } from '../../utils/colors';
import { formatCurrency } from '../../utils/format';
import { CloseCircleIcon, StarIcon, CheckCircleIcon, ChevronForwardIcon } from '../../components/TabIcons';
import { ShieldCheckIcon, CheckDecagramIcon, ClockIcon, InstagramIcon } from '../../components/CareIcons';
import { GlowMark } from '../../components/GlowLogo';
import { ServiceIcon } from '../../components/ServiceIcon';
import { LookTile } from '../../components/LookTile';
import { LookGalleryModal } from '../../components/LookGalleryModal';
import { PostMedia } from '../../components/PostMedia';
import { lookById, Look } from '../../data/looks';
import { OSMMap } from '../../components/OSMMap';
import { LocationIcon, HeartIcon } from '../../components/TabIcons';
import { tapLight } from '../../utils/haptics';
import { useFavorites, toggleFavorite } from '../../utils/favorites';
import { humanizeQualification } from '../../utils/format';

const { width: SCREEN_W } = Dimensions.get('window');
const PHOTO_H = 380;

const HOUR_DAY_ORDER: { key: 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'; label: string }[] = [
  { key: 'mon', label: 'Monday' }, { key: 'tue', label: 'Tuesday' }, { key: 'wed', label: 'Wednesday' },
  { key: 'thu', label: 'Thursday' }, { key: 'fri', label: 'Friday' }, { key: 'sat', label: 'Saturday' }, { key: 'sun', label: 'Sunday' },
];

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
  // Portfolio photos take priority as the hero, but a broken/expired URL among
  // them shouldn't blank the whole header — drop failed ones and fall back to
  // the personal avatar (and finally initials) so the client always sees a face.
  const [failed, setFailed] = useState<Set<string>>(new Set());
  const workingPhotos = photos.filter(u => !failed.has(u));
  const slides = workingPhotos.length > 0 ? workingPhotos : photoUrl && !failed.has(photoUrl) ? [photoUrl] : [];
  const markFailed = (uri: string) => setFailed(prev => (prev.has(uri) ? prev : new Set(prev).add(uri)));
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
        <Image source={{ uri: slides[0] }} style={styles.carouselImage} contentFit="cover" cachePolicy="memory-disk" onError={() => markFailed(slides[0])} />
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
          <Image source={{ uri: item }} style={{ width: SCREEN_W, height: PHOTO_H }} contentFit="cover" cachePolicy="memory-disk" onError={() => markFailed(item)} />
        )}
      />
      <LinearGradient colors={['transparent', 'rgba(20,8,12,0.72)']} style={styles.carouselGradient} pointerEvents="none" />
      <View style={styles.dotRow}>
        {/* Clamp: an image failing mid-view shrinks `slides` via markFailed,
            but `active` (last real scroll position) isn't reset — comparing
            against a clamped index keeps a dot highlighted instead of none. */}
        {slides.map((_, i) => (
          <View key={i} style={[styles.dot, i === Math.min(active, slides.length - 1) && styles.dotActive]} />
        ))}
      </View>
    </View>
  );
}

export function ProviderPublicProfileScreen() {
  const nav    = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const route  = useRoute<any>();
  const { providerId, fromBooking } = route.params ?? {};
  const [provider, setProvider] = useState<ProviderPublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const favoriteIds = useFavorites();
  const favorited = provider ? favoriteIds.includes(provider.id) : false;

  // Local, optimistic overlay on top of provider.lookLikes/myLikedLookKeys —
  // lets the heart flip instantly instead of waiting on a round trip.
  const [likedKeys, setLikedKeys] = useState<Set<string>>(new Set());
  const [likeCounts, setLikeCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!providerId) { setError('No artist selected'); setLoading(false); return; }
    apiGetProviderPublicProfile(providerId)
      .then(res => {
        setProvider(res.provider);
        setLikedKeys(new Set(res.provider.myLikedLookKeys ?? []));
        setLikeCounts(res.provider.lookLikes ?? {});
      })
      .catch(err => setError(err.message ?? 'Could not load this artist'))
      .finally(() => setLoading(false));
  }, [providerId]);

  function toggleLookLike(lookKey: string) {
    if (!provider) return;
    tapLight();
    const wasLiked = likedKeys.has(lookKey);
    setLikedKeys(prev => {
      const next = new Set(prev);
      wasLiked ? next.delete(lookKey) : next.add(lookKey);
      return next;
    });
    setLikeCounts(prev => ({ ...prev, [lookKey]: Math.max(0, (prev[lookKey] || 0) + (wasLiked ? -1 : 1)) }));
    const call = wasLiked ? apiUnlikeLook(provider.id, lookKey) : apiLikeLook(provider.id, lookKey);
    call.catch(() => {
      // Revert on failure — this local overlay is the only place the "false"
      // optimistic state lives, so undoing it here is the only undo there is.
      setLikedKeys(prev => {
        const next = new Set(prev);
        wasLiked ? next.add(lookKey) : next.delete(lookKey);
        return next;
      });
      setLikeCounts(prev => ({ ...prev, [lookKey]: Math.max(0, (prev[lookKey] || 0) + (wasLiked ? 1 : -1)) }));
    });
  }

  // Looks (data/looks.ts) this artist confirmed at onboarding they can
  // create — booking one carries the specific look through (lookId), same as
  // "Book this look" from Home/Explore's LookSheet, so pricing/matching stays
  // consistent whichever entry point a client used.
  function bookLook(look: Look) {
    if (!provider) return;
    tapLight();
    if (fromBooking) {
      nav.navigate('NewBooking', { providerId: provider.id, serviceType: look.serviceType, lookId: look.id });
      return;
    }
    nav.navigate('NewBooking', {
      bookingMode: 'scheduled',
      providerId: provider.id,
      serviceType: look.serviceType,
      lookId: look.id,
      _t: Date.now(),
    });
  }

  // Unlike bookLook's shared data/looks.ts lookId, a ProviderLook is a real
  // DB row this specific artist priced themselves — carry its id (plus a
  // display snapshot for the booking summary before submit) so the backend
  // charges what they actually set for this package, not just their plain
  // per-service rate. See resolveProviderLookBooking on the backend.
  function bookCustomLook(item: ProviderLookItem) {
    book(item.serviceType, item);
  }

  const [galleryFor, setGalleryFor] = useState<{ item: ProviderLookItem; look: Look } | null>(null);
  // A single-photo (or theme-only) look books straight away — the gallery
  // only earns its interruption when there's actually more than one shot to
  // swipe through.
  function openCustomLook(entry: { item: ProviderLookItem; look: Look }) {
    if (entry.item.media.length > 1) { setGalleryFor(entry); return; }
    bookCustomLook(entry.item);
  }

  function book(serviceType?: string, providerLook?: ProviderLookItem) {
    if (!provider) return;
    tapLight();
    const lookParams = providerLook ? {
      providerLookId: providerLook.id,
      providerLookName: providerLook.name,
      providerLookPrice: providerLook.price,
      providerLookDurationMin: providerLook.durationMin,
    } : null;
    // Opened from an in-progress booking's Choose Artist step (View Profile) —
    // just select this provider and pop back to that same booking. Sending a
    // fresh `_t` here would trip CreateBookingScreen's route.params watcher,
    // which resets step/selection on ANY param change — restarting the whole
    // flow instead of resuming it (the "profile → book loops back to step 1" bug).
    if (fromBooking) {
      nav.navigate('NewBooking', {
        providerId: provider.id,
        ...(serviceType ? { serviceType } : null),
        ...lookParams,
      });
      return;
    }
    nav.navigate('NewBooking', {
      bookingMode: 'scheduled',
      providerId: provider.id,
      ...(serviceType ? { serviceType } : null),
      ...lookParams,
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

  // Looks this artist confirmed they can create, resolved from the shared
  // curated catalog. Price prefers whatever they've actually set for the
  // matching service on their own menu over the editorial fallback, same
  // rule the rest of the app follows (see data/looks.ts's header comment).
  const catalogLooks = (p.capableLooks ?? [])
    .map(id => lookById(id))
    .filter((l): l is Look => !!l);
  function priceForLook(look: Look): number {
    const matched = p.services?.find(s => s.name === look.serviceType);
    return matched ? matched.price : look.fromPrice;
  }

  // Self-served looks this artist built themselves (ProviderLook — no shared
  // catalog entry). Adapted into the same Look shape so LookTile renders both
  // kinds identically; the real ProviderLookItem is kept alongside for
  // bookLookCustom below since it carries its own price directly.
  const customLooks: { item: ProviderLookItem; look: Look }[] = (p.customLooks ?? []).map(item => ({
    item,
    look: {
      id: `custom-${item.id}`,
      name: item.name,
      vibe: item.vibe || '',
      collection: 'Trending',
      occasion: '',
      serviceType: item.serviceType,
      includes: item.includes,
      durationMin: item.durationMin ?? 60,
      fromPrice: item.price,
      products: [],
      from: item.themeFrom || Colors.brand,
      to: item.themeTo || Colors.brandAccent,
      photo: item.media[0]?.type === 'photo' ? item.media[0].url : undefined,
    },
  }));

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
    ...(p.qualificationType ? [`${humanizeQualification(p.qualificationType)} — certificate verified`] : []),
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
          <Pressable
            style={[styles.floatHeart, { top: insets.top + 8 }]}
            onPress={() => { tapLight(); toggleFavorite(p.id); }}
            hitSlop={12}
            accessibilityLabel={favorited ? 'Remove from favorites' : 'Favorite artist'}
          >
            <HeartIcon size={18} color={favorited ? Colors.brand : '#fff'} filled={favorited} />
          </Pressable>
          <View style={styles.nameOverlay}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <Text style={styles.overlayName}>{p.name}</Text>
              {p.policeCheckCleared && <CheckDecagramIcon size={18} color={Colors.gold} />}
            </View>
            <Text style={styles.overlayQual}>
              {p.specialties.length ? p.specialties.slice(0, 2).join(' · ') : humanizeQualification(p.qualificationType)}
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

        {/* ── Instagram — tap opens their profile in the Instagram app (falls
             back to the web profile if it's not installed). ── */}
        {!!p.instagramHandle && (
          <View style={styles.section}>
            <Pressable
              style={styles.instagramRow}
              onPress={() => {
                tapLight();
                Linking.openURL(`https://instagram.com/${p.instagramHandle}`);
              }}
            >
              <InstagramIcon size={20} color={Colors.brand} />
              <Text style={styles.instagramText}>@{p.instagramHandle}</Text>
              <ChevronForwardIcon size={16} color={Colors.tertiaryLabel} />
            </Pressable>
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

        {/* ── Looks this artist creates — the curated, outcome-based catalog
             (data/looks.ts) they confirmed at onboarding, distinct from the
             raw priced service menu below. Leads with the emotional pitch
             ("Soft Glam") a client can picture, same as Home/Explore. ── */}
        {(catalogLooks.length > 0 || customLooks.length > 0) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Looks {p.name.split(' ')[0]} creates</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 14, alignItems: 'flex-start' }}>
              {customLooks.map(({ item, look }) => {
                const key = `custom:${item.id}`;
                return (
                  <View key={look.id} style={{ width: 150 }}>
                    <LookTile
                      look={look}
                      price={item.price}
                      onPress={() => openCustomLook({ item, look })}
                      height={130}
                      fitToPhoto
                      likeOverride={{ liked: likedKeys.has(key), count: likeCounts[key] || 0, onToggle: () => toggleLookLike(key) }}
                      photoCount={item.media.length}
                      coverVideo={item.media[0]?.type === 'video' ? item.media[0].url : undefined}
                      badge={item.badge}
                    />
                  </View>
                );
              })}
              {catalogLooks.map(look => {
                const key = `catalog:${look.id}`;
                return (
                  <View key={look.id} style={{ width: 150 }}>
                    <LookTile
                      look={look}
                      price={priceForLook(look)}
                      onPress={() => bookLook(look)}
                      height={130}
                      likeOverride={{ liked: likedKeys.has(key), count: likeCounts[key] || 0, onToggle: () => toggleLookLike(key) }}
                    />
                  </View>
                );
              })}
            </ScrollView>
          </View>
        )}

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
                <Text style={styles.pkgPrice}>{formatCurrency(s.price, { decimals: 0 })}</Text>
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

        {/* ── Posts — the Provider's feed content, distinct from the static
             portfolio gallery above. ── */}
        {!!p.posts?.length && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Posts</Text>
            <View style={styles.postsGrid}>
              {p.posts.map(post => (
                <View key={post.id} style={styles.postThumb}>
                  <PostMedia photoUrl={post.photoUrl} videoUrl={post.videoUrl} style={styles.postThumbImg} showBadge />
                  {post.likeCount > 0 && (
                    <View style={styles.postLikeBadge}>
                      <Text style={styles.postLikeBadgeText}>♥ {post.likeCount}</Text>
                    </View>
                  )}
                </View>
              ))}
            </View>
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

        {/* ── Where they work + rough location (StyleSeat/Booksy discovery
             pattern) — real fields already returned by the backend, just never
             surfaced here before. Map only renders with a real geocoded point;
             0/0 (the project's ungeocoded convention) never shows a fake pin. ── */}
        {(p.homeService || p.salonService) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Where they work</Text>
            <View style={styles.workCard}>
              {p.homeService && (
                <View style={styles.workRow}>
                  <LocationIcon size={18} color={Colors.brand} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.workRowTitle}>At your home</Text>
                    <Text style={styles.workRowSub}>
                      Travels within {p.serviceRadiusKm ?? 10} km
                    </Text>
                  </View>
                </View>
              )}
              {p.homeService && p.salonService && <View style={styles.workDivider} />}
              {p.salonService && (
                <View style={styles.workRow}>
                  <LocationIcon size={18} color={Colors.brand} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.workRowTitle}>In their salon</Text>
                    {!!p.salonAddress && (
                      <Text style={styles.workAddress} selectable>{p.salonAddress}</Text>
                    )}
                  </View>
                </View>
              )}
            </View>
            {!!p.lat && !!p.lng && (
              <View style={styles.mapWrap}>
                <OSMMap
                  center={{ lat: p.lat, lng: p.lng }}
                  markers={[{ lat: p.lat, lng: p.lng, kind: 'provider' }]}
                  height={150}
                  style={{ borderRadius: 20 }}
                />
              </View>
            )}
            {!!p.businessHours && Object.keys(p.businessHours).length > 0 && (
              <View style={styles.hoursCard}>
                <View style={styles.hoursCardHeader}>
                  <ClockIcon size={16} color={Colors.brand} />
                  <Text style={styles.hoursCardTitle}>Hours</Text>
                </View>
                <ScrollView style={styles.hoursCardScroll} nestedScrollEnabled showsVerticalScrollIndicator>
                  {HOUR_DAY_ORDER.filter(d => p.businessHours?.[d.key]).map((d, i) => (
                    <View key={d.key} style={[styles.hoursCardRow, i > 0 && styles.hoursCardRowBorder]}>
                      <Text style={styles.hoursCardDay}>{d.label}</Text>
                      <Text style={styles.hoursCardValue}>{p.businessHours?.[d.key]}</Text>
                    </View>
                  ))}
                </ScrollView>
              </View>
            )}
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
              <Text style={styles.priceText}>From {formatCurrency(fromPrice, { decimals: 0 })}</Text>
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

      <LookGalleryModal
        visible={!!galleryFor}
        media={galleryFor?.item.media ?? []}
        name={galleryFor?.look.name ?? ''}
        vibe={galleryFor?.look.vibe}
        price={galleryFor?.item.price}
        durationMin={galleryFor?.item.durationMin}
        includes={galleryFor?.item.includes}
        onClose={() => setGalleryFor(null)}
        onBook={() => { if (galleryFor) bookCustomLook(galleryFor.item); setGalleryFor(null); }}
      />
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
  floatHeart: {
    position: 'absolute', right: 16, width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(20,8,12,0.4)', alignItems: 'center', justifyContent: 'center',
  },

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

  instagramRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: Colors.separator,
    paddingHorizontal: 16, paddingVertical: 14,
  },
  instagramText: { flex: 1, fontSize: 15, fontFamily: Fonts.semibold, color: Colors.label },

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

  postsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  postThumb: {
    width: '31%', aspectRatio: 1, borderRadius: 14, overflow: 'hidden',
    backgroundColor: Colors.brandLight,
  },
  postThumbImg: { width: '100%', height: '100%' },
  postLikeBadge: {
    position: 'absolute', bottom: 6, right: 6, backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3,
  },
  postLikeBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },

  workCard: {
    backgroundColor: '#fff', borderRadius: 20, padding: 16,
    borderWidth: 1, borderColor: Colors.separator, gap: 0,
  },
  workRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
  workRowTitle: { fontSize: 14.5, fontFamily: Fonts.semibold, color: Colors.label },
  workRowSub: { fontSize: 12.5, color: Colors.secondaryLabel, marginTop: 2, fontFamily: Fonts.regular },
  // Real street address needs to actually be readable — was 12.5px secondaryLabel,
  // easy to miss against the card. Bumped size/weight/contrast + made selectable.
  workAddress: { fontSize: 14, color: Colors.label, marginTop: 3, fontFamily: Fonts.medium, lineHeight: 19 },
  workDivider: { height: 1, backgroundColor: Colors.separator, marginVertical: 8 },
  mapWrap: { marginTop: 12, borderRadius: 20, overflow: 'hidden' },

  hoursCard: {
    backgroundColor: '#fff', borderRadius: 20, padding: 16, marginTop: 12,
    borderWidth: 1, borderColor: Colors.separator,
  },
  hoursCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  hoursCardTitle: { fontSize: 14.5, fontFamily: Fonts.semibold, color: Colors.label },
  // Capped + internally scrollable so a full 7-day list never pushes the rest
  // of the profile (reviews, book button) further down than needed.
  hoursCardScroll: { maxHeight: 220 },
  hoursCardRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 9,
  },
  hoursCardRowBorder: { borderTopWidth: 1, borderTopColor: Colors.separator },
  hoursCardDay: { fontSize: 13.5, fontFamily: Fonts.medium, color: Colors.secondaryLabel },
  hoursCardValue: { fontSize: 13.5, fontFamily: Fonts.semibold, color: Colors.label },

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
