import React, { useEffect, useState } from 'react';
import { ActivityIndicator, LayoutAnimation, Platform, Pressable, StyleSheet, Text, UIManager, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '../utils/colors';
import { apiGetProviderReviews } from '../api/client';
import { tapLight } from '../utils/haptics';
import { humanizeQualification } from '../utils/format';
import {
  StarIcon,
  ShieldCheckIcon,
  CheckCircleIcon,
  HospitalIcon,
  CardAccountDetailsIcon,
  PackageIcon,
  MedalIcon,
  TranslateIcon,
  BriefcaseAccountIcon,
  ChevronForwardIcon,
} from './CareIcons';

// LayoutAnimation needs this flag on old-arch Android for the reviews accordion
// to animate. No-op on iOS/web. Wrapped so it only runs once.
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface ProviderCreditials {
  id?: string;
  _id?: string;
  name: string;
  photoUrl?: string;
  rating?: number;
  ratingCount?: number;
  experienceYears?: number;
  jobsDone?: number;          // total completed sessions, if the caller has it
  totalSessions?: number;     // alias some endpoints use for jobsDone
  languages?: string[];
  certifications?: string[];
  specialties?: string[];
  policeCheckCleared?: boolean;
  bio?: string;
  firstAidCertified?: boolean;
  driversLicense?: boolean;
  ownTransportation?: boolean;
  qualificationType?: string;
  collegeName?: string;
  insuranceVerified?: boolean;
}

interface ProviderProfileCardProps {
  provider: ProviderCreditials;
  compact?: boolean;
  onCall?: () => void;
  onMessage?: () => void;
  onViewFullProfile?: () => void;
}

const SERVICE_SPECIALTIES: Record<string, string> = {
  'Makeup': 'Everyday, glam and HD makeup looks',
  'Bridal Makeup': 'Complete bridal looks with trial session',
  'Party Makeup': 'Event-ready glam for parties and functions',
  'Threading': 'Eyebrow shaping and facial threading',
  'Hair Styling': 'Blowouts, curls, updos and styling',
  'Hair Coloring': 'Global color, highlights and balayage',
  'Facial': 'Deep-cleansing, hydrating and glow facials',
  'Waxing': 'Full body and facial waxing',
  'Nails': 'Manicure, pedicure, gel and nail art',
  'Mehendi': 'Bridal and party henna designs',
  'Massage': 'Relaxing head, neck and body massage',
};

type Review = { rating: number; comment: string; createdAt: string; customerName: string; serviceType: string };

// ── Inline client-reviews list, lazy-loaded the first time it's expanded ────────
// Fetches from apiGetProviderReviews(providerId) → each review shows stars, comment,
// customer name, service type and date. Used inside the tappable rating section.
function ReviewsList({ providerId }: { providerId: string }) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!providerId) { setLoading(false); return; }
    let alive = true;
    apiGetProviderReviews(providerId)
      .then(r => { if (alive) { setReviews(r.reviews ?? []); setLoading(false); } })
      .catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [providerId]);

  if (loading) return <ActivityIndicator size="small" color={Colors.brand} style={{ marginTop: 16 }} />;
  if (!reviews.length) return (
    <Text style={styles.noReviews}>No client reviews yet</Text>
  );

  return (
    <View style={{ marginTop: 14, gap: 10 }}>
      {reviews.slice(0, 8).map((r, i) => (
        <View key={i} style={styles.reviewCard}>
          <View style={styles.reviewTop}>
            <Text style={styles.reviewName}>{r.customerName || 'Verified client'}</Text>
            <View style={styles.reviewStars}>
              {[1, 2, 3, 4, 5].map(n => (
                <StarIcon key={n} size={13} color={Colors.accentGold} filled={n <= Math.round(r.rating)} />
              ))}
            </View>
          </View>
          {r.comment ? <Text style={styles.reviewComment}>{r.comment}</Text> : null}
          <Text style={styles.reviewMeta}>
            {[r.serviceType, r.createdAt ? new Date(r.createdAt).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' }) : null]
              .filter(Boolean)
              .join('  ·  ')}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function ProviderProfileCard({ provider, compact = false, onCall, onMessage, onViewFullProfile }: ProviderProfileCardProps) {
  // Tapping the rating row toggles the inline client-reviews accordion.
  const [showReviews, setShowReviews] = useState(false);
  const providerId = provider.id ?? provider._id ?? '';
  const jobsDone = provider.jobsDone ?? provider.totalSessions;

  // Trust badges — CareIcons (brand-kit SVG), no emoji.
  const verifiedBadges = [
    provider.policeCheckCleared && { Icon: ShieldCheckIcon, label: 'Police Checked', color: Colors.trustGreen },
    provider.firstAidCertified && { Icon: HospitalIcon, label: 'First Aid', color: Colors.systemRed },
    provider.driversLicense && { Icon: CardAccountDetailsIcon, label: "Driver's License", color: Colors.systemBlue },
    provider.ownTransportation && { Icon: PackageIcon, label: 'Has Vehicle', color: Colors.systemPurple },
    provider.insuranceVerified && { Icon: CheckCircleIcon, label: 'Insured', color: Colors.earningsGold },
  ].filter(Boolean) as { Icon: React.ComponentType<{ size?: number; color?: string }>; label: string; color: string }[];

  function toggleReviews() {
    tapLight();
    LayoutAnimation.configureNext(LayoutAnimation.create(220, 'easeInEaseOut', 'opacity'));
    setShowReviews(s => !s);
  }

  if (compact) {
    // When a parent wraps this card in its own Pressable (e.g. BookingDetail navigates
    // to the public profile), nesting a second Pressable here created two competing tap
    // targets — taps were swallowed by the inner one and the parent's nav never fired
    // ("two buttons, doesn't work"). So: render a plain View when there's no own handler
    // and let the parent own the tap. Only self-handle when used standalone.
    const ownHandler = onViewFullProfile ? () => onViewFullProfile() : undefined;
    const CardWrapper: any = ownHandler ? Pressable : View;
    return (
      <CardWrapper style={styles.compactCard} onPress={ownHandler}>
        <View style={styles.compactLeft}>
          <Avatar photoUrl={provider.photoUrl} name={provider.name} size={48} fontSize={18} />
          <View style={styles.compactInfo}>
            <View style={styles.compactNameRow}>
              <Text style={styles.compactName} numberOfLines={1}>{provider.name}</Text>
              {provider.policeCheckCleared && (
                <View style={styles.miniVerifiedBadge}>
                  <CheckCircleIcon size={12} color="#fff" />
                </View>
              )}
            </View>
            <View style={styles.compactRatingRow}>
              <StarIcon size={13} color={Colors.accentGold} filled />
              <Text style={styles.compactRating}>{provider.rating?.toFixed(1) ?? '—'}</Text>
              <Text style={styles.compactRatingCount}>({provider.ratingCount ?? 0})</Text>
            </View>
          </View>
        </View>
        <View style={styles.compactRight}>
          <ChevronForwardIcon size={20} color={Colors.systemGray3} />
        </View>
      </CardWrapper>
    );
  }

  return (
    <View style={styles.card}>
      <LinearGradient
        colors={['#F4FBF8', '#FFFFFF']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.cardGradient}
      >
        {/* ── Header: avatar · name · verified · tappable rating ── */}
        <View style={styles.header}>
          <Avatar photoUrl={provider.photoUrl} name={provider.name} size={76} fontSize={30} ring />
          <View style={styles.headerInfo}>
            <View style={styles.nameRow}>
              <Text style={styles.name} numberOfLines={1}>{provider.name}</Text>
              {provider.policeCheckCleared && (
                <View style={styles.verifiedBadge}>
                  <ShieldCheckIcon size={12} color={Colors.trustGreen} />
                  <Text style={styles.verifiedBadgeText}>Verified</Text>
                </View>
              )}
            </View>

            {/* Tappable rating → expands client reviews. 44pt min tap target. */}
            <Pressable
              onPress={toggleReviews}
              hitSlop={8}
              style={({ pressed }) => [styles.ratingTap, pressed && { opacity: 0.6 }]}
              accessibilityRole="button"
              accessibilityLabel={`${provider.rating?.toFixed(1) ?? 'No'} star rating, ${provider.ratingCount ?? 0} reviews. Tap to ${showReviews ? 'hide' : 'see'} client reviews`}
            >
              <View style={styles.stars}>
                {[1, 2, 3, 4, 5].map(n => (
                  <StarIcon key={n} size={15} color={Colors.accentGold} filled={n <= Math.round(provider.rating ?? 0)} />
                ))}
              </View>
              <Text style={styles.ratingNum}>{provider.rating?.toFixed(1) ?? '—'}</Text>
              <Text style={styles.ratingCount}>({provider.ratingCount ?? 0})</Text>
              <Text style={styles.reviewsToggle}>{showReviews ? 'Hide reviews' : 'See reviews'}</Text>
            </Pressable>

            <Text style={styles.qualification} numberOfLines={1}>
              {humanizeQualification(provider.qualificationType) || 'Provider'}  ·  {provider.experienceYears || 0}+ yrs experience
            </Text>
          </View>
        </View>

        {/* ── Expandable client reviews (tap rating to open) ── */}
        {showReviews && (
          <View style={styles.reviewsPanel}>
            <Text style={styles.reviewsPanelTitle}>Client Reviews</Text>
            <ReviewsList providerId={providerId} />
          </View>
        )}

        {/* ── Stats strip: rating · reviews · years · jobs ── */}
        <View style={styles.statsRow}>
          <Stat value={provider.rating ? provider.rating.toFixed(1) : '—'} label="Rating" />
          <View style={styles.statDivider} />
          <Stat value={String(provider.ratingCount ?? 0)} label="Reviews" />
          <View style={styles.statDivider} />
          <Stat value={`${provider.experienceYears ?? 0}`} label="Years" />
          {jobsDone != null && (
            <>
              <View style={styles.statDivider} />
              <Stat value={String(jobsDone)} label="Jobs Done" />
            </>
          )}
        </View>

        {/* ── Trust badges ── */}
        {verifiedBadges.length > 0 && (
          <View style={styles.badgesRow}>
            {verifiedBadges.map((badge, i) => (
              <View key={i} style={[styles.badge, { backgroundColor: badge.color + '14', borderColor: badge.color + '40' }]}>
                <badge.Icon size={13} color={badge.color} />
                <Text style={[styles.badgeLabel, { color: badge.color }]}>{badge.label}</Text>
              </View>
            ))}
          </View>
        )}

        {/* ── About ── */}
        {provider.bio ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>About</Text>
            <Text style={styles.bioText}>{provider.bio}</Text>
          </View>
        ) : null}

        {/* ── Languages ── */}
        {provider.languages && provider.languages.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Languages</Text>
            <View style={styles.chipsRow}>
              {provider.languages.map((lang, i) => (
                <View key={i} style={styles.langChip}>
                  <TranslateIcon size={13} color={Colors.systemBlue} />
                  <Text style={styles.langChipText}>{lang}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ── Certifications ── */}
        {provider.certifications && provider.certifications.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Certifications</Text>
            <View style={styles.chipsRow}>
              {provider.certifications.map((cert, i) => (
                <View key={i} style={styles.certChip}>
                  <CheckCircleIcon size={13} color={Colors.trustGreen} />
                  <Text style={styles.certChipText}>{cert}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ── Care specialties ── */}
        {provider.specialties && provider.specialties.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Care Specialties</Text>
            {provider.specialties.map((specialty, i) => (
              <View key={i} style={styles.specialtyRow}>
                <View style={styles.specialtyBullet}>
                  <CheckCircleIcon size={16} color={Colors.brand} />
                </View>
                <View style={styles.specialtyContent}>
                  <Text style={styles.specialtyName}>{specialty}</Text>
                  {SERVICE_SPECIALTIES[specialty] && (
                    <Text style={styles.specialtyDesc}>{SERVICE_SPECIALTIES[specialty]}</Text>
                  )}
                </View>
              </View>
            ))}
          </View>
        )}

        {/* ── Education ── */}
        {provider.collegeName ? (
          <View style={styles.educationRow}>
            <MedalIcon size={20} color={Colors.earningsGold} />
            <View>
              <Text style={styles.educationLabel}>Education</Text>
              <Text style={styles.educationValue}>{provider.collegeName}</Text>
            </View>
          </View>
        ) : null}

        {/* ── Actions ── */}
        {(onCall || onMessage || onViewFullProfile) && (
          <View style={styles.actionsRow}>
            {onCall && (
              <Pressable style={[styles.actionBtn, styles.callBtn]} onPress={onCall}>
                <Text style={[styles.actionBtnText, { color: Colors.systemGreen }]}>Call</Text>
              </Pressable>
            )}
            {onMessage && (
              <Pressable style={[styles.actionBtn, styles.messageBtn]} onPress={onMessage}>
                <Text style={[styles.actionBtnText, { color: Colors.systemBlue }]}>Message</Text>
              </Pressable>
            )}
            {onViewFullProfile && (
              <Pressable style={[styles.actionBtn, styles.profileBtn]} onPress={onViewFullProfile}>
                <BriefcaseAccountIcon size={16} color={Colors.systemPurple} />
                <Text style={[styles.actionBtnText, { color: Colors.systemPurple }]}>Profile</Text>
              </Pressable>
            )}
          </View>
        )}
      </LinearGradient>
    </View>
  );
}

// ── Avatar with initials fallback — never renders a broken image ────────────────
function Avatar({ photoUrl, name, size, fontSize, ring }: { photoUrl?: string; name: string; size: number; fontSize: number; ring?: boolean }) {
  const [failed, setFailed] = useState(false);
  const radius = size / 2;
  const border = ring ? { borderWidth: 3, borderColor: '#E2E8F0' } : { borderWidth: 2, borderColor: '#E5E7EB' };
  if (photoUrl && !failed) {
    return (
      <Image
        source={{ uri: photoUrl }}
        style={[{ width: size, height: size, borderRadius: radius }, border]}
        contentFit="cover"
        cachePolicy="memory-disk"
        transition={150}
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <View style={[{ width: size, height: size, borderRadius: radius, backgroundColor: Colors.brand }, border, styles.avatarFallback]}>
      <Text style={[styles.avatarInitial, { fontSize }]}>{name?.[0]?.toUpperCase() ?? '?'}</Text>
    </View>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.statItem}>
      <Text style={styles.statValue} numberOfLines={1}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cardGradient: {
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    gap: 14,
    marginBottom: 16,
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    color: '#fff',
    fontWeight: '800',
  },
  headerInfo: {
    flex: 1,
    gap: 5,
    justifyContent: 'center',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  name: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.label,
    letterSpacing: -0.3,
    flexShrink: 1,
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    gap: 4,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  verifiedBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.trustGreen,
  },
  ratingTap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    minHeight: 28,
    paddingVertical: 4,        // pads tap target toward 44pt with the surrounding row
  },
  stars: {
    flexDirection: 'row',
    gap: 1,
  },
  ratingNum: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.label,
  },
  ratingCount: {
    fontSize: 12,
    color: Colors.secondaryLabel,
  },
  reviewsToggle: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.brand,
    marginLeft: 4,
  },
  qualification: {
    fontSize: 13,
    color: Colors.secondaryLabel,
  },
  reviewsPanel: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  reviewsPanelTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.secondaryLabel,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  noReviews: {
    color: Colors.secondaryLabel,
    fontSize: 13,
    marginTop: 12,
    textAlign: 'center',
  },
  reviewCard: {
    padding: 12,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  reviewTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  reviewName: {
    fontWeight: '700',
    fontSize: 13,
    color: Colors.label,
    flexShrink: 1,
  },
  reviewStars: {
    flexDirection: 'row',
    gap: 1,
  },
  reviewComment: {
    fontSize: 13,
    color: Colors.label,
    lineHeight: 18,
  },
  reviewMeta: {
    fontSize: 11,
    color: Colors.tertiaryLabel,
    marginTop: 5,
  },
  statsRow: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
  },
  statDivider: {
    width: 1,
    height: 28,
    backgroundColor: '#E5E7EB',
  },
  statValue: {
    fontSize: 17,
    fontWeight: '900',
    color: Colors.label,
    letterSpacing: -0.3,
  },
  statLabel: {
    fontSize: 10,
    color: Colors.secondaryLabel,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  badgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    gap: 5,
  },
  badgeLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.secondaryLabel,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  bioText: {
    fontSize: 14,
    color: Colors.label,
    lineHeight: 21,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  langChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 5,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  langChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.systemBlue,
  },
  certChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 5,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  certChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.trustGreen,
  },
  specialtyRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  specialtyBullet: {
    marginTop: 1,
  },
  specialtyContent: {
    flex: 1,
  },
  specialtyName: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.label,
  },
  specialtyDesc: {
    fontSize: 12,
    color: Colors.secondaryLabel,
    marginTop: 2,
  },
  educationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#F8FAFC',
    padding: 12,
    borderRadius: 10,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  educationLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.secondaryLabel,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  educationValue: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.label,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    borderRadius: 12,
    gap: 6,
    borderWidth: 1.5,
    minHeight: 44,
  },
  callBtn: {
    backgroundColor: '#F0FDF4',
    borderColor: '#A7F3D0',
  },
  messageBtn: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
  },
  profileBtn: {
    backgroundColor: '#F5F3FF',
    borderColor: '#DDD6FE',
  },
  actionBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
  // ── Compact variant ──
  compactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 12,
  },
  compactLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  compactInfo: {
    flex: 1,
    gap: 2,
  },
  compactNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  compactName: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.label,
    flexShrink: 1,
  },
  miniVerifiedBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.trustGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactRatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  compactRating: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.label,
  },
  compactRatingCount: {
    fontSize: 12,
    color: Colors.secondaryLabel,
  },
  compactRight: {
    paddingLeft: 8,
  },
});
