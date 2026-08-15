import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Image } from 'expo-image';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  useWindowDimensions,
  FlatList,
  KeyboardAvoidingView,
  LayoutAnimation,
  Modal,
  Platform,
  UIManager,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CommonActions, useNavigation, useRoute } from '@react-navigation/native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { tapLight, tapSuccess } from '../../utils/haptics';
import { humanizeQualification } from '../../utils/format';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, ServiceAccentColors } from '../../utils/colors';
import { ServiceIcon } from '../../components/ServiceIcon';
import { PinIcon, SearchIcon, CreditCardIcon, KeyIcon } from '../../components/CareIcons';
import { LocationIcon } from '../../components/TabIcons';
import { apiCreateBooking, apiGetAvailableProviders, apiNearbyProviders, apiGetFavorites, AvailableProvider } from '../../api/client';
import { useCoordsOrFallback, useLocation } from '../../context/LocationContext';
import { OSMMap, OSMMarker } from '../../components/OSMMap';
import { DEFAULT_REGION, DEFAULT_REGION_NAME } from '../../utils/region';
import { VerifyPhoneSheet } from '../../components/VerifyPhoneSheet';
import { useAuth } from '../../context/AuthContext';
import { SEED_ARTISTS } from '../../data/seedArtists';
import { formatCurrency, getCurrencySymbol } from '../../utils/format';

// Seed artists (Explore's curated showcase) shown as pickable cards here too, so
// the booking flow doesn't look empty before real Providers are onboarded — but
// they carry no real backend account, so handleBook blocks submitting against
// them (see the seed-id guard there) rather than letting checkout fail confusingly.
const SEED_AS_AVAILABLE_PROVIDERS: AvailableProvider[] = SEED_ARTISTS.map(s => ({
  _id: s.id,
  name: s.name,
  rating: s.rating ?? 0,
  ratingCount: s.ratingCount,
  lat: 0,
  lng: 0,
  qualificationType: s.qualificationType,
  photoUrl: s.photoUrl,
  experienceYears: s.experienceYears,
  specialties: s.specialties,
  bio: s.bio,
  approvedByAdmin: true,
  policeCheckCleared: s.policeCheckCleared,
  firstAidCertified: s.firstAidCertified,
  available: true,
  hasLocation: false,
  online: false,
}));

// ─── Brand tokens ───────────────────────────────────────────────────────────────
const BRAND_DARK  = Colors.brandDark;
const BRAND_MID   = Colors.brand;
const BRAND_LIGHT = Colors.brand;
const MIST        = '#E8F5EE';
const PAPER       = '#F4F1EA';
const INK         = '#1F1215';
const MUTED       = '#5A5A5A';
const BG_PAPER    = '#F8FAFC';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// Enable smooth layout transitions on Android (iOS/web have it on by default).
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}


// ─── Constants ──────────────────────────────────────────────────────────────────
const SERVICES = [
  'Makeup',
  'Bridal Makeup',
  'Party Makeup',
  'Threading',
  'Hair Styling',
  'Hair Coloring',
  'Facial',
  'Waxing',
  'Nails',
  'Mehendi',
  'Massage',
];

// Estimated duration per service — mirrors scripts/seed-catalog.js's
// BEAUTY_SERVICES durations. Used only as a scheduling estimate for artists
// billed HOURLY (who have no per-service catalog of their own); it never
// affects price, which is always the artist's hourlyRate per selection. Plain
// "Makeup" has no fixed length in reality (a natural day look and a full glam
// look take very different time), so it gets a mid-range estimate rather than
// borrowing "1 hour" for every service regardless of what it actually takes.
const SERVICE_DURATION_MIN: Record<string, number> = {
  'Makeup': 75,
  'Bridal Makeup': 180,
  'Party Makeup': 90,
  'Threading': 20,
  'Hair Styling': 60,
  'Hair Coloring': 120,
  'Facial': 60,
  'Waxing': 45,
  'Nails': 60,
  'Mehendi': 90,
  'Massage': 60,
};

const START_HOURS   = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];

function fmtHour(h: number) {
  if (h < 12) return `${h}:00 AM`;
  if (h === 12) return '12:00 PM';
  return `${h - 12}:00 PM`;
}

function fmtHourMinute(h: number, m: number) {
  const mm = String(m).padStart(2, '0');
  if (h < 12) return `${h === 0 ? 12 : h}:${mm} AM`;
  if (h === 12) return `12:${mm} PM`;
  return `${h - 12}:${mm} PM`;
}

function fmtShort(d: Date, locale: string = 'en-CA') {
  return d.toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric' });
}

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth()    === b.getMonth() &&
    a.getDate()     === b.getDate()
  );
}

function addDays(date: Date, n: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

type Step = 1 | 2 | 3 | 4;

// One service the customer has selected, carrying the chosen artist's OWN
// price and duration (from ProviderService via AvailableProvider.services).
export type SelectedService = {
  name: string;
  price: number;
  durationMin: number;
  serviceItemId?: string | null;
};

// Seed/demo artists (Explore's curated showcase) carry no real backend account.
// Single definition shared by the Services-step empty state and handleBook's
// submit guard so the two can never disagree about what counts as a demo.
function isSeedProvider(provider: { _id: string } | null): boolean {
  return !!provider && String(provider._id).startsWith('seed-');
}

// ─── Provider pricing helpers ──────────────────────────────────────────────
// Per-service catalog pricing is the primary (and normally only) model — every
// bookable service has a real price from the platform catalog or the Artist's
// own per-service rate. FALLBACK_RATE only applies if somehow neither exists
// (e.g. a brand-new Artist profile with no catalog match yet); it is a last
// resort, not a pricing model.
const FALLBACK_RATE = 40;

function providerServicePrice(provider: { services?: { name: string; price: number }[] } | null, serviceType: string): number | null {
  const svc = provider?.services?.find(s => s.name === serviceType);
  if (svc && svc.price > 0) return svc.price;
  return null;
}

// The "From $X" figure on map pins and near-me cards — the cheapest thing this
// artist can actually be booked for, mirroring how artistMenu prices them:
//   PER_SERVICE — the lowest price on their published menu.
//   HOURLY      — their hourly rate (every service bills as one hour).
// Passing a serviceType asks for that specific service's price instead.
// FALLBACK_RATE applies only when an artist has neither a rate nor a menu; it
// is a last-resort placeholder, not a pricing model.
function providerHourlyRate(
  provider: {
    services?: { name: string; price: number }[];
    pricingModel?: 'PER_SERVICE' | 'HOURLY';
    hourlyRate?: number;
  } | null,
  serviceType?: string,
): number {
  if (serviceType) {
    const svcPrice = providerServicePrice(provider, serviceType);
    if (svcPrice != null) return svcPrice;
  }

  if (provider?.pricingModel !== 'PER_SERVICE' && provider?.hourlyRate != null && provider.hourlyRate > 0) {
    return provider.hourlyRate;
  }

  const prices = (provider?.services ?? []).map(s => s.price).filter(p => p > 0);
  if (prices.length > 0) return Math.min(...prices);

  // No menu either — fall back to the artist's rate even under PER_SERVICE
  // before giving up on a real number entirely.
  if (provider?.hourlyRate != null && provider.hourlyRate > 0) return provider.hourlyRate;

  return FALLBACK_RATE;
}

// Sum of the selected line items — the listed total ONE session costs. Multiply
// by the number of selected dates at the call site for a multi-date estimate;
// the server prices each date's booking independently from the same bundle.
function servicesTotal(services: SelectedService[]): number {
  return Math.round(services.reduce((sum, s) => sum + s.price, 0) * 100) / 100;
}

function servicesDurationMin(services: SelectedService[]): number {
  return services.reduce((sum, s) => sum + s.durationMin, 0);
}

function fmtDuration(totalMin: number): string {
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

// Session end time = start + combined duration of every selected service.
function endTimeFor(start: Date, totalMin: number): Date {
  return new Date(start.getTime() + totalMin * 60 * 1000);
}

function fmtClock(d: Date, locale: string = 'en-CA'): string {
  return d.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });
}

const DAYS_HEADER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// ─── Calendar helpers ────────────────────────────────────────────────────────────
function getMonthGrid(year: number, month: number): (Date | null)[][] {
  const firstDay    = new Date(year, month, 1);
  const startDow    = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (Date | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));

  const weeks: (Date | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  const lastRow = weeks[weeks.length - 1];
  while (lastRow.length < 7) lastRow.push(null);
  return weeks;
}

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

// English copy for this screen (i18n removed — Glow is English-only).
const t = {
  headerTitle:            'Book an Artist',
  backBtn:                '‹ Back',
  stepService:            'Service',
  stepDateTime:           'Date & Time',
  stepChooseArtist:       'Choose Artist',
  stepConfirm:            'Confirm',
  sectionCareType:        'Which services would you like?',
  servicesSub:            'Tap to add as many as you like — prices are this artist\'s own.',
  noArtistMenu:           'This artist hasn\'t published a service menu yet.',
  noArtistMenuSub:        'Pick a different artist to continue.',
  // Seed/demo artists have no real backend account. Since Choose Artist is now
  // the FIRST step, say so here rather than letting the generic no-menu copy
  // send the user off to "pick a different artist" for the wrong reason.
  demoArtistMenu:         'This is a demo artist — booking isn\'t available for them yet.',
  demoArtistMenuSub:      'Please choose another artist.',
  summaryBarEmpty:        'Select at least one service',
  summaryBarCount:        (n: number) => `${n} service${n !== 1 ? 's' : ''}`,
  confirmServices:        'Services',
  confirmDuration:        'Duration',
  confirmWindow:          'Time',
  sectionAddress:         'Service address',
  addressSub:             'Where should the Artist come? Include a postal code so we can map it.',
  addressPlaceholder:     'e.g. 123 Main St',
  streetPlaceholder:      'Street address',
  unitPlaceholder:        'Floor / Apt (optional)',
  postalPlaceholder:      'Postal code (optional)',
  cityPlaceholder:        'City',
  sectionDates:           'Select date(s)',
  datesSub:               'Tap to pick up to 7 dates · starts tomorrow',
  todayNotBookable:       "Today can't be booked — bookings start tomorrow at the earliest.",
  sectionStartTime:       'Start time',
  customTime:             'Custom',
  chooseArtist:           'Choose your Artist',
  nearMe:                 'Near Me',
  browseProfiles:         'Browse Profiles',
  findingArtists:         'Finding available Artists…',
  noArtistsNearby:        'No Artists available right now.',
  tryAgain:               'Try again soon or contact us.',
  browseAll:              'Browse all Artists →',
  noArtistsNearbyMap:     'No Artists available nearby',
  noArtistsNearbyMapSub:  'Try again soon or browse profiles below.',
  viewProfile:            'View Profile',
  select:                 'Select',
  selected:               '✓ Selected',
  available:              'Available',
  sectionConfirm:         'Confirm your booking',
  confirmService:         'Service',
  confirmWhen:            'When',
  confirmWhenOnDemand:    'Today · As soon as possible',
  confirmDates:           'Date(s)',
  confirmStartTime:       'Start time',
  confirmAddress:         'Address',
  confirmEstTotal:        'Total',
  confirmDays:            (n: number) => `· ${n} day${n > 1 ? 's' : ''}`,
  paymentSection:         'Payment',
  payDebitCredit:         'Debit / Credit',
  payInterac:             'Interac',
  payInteracSub:          'Pay app',
  escrowTitle:            'Pay after your visit',
  escrowText:             'No charge in the app. You pay your Artist directly after the visit — Interac e-Transfer or cash.',
  confirmNote:            'Your Artist receives a request notification. Booking moves to Upcoming once they accept.',
  continueBtn:            'Continue',
  continueWith:           (name: string) => `Continue with ${name}`,
  confirmBtn:             (amt: number) => `Confirm · ${formatCurrency(amt)} est.`,
  collapseList:           'Collapse Artist list',
  expandList:             'Expand Artist list',
  providerAvailableNearby: (n: number) => `${n} Artist${n !== 1 ? 's' : ''} available nearby`,
  seeAll:                 'See all',
  collapse:               'Collapse',
  maxDatesAlert:          'Select up to 7 dates per booking.',
  maxDatesAlertTitle:     'Max 7 dates',
  providerRequestedTitle: 'Artist Requested',
  providerRequestedMsg:   (name: string) => `Request sent to ${name}. You'll be notified when they accept.`,
  reassignFail:           'Failed',
  bookingFailed:          'Booking Failed',
  partialSuccess:         'Partial Success',
  partialMsg:             (ok: number, fail: number) => `${ok} booking${ok !== 1 ? 's' : ''} created. ${fail} date${fail !== 1 ? 's' : ''} failed — please try booking those separately.`,
  tryAgainDefault:        'Please try again.',
  aboutSection:           'About',
  certificationsSection:  'Certifications',
  credentialsSection:     'Credentials',
  specialtiesSection:     'Specialties',
  certPoliceCheck:        'Police Check Cleared',
  certArtist:             'Artist Certificate',
  certFirstAid:           'First Aid / CPR',
  credQualification:      'Qualification',
  credCollege:            'College',
  credRegistration:       'Registration #',
  showLess:               'Show less',
  readMore:               'Read more',
  availableRate:          'Available now',
  selectForBooking:       (name: string) => `Select ${name.split(' ')[0]} for this booking`,
  youPin:                 'You',
  seeAllCollapse:         'Collapse',
  sortBy:                 'Sort',
  sortDistance:           'Distance',
  sortRating:             'Rating',
  sortPrice:              'Price',
  sortExperience:         'Experience',
  savedFilter:            'Saved',
  noSavedArtists:         'No saved artists yet — tap the heart on a profile to save one.',
  filterBtn:              'Filters',
  filtersActive:          (n: number) => `${n} filter${n !== 1 ? 's' : ''} active`,
  filtersTitle:           'Filters',
  filterVerifiedOnly:     'Verified only',
  filterServiceType:      'Service type',
  filterExperience:       'Experience level',
  filterExp0to2:          '0–2 years',
  filterExp2to5:          '2–5 years',
  filterExp5plus:         '5+ years',
  filterMinRating:        'Minimum rating',
  filterApply:            'Apply',
  filterClear:            'Clear filters',
  resultsCount:           (n: number) => `${n} Artist${n !== 1 ? 's' : ''} match your filters`,
  respondsWithin:         'Responds in <1 hour',
  cancellationPolicy:     '24h free cancellation',
};
type CreateBookingCopy = typeof t;

// ─── Star rating display ─────────────────────────────────────────────────────────
function StarRating({ rating, size = 13 }: { rating: number; size?: number }) {
  const full  = Math.floor(rating);
  const half  = rating - full >= 0.5 ? 1 : 0;
  const empty = 5 - full - half;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 1 }}>
      {Array.from({ length: full  }).map((_, i) => <Text key={`f${i}`} style={{ fontSize: size, color: '#F59E0B' }}>★</Text>)}
      {half === 1 && <Text style={{ fontSize: size, color: '#F59E0B' }}>⯨</Text>}
      {Array.from({ length: empty }).map((_, i) => <Text key={`e${i}`} style={{ fontSize: size, color: '#D1D5DB' }}>★</Text>)}
    </View>
  );
}

// ─── Provider Avatar ──────────────────────────────────────────────────────────────────
function ProviderAvatar({
  provider,
  size = 52,
  borderColor,
  borderWidth = 0,
}: {
  provider: AvailableProvider;
  size?: number;
  borderColor?: string;
  borderWidth?: number;
}) {
  const [imgError, setImgError] = useState(false);
  const hasPhoto = !!provider.photoUrl && !imgError;
  const initials = provider.name
    .split(' ')
    .slice(0, 2)
    .map(s => s[0]?.toUpperCase() ?? '')
    .join('');

  const containerStyle = {
    width: size,
    height: size,
    borderRadius: size / 2,
    borderColor: borderColor ?? 'transparent',
    borderWidth,
    overflow: 'hidden' as const,
  };

  if (hasPhoto) {
    return (
      <View style={containerStyle}>
        <Image
          source={{ uri: provider.photoUrl! }}
          style={{ width: '100%', height: '100%' }}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={150}
          onError={() => setImgError(true)}
        />
      </View>
    );
  }
  return (
    <View style={[styles.avatarFallback, containerStyle]}>
      <Text style={[styles.avatarFallbackText, { fontSize: size * 0.36 }]}>{initials}</Text>
    </View>
  );
}

// ─── Provider Profile Modal (defined outside parent — no remount issue) ───────────────
function ProviderProfileModal({
  provider,
  visible,
  onClose,
  onSelect,
}: {
  provider: AvailableProvider | null;
  visible: boolean;
  onClose: () => void;
  onSelect: (p: AvailableProvider) => void;
}) {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<any>();
  const [bioExpanded, setBioExpanded] = useState(false);

  if (!provider) return null;

  const certItems = [
    { label: 'Police Check Cleared', ok: !!provider.policeCheckCleared },
    { label: 'Artist Certificate',   ok: true /* all on platform have Provider cert */ },
    { label: 'First Aid / CPR',      ok: !!provider.firstAidCertified },
  ];

  const modalContent = (
    <View style={[modalStyles.sheet, { paddingBottom: insets.bottom + 24 }]}>
      {/* Drag handle */}
      <View style={modalStyles.handle} />

      {/* Header */}
      <View style={modalStyles.headerRow}>
        <ProviderAvatar
          provider={provider}
          size={80}
          borderColor={provider.policeCheckCleared ? BRAND_MID : '#E5E7EB'}
          borderWidth={3}
        />
        <View style={{ flex: 1, marginLeft: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={modalStyles.name}>{provider.name}</Text>
            {provider.policeCheckCleared && (
              <View style={modalStyles.verifiedBadge}>
                <Text style={modalStyles.verifiedBadgeText}>✓ Verified</Text>
              </View>
            )}
          </View>
          <Text style={modalStyles.qual}>{humanizeQualification(provider.qualificationType)}</Text>
          {/* Stats row */}
          <View style={modalStyles.statsRow}>
            {(provider.rating ?? 0) > 0 && (
              <>
                <StarRating rating={provider.rating} size={12} />
                <Text style={modalStyles.statText}>
                  {provider.rating.toFixed(1)}
                  {(provider.ratingCount ?? 0) > 0 ? ` (${provider.ratingCount})` : ''}
                </Text>
              </>
            )}
            {(provider.experienceYears ?? 0) > 0 && (
              <Text style={modalStyles.statText}>
                · {provider.experienceYears} {`yr${(provider.experienceYears ?? 0) !== 1 ? 's' : ''} exp`}
              </Text>
            )}
            {provider.distanceKm != null && (
              <Text style={modalStyles.statText}>· {provider.distanceKm} km</Text>
            )}
          </View>
        </View>
        <Pressable onPress={onClose} style={modalStyles.closeBtn} hitSlop={12}>
          <Text style={modalStyles.closeBtnText}>✕</Text>
        </Pressable>
      </View>

      {/* Same destination "Loved by clients" uses on Home — keeps the two
          "view profile" entry points in the app consistent. */}
      <Pressable
        onPress={() => { tapLight(); onClose(); nav.navigate('ProviderPublicProfile', { providerId: String(provider._id), providerName: provider.name, fromBooking: true }); }}
      >
        <Text style={modalStyles.viewFullProfile}>View full profile →</Text>
      </Pressable>

      <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: SCREEN_H * 0.55 }}>
        {/* Bio */}
        {!!provider.bio && (
          <View style={modalStyles.section}>
            <Text style={modalStyles.sectionTitle}>About</Text>
            <Text
              style={modalStyles.bioText}
              numberOfLines={bioExpanded ? undefined : 4}
            >
              {provider.bio}
            </Text>
            {(provider.bio?.length ?? 0) > 160 && (
              <Pressable onPress={() => setBioExpanded(e => !e)}>
                <Text style={modalStyles.readMore}>
                  {bioExpanded ? 'Show less' : 'Read more'}
                </Text>
              </Pressable>
            )}
          </View>
        )}

        {/* Certifications */}
        <View style={modalStyles.section}>
          <Text style={modalStyles.sectionTitle}>Certifications</Text>
          {certItems.map(c => (
            <View key={c.label} style={modalStyles.certItem}>
              <View style={[modalStyles.certIcon, { backgroundColor: c.ok ? '#DCFCE7' : '#F3F4F6' }]}>
                <Text style={{ fontSize: 12, color: c.ok ? '#166534' : '#9CA3AF' }}>
                  {c.ok ? '✓' : '✕'}
                </Text>
              </View>
              <Text style={[modalStyles.certLabel, !c.ok && { color: '#9CA3AF' }]}>
                {c.label}
              </Text>
            </View>
          ))}
        </View>

        {/* Credentials */}
        {(!!provider.collegeName || !!provider.licenseNumber) && (
          <View style={modalStyles.section}>
            <Text style={modalStyles.sectionTitle}>Credentials</Text>
            <View style={modalStyles.certItem}>
              <Text style={[modalStyles.certLabel, { color: '#6B7280' }]}>Qualification</Text>
              <Text style={[modalStyles.certLabel, { marginLeft: 'auto', fontWeight: '700' }]}>{humanizeQualification(provider.qualificationType)}</Text>
            </View>
            {!!provider.collegeName && (
              <View style={modalStyles.certItem}>
                <Text style={[modalStyles.certLabel, { color: '#6B7280' }]}>College</Text>
                <Text style={[modalStyles.certLabel, { marginLeft: 'auto', fontWeight: '700', flexShrink: 1, textAlign: 'right' }]} numberOfLines={1}>{provider.collegeName}</Text>
              </View>
            )}
            {!!provider.licenseNumber && (
              <View style={modalStyles.certItem}>
                <Text style={[modalStyles.certLabel, { color: '#6B7280' }]}>Registration #</Text>
                <Text style={[modalStyles.certLabel, { marginLeft: 'auto', fontWeight: '700' }]}>{provider.licenseNumber}</Text>
              </View>
            )}
          </View>
        )}

        {/* Specialties */}
        {(provider.specialties ?? []).length > 0 && (
          <View style={modalStyles.section}>
            <Text style={modalStyles.sectionTitle}>Specialties</Text>
            <View style={modalStyles.tagRow}>
              {(provider.specialties ?? []).map(sp => (
                <View key={sp} style={modalStyles.tag}>
                  <Text style={modalStyles.tagText}>{sp}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Availability */}
        <View style={[modalStyles.section, { flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
          <View style={modalStyles.availDot} />
          <Text style={modalStyles.availText}>Available now</Text>
        </View>
      </ScrollView>

      {/* CTA */}
      <Pressable
        style={({ pressed }) => [
          modalStyles.ctaWrap,
          pressed && { opacity: 0.88, transform: [{ scale: 0.98 }] },
        ]}
        onPress={() => { tapSuccess(); onSelect(provider); }}
      >
        <LinearGradient
          colors={[BRAND_LIGHT, BRAND_MID]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={modalStyles.cta}
        >
          <Text style={modalStyles.ctaText}>{`Select ${provider.name.split(' ')[0]} for this booking`}</Text>
        </LinearGradient>
      </Pressable>
    </View>
  );

  if (Platform.OS === 'web') {
    // On web: fixed overlay + slide-up sheet via CSS
    if (!visible) return null;
    return (
      <View style={modalStyles.webOverlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        {modalContent}
      </View>
    );
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={modalStyles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        {modalContent}
      </View>
    </Modal>
  );
}

// ─── Leaflet helpers ─────────────────────────────────────────────────────────────
declare global { interface Window { L: any } }

let leafletLoadPromise: Promise<void> | null = null;

// Loads the Leaflet script/CSS from CDN exactly once per page load. Previously
// had no onload/onerror rejection path — a blocked or slow CDN request left
// the returned Promise pending forever, so the map silently never rendered
// with no error or retry. Now rejects on failure/timeout so callers can show
// a fallback instead of hanging indefinitely.
function loadLeaflet(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.L) return Promise.resolve();
  if (leafletLoadPromise) return leafletLoadPromise;

  leafletLoadPromise = new Promise((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);

    const timeout = setTimeout(() => {
      leafletLoadPromise = null;
      reject(new Error('Leaflet script load timed out'));
    }, 10000);

    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload = () => { clearTimeout(timeout); resolve(); };
    script.onerror = () => {
      clearTimeout(timeout);
      leafletLoadPromise = null;
      reject(new Error('Leaflet script failed to load'));
    };
    document.head.appendChild(script);
  });
  return leafletLoadPromise;
}


// Deterministic jitter for Providers without coordinates (same logic as before)
// Service region centre — the map's home when neither the user nor a Provider
// has a real GPS fix, so we never fall back to a world view. Shared with every
// other screen via utils/region.ts (env-driven, not hardcoded to one city).
const REGION_LAT = DEFAULT_REGION.lat;
const REGION_LNG = DEFAULT_REGION.lng;

// A coordinate pair is "real" only when it isn't the 0/0 (or null) sentinel. The
// backend sends 0,0 — and sometimes the region centre — for Providers who haven't shared
// GPS; treating those as real is what scattered pins to null island / across the
// world and forced the map to zoom out.
function hasRealCoord(lat?: number | null, lng?: number | null): boolean {
  return lat != null && lng != null && (lat !== 0 || lng !== 0);
}

function providersWithFallbackCoords(providers: AvailableProvider[], uLat: number, uLng: number) {
  // Scatter anchor: the user if we have them, else the region centre — never 0,0.
  const baseLat = hasRealCoord(uLat, uLng) ? uLat : REGION_LAT;
  const baseLng = hasRealCoord(uLat, uLng) ? uLng : REGION_LNG;
  return providers.map((p, i) => {
    if (hasRealCoord(p.lat, p.lng)) return p;
    const hash = p.name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
    const angleDeg = (hash * 37 + i * 90) % 360;
    const angleRad = (angleDeg * Math.PI) / 180;
    const radiusDeg = 0.02 + (hash % 7) * 0.01;
    return { ...p, lat: baseLat + Math.sin(angleRad) * radiusDeg, lng: baseLng + Math.cos(angleRad) * radiusDeg };
  });
}

// CSS for selected pin pulse ring — injected once
const PULSE_CSS = `
@keyframes cn-pin-pulse {
  0%   { transform: scale(1);   opacity: 0.6; }
  50%  { transform: scale(1.5); opacity: 0.15; }
  100% { transform: scale(1);   opacity: 0.6; }
}
.cn-pin-selected-ring {
  position: absolute;
  width: 60px; height: 60px;
  border-radius: 30px;
  background: rgba(183,110,121,0.18);
  border: 2px solid rgba(183,110,121,0.35);
  top: -8px; left: -8px;
  animation: cn-pin-pulse 1.4s ease-in-out infinite;
  pointer-events: none;
}
`;

function injectPulseCSS() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('cn-pin-css')) return;
  const style = document.createElement('style');
  style.id = 'cn-pin-css';
  style.textContent = PULSE_CSS;
  document.head.appendChild(style);
}

function makeProviderPinHTML(name: string, isSelected: boolean, rate: number = 25, photoUrl?: string): string {
  const size = isSelected ? 44 : 36;
  const bg   = isSelected ? Colors.brandDark : '#fff';
  const fg   = isSelected ? '#fff' : Colors.brand;
  const border = isSelected ? Colors.brandDark : Colors.brand;
  const initial = (name[0] ?? '?').toUpperCase();
  const pulse = isSelected
    ? `<div class="cn-pin-selected-ring"></div>`
    : '';
  // Escape for safe embedding in an HTML attribute — provider names/URLs are
  // user-controlled data injected straight into a divIcon's innerHTML.
  const safeUrl = (photoUrl ?? '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const avatarInner = photoUrl
    ? `<img src="${safeUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:${size / 2}px;" onerror="this.style.display='none';this.nextSibling.style.display='flex';" />` +
      `<div style="display:none;width:100%;height:100%;align-items:center;justify-content:center;font-size:${isSelected ? 15 : 13}px;font-weight:800;color:${fg};">${initial}</div>`
    : `<div style="display:flex;width:100%;height:100%;align-items:center;justify-content:center;font-size:${isSelected ? 15 : 13}px;font-weight:800;color:${fg};">${initial}</div>`;
  return (
    `<div style="position:relative;display:flex;flex-direction:column;align-items:center;cursor:pointer;">` +
      pulse +
      `<div style="width:${size}px;height:${size}px;border-radius:${size / 2}px;background:${bg};border:2.5px solid ${border};overflow:hidden;box-shadow:0 3px 10px rgba(0,0,0,0.18);">${avatarInner}</div>` +
      `<div style="font-size:9px;font-weight:700;color:${isSelected ? Colors.brandDark : Colors.brand};margin-top:2px;">${formatCurrency(rate, { decimals: 0 })}</div>` +
      `<div style="width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:8px solid ${border};margin-top:0;"></div>` +
    `</div>`
  );
}

function GeoMapWeb({
  providers,
  selectedId,
  userLat,
  userLng,
  onPinPress,
  onViewProfile,
}: {
  providers: AvailableProvider[];
  selectedId?: string;
  userLat?: number;
  userLng?: number;
  onPinPress: (provider: AvailableProvider) => void;
  onViewProfile?: (provider: AvailableProvider) => void;
}) {
  const mapContainerRef = useRef<any>(null);
  const leafletMapRef   = useRef<any>(null);
  const markerRefs      = useRef<Record<string, any>>({});
  const infoProviderRef      = useRef<any>(null); // tracks current info card DOM element
  const [infoProvider, setInfoProvider] = useState<AvailableProvider | null>(null);
  const [mapLoadFailed, setMapLoadFailed] = useState(false);

  // Real user coords only — no hardcoded city default. When absent we center on
  // the Providers themselves (or a neutral view) and skip the "You" pin entirely
  // so we never drop a fake marker at the city centre.
  const hasUserCoords = hasRealCoord(userLat, userLng);
  const firstProvider = providers.find(p => hasRealCoord((p as any).lat, (p as any).lng)) as any;
  // Centre priority: real user GPS → first Provider with real coords → configured
  // default region (utils/region.ts). Never null, so the map can't fall back to
  // the [20,0] zoom-2 world view.
  const uLat = hasUserCoords ? (userLat as number) : (firstProvider ? firstProvider.lat : REGION_LAT);
  const uLng = hasUserCoords ? (userLng as number) : (firstProvider ? firstProvider.lng : REGION_LNG);

  // ── Init Leaflet map (web only) ───────────────────────────────────────────────
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    injectPulseCSS();
    let cancelled = false;
    loadLeaflet().then(() => {
      if (cancelled || !mapContainerRef.current || leafletMapRef.current) return;
      const L = window.L;
      if (!L) { setMapLoadFailed(true); return; }
      const map = L.map(mapContainerRef.current, {
        // zoom +/- removed — it overlapped the floating Provider info card and the
        // sheet controls. Pinch / scroll-zoom still available.
        zoomControl: false,
        scrollWheelZoom: false,
        attributionControl: false,
      }).setView([uLat, uLng], 13);
      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
      }).addTo(map);

      // "You" marker — only when we have the user's real location.
      if (hasUserCoords) {
        const userIcon = L.divIcon({
          html: `<div style="width:18px;height:18px;background:#007AFF;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 8px rgba(0,122,255,0.45);"></div>`,
          className: '',
          iconSize: [18, 18],
          iconAnchor: [9, 9],
        });
        L.marker([userLat, userLng], { icon: userIcon }).addTo(map);
      }

      leafletMapRef.current = map;
      // Leaflet measures its container on init; inside a freshly-laid-out flex box
      // that measurement can be 0 → grey/blank tiles. Recompute once the layout
      // settles so the map paints correctly.
      setTimeout(() => { if (!cancelled) map.invalidateSize(); }, 200);
    }).catch(() => {
      if (!cancelled) setMapLoadFailed(true);
    });
    return () => {
      cancelled = true;
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
        markerRefs.current = {};
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally run once on mount

  // ── Update Provider markers when providers or selectedId changes ───────────────────────
  useEffect(() => {
    if (Platform.OS !== 'web' || !leafletMapRef.current) return;
    const L = window.L;
    const map = leafletMapRef.current;
    const enriched = providersWithFallbackCoords(providers, uLat, uLng);
    const currentIds = new Set(enriched.map(p => String(p._id)));

    // Remove markers for Providers no longer in list
    Object.keys(markerRefs.current).forEach(id => {
      if (!currentIds.has(id)) {
        markerRefs.current[id].remove();
        delete markerRefs.current[id];
      }
    });

    enriched.forEach(provider => {
      const id = String(provider._id);
      const isSelected = id === selectedId;
      const html = makeProviderPinHTML(provider.name, isSelected, providerHourlyRate(provider), provider.photoUrl);
      const icon = L.divIcon({
        html,
        className: '',
        iconSize:   [isSelected ? 44 : 36, isSelected ? 68 : 56],
        iconAnchor: [isSelected ? 22 : 18, isSelected ? 68 : 56],
      });

      if (markerRefs.current[id]) {
        // Update existing marker icon (avoid full remove/add to prevent flicker)
        markerRefs.current[id].setIcon(icon);
      } else {
        // Create new marker
        const marker = L.marker([provider.lat!, provider.lng!], { icon })
          .addTo(map)
          .on('click', () => {
            setInfoProvider(prev => (prev?._id === provider._id ? null : provider));
            onPinPress(provider);
          });
        markerRefs.current[id] = marker;
      }
    });
  // onPinPress intentionally excluded — it's a stable callback from the parent
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providers, selectedId, uLat, uLng]);

  // Empty state
  if (providers.length === 0) {
    return (
      <View style={[geoMapStyles.container, { alignItems: 'center', justifyContent: 'center' }]}>
        <View style={{ marginBottom: 8 }}><SearchIcon size={28} color={Colors.brand} /></View>
        <Text style={{ fontSize: 14, fontWeight: '700', color: Colors.brandDark, textAlign: 'center' }}>
          No Artists available nearby
        </Text>
        <Text style={{ fontSize: 12, color: '#5A5A5A', marginTop: 4, textAlign: 'center', paddingHorizontal: 24 }}>
          Try again soon or browse profiles below.
        </Text>
      </View>
    );
  }

  if (Platform.OS === 'web' && mapLoadFailed) {
    return (
      <View style={[geoMapStyles.container, { alignItems: 'center', justifyContent: 'center' }]}>
        <View style={{ marginBottom: 8 }}><SearchIcon size={28} color={Colors.brand} /></View>
        <Text style={{ fontSize: 14, fontWeight: '700', color: Colors.brandDark, textAlign: 'center' }}>
          Map couldn't load
        </Text>
        <Text style={{ fontSize: 12, color: '#5A5A5A', marginTop: 4, textAlign: 'center', paddingHorizontal: 24 }}>
          Check your connection, or browse profiles below.
        </Text>
      </View>
    );
  }

  if (Platform.OS !== 'web') {
    // Native — key-free OSM/Leaflet map (no Google API key needed).
    const enriched = providersWithFallbackCoords(providers, uLat, uLng);
    const markers: OSMMarker[] = enriched.map(provider => ({
      lat: provider.lat!,
      lng: provider.lng!,
      kind: 'provider',
      label: provider.name,
      photoUrl: provider.photoUrl,
    }));
    return (
      <View style={geoMapStyles.container}>
        <OSMMap
          style={{ flex: 1 }}
          center={{ lat: uLat, lng: uLng }}
          zoom={12}
          markers={markers}
          onMarkerPress={(label) => {
            const provider = providers.find(p => p.name === label);
            if (provider) onViewProfile?.(provider);
          }}
        />
      </View>
    );
  }

  // Web: render the Leaflet map container div + floating info card overlay
  return (
    <View style={geoMapStyles.container}>
      {/* Leaflet mounts into this div */}
      <View
        ref={mapContainerRef}
        style={StyleSheet.absoluteFill}
        // @ts-ignore — web-only prop for the DOM div
        nativeID="cn-leaflet-map"
      />

      {/* Floating info card rendered as RN View on top of the Leaflet map */}
      {infoProvider && (
        <Pressable
          style={geoMapStyles.infoCard}
          // Tapping the popup card opens the Provider's full profile (pin popup was a
          // dead, non-interactive label before).
          onPress={() => { if (onViewProfile) { onViewProfile(infoProvider); } setInfoProvider(null); }}
        >
          <ProviderAvatar provider={infoProvider} size={44} borderColor={BRAND_MID} borderWidth={2} />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
              <Text style={geoMapStyles.infoName} numberOfLines={1}>{infoProvider.name}</Text>
              {infoProvider.policeCheckCleared && (
                <View style={{ backgroundColor: '#DCFCE7', borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1 }}>
                  <Text style={{ fontSize: 9, color: '#166534', fontWeight: '700' }}>✓ Verified</Text>
                </View>
              )}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
              {(infoProvider.rating ?? 0) > 0 && (
                <>
                  <StarRating rating={infoProvider.rating} size={11} />
                  <Text style={{ fontSize: 10, color: '#F59E0B', fontWeight: '700' }}>{infoProvider.rating.toFixed(1)}</Text>
                </>
              )}
              {(infoProvider.experienceYears ?? 0) > 0 && (
                <Text style={{ fontSize: 10, color: '#6B7280' }}>
                  {infoProvider.experienceYears} {`yr${(infoProvider.experienceYears ?? 0) !== 1 ? 's' : ''}`}
                </Text>
              )}
              {infoProvider.distanceKm != null && (
                <View style={geoMapStyles.infoDistBadge}>
                  <Text style={geoMapStyles.infoDistText}>{infoProvider.distanceKm} km</Text>
                </View>
              )}
            </View>
          </View>
          <Pressable
            style={geoMapStyles.infoSelectBtn}
            onPress={(e) => { e.stopPropagation?.(); onPinPress(infoProvider); setInfoProvider(null); }}
          >
            <Text style={geoMapStyles.infoSelectText}>Select →</Text>
          </Pressable>
        </Pressable>
      )}
    </View>
  );
}

// ─── Confirm row (defined outside component) ─────────────────────────────────────
function ConfirmRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={styles.confirmRow}>
      <Text style={styles.confirmLabel}>{label}</Text>
      <Text style={[styles.confirmValue, bold && styles.confirmValueBold]}>{value}</Text>
    </View>
  );
}

// ─── Browse Provider Card (defined outside component) ──────────────────────────────────
function BrowseProviderCard({
  provider,
  selected,
  onSelect,
  onViewProfile,
}: {
  provider: AvailableProvider;
  selected: boolean;
  onSelect: () => void;
  onViewProfile: () => void;
}) {
  return (
    <View style={[styles.providerBrowseCard, selected && styles.providerCardSelected]}>
      {/* Top row */}
      <View style={styles.providerBrowseTop}>
        <ProviderAvatar
          provider={provider}
          size={80}
          borderColor={provider.policeCheckCleared ? BRAND_MID : '#E5E7EB'}
          borderWidth={2}
        />
        <View style={{ flex: 1, marginLeft: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <Text style={styles.providerBrowseName}>{provider.name}</Text>
            {provider.policeCheckCleared && (
              <View style={styles.verifiedBadge}>
                <Text style={styles.verifiedBadgeText}>✓ Verified</Text>
              </View>
            )}
          </View>
          <Text style={styles.providerQual}>{humanizeQualification(provider.qualificationType)}</Text>
          {(provider.experienceYears ?? 0) > 0 && (
            <Text style={styles.providerExp}>
              {`${provider.experienceYears} yr${(provider.experienceYears ?? 0) !== 1 ? 's' : ''} experience`}
            </Text>
          )}
          <View style={styles.providerMetaRow}>
            {(provider.rating ?? 0) > 0 && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <StarRating rating={provider.rating} size={12} />
                <Text style={styles.providerRating}>
                  {provider.rating.toFixed(1)}
                  {(provider.ratingCount ?? 0) > 0 ? ` (${provider.ratingCount})` : ''}
                </Text>
              </View>
            )}
          </View>
        </View>
      </View>

      {/* Cert badges */}
      <View style={styles.certRow}>
        {provider.policeCheckCleared && (
          <View style={styles.certBadge}><Text style={styles.certBadgeText}>✓ Police Check Cleared</Text></View>
        )}
        {provider.firstAidCertified && (
          <View style={styles.certBadge}><Text style={styles.certBadgeText}>✓ First Aid / CPR</Text></View>
        )}
        <View style={styles.certBadge}><Text style={styles.certBadgeText}>✓ Artist Certificate</Text></View>
      </View>

      {/* Specialties */}
      {(provider.specialties ?? []).length > 0 && (
        <View style={styles.tagRow}>
          {(provider.specialties ?? []).slice(0, 4).map(sp => (
            <View key={sp} style={styles.tag}><Text style={styles.tagText}>{sp}</Text></View>
          ))}
        </View>
      )}

      {/* Bio */}
      {!!provider.bio && (
        <Text style={styles.providerBio} numberOfLines={2}>{provider.bio}</Text>
      )}

      {/* Trust/policy line — response time + cancellation policy build confidence pre-tap */}
      <Text style={styles.policyLine}>
        Responds in &lt;1 hour · 24h free cancellation
      </Text>

      {/* Bottom row: availability + actions */}
      <View style={styles.cardBottomRow}>
        <View style={styles.availRow}>
          <View style={styles.availDot} />
          <Text style={styles.availText}>Available</Text>
          {provider.distanceKm != null && (
            <Text style={styles.providerDistanceBrowse}>{provider.distanceKm} km</Text>
          )}
        </View>
        <View style={styles.cardActions}>
          <Pressable
            style={({ pressed }) => [styles.ghostBtn, pressed && { opacity: 0.7 }]}
            onPress={onViewProfile}
          >
            <Text style={styles.ghostBtnText}>View Profile</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.selectBtn, selected && styles.selectBtnSelected, pressed && { opacity: 0.85 }]}
            onPress={onSelect}
          >
            <Text style={[styles.selectBtnText, selected && styles.selectBtnTextSelected]}>
              {selected ? '✓ Selected' : 'Select'}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

// ─── Near Me Provider card — Uber-style horizontal bottom-sheet card ──────────────────
function NearMeProviderCard({
  provider,
  selected,
  onSelect,
  onViewProfile,
  fullWidth,
}: {
  provider: AvailableProvider;
  selected: boolean;
  onSelect: () => void;
  onViewProfile: () => void;
  fullWidth?: boolean;
}) {
  return (
    <Pressable
      style={({ pressed }) => [nearStyles.card, fullWidth && { width: '100%' }, selected && nearStyles.cardSelected, pressed && { opacity: 0.92 }]}
      onPress={onSelect}
    >
      {/* Left + centre: avatar, name, qualification, rating, badges — tapping
          this section opens the Provider's full profile (matches "tap name/card to
          view profile" expectation). Selecting stays on the explicit ✓ button
          and the surrounding card Pressable. */}
      <Pressable
        style={{ flexDirection: 'row', flex: 1 }}
        onPress={e => { e.stopPropagation(); onViewProfile(); }}
      >
        {/* Online dot — green only when the Provider is genuinely online now
            (available + seen recently); grey otherwise so it stops lying. */}
        <View style={{ position: 'relative', marginRight: 12 }}>
          <ProviderAvatar provider={provider} size={60} borderColor={selected ? BRAND_MID : '#E0E0E0'} borderWidth={selected ? 2.5 : 1.5} />
          <View style={[nearStyles.onlineDot, !provider.online && nearStyles.offlineDot]} />
        </View>

        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
            <Text style={nearStyles.name} numberOfLines={1}>{provider.name}</Text>
            {selected && (
              <View style={nearStyles.selectedBadge}>
                <Text style={nearStyles.selectedBadgeText}>✓ Selected</Text>
              </View>
            )}
          </View>
          <Text style={nearStyles.qual} numberOfLines={1}>{provider.qualificationType ? humanizeQualification(provider.qualificationType) : 'Beauty Artist'}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 5, flexWrap: 'wrap' }}>
            {provider.distanceKm != null && (
              <View style={nearStyles.distBadge}>
                {/* Brand PinIcon replaces the 📍 emoji (distance VALUE unchanged). */}
                <PinIcon size={12} color="#9C5560" />
                <Text style={nearStyles.distText}>{provider.distanceKm} km</Text>
              </View>
            )}
            {(provider.rating ?? 0) > 0 && (
              <View style={nearStyles.ratingBadge}>
                <Text style={nearStyles.ratingText}>★ {provider.rating.toFixed(1)}</Text>
              </View>
            )}
            <Text style={nearStyles.rate}>From {formatCurrency(providerHourlyRate(provider), { decimals: 0 })}</Text>
          </View>
          {(provider.specialties ?? []).length > 0 && (
            <View style={{ flexDirection: 'row', gap: 5, marginTop: 6, flexWrap: 'wrap' }}>
              {(provider.specialties ?? []).slice(0, 2).map(sp => (
                <View key={sp} style={nearStyles.tag}><Text style={nearStyles.tagText}>{sp}</Text></View>
              ))}
            </View>
          )}
        </View>
      </Pressable>

      {/* Right: profile + select buttons */}
      <View style={{ gap: 8, marginLeft: 8, alignItems: 'center' }}>
        <Pressable
          style={({ pressed }) => [nearStyles.profileBtn, pressed && { opacity: 0.7 }]}
          onPress={e => { e.stopPropagation(); onViewProfile(); }}
          hitSlop={8}
        >
          <Text style={nearStyles.profileBtnText}>View Profile</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [nearStyles.selectBtn, selected && nearStyles.selectBtnSel, pressed && { opacity: 0.85 }]}
          onPress={e => { e.stopPropagation(); onSelect(); }}
        >
          <Text style={[nearStyles.selectBtnText, selected && nearStyles.selectBtnTextSel]}>
            {selected ? '✓' : 'Select'}
          </Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

// ─── Filters Modal (defined outside parent — no remount issue) ──────────────────
function FiltersModal({
  visible,
  onClose,
  t,
  services,
  filterVerifiedOnly,
  setFilterVerifiedOnly,
  filterMinExp,
  setFilterMinExp,
  filterMinRating,
  setFilterMinRating,
  filterServices,
  toggleFilterService,
  clearFilters,
}: {
  visible: boolean;
  onClose: () => void;
  t: CreateBookingCopy;
  services: string[];
  filterVerifiedOnly: boolean;
  setFilterVerifiedOnly: (v: boolean) => void;
  filterMinExp: 0 | 2 | 5;
  setFilterMinExp: (v: 0 | 2 | 5) => void;
  filterMinRating: number;
  setFilterMinRating: (v: number) => void;
  filterServices: string[];
  toggleFilterService: (s: string) => void;
  clearFilters: () => void;
}) {
  const insets = useSafeAreaInsets();
  if (!visible) return null;

  const content = (
    <View style={[filterStyles.sheet, { paddingBottom: insets.bottom + 24 }]}>
      <View style={filterStyles.handle} />
      <View style={filterStyles.headerRow}>
        <Text style={filterStyles.title}>{t.filtersTitle}</Text>
        <Pressable onPress={onClose} hitSlop={12}>
          <Text style={filterStyles.closeBtn}>✕</Text>
        </Pressable>
      </View>

      <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
        {/* Verified only */}
        <Pressable
          style={filterStyles.toggleRow}
          onPress={() => { tapLight(); setFilterVerifiedOnly(!filterVerifiedOnly); }}
        >
          <Text style={filterStyles.toggleLabel}>{t.filterVerifiedOnly}</Text>
          <View style={[filterStyles.checkbox, filterVerifiedOnly && filterStyles.checkboxOn]}>
            {filterVerifiedOnly && <Text style={filterStyles.checkboxTick}>✓</Text>}
          </View>
        </Pressable>

        {/* Experience */}
        <Text style={filterStyles.label}>{t.filterExperience}</Text>
        <View style={filterStyles.chipRow}>
          {([
            { v: 0 as const, label: t.filterExp0to2 },
            { v: 2 as const, label: t.filterExp2to5 },
            { v: 5 as const, label: t.filterExp5plus },
          ]).map(opt => (
            <Pressable
              key={opt.v}
              style={[filterStyles.chip, filterMinExp === opt.v && filterStyles.chipActive]}
              onPress={() => { tapLight(); setFilterMinExp(filterMinExp === opt.v ? 0 : opt.v); }}
            >
              <Text style={[filterStyles.chipText, filterMinExp === opt.v && filterStyles.chipTextActive]}>{opt.label}</Text>
            </Pressable>
          ))}
        </View>

        {/* Min rating */}
        <Text style={filterStyles.label}>{t.filterMinRating}</Text>
        <View style={filterStyles.chipRow}>
          {[3.5, 4.0, 4.5].map(r => (
            <Pressable
              key={r}
              style={[filterStyles.chip, filterMinRating === r && filterStyles.chipActive]}
              onPress={() => { tapLight(); setFilterMinRating(filterMinRating === r ? 0 : r); }}
            >
              <Text style={[filterStyles.chipText, filterMinRating === r && filterStyles.chipTextActive]}>★ {r.toFixed(1)}+</Text>
            </Pressable>
          ))}
        </View>

        {/* Service type */}
        <Text style={filterStyles.label}>{t.filterServiceType}</Text>
        <View style={filterStyles.chipRow}>
          {services.map(s => (
            <Pressable
              key={s}
              style={[filterStyles.chip, filterServices.includes(s) && filterStyles.chipActive]}
              onPress={() => { tapLight(); toggleFilterService(s); }}
            >
              <Text style={[filterStyles.chipText, filterServices.includes(s) && filterStyles.chipTextActive]}>{s}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      <View style={filterStyles.footerRow}>
        <Pressable style={filterStyles.clearBtn} onPress={() => { tapLight(); clearFilters(); }}>
          <Text style={filterStyles.clearBtnText}>{t.filterClear}</Text>
        </Pressable>
        <Pressable style={filterStyles.applyBtn} onPress={() => { tapLight(); onClose(); }}>
          <Text style={filterStyles.applyBtnText}>{t.filterApply}</Text>
        </Pressable>
      </View>
    </View>
  );

  if (Platform.OS === 'web') {
    return (
      <View style={filterStyles.webOverlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        {content}
      </View>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={filterStyles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        {content}
      </View>
    </Modal>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────────
export function CreateBookingScreen() {
  const nav    = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const locale = 'en-CA';
  const STEP_LABELS_SCHEDULED = [t.stepChooseArtist, t.stepService, t.stepDateTime, t.stepConfirm];
  // Preselected-artist scheduled bookings skip the Choose Artist step (see goNext),
  // so its pill is dropped from the progress row too — it was never visited.
  const STEP_LABELS_SCHEDULED_PRESELECTED = [t.stepService, t.stepDateTime, t.stepConfirm];
  const STEP_LABELS_ONDEMAND  = [t.stepChooseArtist, t.stepService, t.stepConfirm];
  const STEP_LABELS_ONDEMAND_PRESELECTED = [t.stepService, t.stepConfirm];
  // `coords` keeps a fallback so the nearby-Provider search still returns local
  // results even before the user grants GPS. `realCoords` is null until we have
  // the device's actual location — used for the map's "You" pin so we never
  // drop a fake marker on a default city.
  const coords = useCoordsOrFallback();
  const { coords: realCoords, requestLocation } = useLocation();
  const route  = useRoute<any>();
  const { user } = useAuth();
  const [showVerifySheet, setShowVerifySheet] = useState(false);

  const initService = route.params?.serviceType ?? '';
  const initMode    = (route.params?.bookingMode ?? 'scheduled') as 'ondemand' | 'scheduled';
  // An artist was explicitly chosen before entering this screen (Glow Match,
  // artist profile "Book" button) — booking should stay a confirm of that
  // choice, not route back through the general provider-search step.
  const hasPreselectedProvider = !!route.params?.providerId;

  // Preselected-artist entries (Home's Loved-by-clients, a post's chip, Find My
  // Glow, an artist profile's Book button) already chose the artist — start
  // directly on Services (slot 2), same fast-path behaviour as before, just at
  // a different slot now that Choose Artist moved to slot 1.
  const [step,          setStep]          = useState<Step>(hasPreselectedProvider ? 2 : 1);
  const [bookingMode,   setBookingMode]   = useState<'ondemand' | 'scheduled'>(initMode);
  // Multi-select: one entry per service the customer has chosen from THIS
  // artist's menu. `initService` (a bare name from a Home category card / post
  // chip) can't be priced until an artist is chosen, so it's held here and
  // applied by the artist-menu effect below once the menu loads.
  const [selectedServices, setSelectedServices] = useState<SelectedService[]>([]);
  const [pendingServiceName, setPendingServiceName] = useState<string>(initService);
  // "Book this look" on a specific artist-owned ProviderLook (LookGalleryModal /
  // ProviderPublicProfileScreen) — unlike pendingServiceName, this already has a
  // real price/duration the artist set themselves, so it doesn't need the
  // artist's menu to resolve; it's injected as-is below. Snapshotted once from
  // route params (doesn't change through the flow, so no setter needed).
  const [pendingProviderLook, setPendingProviderLook] = useState<{ id: string; name: string; price: number; durationMin: number | null } | null>(() => {
    const id = route.params?.providerLookId as string | undefined;
    if (!id) return null;
    return {
      id,
      name: (route.params?.providerLookName as string) || 'Look',
      price: Number(route.params?.providerLookPrice) || 0,
      durationMin: route.params?.providerLookDurationMin != null ? Number(route.params.providerLookDurationMin) : null,
    };
  });
  // Structured address — captured as discrete fields so we always collect a full,
  // geocodable address (incl. postal code) instead of a single short free-text line.
  const [street,        setStreet]        = useState('');
  const [unit,          setUnit]          = useState('');
  // No default city — a stale hardcoded city name here would silently submit
  // the wrong address if a customer didn't notice and overwrite it.
  const [city,          setCity]          = useState('');
  const [postal,        setPostal]        = useState('');
  const [geocoding,     setGeocoding]     = useState(false);
  const [locatingAddress, setLocatingAddress] = useState(false);
  // Combined, human-readable address string sent to the backend + shown on the booking.
  const address = [street.trim(), unit.trim() ? `Unit ${unit.trim()}` : '', city.trim(), postal.trim().toUpperCase()]
    .filter(Boolean)
    .join(', ');
  const [selectedDates, setSelectedDates] = useState<Date[]>([]);
  const [startHour,     setStartHour]     = useState(9);
  const [startMinute,   setStartMinute]   = useState(0);
  const [customTimeOpen, setCustomTimeOpen] = useState(false);
  const [providers,          setProviders]          = useState<AvailableProvider[]>([]);
  const [selectedProvider,   setSelectedProvider]   = useState<AvailableProvider | null>(null);
  const [proposedPrice,      setProposedPrice]      = useState<string>('');

  // The chosen artist's bookable menu, which depends on their pricing model
  // (mirrors resolveBookingServices in src/utils/bookingServices.js):
  //
  //   PER_SERVICE — their own published ProviderService rows. Never the
  //     hardcoded SERVICES list; that's a platform catalog, not a promise that
  //     THIS artist offers any of it.
  //
  //   HOURLY (the ProviderProfile default, and the common case) — the artist
  //     sells time, not individually-priced named services, so there is no
  //     catalog to list. Synthesise the menu from the platform's standard
  //     SERVICES list, each billed as one hour at their hourlyRate. Multi-select
  //     still works and sums normally; the backend prices it identically.
  //
  // An empty menu means the artist genuinely can't be booked yet (no rate and
  // no catalog), which the Services step surfaces explicitly.
  const artistMenu: SelectedService[] = React.useMemo(() => {
    if (!selectedProvider) return [];

    const published = (selectedProvider.services ?? [])
      .filter(s => s.price > 0)
      .map(s => ({ name: s.name, price: s.price, durationMin: s.durationMin }));

    if (selectedProvider.pricingModel === 'PER_SERVICE') return published;

    const rate = selectedProvider.hourlyRate;
    if (rate != null && rate > 0) {
      return SERVICES.map(name => ({ name, price: rate, durationMin: SERVICE_DURATION_MIN[name] ?? 60 }));
    }

    // No usable hourly rate: fall back to anything they did publish rather
    // than dead-ending an artist who has a catalog but an unset rate.
    return published;
  }, [selectedProvider]);

  function toggleService(svc: SelectedService) {
    tapLight();
    setSelectedServices(prev =>
      prev.some(s => s.name === svc.name)
        ? prev.filter(s => s.name !== svc.name)
        : [...prev, svc],
    );
  }

  const totalPriceOneSession = servicesTotal(selectedServices);
  const totalDurationMin     = servicesDurationMin(selectedServices);

  // Real validation for the price-negotiation offer, matching the screen's
  // own stated "±50% of the listed price" claim. `parsedProposedPrice` is
  // NaN for empty/non-numeric input — every check below correctly rejects
  // NaN via the comparisons (NaN comparisons are always false), so an empty
  // field just isn't "valid" on its own; canNext separately treats an empty
  // field as "no offer, not blocking" rather than "invalid offer."
  const parsedProposedPrice = Number(proposedPrice);
  function isProposedPriceValid(): boolean {
    if (!Number.isFinite(parsedProposedPrice) || parsedProposedPrice <= 0) return false;
    const listed = servicesTotal(selectedServices);
    if (listed <= 0) return true; // no listed price to compare against — can't range-check
    // Offers at or above listed price are allowed (Glow doesn't control final
    // price either way) — the 50% floor is only anti-lowball noise reduction.
    // Negotiation is against the SUMMED total, never per line item.
    return parsedProposedPrice >= listed * 0.5;
  }
  function proposedPriceErrorMsg(): string {
    if (!Number.isFinite(parsedProposedPrice) || parsedProposedPrice <= 0) {
      return 'Enter a valid amount.';
    }
    const listed = servicesTotal(selectedServices);
    return `Offer must be at least ${formatCurrency(Math.round(listed * 0.5), { decimals: 0 })}.`;
  }

  // A service name arrived via route params (Home category card, occasion card,
  // a post's service chip) BEFORE any artist was chosen, so it had no price.
  // Once this artist's menu is available, promote it to a real selection if
  // they actually offer it — otherwise silently drop it rather than booking a
  // service the artist doesn't provide.
  useEffect(() => {
    if (!pendingServiceName) return;
    // A "Book this look" entry sends serviceType too (open-pool artist-sort
    // preference only — see the matchTier comment below), not as a second
    // thing to also select — the look above is the whole booking, and
    // promoting BOTH double-counts one visit as two separate line items.
    if (pendingProviderLook) { setPendingServiceName(''); return; }
    if (artistMenu.length === 0) return;
    const match = artistMenu.find(s => s.name === pendingServiceName);
    if (match) setSelectedServices(prev => (prev.some(s => s.name === match.name) ? prev : [...prev, match]));
    setPendingServiceName('');
  }, [pendingServiceName, artistMenu, pendingProviderLook]);

  // A ProviderLook already carries its own real price/duration (the artist set
  // it themselves) — inject it straight into the summary/review UI so what the
  // customer sees while booking matches what resolveProviderLookBooking will
  // actually charge server-side, instead of showing $0 or nothing until submit.
  useEffect(() => {
    if (!pendingProviderLook) return;
    setSelectedServices(prev => (prev.some(s => s.name === pendingProviderLook.name)
      ? prev
      : [...prev, { name: pendingProviderLook.name, price: pendingProviderLook.price, durationMin: pendingProviderLook.durationMin ?? 60 }]));
  }, [pendingProviderLook]);

  // Switching artists invalidates every selection — the prices and durations
  // belonged to the previous artist's menu. Keep only services the new artist
  // also offers, re-priced at THEIR rate. A pending look-based selection is the
  // one exception: it isn't drawn from any artist's menu (its price/duration
  // come straight from the ProviderLook row above), so name-matching against
  // artistMenu would always wipe it the moment selectedProvider first resolves.
  const prevProviderIdRef = useRef<string | null>(null);
  useEffect(() => {
    const id = selectedProvider ? String(selectedProvider._id) : null;
    if (prevProviderIdRef.current === id) return;
    prevProviderIdRef.current = id;
    setSelectedServices(prev =>
      prev
        .map(sel => sel.name === pendingProviderLook?.name ? sel : artistMenu.find(m => m.name === sel.name))
        .filter((s): s is SelectedService => !!s),
    );
  }, [selectedProvider, artistMenu, pendingProviderLook]);

  const [loading,       setLoading]       = useState(false);
  const [loadingProviders,   setLoadingProviders]   = useState(false);
  const [providerMode,       setProviderMode]       = useState<'near' | 'browse'>('near');
  // ─── Sort & Filter (Browse Profiles mode) ───────────────────────────────────
  const [sortBy,        setSortBy]        = useState<'distance' | 'rating' | 'price' | 'experience'>('distance');
  const [filterVerifiedOnly, setFilterVerifiedOnly] = useState(false);
  const [filterMinExp,  setFilterMinExp]  = useState<0 | 2 | 5>(0); // min years bucket
  const [filterMinRating, setFilterMinRating] = useState(0);
  const [filterServices, setFilterServices] = useState<string[]>([]);
  const [filtersVisible, setFiltersVisible] = useState(false);
  const [favoriteIds,   setFavoriteIds]   = useState<Set<string>>(new Set());
  const [filterSavedOnly, setFilterSavedOnly] = useState(false);
  const activeFilterCount =
    (filterVerifiedOnly ? 1 : 0) +
    (filterMinExp > 0 ? 1 : 0) +
    (filterMinRating > 0 ? 1 : 0) +
    (filterServices.length > 0 ? 1 : 0);
  function clearFilters() {
    setFilterVerifiedOnly(false);
    setFilterMinExp(0);
    setFilterMinRating(0);
    setFilterServices([]);
  }
  function toggleFilterService(s: string) {
    setFilterServices(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);
  }
  const visibleProviders = providers
    .filter(p => !filterVerifiedOnly || !!p.policeCheckCleared)
    .filter(p => filterMinExp === 0 || (p.experienceYears ?? 0) >= filterMinExp)
    .filter(p => filterMinRating === 0 || (p.rating ?? 0) >= filterMinRating)
    .filter(p => filterServices.length === 0 || (p.specialties ?? []).some(sp => filterServices.includes(sp)))
    .filter(p => !filterSavedOnly || favoriteIds.has(String(p._id)))
    .slice()
    .sort((a, b) => {
      if (sortBy === 'rating')     return (b.rating ?? 0) - (a.rating ?? 0);
      if (sortBy === 'experience') return (b.experienceYears ?? 0) - (a.experienceYears ?? 0);
      if (sortBy === 'price')      return 0; // flat rate — no-op, kept for UX parity
      return (a.distanceKm ?? 99) - (b.distanceKm ?? 99);
    });
  const [nearExpanded,  setNearExpanded]  = useState(false); // Near Me sheet: full-height list vs peek
  // Reactive viewport height — the module-level Dimensions.get() value is stale on
  // web (can read 0 / pre-layout), which made the sheet compute an off-screen size
  // and vanish. useWindowDimensions updates correctly on web + native.
  const { height: winH } = useWindowDimensions();
  const VH = winH > 0 ? winH : SCREEN_H;          // guard against a 0 first read
  // The sheet is bottom-anchored and ALWAYS visible. We animate its HEIGHT between
  // a peek (a couple of cards) and full. Bottom-anchored height is bulletproof on
  // web — no transforms that can push it off-screen.
  const PEEK_HEIGHT = 300;
  // Leave a clear band at the top (~insets.top + the floating Near Me/Browse
  // toggle + breathing room) so the expanded sheet header never slides under the
  // toggle. Cap to 72% as well so there's always visible map above.
  const TOP_RESERVE = (insets.top || 12) + 72;
  const FULL_HEIGHT = Math.max(PEEK_HEIGHT, Math.min(VH * 0.72, VH - TOP_RESERVE));
  const sheetAnim = useRef(new Animated.Value(0)).current; // 0 = peek, 1 = full
  useEffect(() => {
    Animated.timing(sheetAnim, {
      toValue: nearExpanded ? 1 : 0,
      duration: 300,
      useNativeDriver: false, // animating height
    }).start();
  }, [nearExpanded, sheetAnim]);
  const sheetHeight = sheetAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [PEEK_HEIGHT, FULL_HEIGHT],
  });

  // Main scroll + step-1 address section position (for scroll-to-missing-field)
  const mainScrollRef = useRef<ScrollView>(null);
  const addressYRef   = useRef(0);
  useEffect(() => {
    mainScrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [step]);

  // Profile modal
  const [profileProvider,    setProfileProvider]    = useState<AvailableProvider | null>(null);
  const [profileVisible, setProfileVisible] = useState(false);

  // Near Me: highlighted pin (for map <-> card sync)
  const [highlightedId, setHighlightedId] = useState<string | undefined>();
  const hScrollRef = useRef<FlatList<AvailableProvider>>(null);

  // Calendar navigation
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const minSelectDate = addDays(today, 1);
  const maxSelectDate = addDays(today, 90);

  // Open the calendar on the FIRST bookable month. At month-end (e.g. May 30,
  // earliest booking May 31) the current month is almost entirely past — show
  // the month that actually contains selectable dates so it isn't a dead grid.
  const [calYear,  setCalYear]  = useState(minSelectDate.getFullYear());
  const [calMonth, setCalMonth] = useState(minSelectDate.getMonth());

  const canNext =
    // Slot 1 — Choose Artist
    step === 1 ? !!selectedProvider :
    // Slot 2 — Services (>= 1) + address
    step === 2 ? (selectedServices.length > 0 && street.trim().length > 2) :
    // Slot 3 — Date & Time
    step === 3 ? selectedDates.length > 0 :
    // Slot 4 (Confirm): only blocked by an out-of-range/invalid price offer
    // when negotiation is actually visible and the customer typed something.
    // An empty proposedPrice means "no offer" — that's valid, not a gate.
    (proposedPrice.trim() === '' || isProposedPriceValid());

  // React Navigation reuses mounted tab screens — params change but useState doesn't re-init.
  // Watch route.params and sync serviceType + bookingMode whenever they change.
  const prevParamsRef = useRef<any>(null);
  useEffect(() => {
    const params = route.params as any;
    if (!params) return;
    const changed = JSON.stringify(params) !== JSON.stringify(prevParamsRef.current);
    if (!changed) return;
    const prevT = prevParamsRef.current?._t;
    prevParamsRef.current = params;
    if (params.serviceType) setPendingServiceName(params.serviceType);
    // Re-arm on every params change (not just mount) — the `_t` reset block
    // right below this clears selectedServices, including whatever the LAST
    // run of this effect already injected, and this state's own promotion
    // effect only re-fires when its object reference changes, so it has to
    // get a fresh one here to recover from that reset.
    if (params.providerLookId) {
      setPendingProviderLook({
        id: params.providerLookId,
        name: params.providerLookName || 'Look',
        price: Number(params.providerLookPrice) || 0,
        durationMin: params.providerLookDurationMin != null ? Number(params.providerLookDurationMin) : null,
      });
    }
    if (params.bookingMode) setBookingMode(params.bookingMode as 'ondemand' | 'scheduled');
    // Reassign: the booking already exists, so we only need to pick a Provider.
    // Use on-demand mode (no date step) and keep the preset service.
    if (params.reassignBookingId) setBookingMode('ondemand');
    // A fresh `_t` means "start a new booking" (Home category cards, occasion
    // cards, Find My Glow, a post's service chip) — reset to step 1. Without a
    // new `_t` (e.g. returning here from a "View Profile" detour with a
    // provider now selected), this is the SAME booking resuming, not a new
    // one — resetting here was the "profile → book loops back to step 1" bug.
    if (params._t && params._t !== prevT) {
      setStep(hasPreselectedProvider ? 2 : 1);
      setSelectedProvider(null);
      setSelectedServices([]);
      setSelectedDates([]);
      setStreet('');
      setUnit('');
      setPostal('');
    }
  }, [route.params]);

  useEffect(() => {
    // Choose Artist is slot 1, so the artist list loads on mount for every
    // booking (not gated on reaching a later step), and also loads whenever
    // hasPreselectedProvider is true so the preselect is already resolved by
    // the time goNext() decides whether to skip the provider-picking step.
    if (step !== 1 && !hasPreselectedProvider) return;
    // Set Provider mode default based on booking mode
    setProviderMode(bookingMode === 'ondemand' ? 'near' : 'browse');
    setLoadingProviders(true);
    apiGetFavorites()
      .then(res => setFavoriteIds(new Set((res.providers ?? []).map(p => String(p.id)))))
      .catch(() => setFavoriteIds(new Set()));
    Promise.all([
      apiGetAvailableProviders().catch(() => ({ count: 0, providers: [] as AvailableProvider[] })),
      apiNearbyProviders(coords.lat, coords.lng).catch(() => ({ providers: [] as any[] })),
    ]).then(([available, nearby]) => {
      const distMap: Record<string, number> = {};
      (nearby.providers ?? []).forEach((n: any) => {
        distMap[String(n.id ?? n._id)] = n.distanceKm ?? 99;
      });
      const merged = (available.providers ?? []).map(p => ({
        ...p,
        distanceKm: distMap[String(p._id)] ?? undefined,
      }));
      // "Book this look" (LookSheet) arrives with a lookId — artists who
      // confirmed that specific look during onboarding float above everyone
      // else, then artists whose specialties match the underlying service
      // type, before falling back to distance. Mirrors notifyNearbyProviders'
      // isQualified in src/routes/customer.js (capableLooks match OR
      // specialty match — not lookId-exclusive, since almost no artist has
      // confirmed any specific look yet) so the order shown here doesn't
      // imply a preference the backend wouldn't actually honor. Nobody is
      // hidden: an artist matching neither just sorts by distance like before.
      const lookId = (route.params as any)?.lookId as string | undefined;
      const lookServiceType = (route.params as any)?.serviceType as string | undefined;
      const matchTier = (p: typeof merged[number]) => {
        if (lookId && p.capableLooks?.includes(lookId)) return 2;
        if (lookServiceType && p.specialties?.includes(lookServiceType)) return 1;
        return 0;
      };
      const sorted = [...merged].sort((a, b) => {
        if (lookId || lookServiceType) {
          const diff = matchTier(b) - matchTier(a);
          if (diff !== 0) return diff;
        }
        return (a.distanceKm ?? 99) - (b.distanceKm ?? 99);
      });
      // Seed artists trail real Providers — they're a demo showcase, never the
      // default/preselected choice, and never eligible for the preferId float below.
      const withSeed = [...sorted, ...SEED_AS_AVAILABLE_PROVIDERS];
      // Glow Match / artist-profile entry: a specific artist was already chosen —
      // float them to the top and preselect so booking stays a confirm, not a search.
      const preferId = (route.params as any)?.providerId as string | undefined;
      const preferred = preferId ? sorted.find(p => String(p._id) === String(preferId)) : undefined;
      if (preferred) {
        setProviders([preferred, ...withSeed.filter(p => p !== preferred)]);
        setSelectedProvider(preferred);
        setProviderMode('browse');
      } else {
        setProviders(withSeed);
      }
    }).finally(() => setLoadingProviders(false));
  }, [step, hasPreselectedProvider]);

  function toggleDate(d: Date) {
    if (d < minSelectDate || d > maxSelectDate) return;
    tapLight();
    setSelectedDates(prev => {
      if (prev.some(p => sameDay(p, d))) return prev.filter(p => !sameDay(p, d));
      if (prev.length >= 7) {
        if (Platform.OS === 'web') {
          window.alert(t.maxDatesAlert);
        } else {
          Alert.alert(t.maxDatesAlertTitle, t.maxDatesAlert);
        }
        return prev;
      }
      return [...prev, d].sort((a, b) => a.getTime() - b.getTime());
    });
  }

  function prevMonth() {
    tapLight();
    // Smooth grid swap (cross-platform: iOS/web on by default, Android enabled above).
    LayoutAnimation.configureNext(LayoutAnimation.create(180, 'easeInEaseOut', 'opacity'));
    if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); }
    else setCalMonth(m => m - 1);
  }

  function nextMonth() {
    tapLight();
    LayoutAnimation.configureNext(LayoutAnimation.create(180, 'easeInEaseOut', 'opacity'));
    if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); }
    else setCalMonth(m => m + 1);
  }

  // Reverse-geocodes the device's current GPS position into the structured
  // address fields (street/city/postal). Pure convenience prefill — every
  // field it touches stays a normal controlled TextInput, so the customer can
  // freely edit over any of them afterward. requestLocation() resolves with
  // the freshly-fetched coords directly (see LocationContext), so there's no
  // need to guess when to re-read the reactive `realCoords` after a permission
  // prompt — we just use whatever this call resolves with.
  async function autofillFromCurrentLocation() {
    setLocatingAddress(true);
    try {
      const useCoords = realCoords ?? await requestLocation();
      if (!useCoords) {
        Alert.alert('Location unavailable', 'Could not get your current location. Please enter your address manually.');
        return;
      }

      // expo-location's reverseGeocodeAsync always returns [] on web (the
      // Geocoding API was removed from the web shim in Expo SDK 49) — use
      // OpenStreetMap's free Nominatim API there instead, same OSM stack the
      // app already uses for maps elsewhere (no API key/billing needed).
      if (Platform.OS === 'web') {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${useCoords.lat}&lon=${useCoords.lng}&format=json`,
          { headers: { 'Accept-Language': 'en' } },
        );
        const data = await res.json();
        const addr = data?.address;
        if (!addr) {
          Alert.alert('Location unavailable', 'Could not determine an address for your current location. Please enter it manually.');
          return;
        }
        const streetLine = [addr.house_number, addr.road].filter(Boolean).join(' ');
        if (streetLine) setStreet(streetLine);
        const city = addr.city || addr.town || addr.village || addr.suburb;
        if (city) setCity(city);
        if (addr.postcode) setPostal(addr.postcode);
        return;
      }

      const Location = await import('expo-location');
      const hits = await Location.reverseGeocodeAsync({ latitude: useCoords.lat, longitude: useCoords.lng });
      const hit = hits[0];
      if (!hit) {
        Alert.alert('Location unavailable', 'Could not determine an address for your current location. Please enter it manually.');
        return;
      }
      const streetLine = [hit.streetNumber, hit.street].filter(Boolean).join(' ');
      if (streetLine) setStreet(streetLine);
      if (hit.city) setCity(hit.city);
      if (hit.postalCode) setPostal(hit.postalCode);
    } catch {
      Alert.alert('Location unavailable', 'Could not get your current location. Please enter your address manually.');
    } finally {
      setLocatingAddress(false);
    }
  }

  async function handleBook() {
    if (!selectedProvider) return;

    // Seed/demo artists (Explore's curated showcase) have no real backend account —
    // submitting a booking against one would fail server-side. Block early with a
    // clear message instead of letting the user hit a confusing checkout error.
    if (isSeedProvider(selectedProvider)) {
      const msg = 'This is a demo artist — booking isn\'t available for them yet. Please choose another artist.';
      if (Platform.OS === 'web') window.alert(msg); else Alert.alert('Demo Artist', msg);
      return;
    }

    if (!user?.phoneVerified) {
      setShowVerifySheet(true);
      return;
    }

    // Reassign mode: client is picking a new Provider for an existing booking
    // (the first one declined). Skip create — just assign + go back.
    const reassignId = (route.params as any)?.reassignBookingId as string | undefined;
    if (reassignId) {
      setLoading(true);
      try {
        const { apiReassignBooking } = await import('../../api/client');
        await apiReassignBooking(reassignId, selectedProvider._id);
        tapSuccess();
        const okMsg = t.providerRequestedMsg(selectedProvider.name);
        if (Platform.OS === 'web') window.alert(okMsg); else Alert.alert(t.providerRequestedTitle, okMsg);
        nav.navigate('Bookings');
      } catch (err: any) {
        const msg = err?.message ?? t.tryAgainDefault;
        if (Platform.OS === 'web') window.alert(`${t.reassignFail}: ${msg}`); else Alert.alert(t.reassignFail, msg);
      } finally {
        setLoading(false);
      }
      return;
    }

    if (bookingMode === 'scheduled' && selectedDates.length === 0) return;
    // canNext already gates this, but handleBook is also invoked directly from
    // the phone-verification sheet's onVerified callback, which bypasses it.
    if (selectedServices.length === 0) return;
    setLoading(true);
    try {
      // Geocode the manually-entered address → coords for the booking's map.
      // Prefer real GPS when we have it; otherwise turn the typed full address
      // (street + postal) into lat/lng so the care location renders a real map
      // instead of "map preview unavailable".
      let bookingCoords = realCoords ?? null;
      if (!bookingCoords && address) {
        try {
          const Location = await import('expo-location');
          const hits = await Location.geocodeAsync(address);
          if (hits && hits[0]) bookingCoords = { lat: hits[0].latitude, lng: hits[0].longitude };
        } catch { /* geocode best-effort; booking still goes through without coords */ }
      }

      // On-demand: use current time + 1 hour as scheduledAt
      let datesToBook: Date[];
      if (bookingMode === 'ondemand') {
        const soon = new Date();
        soon.setHours(soon.getHours() + 1, 0, 0, 0);
        datesToBook = [soon];
      } else {
        datesToBook = selectedDates;
      }

      // The look only still applies if its line item is still selected — the
      // customer can deselect it like any other service (toggleService), and
      // sending providerLookId anyway would silently re-add its price
      // server-side even though the summary they're looking at no longer does.
      const activeProviderLookId = pendingProviderLook && selectedServices.some(s => s.name === pendingProviderLook.name)
        ? pendingProviderLook.id
        : undefined;

      // Create one booking per selected date in parallel. Multi-service is
      // ADDITIVE to multi-date: each date still gets exactly one booking, that
      // booking just carries the full service bundle instead of a single
      // service. N dates × M services = N bookings, each with M BookingService
      // rows — the loop shape is unchanged.
      const results = await Promise.allSettled(
        datesToBook.map(date => {
          const scheduledAt = bookingMode === 'ondemand'
            ? date
            : (() => { const d = new Date(date); d.setHours(startHour, startMinute, 0, 0); return d; })();
          return apiCreateBooking({
            services: selectedServices.map(s => ({ name: s.name, serviceItemId: s.serviceItemId ?? null })),
            scheduledAt: scheduledAt.toISOString(),
            lat: bookingCoords?.lat,
            lng: bookingCoords?.lng,
            providerId: selectedProvider._id,
            address: address.trim(),
            lookId: (route.params as any)?.lookId,
            providerLookId: activeProviderLookId,
            // Only send a real, in-range offer — never NaN/0/negative from a
            // malformed field, and never an out-of-range value that slipped
            // past canNext's gate somehow. The offer is against the SUMMED
            // total of the bundle, applied per booking (i.e. per date).
            proposedPrice: proposedPrice.trim() !== '' && isProposedPriceValid() ? parsedProposedPrice : undefined,
          });
        })
      );

      const succeeded = results.filter(r => r.status === 'fulfilled') as PromiseFulfilledResult<any>[];
      const failCount  = results.length - succeeded.length;

      if (succeeded.length === 0) {
        const firstErr = (results[0] as PromiseRejectedResult).reason;
        const msg = firstErr?.message ?? t.tryAgainDefault;
        if (Platform.OS === 'web') {
          window.alert(`${t.bookingFailed}: ${msg}`);
        } else {
          Alert.alert(t.bookingFailed, msg);
        }
        return;
      }

      tapSuccess();

      // Warn about partial failures but still navigate to first successful booking
      if (failCount > 0) {
        const warnMsg = t.partialMsg(succeeded.length, failCount);
        if (Platform.OS === 'web') {
          window.alert(warnMsg);
        } else {
          Alert.alert(t.partialSuccess, warnMsg);
        }
      }

      const firstBooking = succeeded[0].value.booking;
      nav.dispatch(
        CommonActions.reset({
          index: 1,
          routes: [
            { name: 'Home' },
            { name: 'BookingDetail', params: { booking: firstBooking } },
          ],
        })
      );
    } catch (e: any) {
      const msg = e?.message ?? t.tryAgainDefault;
      if (Platform.OS === 'web') {
        window.alert(`${t.bookingFailed}: ${msg}`);
      } else {
        Alert.alert(t.bookingFailed, msg);
      }
    } finally {
      setLoading(false);
    }
  }

  function goBack() {
    // Preselected artist: slot 1 (Choose Artist) is never shown, so leaving
    // slot 2 exits the screen entirely.
    if (step === 1 || (step === 2 && hasPreselectedProvider)) { nav.goBack(); return; }
    // On-demand: no Date & Time slot, so Confirm (4) goes back to Services (2).
    if (step === 4 && bookingMode === 'ondemand') { setStep(2); return; }
    setStep(s => (s - 1) as Step);
  }

  function goNext() {
    if (!canNext) {
      // Slot 2's address fields live below the fold on small screens — users
      // tapped a greyed Continue with no idea what was missing. Scroll the
      // missing address section into view instead of doing nothing.
      if (step === 2 && selectedServices.length > 0) {
        mainScrollRef.current?.scrollTo({ y: Math.max(addressYRef.current - 12, 0), animated: true });
      }
      return;
    }
    if (step === 4) { handleBook(); return; }
    // On-demand: skip slot 3 (Date & Time) — Services (2) → Confirm (4).
    if (step === 2 && bookingMode === 'ondemand') { setStep(4); return; }
    setStep(s => (s + 1) as Step);
  }

  function openProfile(provider: AvailableProvider) {
    setProfileProvider(provider);
    setProfileVisible(true);
  }

  function handleSelectFromModal(provider: AvailableProvider) {
    setSelectedProvider(provider);
    setProfileVisible(false);
  }

  // Tapping a map pin selects that Provider + scrolls to their card
  function handlePinPress(provider: AvailableProvider) {
    tapLight();
    setSelectedProvider(provider);
    setHighlightedId(String(provider._id));
    const idx = providers.findIndex(p => String(p._id) === String(provider._id));
    if (idx >= 0 && hScrollRef.current) {
      hScrollRef.current.scrollToIndex({ index: idx, animated: true, viewPosition: 0 });
    }
  }

  const calWeeks = getMonthGrid(calYear, calMonth);
  const isPrevDisabled = calYear < today.getFullYear() ||
    (calYear === today.getFullYear() && calMonth <= today.getMonth());

  // Near Me peek: card width tuned so ~1.5 cards show (the half-card is the
  // scroll affordance). Must match nearStyles.card width + snapToInterval below.
  const CARD_W = Math.min(SCREEN_W * 0.64, 280);

  const renderNearCard = useCallback(({ item: provider }: { item: AvailableProvider }) => (
    <NearMeProviderCard
      provider={provider}
      fullWidth={true}
      selected={selectedProvider?._id === provider._id}
      onSelect={() => {
        tapLight();
        setSelectedProvider(prev => prev?._id === provider._id ? null : provider);
        setHighlightedId(String(provider._id));
      }}
      onViewProfile={() => openProfile(provider)}
    />
  ), [selectedProvider]);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: BG_PAPER }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* ── Header ── */}
      <LinearGradient
        colors={[BRAND_DARK, BRAND_MID]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={[styles.header, { paddingTop: insets.top + 12 }]}
      >
        <View style={styles.headerRow}>
          <Pressable
            onPress={goBack}
            hitSlop={{ top: 12, bottom: 12, left: 16, right: 16 }}
            style={{ minHeight: 44, justifyContent: 'center' }}
          >
            <Text style={styles.backText}>{t.backBtn}</Text>
          </Pressable>
          <Text style={styles.headerTitle}>{t.headerTitle}</Text>
          <View style={{ width: 60 }} />
        </View>

        {/* Step progress pills */}
        <View style={styles.stepRow}>
          {(bookingMode === 'ondemand'
            ? (hasPreselectedProvider ? STEP_LABELS_ONDEMAND_PRESELECTED : STEP_LABELS_ONDEMAND)
            : (hasPreselectedProvider ? STEP_LABELS_SCHEDULED_PRESELECTED : STEP_LABELS_SCHEDULED)
          ).map((label, i) => {
            // Map display index to actual slot numbers:
            //   scheduled:               0→1, 1→2, 2→3, 3→4
            //   scheduled (preselected): 0→2, 1→3, 2→4
            //   ondemand:                0→1, 1→2, 2→4
            //   ondemand (preselected):  0→2, 1→4
            const actualStep: Step = bookingMode === 'ondemand'
              ? (hasPreselectedProvider ? ([2, 4] as Step[])[i] : ([1, 2, 4] as Step[])[i])
              : (hasPreselectedProvider ? ([2, 3, 4] as Step[])[i] : ((i + 1) as Step));
            const active = actualStep === step;
            const done   = actualStep < step;
            // Completed steps are tappable to jump back. Forward steps stay locked
            // (each step has its own validation before Continue advances).
            const canTap = done;
            return (
              <Pressable
                key={label}
                style={styles.stepItem}
                disabled={!canTap}
                onPress={() => { if (canTap) { tapLight(); setStep(actualStep); } }}
                hitSlop={6}
              >
                <View style={[
                  styles.stepDot,
                  done   && styles.stepDotDone,
                  active && styles.stepDotActive,
                ]}>
                  <Text style={[
                    styles.stepDotText,
                    done   && { color: '#fff' },
                    active && { color: BRAND_DARK },
                  ]}>
                    {done ? '✓' : String(i + 1)}
                  </Text>
                </View>
                <Text style={[styles.stepLabel, active && styles.stepLabelActive]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
      </LinearGradient>

      {/* ── Slot 1 Near Me: Uber-style full-screen map + bottom sheet ── */}
      {step === 1 && providerMode === 'near' ? (
        <View style={{ flex: 1 }}>
          {/* Mode toggle — floats over map */}
          <View style={nearStyles.modeToggleOverlay}>
            <View style={nearStyles.modeTogglePill}>
              <Pressable
                style={[nearStyles.modeTab, nearStyles.modeTabActive, { flexDirection: 'row', alignItems: 'center', gap: 5 }]}
                onPress={() => setProviderMode('near')}
              >
                <PinIcon size={14} color="#fff" />
                <Text style={[nearStyles.modeTabText, nearStyles.modeTabTextActive]}>{t.nearMe}</Text>
              </Pressable>
              <Pressable
                style={nearStyles.modeTab}
                onPress={() => setProviderMode('browse')}
              >
                <Text style={nearStyles.modeTabText}>{t.browseProfiles}</Text>
              </Pressable>
            </View>
          </View>

          {loadingProviders ? (
            <View style={styles.emptyBox}>
              <ActivityIndicator color={BRAND_MID} size="large" />
              <Text style={styles.emptyText}>{t.findingArtists}</Text>
            </View>
          ) : providers.length === 0 ? (
            <View style={styles.emptyBox}>
              <View style={{ marginBottom: 8 }}><SearchIcon size={32} color={Colors.tertiaryLabel} /></View>
              <Text style={styles.emptyText}>{t.noArtistsNearby}</Text>
              <Pressable onPress={() => setProviderMode('browse')} style={{ marginTop: 12 }}>
                <Text style={{ color: Colors.brand, fontWeight: '700' }}>{t.browseAll}</Text>
              </Pressable>
            </View>
          ) : (
            <>
              {/* Full-bleed map */}
              <View style={nearStyles.mapFull}>
                <GeoMapWeb
                  providers={providers}
                  selectedId={highlightedId ?? (selectedProvider ? String(selectedProvider._id) : undefined)}
                  userLat={realCoords?.lat}
                  userLng={realCoords?.lng}
                  onPinPress={handlePinPress}
                  onViewProfile={openProfile}
                />
              </View>

              {/* Bottom sheet panel — bottom-anchored, ALWAYS visible. Tap the
                  handle/header to grow its height from peek → full (smooth on web
                  + native). bottom:0 + animated height = can't go off-screen. */}
              <Animated.View style={[
                nearStyles.bottomSheet,
                {
                  top: undefined as any,
                  bottom: 0,
                  height: sheetHeight,
                  paddingBottom: insets.bottom + 4,
                },
              ]}>
                {/* Handle bar — big (44pt) tap target to expand/collapse */}
                <Pressable
                  onPress={() => { tapLight(); setNearExpanded(e => !e); }}
                  hitSlop={16}
                  style={({ pressed }) => [nearStyles.sheetHandleTap, pressed && { opacity: 0.6 }]}
                  accessibilityRole="button"
                  accessibilityLabel={nearExpanded ? t.collapseList : t.expandList}
                >
                  <View style={nearStyles.sheetHandle} />
                </Pressable>

                {/* Header row */}
                <Pressable style={nearStyles.sheetHeader} onPress={() => { tapLight(); setNearExpanded(e => !e); }}>
                  <Text style={nearStyles.sheetTitle}>
                    {t.providerAvailableNearby(providers.length)}
                  </Text>
                  <Text style={nearStyles.sheetExpandHint}>{nearExpanded ? t.collapse : t.seeAll}</Text>
                </Pressable>

                {/* Provider cards — always a vertical scrollable list. Collapsed, only the
                    top couple peek; "See all" slides the sheet up to reveal the rest. */}
                <FlatList
                  data={providers}
                  keyExtractor={p => String(p._id)}
                  renderItem={renderNearCard}
                  showsVerticalScrollIndicator
                  // Scrollable even while collapsed — users were stuck on the top two
                  // cards ("need to slide") because scrolling was gated behind "See all".
                  scrollEnabled
                  nestedScrollEnabled
                  contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 24, gap: 12 }}
                  // minHeight: 0 is required on web — a flex:1 child of a column
                  // flexbox otherwise refuses to shrink below its content size,
                  // so the list never becomes scrollable (it just expands the parent).
                  style={{ flex: 1, minHeight: 0 }}
                />

                {/* Continue button */}
                <View style={{ paddingHorizontal: 16, paddingTop: 10 }}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.ctaBtn,
                      !canNext && styles.ctaBtnDisabled,
                      pressed && canNext && { opacity: 0.88, transform: [{ scale: 0.98 }] },
                    ]}
                    onPress={goNext}
                    disabled={!canNext || loading}
                  >
                    <LinearGradient
                      colors={canNext ? [BRAND_LIGHT, BRAND_MID] : ['#B0BEC5', '#90A4AE']}
                      start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                      style={styles.ctaBtnGradient}
                    >
                      {loading ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Text style={styles.ctaBtnText}>
                          {selectedProvider ? t.continueWith(selectedProvider.name.split(' ')[0]) : t.continueBtn}
                        </Text>
                      )}
                    </LinearGradient>
                  </Pressable>
                </View>
              </Animated.View>
            </>
          )}
        </View>
      ) : (
        <ScrollView
          ref={mainScrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={[styles.body, { paddingBottom: 40 }]}
          keyboardShouldPersistTaps="handled"
        >

          {/* ── Slot 2: Services multi-select ── */}
          {step === 2 && (
            <View>
              {pendingProviderLook ? (
                // Booking a specific look — the package is already decided
                // (see the pendingProviderLook effect above), so the full
                // per-service picker below has nothing left to actually
                // choose. Showing it anyway read as "pick again" on top of
                // a decision already made tapping "Book this look" — a
                // plain summary of what's already locked in instead.
                <>
                  <Text style={styles.sectionTitle}>You're booking</Text>
                  <View style={styles.lookSummaryCard}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.lookSummaryName}>{pendingProviderLook.name}</Text>
                      {pendingProviderLook.durationMin != null && (
                        <Text style={styles.lookSummaryMeta}>{fmtDuration(pendingProviderLook.durationMin)}</Text>
                      )}
                    </View>
                    <Text style={styles.lookSummaryPrice}>{formatCurrency(pendingProviderLook.price, { decimals: 0 })}</Text>
                  </View>
                </>
              ) : (
                <>
                  <Text style={styles.sectionTitle}>{t.sectionCareType}</Text>
                  <Text style={styles.sectionSub}>{t.servicesSub}</Text>
                  {artistMenu.length === 0 ? (
                    <View style={styles.emptyBox}>
                      <Text style={styles.emptyText}>
                        {isSeedProvider(selectedProvider) ? t.demoArtistMenu : t.noArtistMenu}
                      </Text>
                      <Text style={[styles.emptyText, { fontSize: 13, marginTop: 4 }]}>
                        {isSeedProvider(selectedProvider) ? t.demoArtistMenuSub : t.noArtistMenuSub}
                      </Text>
                    </View>
                  ) : (
                <View style={styles.serviceGrid}>
                  {artistMenu.map(svc => {
                    const accent = ServiceAccentColors[svc.name] ?? BRAND_MID;
                    const active = selectedServices.some(s => s.name === svc.name);
                    return (
                      <Pressable
                        key={svc.name}
                        style={[
                          styles.serviceCard,
                          // Use a white card + colored border when active (NOT an
                          // 8-digit #RRGGBBAA fill — Android RN renders that as an
                          // opaque grey box, which looked broken).
                          active && { borderColor: accent, borderWidth: 2, backgroundColor: '#fff' },
                        ]}
                        onPress={() => toggleService(svc)}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: active }}
                        accessibilityLabel={`${svc.name}, ${formatCurrency(svc.price)}, ${fmtDuration(svc.durationMin)}`}
                      >
                        <ServiceIcon serviceType={svc.name} size={32} bubbleSize={60} color={accent} />
                        <Text style={[
                          styles.serviceCardLabel,
                          active && { color: accent, fontWeight: '800' },
                        ]}>
                          {svc.name}
                        </Text>
                        <Text style={styles.serviceCardPrice}>
                          {formatCurrency(svc.price, { decimals: 0 })} · {fmtDuration(svc.durationMin)}
                        </Text>
                        {active && (
                          <View style={[styles.serviceCheck, { backgroundColor: accent }]}>
                            <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>✓</Text>
                          </View>
                        )}
                      </Pressable>
                    );
                  })}
                </View>
                  )}
                </>
              )}

              <Text
                style={[styles.sectionTitle, { marginTop: 28 }]}
                onLayout={e => { addressYRef.current = e.nativeEvent.layout.y; }}
              >{t.sectionAddress}</Text>
              <Text style={styles.sectionSub}>{t.addressSub}</Text>
              <Pressable
                style={[styles.autofillBtn, locatingAddress && { opacity: 0.6 }]}
                onPress={autofillFromCurrentLocation}
                disabled={locatingAddress}
              >
                {locatingAddress
                  ? <ActivityIndicator size="small" color={BRAND_MID} />
                  : <LocationIcon size={16} color={BRAND_MID} />}
                <Text style={styles.autofillBtnText}>Use current location</Text>
              </Pressable>
              <TextInput
                style={styles.addressInput}
                value={street}
                onChangeText={setStreet}
                onFocus={() => mainScrollRef.current?.scrollTo({ y: Math.max(addressYRef.current - 12, 0), animated: true })}
                placeholder={t.streetPlaceholder}
                placeholderTextColor="#8E8E93"
                returnKeyType="next"
                autoCapitalize="words"
              />
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TextInput
                  style={[styles.addressInput, { flex: 1 }]}
                  value={unit}
                  onChangeText={setUnit}
                  onFocus={() => mainScrollRef.current?.scrollTo({ y: Math.max(addressYRef.current - 12, 0), animated: true })}
                  placeholder={t.unitPlaceholder}
                  placeholderTextColor="#8E8E93"
                  returnKeyType="next"
                />
                <TextInput
                  style={[styles.addressInput, { flex: 1.4 }]}
                  value={postal}
                  onChangeText={setPostal}
                  onFocus={() => mainScrollRef.current?.scrollTo({ y: Math.max(addressYRef.current - 12, 0), animated: true })}
                  placeholder={t.postalPlaceholder}
                  placeholderTextColor="#8E8E93"
                  returnKeyType="next"
                  autoCapitalize="characters"
                  maxLength={10}
                />
              </View>
              <TextInput
                style={styles.addressInput}
                value={city}
                onChangeText={setCity}
                onFocus={() => mainScrollRef.current?.scrollTo({ y: Math.max(addressYRef.current + 60, 0), animated: true })}
                placeholder={t.cityPlaceholder}
                placeholderTextColor="#8E8E93"
                returnKeyType="done"
                autoCapitalize="words"
              />
            </View>
          )}

          {/* ── Slot 3: Date & Time ── */}
          {step === 3 && (
            <View>
              <Text style={styles.sectionTitle}>{t.sectionDates}</Text>
              <Text style={styles.sectionSub}>{t.datesSub}</Text>

              {selectedDates.length > 0 && (
                <View style={styles.chipRow}>
                  {selectedDates.map(d => (
                    <Pressable key={d.toISOString()} style={styles.dateChip} onPress={() => toggleDate(d)}>
                      <Text style={styles.dateChipText}>{fmtShort(d, locale)} ✕</Text>
                    </Pressable>
                  ))}
                </View>
              )}

              <View style={styles.calCard}>
                <View style={styles.calNavRow}>
                  <Pressable
                    onPress={prevMonth}
                    disabled={isPrevDisabled}
                    style={[styles.calNavBtn, isPrevDisabled && { opacity: 0.3 }]}
                    hitSlop={{ top: 12, bottom: 12, left: 16, right: 16 }}
                  >
                    <Text style={styles.calNavBtnText}>‹</Text>
                  </Pressable>
                  <Text style={styles.calMonthLabel}>{MONTH_NAMES[calMonth]} {calYear}</Text>
                  <Pressable
                    onPress={nextMonth}
                    style={styles.calNavBtn}
                    hitSlop={{ top: 12, bottom: 12, left: 16, right: 16 }}
                  >
                    <Text style={styles.calNavBtnText}>›</Text>
                  </Pressable>
                </View>

                <View style={styles.calDowRow}>
                  {DAYS_HEADER.map(d => (
                    <Text key={d} style={styles.calDowText}>{d}</Text>
                  ))}
                </View>

                {calWeeks.map((week, wi) => (
                  <View key={wi} style={styles.calWeekRow}>
                    {week.map((day, di) => {
                      if (!day) return <View key={di} style={styles.calDayCell} />;
                      const isToday     = sameDay(day, today);
                      const isSelected  = selectedDates.some(s => sameDay(s, day));
                      const isPast      = day < minSelectDate;
                      const isFutureFar = day > maxSelectDate;
                      const isDisabled  = isPast || isFutureFar;
                      // Today is intentionally NOT selectable (bookings start
                      // tomorrow) — but we still ring it so users understand WHY
                      // it's greyed rather than thinking the calendar is broken.
                      const markToday = isToday && !isSelected;
                      return (
                        <Pressable
                          key={di}
                          style={({ pressed }) => [
                            styles.calDayCell,
                            markToday && styles.calDayCellTodayRing,
                            isSelected && styles.calDayCellSelected,
                            isDisabled && !isToday && styles.calDayCellDisabled,
                            pressed && !isDisabled && !isSelected && styles.calDayCellPressed,
                          ]}
                          onPress={() => !isDisabled && toggleDate(day)}
                          disabled={isDisabled}
                          accessibilityRole="button"
                          accessibilityState={{ disabled: isDisabled, selected: isSelected }}
                          accessibilityLabel={fmtShort(day, locale) + (isToday ? ' (today, not bookable)' : '')}
                        >
                          <Text style={[
                            styles.calDayNum,
                            markToday && styles.calDayNumToday,
                            isSelected && styles.calDayNumSelected,
                            isDisabled && !isToday && styles.calDayNumDisabled,
                          ]}>
                            {day.getDate()}
                          </Text>
                          {/* Selected → white dot; today (unselected) → muted "today" dot */}
                          {isSelected ? (
                            <View style={styles.calDayDot} />
                          ) : isToday ? (
                            <View style={styles.calDayTodayDot} />
                          ) : null}
                        </Pressable>
                      );
                    })}
                  </View>
                ))}
              </View>

              {/* Helper line — explains the start-tomorrow rule + today marker. */}
              <View style={styles.calHelperRow}>
                <View style={styles.calHelperDotRing} />
                <Text style={styles.calHelperText}>{t.todayNotBookable}</Text>
              </View>

              <Text style={[styles.sectionTitle, { marginTop: 28 }]}>{t.sectionStartTime}</Text>
              <View style={styles.chipRow}>
                {START_HOURS.map(h => (
                  <Pressable
                    key={h}
                    style={[styles.chip, !customTimeOpen && startHour === h && startMinute === 0 && styles.chipActive]}
                    onPress={() => { tapLight(); setStartHour(h); setStartMinute(0); setCustomTimeOpen(false); }}
                  >
                    <Text style={[styles.chipText, !customTimeOpen && startHour === h && startMinute === 0 && styles.chipTextActive]}>
                      {fmtHour(h)}
                    </Text>
                  </Pressable>
                ))}
                <Pressable
                  style={[styles.chip, customTimeOpen && styles.chipActive]}
                  onPress={() => { tapLight(); setCustomTimeOpen(true); }}
                >
                  <Text style={[styles.chipText, customTimeOpen && styles.chipTextActive]}>
                    {customTimeOpen ? fmtHourMinute(startHour, startMinute) : t.customTime}
                  </Text>
                </Pressable>
              </View>

              {customTimeOpen && Platform.OS === 'web' ? (
                <input
                  type="time"
                  value={`${String(startHour).padStart(2, '0')}:${String(startMinute).padStart(2, '0')}`}
                  onChange={(e: any) => {
                    const [h, m] = e.target.value.split(':').map(Number);
                    if (!Number.isNaN(h) && !Number.isNaN(m)) { setStartHour(h); setStartMinute(m); }
                  }}
                  style={{
                    marginTop: 12, padding: '10px 14px', borderRadius: 12,
                    border: '1px solid #E5E7EB', fontSize: 15, fontFamily: 'inherit',
                  }}
                />
              ) : null}

              {customTimeOpen && Platform.OS !== 'web' && (
                <DateTimePicker
                  value={(() => { const d = new Date(); d.setHours(startHour, startMinute, 0, 0); return d; })()}
                  mode="time"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={(_event: any, selected?: Date) => {
                    if (Platform.OS === 'android') setCustomTimeOpen(false);
                    if (selected) { setStartHour(selected.getHours()); setStartMinute(selected.getMinutes()); }
                  }}
                />
              )}
            </View>
          )}

          {/* ── Slot 1: Choose Artist (loading / empty / browse mode) ── */}
          {step === 1 && (
            <View>
              <Text style={styles.sectionTitle}>{t.chooseArtist}</Text>

              <View style={styles.modeToggleRow}>
                <Pressable
                  style={[styles.modePill, providerMode === 'near' && styles.modePillActive]}
                  onPress={() => setProviderMode('near')}
                >
                  <Text style={[styles.modePillText, providerMode === 'near' && styles.modePillTextActive]}>
                    {t.nearMe}
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.modePill, providerMode === 'browse' && styles.modePillActive]}
                  onPress={() => setProviderMode('browse')}
                >
                  <Text style={[styles.modePillText, providerMode === 'browse' && styles.modePillTextActive]}>
                    {t.browseProfiles}
                  </Text>
                </Pressable>
              </View>

              {loadingProviders ? (
                <View style={styles.emptyBox}>
                  <ActivityIndicator color={BRAND_MID} size="large" />
                  <Text style={styles.emptyText}>{t.findingArtists}</Text>
                </View>
              ) : providers.length === 0 ? (
                <View style={styles.emptyBox}>
                  <SearchIcon size={32} color={Colors.brand} />
                  <Text style={styles.emptyText}>{t.noArtistsNearby}</Text>
                  <Text style={[styles.emptyText, { fontSize: 13, marginTop: 4 }]}>
                    {t.tryAgain}
                  </Text>
                </View>
              ) : (
                <>
                  {/* Sort + Filter bar — Browse Profiles only (Near Me has its own map UX) */}
                  {providerMode === 'browse' && (
                    <>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ width: '100%', marginBottom: 10 }} contentContainerStyle={{ gap: 8, paddingRight: 8 }}>
                        {(['distance', 'rating', 'price', 'experience'] as const).map(opt => (
                          <Pressable
                            key={opt}
                            style={[styles.sortChip, sortBy === opt && styles.sortChipActive]}
                            onPress={() => { tapLight(); setSortBy(opt); }}
                          >
                            <Text style={[styles.sortChipText, sortBy === opt && styles.sortChipTextActive]}>
                              {opt === 'distance' ? t.sortDistance : opt === 'rating' ? t.sortRating : opt === 'price' ? t.sortPrice : t.sortExperience}
                            </Text>
                          </Pressable>
                        ))}
                        <Pressable
                          style={[styles.sortChip, filterSavedOnly && styles.sortChipActive]}
                          onPress={() => { tapLight(); setFilterSavedOnly(v => !v); }}
                        >
                          <Text style={[styles.sortChipText, filterSavedOnly && styles.sortChipTextActive]}>
                            ♥ {t.savedFilter}
                          </Text>
                        </Pressable>
                        <Pressable
                          style={[styles.filterChip, activeFilterCount > 0 && styles.filterChipActive]}
                          onPress={() => { tapLight(); setFiltersVisible(true); }}
                        >
                          <Text style={[styles.filterChipText, activeFilterCount > 0 && styles.filterChipTextActive]}>
                            {activeFilterCount > 0 ? t.filtersActive(activeFilterCount) : t.filterBtn}
                          </Text>
                        </Pressable>
                      </ScrollView>
                      <Text style={styles.resultsCountText}>{t.resultsCount(visibleProviders.length)}</Text>
                    </>
                  )}

                  {/* Browse Profiles cards (Near Me handled above in split-screen) */}
                  {providerMode === 'browse' && filterSavedOnly && visibleProviders.length === 0 ? (
                    <View style={styles.emptyBox}>
                      <Text style={styles.emptyText}>{t.noSavedArtists}</Text>
                    </View>
                  ) : (
                    (providerMode === 'browse' ? visibleProviders : providers).map(provider => (
                      <BrowseProviderCard
                        key={String(provider._id)}
                        provider={provider}
                        selected={selectedProvider?._id === provider._id}
                        onSelect={() => { tapLight(); setSelectedProvider(prev => prev?._id === provider._id ? null : provider); }}
                        onViewProfile={() => {
                          tapLight();
                          nav.navigate('ProviderPublicProfile', { providerId: String(provider._id), providerName: provider.name, fromBooking: true });
                        }}
                      />
                    ))
                  )}
                </>
              )}
            </View>
          )}

          {/* ── Step 4: Confirm ── */}
          {step === 4 && selectedProvider && (
            <View>
              <Text style={styles.sectionTitle}>{t.sectionConfirm}</Text>

              <View style={styles.confirmProviderCard}>
                <ProviderAvatar provider={selectedProvider} size={56} borderColor={BRAND_MID + '60'} borderWidth={2} />
                <View style={{ flex: 1, marginLeft: 14 }}>
                  <Text style={styles.confirmProviderName}>{selectedProvider.name}</Text>
                  <Text style={styles.providerQual}>{humanizeQualification(selectedProvider.qualificationType)}</Text>
                  {(selectedProvider.rating ?? 0) > 0 && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                      <StarRating rating={selectedProvider.rating} size={12} />
                      <Text style={styles.providerRating}>{selectedProvider.rating.toFixed(1)}</Text>
                    </View>
                  )}
                </View>
                {selectedProvider.policeCheckCleared && (
                  <View style={styles.verifiedBadge}><Text style={styles.verifiedBadgeText}>✓ Verified</Text></View>
                )}
              </View>

              <View style={styles.confirmCard}>
                {/* Itemized line items — one row per selected service, then the
                    summed total, combined duration, and computed time window. */}
                {selectedServices.map(svc => (
                  <ConfirmRow key={svc.name} label={svc.name} value={formatCurrency(svc.price)} />
                ))}
                <View style={styles.confirmDivider} />
                <View style={styles.confirmRow}>
                  <Text style={styles.confirmLabel}>{t.confirmEstTotal}</Text>
                  <View style={{ flex: 1, alignItems: 'flex-end' }}>
                    <Text style={[styles.confirmValue, styles.confirmValueBold]}>
                      {formatCurrency(totalPriceOneSession * (bookingMode === 'ondemand' ? 1 : Math.max(selectedDates.length, 1)), { decimals: 0 })}
                    </Text>
                    {bookingMode === 'scheduled' && selectedDates.length > 1 && (
                      <Text style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>
                        {t.confirmDays(selectedDates.length)}
                      </Text>
                    )}
                  </View>
                </View>
                <ConfirmRow label={t.confirmDuration} value={`⏱️ ${fmtDuration(totalDurationMin)}`} />
                <View style={styles.confirmDivider} />
                {bookingMode === 'ondemand' ? (
                  <ConfirmRow label={t.confirmWhen} value={t.confirmWhenOnDemand} />
                ) : (
                  <>
                    <ConfirmRow label={t.confirmDates} value={selectedDates.map(d => fmtShort(d, locale)).join('\n')} />
                    {/* One computed window per booking: start time → start +
                        combined duration of every selected service. */}
                    <ConfirmRow
                      label={t.confirmWindow}
                      value={(() => {
                        const start = new Date(selectedDates[0] ?? new Date());
                        start.setHours(startHour, startMinute, 0, 0);
                        return `${fmtClock(start, locale)} – ${fmtClock(endTimeFor(start, totalDurationMin), locale)}`;
                      })()}
                    />
                  </>
                )}
                <ConfirmRow label={t.confirmAddress} value={address.trim()} />
              </View>

              {/* Price negotiation UI — only when provider allows it */}
              {selectedProvider?.priceNegotiable && (
                <View style={[styles.escrowBox, { backgroundColor: '#FEF3C7', borderColor: '#FDE68A', marginTop: 14 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.escrowTitle, { color: '#92400E' }]}>Propose a Price</Text>
                    <Text style={[styles.escrowText, { color: '#A16207' }]}>
                      This provider accepts price negotiation. Enter a lower offer below (50–99% of the listed price).
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 }}>
                      <Text style={{ fontSize: 18, fontWeight: '800', color: '#92400E' }}>{getCurrencySymbol()}</Text>
                      <TextInput
                        style={[styles.addressInput, { flex: 1, marginTop: 0, borderColor: '#FDE68A', backgroundColor: '#FFFBEB' }]}
                        value={proposedPrice}
                        onChangeText={setProposedPrice}
                        placeholder={`${totalPriceOneSession}`}
                        placeholderTextColor="#D97706"
                        keyboardType="number-pad"
                        maxLength={6}
                      />
                    </View>
                    {/* The screen's copy claims "±50% of the listed price" but
                        nothing previously enforced that — free-text input fed
                        straight into Number(proposedPrice) at submission with
                        no min/max/positive check, so non-numeric input became
                        NaN (silently dropped by JSON.stringify, offer lost
                        with no error shown) and there was no floor/ceiling at
                        all. Real validation, matching the stated claim. */}
                    {proposedPrice.trim() !== '' && !isProposedPriceValid() && (
                      <Text style={{ fontSize: 12, color: '#B45309', marginTop: 6 }}>
                        {proposedPriceErrorMsg()}
                      </Text>
                    )}
                  </View>
                </View>
              )}

              {/* ── Payment info — settled directly with the caregiver, no in-app
                    charge. Do NOT show payment-method pickers here until real
                    processing (Stripe) exists: fake UI = App Store rejection. ── */}
              <Text style={[styles.sectionTitle, { fontSize: 16, marginTop: 24, marginBottom: 10 }]}>{t.paymentSection}</Text>
              <View style={styles.escrowBox}>
                <View style={styles.escrowIcon}><CreditCardIcon size={20} color={Colors.onlineGreen} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.escrowTitle}>{t.escrowTitle}</Text>
                  <Text style={styles.escrowText}>{t.escrowText}</Text>
                </View>
              </View>

              <Text style={styles.confirmNote}>{t.confirmNote}</Text>
            </View>
          )}
        </ScrollView>
      )}

      {/* ── Footer CTA — hidden when near-me split-screen renders its own ── */}
      {!(step === 1 && providerMode === 'near') && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
          {/* Live running total — updates as services are added/removed on the
              Services step, and stays visible through Confirm so the number the
              customer agreed to never disappears. */}
          {(step === 2 || step === 4) && (
            <View style={styles.summaryBar}>
              <Text style={styles.summaryBarLeft}>
                {selectedServices.length === 0
                  ? t.summaryBarEmpty
                  : `${t.summaryBarCount(selectedServices.length)} · ${fmtDuration(totalDurationMin)}`}
              </Text>
              <Text style={styles.summaryBarRight}>
                {selectedServices.length === 0 ? '' : formatCurrency(totalPriceOneSession)}
              </Text>
            </View>
          )}
          {/* Tell the user exactly WHY Continue is grey — a silent disabled
              button reads as broken (real user report). */}
          {!canNext && !loading && (
            <Text style={styles.ctaHint}>
              {step === 1
                ? 'Tap "Select" on an Artist to continue'
                : step === 2
                  ? (selectedServices.length === 0
                      ? 'Choose at least one service'
                      : 'Enter your street address')
                  : step === 3
                    ? 'Pick at least one date'
                    : ''}
            </Text>
          )}
          <Pressable
            style={({ pressed }) => [
              styles.ctaBtn,
              !canNext && styles.ctaBtnDisabled,
              pressed && canNext && { opacity: 0.88, transform: [{ scale: 0.98 }] },
            ]}
            onPress={goNext}
            // Stays pressable when invalid so goNext can scroll the missing
            // address fields into view; goNext itself blocks advancing.
            disabled={loading}
          >
            <LinearGradient
              colors={canNext ? [BRAND_LIGHT, BRAND_MID] : ['#B0BEC5', '#90A4AE']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={styles.ctaBtnGradient}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  {step === 4 && <KeyIcon size={16} color="#fff" />}
                  <Text style={styles.ctaBtnText}>
                    {step === 4
                      ? t.confirmBtn(totalPriceOneSession * (bookingMode === 'ondemand' ? 1 : Math.max(selectedDates.length, 1)))
                      : t.continueBtn}
                  </Text>
                </View>
              )}
            </LinearGradient>
          </Pressable>
        </View>
      )}

      {/* ── Provider Profile Modal ── */}
      <ProviderProfileModal
        provider={profileProvider}
        visible={profileVisible}
        onClose={() => setProfileVisible(false)}
        onSelect={handleSelectFromModal}
      />

      {/* ── Filters Modal (Browse Profiles) ── */}
      <FiltersModal
        visible={filtersVisible}
        onClose={() => setFiltersVisible(false)}
        t={t}
        services={SERVICES}
        filterVerifiedOnly={filterVerifiedOnly}
        setFilterVerifiedOnly={setFilterVerifiedOnly}
        filterMinExp={filterMinExp}
        setFilterMinExp={setFilterMinExp}
        filterMinRating={filterMinRating}
        setFilterMinRating={setFilterMinRating}
        filterServices={filterServices}
        toggleFilterService={toggleFilterService}
        clearFilters={clearFilters}
      />

      {/* ── Phone Verification Sheet (gates first booking confirm) ── */}
      <VerifyPhoneSheet
        visible={showVerifySheet}
        needsPhone={!user?.phone}
        onClose={() => setShowVerifySheet(false)}
        onVerified={() => {
          setShowVerifySheet(false);
          // Re-run the same submit function now that phoneVerified is true.
          handleBook();
        }}
      />
    </KeyboardAvoidingView>
  );
}

// ─── Geo Map styles ──────────────────────────────────────────────────────────────
const geoMapStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#EDF4EC',
    borderRadius: 16,
    overflow: 'hidden',
  },
  // Floating info card when pin tapped — absolutely positioned inside map View
  infoCard: {
    position: 'absolute',
    left: 12, right: 12, bottom: 12,
    zIndex: 30,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14, shadowRadius: 10, elevation: 8,
    borderWidth: 1.5, borderColor: BRAND_MID + '50',
  },
  infoName: {
    fontSize: 14, fontWeight: '800', color: INK, marginBottom: 2,
  },
  infoDistBadge: {
    backgroundColor: '#FDF2F4', borderRadius: 6,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  infoDistText: {
    fontSize: 10, color: '#9C5560', fontWeight: '700',
  },
  infoSelectBtn: {
    backgroundColor: BRAND_DARK,
    borderRadius: 10,
    paddingVertical: 8, paddingHorizontal: 14,
    marginLeft: 8,
  },
  infoSelectText: {
    color: '#fff', fontSize: 12, fontWeight: '800',
  },
});

// ─── Near Me Uber-style layout styles ────────────────────────────────────────────
const nearStyles = StyleSheet.create({
  // Mode toggle floats over map at top — above the sheet so the expanded sheet
  // header can never overlap it.
  modeToggleOverlay: {
    position: 'absolute',
    top: 12,
    left: 0, right: 0,
    zIndex: 50,
    elevation: 50,
    alignItems: 'center',
  },
  modeTogglePill: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 24,
    padding: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },
  modeTab: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 20,
  },
  modeTabActive: {
    backgroundColor: BRAND_DARK,
  },
  modeTabText: {
    fontSize: 13, fontWeight: '600', color: MUTED,
  },
  modeTabTextActive: {
    color: '#fff',
  },
  // Map takes full background
  mapFull: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
  },
  // Bottom sheet
  bottomSheet: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 10,
    flexDirection: 'column',   // so the expanded FlatList (flex:1) fills the sheet height
    // Without an explicit overflow, RN-Web sometimes fails to clip/bound an
    // Animated (interpolated) height container, so the child FlatList never
    // gets a finite height to scroll within — it just renders unscrollable.
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 20,
  },
  // 44pt-tall hit area around the grabber so it's an easy iOS target.
  sheetHandleTap: {
    alignItems: 'center', justifyContent: 'center',
    height: 28, marginBottom: 2,
  },
  sheetHandle: {
    width: 44, height: 5, borderRadius: 3,
    backgroundColor: '#CBD5E1',
    alignSelf: 'center',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  sheetTitle: {
    fontSize: 15, fontWeight: '700', color: INK,
  },
  sheetSelectedHint: {
    fontSize: 12, fontWeight: '700', color: BRAND_MID,
  },
  sheetExpandHint: {
    fontSize: 13, fontWeight: '700', color: BRAND_MID,
  },
  // Card — horizontal scroll item
  card: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 6,
    elevation: 3,
    // Peek width — kept in sync with CARD_W so ~1.5 cards show and snapping aligns.
    width: Math.min(SCREEN_W * 0.64, 280),
  },
  cardSelected: {
    borderColor: BRAND_MID,
    borderWidth: 2,
    backgroundColor: '#F0FDF8',
  },
  onlineDot: {
    position: 'absolute',
    bottom: 2, right: 2,
    width: 12, height: 12, borderRadius: 6,
    backgroundColor: '#22C55E',
    borderWidth: 2, borderColor: '#fff',
  },
  offlineDot: {
    backgroundColor: '#9CA3AF', // grey when not online now
  },
  name: {
    fontSize: 15, fontWeight: '700', color: INK,
  },
  qual: {
    fontSize: 11, color: MUTED, marginTop: 1,
  },
  selectedBadge: {
    backgroundColor: BRAND_MID,
    borderRadius: 8,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  selectedBadgeText: {
    fontSize: 10, color: '#fff', fontWeight: '800',
  },
  distBadge: {
    backgroundColor: '#FDF2F4',
    borderRadius: 8,
    paddingHorizontal: 7, paddingVertical: 3,
    flexDirection: 'row', alignItems: 'center', gap: 3,
  },
  distText: {
    fontSize: 11, color: '#9C5560', fontWeight: '700',
  },
  ratingBadge: {
    backgroundColor: '#FEF9C3',
    borderRadius: 8,
    paddingHorizontal: 7, paddingVertical: 3,
  },
  ratingText: {
    fontSize: 11, color: '#B45309', fontWeight: '700',
  },
  rate: {
    fontSize: 11, color: BRAND_MID, fontWeight: '700',
  },
  tag: {
    backgroundColor: MIST,
    borderRadius: 6,
    paddingHorizontal: 7, paddingVertical: 2,
  },
  tagText: {
    fontSize: 10, color: BRAND_DARK, fontWeight: '600',
  },
  profileBtn: {
    paddingVertical: 7, paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: BRAND_MID,
    alignItems: 'center',
    minWidth: 62,
    minHeight: 36,
    justifyContent: 'center',
  },
  profileBtnText: {
    fontSize: 11, color: BRAND_MID, fontWeight: '700',
  },
  selectBtn: {
    paddingVertical: 7, paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: MIST,
    alignItems: 'center',
    minWidth: 62,
    minHeight: 36,
    justifyContent: 'center',
  },
  selectBtnSel: {
    backgroundColor: BRAND_MID,
  },
  selectBtnText: {
    fontSize: 11, color: BRAND_MID, fontWeight: '800',
  },
  selectBtnTextSel: {
    color: '#fff',
  },
});

// ─── Modal styles ────────────────────────────────────────────────────────────────
const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  webOverlay: {
    position: 'absolute' as any,
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
    zIndex: 999,
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    paddingHorizontal: 20,
    maxHeight: SCREEN_H * 0.88,
  },
  handle: {
    width: 40, height: 4,
    borderRadius: 2,
    backgroundColor: '#E5E7EB',
    alignSelf: 'center',
    marginBottom: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 20,
    gap: 0,
  },
  name: {
    fontSize: 20, fontWeight: '800', color: INK, marginBottom: 2,
  },
  qual: {
    fontSize: 13, color: MUTED, marginBottom: 4,
  },
  statsRow: {
    flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4,
  },
  statText: {
    fontSize: 12, color: MUTED, fontWeight: '500',
  },
  verifiedBadge: {
    backgroundColor: '#DCFCE7',
    borderRadius: 8,
    paddingHorizontal: 7, paddingVertical: 2,
  },
  verifiedBadgeText: {
    fontSize: 11, color: '#166534', fontWeight: '700',
  },
  closeBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: '#F3F4F6',
    alignItems: 'center', justifyContent: 'center',
    marginLeft: 8,
  },
  closeBtnText: {
    fontSize: 14, color: '#6B7280', fontWeight: '700',
  },
  viewFullProfile: {
    fontSize: 13, fontWeight: '700', color: BRAND_MID,
    marginTop: 4, marginBottom: 14,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 14, fontWeight: '800', color: INK, marginBottom: 10,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  bioText: {
    fontSize: 14, color: '#374151', lineHeight: 22,
  },
  readMore: {
    fontSize: 13, color: BRAND_MID, fontWeight: '700', marginTop: 4,
  },
  certItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8,
  },
  certIcon: {
    width: 24, height: 24, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  certLabel: {
    fontSize: 14, color: '#374151', fontWeight: '500',
  },
  tagRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 6,
  },
  tag: {
    backgroundColor: MIST,
    borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 5,
  },
  tagText: {
    fontSize: 12, color: BRAND_DARK, fontWeight: '700',
  },
  availDot: {
    width: 10, height: 10, borderRadius: 5, backgroundColor: '#22C55E',
  },
  availText: {
    fontSize: 13, color: '#22C55E', fontWeight: '700',
  },
  ctaWrap: {
    borderRadius: 14,
    overflow: 'hidden',
    marginTop: 16,
  },
  cta: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  ctaText: {
    color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 0.2,
  },
});

// ─── Main styles ─────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  backText:    { color: 'rgba(255,255,255,0.85)', fontSize: 17, fontWeight: '600' },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },

  stepRow:  { flexDirection: 'row', justifyContent: 'space-between' },
  stepItem: { alignItems: 'center', gap: 4, flex: 1 },
  stepDot: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  stepDotActive: { backgroundColor: '#fff' },
  stepDotDone:   { backgroundColor: BRAND_LIGHT },
  stepDotText:   { fontSize: 12, fontWeight: '800', color: 'rgba(255,255,255,0.5)' },
  stepLabel:       { fontSize: 10, color: 'rgba(255,255,255,0.5)', fontWeight: '600' },
  stepLabelActive: { color: '#fff', fontWeight: '800' },

  body: { padding: 20 },

  sectionTitle: { fontSize: 20, fontWeight: '800', color: '#1F1215', marginBottom: 4 },
  sectionSub:   { fontSize: 13, color: '#64748B', marginBottom: 16 },

  lookSummaryCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', borderRadius: 18, padding: 16,
    borderWidth: 2, borderColor: BRAND_MID,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 3,
  },
  lookSummaryName: { fontSize: 16, fontWeight: '800', color: '#1F2937' },
  lookSummaryMeta: { fontSize: 13, color: '#64748B', marginTop: 3 },
  lookSummaryPrice: { fontSize: 18, fontWeight: '900', color: BRAND_MID },
  serviceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  serviceCard: {
    width: (SCREEN_W - 60) / 2, flexBasis: (SCREEN_W - 60) / 2,
    padding: 12, borderRadius: 18,
    backgroundColor: '#fff',
    borderWidth: 2, borderColor: '#E5E7EB',
    alignItems: 'center', gap: 6,
    position: 'relative',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 6, elevation: 3,
  },
  serviceCardIcon:  { fontSize: 28 },
  serviceCardLabel: { fontSize: 12, fontWeight: '600', color: '#64748B', textAlign: 'center' },
  serviceCardPrice: { fontSize: 11, fontWeight: '700', color: BRAND_MID, textAlign: 'center' },
  serviceCheck: {
    position: 'absolute', top: 8, right: 8,
    width: 18, height: 18, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center',
  },
  summaryBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 10,
    backgroundColor: MIST, borderRadius: 14, marginBottom: 10,
  },
  summaryBarLeft:  { fontSize: 13, fontWeight: '700', color: BRAND_DARK },
  summaryBarRight: { fontSize: 17, fontWeight: '800', color: BRAND_DARK },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  chip: {
    paddingHorizontal: 18, paddingVertical: 12, borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: 1.5, borderColor: '#E5E7EB',
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  chipActive:     { backgroundColor: BRAND_MID, borderColor: BRAND_MID },
  chipText:       { fontSize: 14, fontWeight: '700', color: '#374151' },
  chipTextActive: { color: '#fff' },
  chipSub:        { fontSize: 11, color: '#9CA3AF', marginTop: 1, fontWeight: '500' },

  dateChip: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20,
    backgroundColor: BRAND_MID + '18',
    borderWidth: 1, borderColor: BRAND_MID,
  },
  dateChipText: { fontSize: 12, fontWeight: '700', color: BRAND_MID },

  calCard: {
    backgroundColor: '#fff',
    borderRadius: 20, padding: 18, marginTop: 14,
    borderWidth: 1, borderColor: '#E5E7EB',
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08, shadowRadius: 10, elevation: 4,
  },
  calNavRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 16,
  },
  calNavBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#F1F5F9',
    alignItems: 'center', justifyContent: 'center',
  },
  calNavBtnText:  { fontSize: 20, fontWeight: '700', color: '#374151', lineHeight: 24 },
  calMonthLabel:  { fontSize: 17, fontWeight: '800', color: '#1F1215' },
  calDowRow:      { flexDirection: 'row', marginBottom: 8 },
  calDowText:     { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '700', color: '#94A3B8', letterSpacing: 0.3 },
  calWeekRow:     { flexDirection: 'row', marginBottom: 2 },
  calDayCell: {
    // flex:1 + aspectRatio:1 in a 7-col row yields ~44pt cells on phones — a
    // comfortable touch target. No maxHeight cap so they don't shrink.
    flex: 1, aspectRatio: 1,
    alignItems: 'center', justifyContent: 'center',
    borderRadius: 12, margin: 2,
    minHeight: 40,
  },
  // Today ring is shown even though today is disabled, so the greyed cell is
  // clearly "today" and not just an inert day.
  calDayCellTodayRing: { borderWidth: 1.5, borderColor: '#CBD5E1', backgroundColor: '#F8FAFC' },
  calDayCellSelected: {
    backgroundColor: BRAND_MID,
    shadowColor: BRAND_DARK, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3, shadowRadius: 5, elevation: 4,
  },
  calDayCellPressed:  { backgroundColor: MIST },
  calDayCellDisabled: { opacity: 0.45 },
  calDayNum:          { fontSize: 15, fontWeight: '600', color: '#1E293B' },
  calDayNumToday:     { color: '#64748B', fontWeight: '800' },
  calDayNumSelected:  { color: '#fff', fontWeight: '800' },
  calDayNumDisabled:  { color: '#CBD5E1' },
  calDayDot:          { width: 4, height: 4, borderRadius: 2, backgroundColor: '#fff', marginTop: 2 },
  calDayTodayDot:     { width: 4, height: 4, borderRadius: 2, backgroundColor: '#94A3B8', marginTop: 2 },
  calHelperRow:       { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, paddingHorizontal: 2 },
  calHelperDotRing:   { width: 12, height: 12, borderRadius: 6, borderWidth: 1.5, borderColor: '#CBD5E1', backgroundColor: '#F8FAFC' },
  calHelperText:      { flex: 1, fontSize: 12, color: '#94A3B8', lineHeight: 17 },

  modeToggleRow: {
    flexDirection: 'row', backgroundColor: '#F1F5F9',
    borderRadius: 14, padding: 4, marginBottom: 16, gap: 4,
  },
  modePill: {
    flex: 1, paddingVertical: 10, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    minHeight: 44,
  },
  modePillActive: {
    backgroundColor: '#fff',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1, shadowRadius: 4, elevation: 2,
  },
  modePillText:       { fontSize: 14, fontWeight: '600', color: '#64748B' },
  modePillTextActive: { color: BRAND_DARK, fontWeight: '800' },

  // Browse card styles
  providerBrowseCard: {
    padding: 18, borderRadius: 18, marginBottom: 14,
    backgroundColor: '#fff',
    borderWidth: 1.5, borderColor: '#E5E7EB',
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08, shadowRadius: 10, elevation: 4,
  },
  providerCardSelected: { borderColor: BRAND_MID, borderWidth: 2, backgroundColor: '#F0FDF8' },
  providerBrowseTop:    { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  providerBrowseName:   { fontSize: 17, fontWeight: '800', color: INK, marginBottom: 2 },

  verifiedBadge: {
    backgroundColor: '#DCFCE7', borderRadius: 8,
    paddingHorizontal: 7, paddingVertical: 2,
  },
  verifiedBadgeText: { fontSize: 11, color: '#166534', fontWeight: '700' },

  // Avatar fallback
  avatarFallback: {
    backgroundColor: BRAND_MID,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarFallbackText: { color: '#fff', fontWeight: '800' },

  providerName:     { fontSize: 15, fontWeight: '700', color: INK },
  providerQual:     { fontSize: 12, color: MUTED, marginTop: 1 },
  providerExp:      { fontSize: 12, color: MUTED, marginTop: 1 },
  providerMetaRow:  { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  providerRating:   { fontSize: 13, color: '#F59E0B', fontWeight: '700' },
  providerRate:     { fontSize: 12, color: BRAND_MID, fontWeight: '700' },
  providerDistanceBrowse: { fontSize: 12, color: '#94A3B8', marginLeft: 'auto' as any },
  policyLine: { fontSize: 11, color: '#94A3B8', fontWeight: '500', marginTop: 8, marginBottom: 4 },

  providerBio: { fontSize: 13, color: '#475569', lineHeight: 19, marginTop: 8 },

  tagRow:    { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  tag:       { backgroundColor: MIST, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  tagText:   { fontSize: 11, color: BRAND_DARK, fontWeight: '700' },
  certRow:   { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 0 },
  certBadge: { backgroundColor: '#DCFCE7', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  certBadgeText: { fontSize: 11, color: '#166534', fontWeight: '700' },

  availRow:  { flexDirection: 'row', alignItems: 'center', gap: 6 },
  availDot:  { width: 8, height: 8, borderRadius: 4, backgroundColor: '#22C55E' },
  availText: { fontSize: 12, color: '#22C55E', fontWeight: '700' },

  cardBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    gap: 8,
    flexWrap: 'wrap',
  },
  cardActions: {
    flexDirection: 'row',
    gap: 8,
  },
  ghostBtn: {
    paddingVertical: 8, paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1.5, borderColor: BRAND_MID,
    alignItems: 'center',
  },
  ghostBtnText: { fontSize: 12, color: BRAND_MID, fontWeight: '700' },
  selectBtn: {
    paddingVertical: 8, paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: MIST,
    alignItems: 'center',
  },
  selectBtnSelected: { backgroundColor: BRAND_MID },
  selectBtnText:     { fontSize: 12, color: BRAND_MID, fontWeight: '700' },
  selectBtnTextSelected: { color: '#fff' },

  // Confirm step
  confirmProviderCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 16, padding: 16,
    borderWidth: 1.5, borderColor: BRAND_MID + '40',
    marginBottom: 16,
  },
  confirmProviderName: { fontSize: 17, fontWeight: '800', color: INK },
  confirmCard: {
    backgroundColor: '#fff', borderRadius: 18, padding: 20,
    borderWidth: 1, borderColor: '#E5E7EB',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
    marginBottom: 16,
  },
  confirmRow:     { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10 },
  confirmLabel:   { fontSize: 14, color: '#64748B', fontWeight: '600' },
  confirmValue:   { fontSize: 14, color: '#1F1215', fontWeight: '600', flex: 1, textAlign: 'right' },
  confirmValueBold: { fontWeight: '800', fontSize: 16, color: BRAND_DARK },
  confirmDivider: { height: 1, backgroundColor: '#E5E7EB', marginVertical: 4 },
  confirmNote:    { fontSize: 13, color: '#94A3B8', textAlign: 'center', lineHeight: 19, marginTop: 14 },

  // Payment info box
  escrowBox: {
    flexDirection: 'row', gap: 12, alignItems: 'flex-start',
    backgroundColor: '#F0FAF6', borderRadius: 16, padding: 16, marginTop: 14,
    borderWidth: 1, borderColor: '#BBF7D0',
  },
  escrowIcon: { },
  escrowTitle: { fontSize: 14, fontWeight: '800', color: BRAND_DARK, marginBottom: 3 },
  escrowText: { fontSize: 12, color: '#15803D', lineHeight: 18 },

  addressInput: {
    borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 14,
    paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 15, color: '#1F1215',
    backgroundColor: '#fff',
    marginTop: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  autofillBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, marginBottom: 10,
    backgroundColor: Colors.brandLight, borderWidth: 1, borderColor: Colors.brand,
  },
  autofillBtnText: { fontSize: 13, fontWeight: '700', color: BRAND_MID },
  emptyBox: { alignItems: 'center', paddingVertical: 48, gap: 10 },
  emptyText: { fontSize: 15, color: '#64748B', textAlign: 'center' },

  footer: {
    paddingHorizontal: 20, paddingTop: 12,
    backgroundColor: '#fff',
    borderTopWidth: 1, borderTopColor: '#E5E7EB',
  },
  ctaBtn: { borderRadius: 14, overflow: 'hidden' },
  ctaBtnDisabled: { opacity: 1 },
  ctaBtnGradient: { paddingVertical: 16, alignItems: 'center', justifyContent: 'center', minHeight: 56 },
  ctaBtnText: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 0.2 },
  ctaHint: { textAlign: 'center', color: '#B45309', fontSize: 13, fontWeight: '600', marginBottom: 8 },

  // Sort & filter bar (Browse Profiles)
  sortChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: '#F1F5F9', minHeight: 36, justifyContent: 'center',
  },
  sortChipActive: { backgroundColor: BRAND_DARK },
  sortChipText: { fontSize: 13, fontWeight: '700', color: '#64748B' },
  sortChipTextActive: { color: '#fff' },
  filterChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#E2E8F0',
    minHeight: 36, justifyContent: 'center',
  },
  filterChipActive: { borderColor: BRAND_MID, backgroundColor: MIST },
  filterChipText: { fontSize: 13, fontWeight: '700', color: '#64748B' },
  filterChipTextActive: { color: BRAND_DARK },
  resultsCountText: { fontSize: 13, color: '#64748B', fontWeight: '600', marginBottom: 12 },
});

// ─── Filter modal styles ────────────────────────────────────────────────────────
const filterStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  webOverlay: {
    position: 'absolute' as any, top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end', zIndex: 999,
  },
  sheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingTop: 12, paddingHorizontal: 20, maxHeight: SCREEN_H * 0.88,
  },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#E5E7EB', alignSelf: 'center', marginBottom: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  title: { fontSize: 18, fontWeight: '800', color: '#1F1215' },
  closeBtn: { fontSize: 18, color: '#6B7280', fontWeight: '700', padding: 4 },
  toggleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F1F5F9', marginBottom: 8,
  },
  toggleLabel: { fontSize: 15, fontWeight: '600', color: '#1F1215' },
  checkbox: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: '#CBD5E1',
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: BRAND_DARK, borderColor: BRAND_DARK },
  checkboxTick: { color: '#fff', fontSize: 13, fontWeight: '800' },
  label: {
    fontSize: 12, fontWeight: '700', color: '#64748B', textTransform: 'uppercase',
    letterSpacing: 0.5, marginTop: 16, marginBottom: 8,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 18,
    backgroundColor: '#F1F5F9', borderWidth: 1.5, borderColor: 'transparent',
  },
  chipActive: { backgroundColor: MIST, borderColor: BRAND_MID },
  chipText: { fontSize: 13, fontWeight: '600', color: '#64748B' },
  chipTextActive: { color: BRAND_DARK, fontWeight: '800' },
  footerRow: { flexDirection: 'row', gap: 10, marginTop: 20, paddingTop: 4 },
  clearBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 14, alignItems: 'center',
    backgroundColor: '#F1F5F9',
  },
  clearBtnText: { fontSize: 14, fontWeight: '700', color: '#475569' },
  applyBtn: {
    flex: 2, paddingVertical: 14, borderRadius: 14, alignItems: 'center',
    backgroundColor: BRAND_DARK,
  },
  applyBtnText: { fontSize: 15, fontWeight: '800', color: '#fff' },
});
