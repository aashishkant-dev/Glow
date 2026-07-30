import React, { useEffect, useState } from 'react';
import { Image } from 'expo-image';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { ArrowBackIcon, CameraIcon, CheckCircleIcon, PersonIcon, StarIcon } from '../../components/TabIcons';
import { MapIcon, LocationIcon, CalendarSVGIcon } from '../../components/TabIcons';
import { NoteIcon, EarningsIcon, BellIcon, HelpIcon, InstagramIcon } from '../../components/CareIcons';
import {
  ShieldCheckIcon,
  CardAccountDetailsIcon,
  CheckDecagramIcon,
  PhoneCheckIcon,
  AccountCheckIcon,
  CreditCardIcon,
  EmailIcon,
  ClockIcon,
  TranslateIcon,
  PackageIcon,
  PinIcon,
  MedicalBagIcon,
  MonitorDashboardIcon,
  ChartBoxIcon,
  KeyIcon,
  MedalIcon,
  PhoneMobileIcon,
} from '../../components/CareIcons';
import { ProfileStrength } from '../../components/ProfileStrength';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { confirmAction } from '../../utils/haptics';
import * as Linking from 'expo-linking';
import Constants from 'expo-constants';
import { useAuth } from '../../context/AuthContext';
import { useLocation } from '../../context/LocationContext';
import {
  apiGetProfile, apiGetMyDocuments, apiSetPublicProfile, apiUpdateProfile, apiUploadPhoto, UserProfile,
  apiGetProviderServices, apiSetProviderServices, apiUpdateProviderPricing, ProviderServiceItem,
  apiMyJobs, apiToggleAvailability, Booking,
  apiUpdateProviderLocationSettings, BusinessHours,
} from '../../api/client';
import { Storage } from '../../utils/storage';
import { Colors, Fonts } from '../../utils/colors';
import { GlowMark } from '../../components/GlowLogo';
import { DEFAULT_REGION_NAME } from '../../utils/region';
import { useFavorites } from '../../utils/favorites';
import { LOOK_OCCASIONS } from '../../data/looks';

// ── Design tokens — soft beauty / girly palette ────────────────────────────────
// Soft blush hero, warm cream bg, rose + gold accents. No healthcare navy/gray.
const ROSE_DEEP  = Colors.brandDeep;   // #A34D63
const ROSE_MID   = Colors.brand;       // #D97A91
const ROSE_SOFT  = Colors.brandAccent; // #E9A0B1
const BRAND      = Colors.brandDark;   // #C4667E
const GOLD       = Colors.gold;        // #D4AF37
const BG         = Colors.systemGroupedBackground; // #FFF9F8 warm cream
const CARD       = '#FFFFFF';

// Representative swatch colors for each skin tone option in the Beauty Profile section.
const SKIN_TONE_COLORS: Record<string, string> = {
  FAIR: '#F5DCC7', LIGHT: '#E8C4A0', MEDIUM: '#C68863', TAN: '#A56B42', DEEP: '#6B4226', RICH: '#3D2314',
};
const LABEL      = Colors.secondaryLabel;
const VALUE      = Colors.label;
const DIVIDER_C  = Colors.separatorSoft;
const ICON_BG    = Colors.brandLight;  // soft rose icon chips

// ── Visual system for this screen ────────────────────────────────────────────
// The structure of this screen was settled in earlier passes; what follows is
// purely the SKIN. Three rules, drawn from the reference apps:
//
//  1. TYPE — hierarchy comes from weight + letter-spacing, not just size
//     (Glossier). Everything routes through `Fonts.*` (Inter). The screen
//     previously used raw `fontWeight: '700'` strings, which on Android/web
//     silently fall back to the system face instead of Inter, so headings
//     rendered in a different typeface than the rest of the app.
//  2. ELEVATION — one soft, warm, wide shadow instead of per-component values
//     between 0.06 and 0.18 opacity (Pinterest). Cards lift off warm paper.
//  3. SURFACE — inset wells use cream/blush, never systemGray (Sephora).
//
// Radii ladder: cards 20 / wells 14 / chips + pills 999.
const R_CARD = 20;
const R_WELL = 14;
const R_PILL = 999;

/** One warm, soft, wide card lift — replaces six near-duplicate shadow blocks. */
const SHADOW_CARD = {
  shadowColor: Colors.shadowSoft,
  shadowOffset: { width: 0, height: 6 },
  shadowOpacity: 0.07,
  shadowRadius: 20,
  elevation: 3,
} as const;

/** A slightly stronger lift for the one card that floats over the hero. */
const SHADOW_FLOAT = {
  shadowColor: Colors.shadowSoft,
  shadowOffset: { width: 0, height: 10 },
  shadowOpacity: 0.10,
  shadowRadius: 28,
  elevation: 6,
} as const;

/**
 * Type scale. Editorial rather than functional: titles are tighter-tracked and
 * heavier, while labels get positive tracking at small sizes so they read as
 * considered captions instead of shrunken body copy (Glossier/Sephora).
 */
const Type = {
  heroName:   { fontFamily: Fonts.bold,     fontSize: 30, letterSpacing: -0.8 },
  groupTitle: { fontFamily: Fonts.bold,     fontSize: 19, letterSpacing: -0.5 },
  cardTitle:  { fontFamily: Fonts.semibold, fontSize: 16, letterSpacing: -0.2 },
  rowLabel:   { fontFamily: Fonts.medium,   fontSize: 15.5, letterSpacing: -0.1 },
  rowValue:   { fontFamily: Fonts.semibold, fontSize: 15.5, letterSpacing: -0.1 },
  body:       { fontFamily: Fonts.regular,  fontSize: 13.5, letterSpacing: 0 },
  caption:    { fontFamily: Fonts.regular,  fontSize: 12.5, letterSpacing: 0 },
  overline:   { fontFamily: Fonts.semibold, fontSize: 11,   letterSpacing: 1.1 },
  statNum:    { fontFamily: Fonts.bold,     fontSize: 25, letterSpacing: -0.9 },
} as const;

// ── Helpers ────────────────────────────────────────────────────────────────────
function fmtMemberSince(dateStr?: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-CA', { month: 'short', year: 'numeric' });
}

function renderStars(rating: number, size = 13): React.ReactNode {
  const full  = Math.floor(rating);
  const half  = rating - full >= 0.5 ? 1 : 0;
  const empty = 5 - full - half;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 1 }}>
      {Array.from({ length: full  }).map((_, i) => (
        <Text key={`f${i}`} style={{ fontSize: size, color: '#D4AF37' }}>★</Text>
      ))}
      {half === 1 && <Text style={{ fontSize: size, color: '#D4AF37' }}>⯨</Text>}
      {Array.from({ length: empty }).map((_, i) => (
        <Text key={`e${i}`} style={{ fontSize: size, color: '#D1D5DB' }}>★</Text>
      ))}
    </View>
  );
}

// ── Icon lookup — maps legacy MCI glyph strings to CareIcon components ────────
type GlyphIconFC = React.ComponentType<{ size?: number; color?: string }>;

function infoIcon(glyph: string): GlyphIconFC {
  const MAP: Record<string, GlyphIconFC> = {
    'account':                         PersonIcon,
    'shield-check':                    ShieldCheckIcon,
    'card-account-details-outline':    CardAccountDetailsIcon,
    'check-decagram':                  CheckDecagramIcon,
    'cellphone':                       PhoneMobileIcon,
    'cellphone-check':                 PhoneCheckIcon,
    'account-check':                   AccountCheckIcon,
    'credit-card-check-outline':       CreditCardIcon,
    'email-outline':                   EmailIcon,
    'clock-outline':                   ClockIcon,
    'translate':                       TranslateIcon,
    'package-variant':                 PackageIcon,
    'map':                             MapIcon,
    'map-marker':                      PinIcon,
    'map-marker-outline':              PinIcon,
    'medical-bag':                     MedicalBagIcon,
    'monitor-dashboard':               MonitorDashboardIcon,
    'chart-box-outline':               ChartBoxIcon,
    'key-variant':                     KeyIcon,
    'medal':                           MedalIcon,
    'star-outline':                    StarIcon,
    'check-circle':                    CheckCircleIcon,
    'instagram':                       InstagramIcon,
  };
  return MAP[glyph] ?? PersonIcon;
}

// ── Verified badge ─────────────────────────────────────────────────────────────
function VerifiedChip({ label }: { label: string }) {
  return (
    <View style={styles.verifiedChip}>
      <CheckCircleIcon size={13} color="#C4667E" />
      <Text style={styles.verifiedChipText}>{label}</Text>
    </View>
  );
}

// ── Info row ──────────────────────────────────────────────────────────────────
// Tappable rows (onPress set) get the brand-colored icon chip + a circular chevron
// chip — the same "navigable" affordance as navCard. Informational-only rows (no
// onPress) get a muted gray icon chip and no chevron slot at all, so it reads at a
// glance as "display only" rather than a slightly-quieter button.
function InfoRow({
  glyph, label, value, onPress, valueColor,
}: { glyph: string; label: string; value: string; onPress?: () => void; valueColor?: string }) {
  const Icon = infoIcon(glyph);
  const iconColor = onPress ? BRAND : Colors.systemGray2;
  if (!onPress) {
    return (
      <View style={styles.infoRow}>
        <View style={styles.infoLeft}>
          <View style={[styles.infoIconWrap, styles.infoIconWrapMuted]}><Icon size={18} color={iconColor} /></View>
          <Text style={styles.infoLabel}>{label}</Text>
        </View>
        <View style={styles.infoRight}>
          <Text
            style={[styles.infoValue, valueColor ? { color: valueColor } : undefined]}
            numberOfLines={1}
          >
            {value}
          </Text>
        </View>
      </View>
    );
  }
  return (
    <Pressable
      style={({ pressed }) => [styles.infoRow, pressed && { opacity: 0.6 }]}
      onPress={() => {
        if (Platform.OS !== 'web') Haptics.selectionAsync();
        onPress();
      }}
      accessibilityRole="button"
    >
      <View style={styles.infoLeft}>
        <View style={styles.infoIconWrap}><Icon size={18} color={iconColor} /></View>
        <Text style={styles.infoLabel}>{label}</Text>
      </View>
      <View style={styles.infoRight}>
        <Text
          style={[styles.infoValue, valueColor ? { color: valueColor } : undefined]}
          numberOfLines={1}
        >
          {value}
        </Text>
        <View style={styles.infoChevronChip}>
          <Text style={styles.infoChevronChipText}>›</Text>
        </View>
      </View>
    </Pressable>
  );
}

// ── Status chip ────────────────────────────────────────────────────────────────
function StatusChip({ status }: { status: 'pending' | 'approved' | 'rejected' }) {
  const config = {
    pending:  { bg: '#FFF7ED', border: '#FED7AA', text: '#EA580C', label: 'Pending Review' },
    approved: { bg: '#FCECEF', border: '#E9A0B1', text: '#C4667E', label: 'Approved' },
    rejected: { bg: '#FFF1F2', border: '#FECDD3', text: '#DC2626', label: 'Not Approved' },
  }[status];
  return (
    <View style={[styles.statusChip, { backgroundColor: config.bg, borderColor: config.border }]}>
      <View style={[styles.statusDot, { backgroundColor: config.text }]} />
      <Text style={[styles.statusChipText, { color: config.text }]}>{config.label}</Text>
    </View>
  );
}

function Divider() { return <View style={styles.divider} />; }

// ── Hierarchy primitives ──────────────────────────────────────────────────────
// The screen used to render ~12 flat `sectionLabel` blocks of identical visual
// weight, which is what made it read as an undifferentiated wall. These three
// components introduce a real hierarchy, mirroring how Fresha groups workspace
// settings under named groups ("Your Workspace", "Locations", "Workspace
// Access") rather than one heading per setting:
//
//   Group   → a named tier that owns several cards (primary or secondary)
//   Subhead → a quiet label for a card *inside* a group (not a peer heading)
//   Secondary group → same structure, deliberately de-emphasised (StyleSeat's
//                     bottom-of-menu "Other" catch-all for billing/legal)

function Group({
  title, caption, tone = 'primary', children,
}: {
  title: string; caption?: string; tone?: 'primary' | 'secondary'; children: React.ReactNode;
}) {
  const secondary = tone === 'secondary';
  return (
    <View style={[styles.group, secondary && styles.groupSecondary]}>
      <View style={styles.groupHeader}>
        {!secondary && <View style={styles.groupAccent} />}
        <View style={{ flex: 1 }}>
          <Text style={[styles.groupTitle, secondary && styles.groupTitleSecondary]}>{title}</Text>
          {caption ? (
            <Text style={[styles.groupCaption, secondary && styles.groupCaptionSecondary]}>{caption}</Text>
          ) : null}
        </View>
      </View>
      <View style={styles.groupBody}>{children}</View>
    </View>
  );
}

function Subhead({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <View style={styles.subheadRow}>
      <Text style={styles.subhead}>{title}</Text>
      {action}
    </View>
  );
}

export function ProfileScreen() {
  const { user, signOut, updatePhoto, photoUri: authPhotoUri, token } = useAuth();
  const insets = useSafeAreaInsets();
  const nav    = useNavigation<any>();
  const { coords, permissionStatus, requestLocation } = useLocation();

  const [photoUri,       setPhotoUri]       = useState<string | null>(authPhotoUri);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoError,     setPhotoError]     = useState<string | null>(null);
  const [profile,        setProfile]        = useState<UserProfile | null>(null);
  const [docCount,       setDocCount]       = useState(0);
  const [skinTone, setSkinTone] = useState<string | undefined>(user?.skinTone);
  const [skinType, setSkinType] = useState<string | undefined>(user?.skinType);
  const [preferredOccasions, setPreferredOccasions] = useState<string[]>(user?.preferredOccasions ?? []);
  const [specModal,      setSpecModal]      = useState(false);
  const [specDraft,      setSpecDraft]      = useState<string[]>([]);
  const [specSaving,     setSpecSaving]     = useState(false);
  // Generic single-field text editor (name, bio) — a real modal + TextInput so it
  // works on iOS AND Android (Alert.prompt is iOS-only).
  const [fieldModal,     setFieldModal]     = useState<null | { key: 'name' | 'bio' | 'instagramHandle'; title: string; value: string; multiline?: boolean }>(null);
  const [fieldDraft,     setFieldDraft]     = useState('');
  const [fieldSaving,    setFieldSaving]    = useState(false);
  // Languages editor (multi-select chips, same UX as specialties).
  const [langModal,      setLangModal]      = useState(false);
  const [langDraft,      setLangDraft]      = useState<string[]>([]);
  // Trust & Safety detail sheet — shows the full explanation when a row is tapped.
  const [trustModal,     setTrustModal]     = useState<null | { label: string; desc: string; detail: string }>(null);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [publicProfile,  setPublicProfile]  = useState(true);
  const [publicSaving,   setPublicSaving]   = useState(false);
  const [galleryPhotos,   setGalleryPhotos]   = useState<string[]>([]);
  // Police check is optional — track whether the artist submitted one so the
  // profile can show Cleared / Under review / Add instead of a false "Cleared".
  const [policeDoc, setPoliceDoc] = useState<'none' | 'submitted' | 'approved'>('none');
  const [galleryUploading, setGalleryUploading] = useState(false);

  // Real per-service pricing — fetched from the artist's actual service menu
  // (ProviderService rows), not the pricing-model badge that used to stand in
  // for it. Editing a price locally, then "Save changes" replaces the whole
  // menu server-side (PUT /services is full-replace, matching the API's design).
  const [services,        setServices]        = useState<ProviderServiceItem[]>([]);
  const [servicesLoading,  setServicesLoading]  = useState(false);
  const [priceEdits,       setPriceEdits]       = useState<Record<string, string>>({});
  const [pricesSaving,     setPricesSaving]     = useState(false);
  const [priceNegotiable,  setPriceNegotiable]  = useState(false);
  const [negotiableSaving, setNegotiableSaving] = useState(false);

  // Where-you-work + business hours — real, editable fields (were previously
  // read-only backend columns with no artist-facing UI to ever set them).
  const [homeService, setHomeService] = useState(true);
  const [salonService, setSalonService] = useState(false);
  const [salonAddressDraft, setSalonAddressDraft] = useState('');
  const [serviceRadiusDraft, setServiceRadiusDraft] = useState('10');
  const [hoursDraft, setHoursDraft] = useState<BusinessHours>({});
  const [locationSaving, setLocationSaving] = useState(false);
  const [locationDirty, setLocationDirty] = useState(false);
  const HOUR_DAYS: { key: keyof BusinessHours; label: string }[] = [
    { key: 'mon', label: 'Mon' }, { key: 'tue', label: 'Tue' }, { key: 'wed', label: 'Wed' },
    { key: 'thu', label: 'Thu' }, { key: 'fri', label: 'Fri' }, { key: 'sat', label: 'Sat' }, { key: 'sun', label: 'Sun' },
  ];

  // Earnings + availability summary card — front-loaded on Profile per the
  // Uber-driver-app pattern (real-time earnings + a prominent online toggle
  // right on the home surface, not buried in a separate screen).
  const [jobs, setJobs] = useState<Booking[]>([]);
  const [isOnline, setIsOnline] = useState(false);
  const [onlineToggling, setOnlineToggling] = useState(false);

  // Provider-only Profile sub-tabs — Business (pricing/hours/visibility/earnings)
  // vs Account (personal info/professional profile/documents/support/legal). The
  // hero stays shared above both. Customers never see this — single scroll, unchanged.
  const [providerProfileTab, setProviderProfileTab] = useState<'business' | 'account'>('account');

  const LANGUAGE_OPTIONS = ['English', 'French', 'Hindi', 'Nepali', 'Spanish', 'Mandarin', 'Punjabi', 'Arabic'];

  const hasPriceEdits = Object.keys(priceEdits).length > 0;

  function priceValueFor(s: ProviderServiceItem) {
    return priceEdits[s.id] ?? String(s.price);
  }

  async function savePriceEdits() {
    setPricesSaving(true);
    try {
      const updated = services.map(s => ({
        name: s.name,
        price: priceEdits[s.id] !== undefined ? (Number(priceEdits[s.id]) || 0) : s.price,
        durationMin: s.durationMin,
      }));
      const { services: saved } = await apiSetProviderServices(updated);
      setServices(saved.map((s, i) => ({ ...s, id: services[i]?.id ?? String(i) })));
      setPriceEdits({});
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      Alert.alert('Could not save prices', e?.message || 'Please try again.');
    }
    setPricesSaving(false);
  }

  function openField(key: 'name' | 'bio' | 'instagramHandle', title: string, current: string, multiline = false) {
    setFieldDraft(current);
    setFieldModal({ key, title, value: current, multiline });
  }
  async function saveField() {
    if (!fieldModal) return;
    const v = fieldDraft.trim();
    setFieldSaving(true);
    try {
      const res = await apiUpdateProfile({ [fieldModal.key]: v } as any);
      setProfile(res.user);
      setFieldModal(null);
    } catch (e: any) {
      Alert.alert('Could not save', e?.message || 'Please try again.');
    }
    setFieldSaving(false);
  }
  async function saveLanguages() {
    setFieldSaving(true);
    try {
      const res = await apiUpdateProfile({ languages: langDraft });
      setProfile(res.user);
      setLangModal(false);
    } catch (e: any) {
      Alert.alert('Could not save', e?.message || 'Please try again.');
    }
    setFieldSaving(false);
  }
  const appVersion = Constants.expoConfig?.version ?? '1.0.0';

  const SPECIALTY_OPTIONS = [
    'Bridal Makeup', 'Party Makeup', 'HD / Airbrush Makeup',
    'Hair Styling', 'Hair Coloring', 'Bridal Mehendi',
    'Festive Mehendi', 'Nail Art', 'Gel & Acrylic Nails',
    'Threading & Brows', 'Facials & Skincare', 'Waxing',
    'Lash Extensions', 'Massage & Spa',
  ];

  async function saveSpecialties() {
    setSpecSaving(true);
    try {
      const res = await apiUpdateProfile({ specialties: specDraft });
      setProfile(res.user);
      setSpecModal(false);
    } catch (e: any) {
      Alert.alert('Could not save', e?.message || 'Please try again.');
    }
    setSpecSaving(false);
  }

  async function addGalleryPhoto() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed', 'Allow photo access to add gallery photos.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      // Portrait 4:5 (not square) — portfolio/work-sample shots read better tall,
      // matching the StyleSeat/Fresha convention of square-only for the avatar
      // and a taller frame for gallery/work photos.
      aspect: [4, 5],
      quality: 0.8,
      base64: true,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    if (!asset.base64) { Alert.alert('Could not read image'); return; }
    setGalleryUploading(true);
    try {
      const { photoUrl } = await apiUploadPhoto(asset.base64, asset.mimeType ?? 'image/jpeg', 'gallery');
      const updated = [...galleryPhotos, photoUrl].slice(0, 10);
      await apiUpdateProfile({ photos: updated });
      setGalleryPhotos(updated);
    } catch (e: any) {
      Alert.alert('Upload failed', e?.message || 'Please try again.');
    }
    setGalleryUploading(false);
  }

  async function removeGalleryPhoto(url: string) {
    const updated = galleryPhotos.filter(u => u !== url);
    try {
      await apiUpdateProfile({ photos: updated });
      setGalleryPhotos(updated);
    } catch {
      Alert.alert('Could not remove', 'Please try again.');
    }
  }

  const isCustomer = user?.role === 'CUSTOMER' || user?.role === 'SALON';
  const isProvider      = user?.role === 'Provider';
  const isAdmin    = user?.role === 'ADMIN';
  const favoriteCount = useFavorites().length;

  async function saveSkinTone(tone: string) {
    setSkinTone(tone);
    try { await apiUpdateProfile({ skinTone: tone as any }); } catch {}
  }
  async function saveSkinType(type: string) {
    setSkinType(type);
    try { await apiUpdateProfile({ skinType: type as any }); } catch {}
  }
  async function toggleOccasion(occ: string) {
    const next = preferredOccasions.includes(occ)
      ? preferredOccasions.filter(o => o !== occ)
      : [...preferredOccasions, occ];
    setPreferredOccasions(next);
    try { await apiUpdateProfile({ preferredOccasions: next }); } catch {}
  }

  useEffect(() => {
    Storage.getPhotoUri().then(uri => { if (uri && uri.length > 4) setPhotoUri(uri); });
    if (!token) return;
    apiGetProfile().then(res => {
      setProfile(res.user);
      if (res.user.skinTone) setSkinTone(res.user.skinTone);
      if (res.user.skinType) setSkinType(res.user.skinType);
      if (Array.isArray(res.user.preferredOccasions)) setPreferredOccasions(res.user.preferredOccasions);
      if (Array.isArray(res.user.providerProfile?.photos)) setGalleryPhotos(res.user.providerProfile.photos);
      if (typeof res.user.providerProfile?.publicProfile === 'boolean') setPublicProfile(res.user.providerProfile.publicProfile);
      const backendPhoto = (res.user as any).photoUrl || res.user.providerProfile?.photoUrl;
      if (backendPhoto && backendPhoto.length > 4) {
        Storage.getPhotoUri().then(local => {
          if (!local || local.length <= 4) {
            setPhotoUri(backendPhoto);
            Storage.savePhotoUri(backendPhoto).catch(() => {});
          }
        });
      }
    }).catch(() => {});
    Storage.getDocuments().then(d => setDocCount(d.length));
    if (user?.role === 'Provider') {
      apiGetMyDocuments().then(({ documents }) => {
        const police = documents.filter(d => d.docType === 'police_check');
        if (police.some(d => d.status === 'APPROVED')) setPoliceDoc('approved');
        else if (police.some(d => d.status === 'PENDING')) setPoliceDoc('submitted');
        else setPoliceDoc('none');
      }).catch(() => {});
      setServicesLoading(true);
      apiGetProviderServices()
        .then(({ services: s }) => setServices(s))
        .catch(() => {})
        .finally(() => setServicesLoading(false));
      apiMyJobs().then(({ bookings }) => setJobs(bookings)).catch(() => {});
    }
  }, [token]);

  useEffect(() => {
    if (typeof profile?.providerProfile?.priceNegotiable === 'boolean') {
      setPriceNegotiable(profile.providerProfile.priceNegotiable);
    }
    if (typeof profile?.providerProfile?.availability === 'boolean') {
      setIsOnline(profile.providerProfile.availability);
    }
  }, [profile?.providerProfile?.priceNegotiable, profile?.providerProfile?.availability]);

  useEffect(() => {
    const pp = profile?.providerProfile as any;
    if (!pp || locationDirty) return;
    if (typeof pp.homeService === 'boolean') setHomeService(pp.homeService);
    if (typeof pp.salonService === 'boolean') setSalonService(pp.salonService);
    if (typeof pp.salonAddress === 'string') setSalonAddressDraft(pp.salonAddress);
    if (pp.serviceRadiusKm != null) setServiceRadiusDraft(String(pp.serviceRadiusKm));
    if (pp.businessHours && typeof pp.businessHours === 'object') setHoursDraft(pp.businessHours);
  }, [profile?.providerProfile, locationDirty]);

  async function saveLocationSettings(overrides: Partial<{
    homeService: boolean; salonService: boolean; salonAddress: string; serviceRadiusKm: number; businessHours: BusinessHours;
  }> = {}) {
    setLocationSaving(true);
    try {
      const radius = Math.min(Math.max(Number(serviceRadiusDraft) || 10, 1), 200);
      const payload = {
        homeService, salonService,
        salonAddress: salonAddressDraft.trim(),
        serviceRadiusKm: radius,
        businessHours: hoursDraft,
        ...overrides,
      };
      const saved = await apiUpdateProviderLocationSettings(payload);
      setProfile(prev => prev ? { ...prev, providerProfile: { ...(prev.providerProfile as any), ...saved } } : prev);
      setLocationDirty(false);
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      Alert.alert('Could not save', e?.message || 'Please try again.');
    }
    setLocationSaving(false);
  }

  const todayEarnings = jobs
    .filter(j => j.status === 'COMPLETED' && new Date(j.scheduledAt).toDateString() === new Date().toDateString())
    .reduce((sum, j) => sum + j.totalPrice, 0);
  const weekEarnings = jobs
    .filter(j => {
      if (j.status !== 'COMPLETED') return false;
      const diffDays = (Date.now() - new Date(j.scheduledAt).getTime()) / (1000 * 60 * 60 * 24);
      return diffDays <= 7;
    })
    .reduce((sum, j) => sum + j.totalPrice, 0);

  async function toggleOnline() {
    if (onlineToggling) return;
    const next = !isOnline;
    setOnlineToggling(true);
    setIsOnline(next);
    try {
      await apiToggleAvailability(next);
      if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (e: any) {
      setIsOnline(!next);
      Alert.alert('Could not update status', e?.message || 'Please try again.');
    }
    setOnlineToggling(false);
  }

  async function compressAndSave(asset: ImagePicker.ImagePickerAsset) {
    setPhotoUploading(true);
    setPhotoError(null);

    // Show local preview IMMEDIATELY. On web, asset.uri can be an empty/blob that
    // renders late, so prefer an inline base64 data URI when available — it paints
    // instantly and doesn't depend on the slow server round-trip.
    const instantUri = asset.base64
      ? `data:${asset.mimeType ?? 'image/jpeg'};base64,${asset.base64}`
      : asset.uri;
    setPhotoUri(instantUri);
    updatePhoto(instantUri);

    try {
      let persistUri: string = asset.uri;
      const mimeType = asset.mimeType ?? 'image/jpeg';

      if (Platform.OS === 'web') {
        // On web: get data URL from base64 or blob URI
        let rawDataUrl = '';
        if (asset.base64) {
          rawDataUrl = `data:${mimeType};base64,${asset.base64}`;
        } else if (asset.uri.startsWith('blob:') && typeof FileReader !== 'undefined') {
          const resp = await fetch(asset.uri);
          const blob = await resp.blob();
          rawDataUrl = await new Promise<string>((res2, rej) => {
            const r = new FileReader();
            r.onload = () => res2(r.result as string);
            r.onerror = rej;
            r.readAsDataURL(blob);
          });
        }

        // Compress via canvas (max 800px)
        if (rawDataUrl.startsWith('data:') && typeof document !== 'undefined') {
          try {
            persistUri = await new Promise<string>((res2) => {
              const img = new (window as any).Image();
              img.onload = () => {
                const MAX = 800;
                const scale = Math.min(1, MAX / Math.max(img.naturalWidth || MAX, img.naturalHeight || MAX));
                const canvas = document.createElement('canvas');
                canvas.width  = Math.round(img.naturalWidth  * scale);
                canvas.height = Math.round(img.naturalHeight * scale);
                const ctx = canvas.getContext('2d');
                if (ctx) ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                res2(canvas.toDataURL('image/jpeg', 0.75));
              };
              img.onerror = () => res2(rawDataUrl);
              img.src = rawDataUrl;
            });
          } catch {
            persistUri = rawDataUrl;
          }
        } else {
          persistUri = rawDataUrl || asset.uri;
        }
      } else {
        if (asset.base64) persistUri = `data:${mimeType};base64,${asset.base64}`;
      }

      // Extract base64 from data URL and upload
      if (persistUri.startsWith('data:')) {
        const [header, base64Data] = persistUri.split(',');
        const mimeMatch = header.match(/data:([^;]+)/);
        const finalMime = mimeMatch?.[1] || 'image/jpeg';
        if (!base64Data) throw new Error('Could not read image data');
        const { apiUploadPhoto } = await import('../../api/client');
        const { photoUrl } = await apiUploadPhoto(base64Data, finalMime, 'avatar');
        updatePhoto(photoUrl);
        setPhotoUri(photoUrl);
        await Storage.savePhotoUri(photoUrl);
      } else {
        // Fallback: save URI as-is (no Blob storage, but at least show it)
        await Storage.savePhotoUri(persistUri);
        apiUpdateProfile({ photoUrl: persistUri }).catch(() => {});
      }

      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      console.error('[Profile] photo upload error:', err);
      const msg = err.message || 'Photo upload failed. Please try again.';
      setPhotoError(msg);
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert('Upload Failed', msg);
      }
    } finally {
      setPhotoUploading(false);
    }
  }

  async function pickPhoto() {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      // System picker (SDK 52) needs no read permission; requesting WRITE
      // permission and getting a denial wrongly blocks picking a photo.
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.7, base64: true });
      if (!result.canceled && result.assets[0]) await compressAndSave(result.assets[0]);
    } catch (err) {
      console.error('[Profile] pickPhoto error:', err);
      if (Platform.OS === 'web') alert('Could not load photo. Please try a different image.');
      else Alert.alert('Error', 'Could not load photo. Please try again.');
    }
  }

  async function takePhoto() {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permission Needed', 'Please allow camera access in Settings.'); return; }
      const result = await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.7, base64: true });
      if (!result.canceled && result.assets[0]) await compressAndSave(result.assets[0]);
    } catch (err) {
      console.error('[Profile] takePhoto error:', err);
      Alert.alert('Error', 'Could not take photo. Please try again.');
    }
  }

  function showPhotoOptions() {
    if (Platform.OS === 'web') { pickPhoto(); return; }
    Alert.alert('Profile Photo', 'How would you like to update your photo?', [
      { text: 'Take Photo', onPress: takePhoto },
      { text: 'Choose from Library', onPress: pickPhoto },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  function handleEditName() {
    openField('name', 'Your name', user?.name ?? '');
  }

  async function performDelete() {
    setDeletingAccount(true);
    try {
      const { apiDeleteAccount } = await import('../../api/client');
      await apiDeleteAccount();
      signOut();
    } catch (e: any) {
      setDeletingAccount(false);
      const msg = e?.message || 'Could not delete account. Please try again.';
      if (Platform.OS === 'web') window.alert(msg); else Alert.alert('Error', msg);
    }
  }

  function handleDeleteAccount() {
    // Two-step, friction-on-purpose confirmation so it can't be tapped by accident.
    const proceed = () => {
      if (Platform.OS === 'web') {
        if (window.confirm('Last chance — permanently delete your Glow account? This cannot be undone.')) performDelete();
        return;
      }
      confirmAction({
        title: 'Delete Account?',
        message: 'This permanently deletes your Glow account. Your booking history is kept in anonymized form as required by law. This cannot be undone.',
        confirmLabel: 'Delete Forever',
        cancelLabel: 'Keep My Account',
        destructive: true,
        onConfirm: performDelete,
      });
    };

    if (Platform.OS === 'web') {
      if (window.confirm('Are you sure you want to delete your account?')) proceed();
      return;
    }
    confirmAction({
      title: 'Delete Account',
      message: 'Are you sure? This will remove your access and anonymize your data.',
      confirmLabel: 'Continue',
      cancelLabel: 'Cancel',
      destructive: true,
      onConfirm: proceed,
    });
  }

  function handleSignOut() {
    if (Platform.OS === 'web') {
      if (window.confirm('Sign out of Glow?')) signOut();
      return;
    }
    confirmAction({
      title: 'Sign Out',
      message: 'Are you sure you want to sign out?',
      confirmLabel: 'Sign Out',
      destructive: true,
      onConfirm: signOut,
    });
  }

  const providerP = profile?.providerProfile;
  const approvalStatus: 'pending' | 'approved' | 'rejected' =
    !providerP ? 'pending' : providerP.approvedByAdmin ? 'approved' : 'pending';

  const roleLabel = isCustomer ? 'Glow Client' : isProvider ? 'Beauty Artist' : 'Administrator';
  const initial   = user?.name?.[0]?.toUpperCase() ?? '?';
  const memberSince = fmtMemberSince(profile?.createdAt);

  const providerRating      = profile?.rating ?? 0;
  const providerRatingCount = profile?.ratingCount ?? 0;

  // Stats values (with dash fallback)
  const customerTotalBookings = profile?.totalBookings ?? null;
  const customerHours         = profile?.totalHours ?? null;
  const customerSpent         = profile?.totalSpent ?? null;

  const providerSessions  = profile?.totalSessions ?? null;
  const providerAvgRating = providerRating > 0 ? providerRating.toFixed(1) : null;
  const providerEarned    = profile?.totalEarned ?? null;

  const locationLabel =
    permissionStatus === 'granted' && coords
      ? 'Location on'
      : permissionStatus === 'loading'
        ? 'Checking…'
        : permissionStatus === 'unavailable'
          ? 'Unavailable'
          : 'Location off';
  const locationSub =
    permissionStatus === 'granted' && coords
      ? 'Artists near you use this for accurate matches'
      : permissionStatus === 'unavailable'
        ? 'We couldn’t read GPS — try again or enter an address when booking'
        : 'Turn on location so we can match you with nearby artists';

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: insets.bottom + 130 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Soft blush hero ──────────────────────────────────────── */}
        <LinearGradient
          colors={[ROSE_DEEP, ROSE_MID, ROSE_SOFT]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.hero, { paddingTop: insets.top + 10 }]}
        >
          {/* Soft decorative blooms */}
          <View pointerEvents="none" style={styles.heroDecor}>
            <View style={[styles.heroBlob, { top: -50, right: -60, width: 180, height: 180, backgroundColor: 'rgba(255,255,255,0.14)' }]} />
            <View style={[styles.heroBlob, { bottom: 25, left: -50, width: 140, height: 140, backgroundColor: 'rgba(212,175,55,0.20)' }]} />
            <View style={[styles.heroBlob, { top: 60, left: 40, width: 14, height: 14, backgroundColor: 'rgba(255,255,255,0.60)' }]} />
            <View style={[styles.heroBlob, { top: 100, right: 55, width: 10, height: 10, backgroundColor: GOLD }]} />
            <View style={[styles.heroBlob, { top: 30, right: 30, width: 6, height: 6, backgroundColor: 'rgba(255,255,255,0.70)' }]} />
          </View>

          {/* Top row: back + bloom mark */}
          <View style={styles.heroTopRow}>
            {nav.canGoBack() ? (
              <Pressable
                style={styles.backBtn}
                onPress={() => nav.goBack()}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <ArrowBackIcon size={20} color="#FFFFFF" />
                <Text style={styles.backBtnLabel}>Back</Text>
              </Pressable>
            ) : (
              <View style={{ width: 72 }} />
            )}
            <View style={styles.heroMarkWrap}>
              <GlowMark size={28} petal="#FFFFFF" petalInner="rgba(255,255,255,0.45)" core={GOLD} />
            </View>
            <View style={{ width: 72 }} />
          </View>

          {/* Avatar */}
          <Pressable
            style={styles.avatarWrap}
            onPress={photoUploading ? undefined : showPhotoOptions}
            disabled={photoUploading}
            accessibilityLabel="Change profile photo"
            accessibilityRole="button"
          >
            <View style={styles.avatarRing}>
              {photoUri ? (
                <Image
                  key={photoUri}
                  source={{ uri: photoUri }}
                  style={styles.avatarImg}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  transition={150}
                  onError={() => {
                    setPhotoUri(null);
                    Storage.savePhotoUri('').catch(() => {});
                  }}
                />
              ) : (
                <LinearGradient
                  colors={['#FCECEF', '#E9A0B1']}
                  style={styles.avatarCircle}
                >
                  <Text style={styles.avatarInitial}>{initial}</Text>
                </LinearGradient>
              )}
              {photoUploading && (
                <View style={styles.avatarUploadOverlay}>
                  <ActivityIndicator color="#fff" size="large" />
                </View>
              )}
            </View>
            {!photoUploading && (
              <View style={styles.cameraBadge}>
                <CameraIcon size={14} color="#fff" />
              </View>
            )}
          </Pressable>

          {/* High-contrast photo CTA — white pill so it never disappears on blush */}
          {!photoUri && !photoUploading && (
            <Pressable onPress={showPhotoOptions} accessibilityRole="button" style={styles.addPhotoPill}>
              <CameraIcon size={13} color={BRAND} />
              <Text style={styles.addPhotoPillText}>Add a profile photo</Text>
            </Pressable>
          )}

          {photoError && (
            <View style={styles.photoErrorBanner}>
              <Text style={styles.photoErrorText}>{photoError}</Text>
              <Pressable onPress={() => setPhotoError(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={styles.photoErrorDismiss}>✕</Text>
              </Pressable>
            </View>
          )}

          <Text style={styles.heroName}>{user?.name ?? '—'}</Text>

          {/* Soft glass role / member chips */}
          <View style={styles.heroChipRow}>
            {!isCustomer && (
              <View style={styles.glassChip}>
                <Text style={styles.glassChipText}>{roleLabel}</Text>
              </View>
            )}
            {isCustomer && (
              <View style={styles.glassChip}>
                <Text style={styles.glassChipText}>Glow Client</Text>
              </View>
            )}
            {memberSince ? (
              <View style={styles.glassChipMuted}>
                <Text style={styles.glassChipMutedText}>Since {memberSince}</Text>
              </View>
            ) : null}
          </View>

          {isProvider && providerRating > 0 && (
            <View style={styles.heroRatingRow}>
              {renderStars(providerRating, 14)}
              <Text style={styles.heroRatingText}>
                {providerRating.toFixed(1)}
                {providerRatingCount > 0 ? ` · ${providerRatingCount} reviews` : ''}
              </Text>
            </View>
          )}

          {isProvider && providerP?.approvedByAdmin && (
            <View style={styles.verifiedBanner}>
              <ShieldCheckIcon size={15} color={ROSE_DEEP} />
              <Text style={styles.verifiedBannerText}>Verified Artist</Text>
            </View>
          )}

          <View style={styles.heroBottom} />
        </LinearGradient>

        {/* ── Business / Account segmented control (Provider only) ──────────
             Splits the previously long single scroll into two focused sub-tabs,
             mirroring the Booksy/Vagaro pattern (Business Settings vs Personal/
             Account Settings) found in competitor research. Customers keep the
             original single-scroll layout untouched — this control never renders
             for them. */}
        {isProvider && (
          <View style={styles.profileTabWrap}>
            <View style={styles.profileTabPill}>
              <Pressable
                style={[styles.profileTabBtn, providerProfileTab === 'business' && styles.profileTabBtnActive]}
                onPress={() => {
                  if (Platform.OS !== 'web') Haptics.selectionAsync();
                  setProviderProfileTab('business');
                }}
              >
                <Text style={[styles.profileTabText, providerProfileTab === 'business' && styles.profileTabTextActive]}>
                  Business
                </Text>
              </Pressable>
              <Pressable
                style={[styles.profileTabBtn, providerProfileTab === 'account' && styles.profileTabBtnActive]}
                onPress={() => {
                  if (Platform.OS !== 'web') Haptics.selectionAsync();
                  setProviderProfileTab('account');
                }}
              >
                <Text style={[styles.profileTabText, providerProfileTab === 'account' && styles.profileTabTextActive]}>
                  Account
                </Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* ── Earnings + availability summary (Provider) — front-loaded like
             Uber Driver's real-time earnings tracker + "Go" toggle on its home
             screen, rather than buried behind a separate Earnings nav card.
             Business sub-tab. ── */}
        {isProvider && providerProfileTab === 'business' && (
          <View style={styles.sectionWrap}>
            <Group
              title="Today"
              caption="Your live status and what you've earned"
            >
            <View style={styles.earningsCard}>
              <View style={styles.earningsTopRow}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                    <View style={[styles.earningsStatusDot, { backgroundColor: isOnline ? Colors.systemGreen : Colors.systemGray3 }]} />
                    <Text style={styles.earningsStatusText}>{isOnline ? "You're online" : "You're offline"}</Text>
                  </View>
                  <Text style={styles.earningsStatusSub}>
                    {isOnline ? 'Accepting new booking requests' : 'Go online to start accepting jobs'}
                  </Text>
                </View>
                <Pressable
                  onPress={toggleOnline}
                  disabled={onlineToggling}
                  style={[styles.earningsToggle, { backgroundColor: isOnline ? Colors.systemGreen : Colors.systemGray4 }]}
                >
                  <View style={[styles.earningsToggleKnob, { transform: [{ translateX: isOnline ? 20 : 0 }] }]} />
                </Pressable>
              </View>
              <View style={styles.earningsSplitRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.earningsAmount}>${todayEarnings.toFixed(0)}</Text>
                  <Text style={styles.earningsLabel}>Today</Text>
                </View>
                <View style={styles.earningsDivider} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.earningsAmount}>${weekEarnings.toFixed(0)}</Text>
                  <Text style={styles.earningsLabel}>This Week</Text>
                </View>
              </View>
              {/* "Quick glance" above, "full detail" below — the standalone
                  Earnings nav card that used to sit beside this card carried
                  equal weight for the same topic. Vagaro nests the detail
                  entry inside the summary it belongs to rather than repeating
                  it as a sibling section. */}
              <Pressable
                style={({ pressed }) => [styles.earningsDetailRow, pressed && { opacity: 0.7 }]}
                onPress={() => {
                  if (Platform.OS !== 'web') Haptics.selectionAsync();
                  nav.navigate('Earnings');
                }}
              >
                <View style={[styles.earningsDetailIcon]}>
                  <EarningsIcon size={16} color="#D97706" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.earningsDetailTitle}>My Earnings</Text>
                  <Text style={styles.earningsDetailSub}>Full history, charts &amp; monthly goal</Text>
                </View>
                <View style={styles.infoChevronChip}>
                  <Text style={styles.infoChevronChipText}>›</Text>
                </View>
              </Pressable>
            </View>
            </Group>
          </View>
        )}

        {/* ── Stats bar ───────────────────────────────────────────── */}
        {isCustomer && (
          <View style={styles.statsBar}>
            <View style={styles.statCell}>
              <Text style={styles.statNum}>
                {customerTotalBookings !== null ? String(customerTotalBookings) : '—'}
              </Text>
              <Text style={styles.statLabel}>Bookings</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statCell}>
              <Text style={styles.statNum}>
                {customerHours !== null ? `${customerHours}h` : '—'}
              </Text>
              <Text style={styles.statLabel}>Hours Booked</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statCell}>
              <Text style={styles.statNum}>
                {customerSpent !== null ? `$${customerSpent}` : '—'}
              </Text>
              <Text style={styles.statLabel}>Amount Spent</Text>
            </View>
          </View>
        )}

        {/* Account sub-tab — performance snapshot lives alongside identity/profile info. */}
        {isProvider && providerProfileTab === 'account' && (
          <View style={[styles.statsBar, styles.statsBarBelowEarnings]}>
            <View style={styles.statCell}>
              <Text style={styles.statNum}>
                {providerSessions !== null ? String(providerSessions) : '—'}
              </Text>
              <Text style={styles.statLabel}>Sessions Done</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statCell}>
              <Text style={styles.statNum}>
                {providerAvgRating ? `★ ${providerAvgRating}` : '—'}
              </Text>
              <Text style={styles.statLabel}>Avg Rating</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statCell}>
              <Text style={styles.statNum}>
                {providerEarned !== null ? `$${providerEarned}` : '—'}
              </Text>
              <Text style={styles.statLabel}>Total Earned</Text>
            </View>
          </View>
        )}

        {/* ── Identity group: Personal Info + Location ── Account sub-tab for
             Provider; same grouping applied to Customer so both roles read as
             one system. Fresha's "Personal settings → Personal info" keeps
             identity fields and device/location prefs in one group rather than
             as two peer headings. ── */}
        {(!isProvider || providerProfileTab === 'account') && (
        <View style={styles.sectionWrap}>
          <Group
            title="Your account"
            caption={isProvider ? 'Your identity and device settings' : 'Your details and how we match you'}
          >
          <Subhead title="Personal info" />
          <View style={styles.card}>
            <Pressable
              style={({ pressed }) => [styles.infoRow, pressed && { opacity: 0.6 }]}
              onPress={() => {
                if (Platform.OS !== 'web') Haptics.selectionAsync();
                handleEditName();
              }}
              accessibilityRole="button"
            >
              <View style={styles.infoLeft}>
                <View style={styles.infoIconWrap}><PersonIcon size={18} color={BRAND} /></View>
                <Text style={styles.infoLabel}>Name</Text>
              </View>
              <View style={styles.infoRight}>
                <Text style={styles.infoValue} numberOfLines={1}>{user?.name ?? '—'}</Text>
                <View style={styles.infoChevronChip}>
                  <Text style={styles.infoChevronChipText}>›</Text>
                </View>
              </View>
            </Pressable>
            <Divider />
            <InfoRow glyph="cellphone" label="Phone" value={user?.phone ?? '—'} />
            <View style={styles.chipRow}>
              <VerifiedChip label="Phone verified" />
            </View>
          </View>

          <Subhead title="Location" />
          <Pressable
            style={({ pressed }) => [styles.locationCard, pressed && permissionStatus !== 'granted' && { opacity: 0.9 }]}
            onPress={permissionStatus === 'granted' ? undefined : () => requestLocation()}
            disabled={permissionStatus === 'granted'}
          >
            <View style={[
              styles.locationIconWrap,
              permissionStatus === 'granted' ? styles.locationIconOk : styles.locationIconOff,
            ]}>
              <PinIcon size={20} color={permissionStatus === 'granted' ? BRAND : '#D97706'} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.locationTitle}>{locationLabel}</Text>
              <Text style={styles.locationSub}>{locationSub}</Text>
            </View>
            {permissionStatus !== 'granted' && (
              <View style={styles.locationCta}>
                <Text style={styles.locationCtaText}>Enable</Text>
              </View>
            )}
            {permissionStatus === 'granted' && (
              <View style={styles.locationOkPill}>
                <CheckCircleIcon size={14} color={BRAND} />
                <Text style={styles.locationOkText}>Active</Text>
              </View>
            )}
          </Pressable>
          </Group>
        </View>
        )}

        {/* ── Beauty profile group (Customer only) — skin tone/type, preferred
             occasions, and a shortcut to favorited artists. Helps artists prep
             for the client ahead of a booking. ── */}
        {isCustomer && (
          <View style={styles.sectionWrap}>
            <Group title="Beauty profile" caption="Helps artists prep for you">
              <Subhead title="Skin tone" />
              <View style={styles.skinToneRow}>
                {(['FAIR', 'LIGHT', 'MEDIUM', 'TAN', 'DEEP', 'RICH'] as const).map(tone => (
                  <Pressable
                    key={tone}
                    style={[styles.skinSwatch, SKIN_TONE_COLORS[tone] && { backgroundColor: SKIN_TONE_COLORS[tone] }, skinTone === tone && styles.skinSwatchActive]}
                    onPress={() => { if (Platform.OS !== 'web') Haptics.selectionAsync(); saveSkinTone(tone); }}
                    accessibilityLabel={tone}
                  />
                ))}
              </View>

              <Subhead title="Skin type" />
              <View style={styles.chipWrapRow}>
                {(['DRY', 'OILY', 'COMBINATION', 'NORMAL', 'SENSITIVE'] as const).map(type => (
                  <Pressable
                    key={type}
                    style={[styles.beautyChip, skinType === type && styles.beautyChipActive]}
                    onPress={() => { if (Platform.OS !== 'web') Haptics.selectionAsync(); saveSkinType(type); }}
                  >
                    <Text style={[styles.beautyChipText, skinType === type && styles.beautyChipTextActive]}>
                      {type.charAt(0) + type.slice(1).toLowerCase()}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Subhead title="Preferred for" />
              <View style={styles.chipWrapRow}>
                {LOOK_OCCASIONS.map(occ => (
                  <Pressable
                    key={occ}
                    style={[styles.beautyChip, preferredOccasions.includes(occ) && styles.beautyChipActive]}
                    onPress={() => { if (Platform.OS !== 'web') Haptics.selectionAsync(); toggleOccasion(occ); }}
                  >
                    <Text style={[styles.beautyChipText, preferredOccasions.includes(occ) && styles.beautyChipTextActive]}>{occ}</Text>
                  </Pressable>
                ))}
              </View>

              <Pressable
                style={({ pressed }) => [styles.infoRow, pressed && { opacity: 0.6 }]}
                onPress={() => nav.navigate('SavedTab', { initialTab: 'Artists' })}
              >
                <View style={styles.infoLeft}>
                  <Text style={styles.infoLabel}>Favorite Artists</Text>
                </View>
                <View style={styles.infoRight}>
                  <Text style={styles.infoValue}>{favoriteCount} saved</Text>
                </View>
              </Pressable>
            </Group>
          </View>
        )}

        {/* ── Public profile group (Provider) — Account sub-tab.
             Profile Strength is now the *summary at the top of* this group
             rather than its own peer section, matching Booksy Biz's "Profile
             Completeness", which is a single guide to the steps to succeed with
             tap-to-fix items, not a status indicator scattered beside the
             fields it grades. The fields it grades follow directly below. ── */}
        {isProvider && providerProfileTab === 'account' && (
          <View style={styles.sectionWrap}>
            <Group
              title="Your public profile"
              caption="What clients see before they book you"
            >
            <ProfileStrength
              providerProfile={providerP}
              hasPhoto={!!photoUri}
              phoneVerified
              onFixBio={() => openField('bio', 'About you', providerP?.bio ?? '', true)}
              onFixLanguages={() => { setLangDraft(providerP?.languages ?? []); setLangModal(true); }}
              onFixSpecialties={() => { setSpecDraft(providerP?.specialties ?? []); setSpecModal(true); }}
              onFixDocuments={() => nav.navigate('ProviderDocuments')}
            />

            {/* The fields the strength meter above actually grades. */}
            <Subhead title="Professional details" />
            <View style={styles.card}>
              {/* Approval status */}
              <View style={styles.approvalRow}>
                <StatusChip status={approvalStatus} />
              </View>

              {providerP ? (
                <>
                  <Divider />
                  {providerP.experienceYears > 0 && (
                    <>
                      <InfoRow glyph="medal" label="Experience" value={`${providerP.experienceYears} years`} />
                      <Divider />
                    </>
                  )}
                  <InfoRow
                    glyph="translate"
                    label="Languages"
                    value={(providerP.languages?.length ?? 0) > 0 ? providerP.languages!.join(' · ') : 'Add languages'}
                    onPress={() => { setLangDraft(providerP.languages ?? []); setLangModal(true); }}
                  />
                  <Divider />
                  <InfoRow
                    glyph="instagram"
                    label="Instagram"
                    value={providerP.instagramHandle?.trim() ? `@${providerP.instagramHandle}` : 'Add your Instagram'}
                    valueColor={providerP.instagramHandle?.trim() ? '#C4667E' : undefined}
                    onPress={() => openField('instagramHandle', 'Instagram handle', providerP.instagramHandle ?? '')}
                  />
                  <Divider />
                  {/* About you — full-width block so long bios wrap naturally */}
                  <Pressable
                    style={styles.bioBlock}
                    onPress={() => openField('bio', 'About you', providerP.bio ?? '', true)}
                  >
                    <View style={styles.bioLabelRow}>
                      <View style={styles.infoIconWrap}>
                        <PersonIcon size={18} color={BRAND} />
                      </View>
                      <Text style={styles.infoLabel}>About you</Text>
                      <Text style={styles.bioEditHint}>Edit ›</Text>
                    </View>
                    <Text style={providerP.bio?.trim() ? styles.bioValue : styles.bioPlaceholder}>
                      {providerP.bio?.trim() ? providerP.bio : 'Add a short bio — clients read this before booking you'}
                    </Text>
                  </Pressable>
                  <Divider />
                  <>
                    <Pressable
                      style={styles.specialtiesBlock}
                      onPress={() => { setSpecDraft(providerP.specialties ?? []); setSpecModal(true); }}
                    >
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={styles.specialtiesLabel}>Specialties</Text>
                        <Text style={{ color: Colors.brand, fontSize: 13, fontFamily: Fonts.semibold }}>Edit</Text>
                      </View>
                      {(providerP.specialties?.length ?? 0) > 0 ? (
                        <View style={styles.specialtiesChips}>
                          {providerP.specialties!.map(s => (
                            <View key={s} style={styles.specialtyChip}>
                              <Text style={styles.specialtyChipText}>{s}</Text>
                            </View>
                          ))}
                        </View>
                      ) : (
                        <Text style={{ color: Colors.tertiaryLabel, fontSize: 13, marginTop: 4 }}>
                          Tap to add your beauty specialties
                        </Text>
                      )}
                    </Pressable>
                    <Divider />
                  </>

                  {/* Verification grid — 4 even cells. Police check is OPTIONAL:
                      it only reads "Cleared" when actually verified (admin flag or
                      approved document), "Under review" once submitted, and offers
                      "Add" otherwise — admin approval alone never implies it. */}
                  <View style={styles.checkGrid}>
                    {(() => {
                      const policeCleared = !!providerP.policeCheckCleared || policeDoc === 'approved';
                      const policeStatus = policeCleared ? 'Cleared' : policeDoc === 'submitted' ? 'In review' : 'Add ›';
                      const items: {
                        Icon: typeof ShieldCheckIcon; label: string; ok: boolean;
                        status: string; onPress?: () => void;
                      }[] = [
                        { Icon: MedalIcon,              label: 'Certificate', ok: providerP.approvedByAdmin, status: providerP.approvedByAdmin ? 'Cleared' : 'Pending' },
                        {
                          Icon: ShieldCheckIcon, label: 'Police', ok: policeCleared, status: policeStatus,
                          onPress: !policeCleared && policeDoc === 'none'
                            ? () => nav.navigate('ProviderDocuments')
                            : undefined,
                        },
                        { Icon: CardAccountDetailsIcon, label: 'ID',       ok: providerP.approvedByAdmin, status: providerP.approvedByAdmin ? 'Cleared' : 'Pending' },
                        { Icon: CheckDecagramIcon,      label: 'Approved', ok: providerP.approvedByAdmin, status: providerP.approvedByAdmin ? 'Cleared' : 'Pending' },
                      ];
                      return items.map(item => (
                        <Pressable
                          key={item.label}
                          style={styles.checkCell}
                          disabled={!item.onPress}
                          onPress={item.onPress}
                        >
                          <View style={[styles.checkIconWrap, item.ok ? styles.checkIconOk : styles.checkIconPending]}>
                            {item.ok
                              ? <item.Icon size={16} color="#C4667E" />
                              : <ClockIcon size={16} color="#D4AF37" />
                            }
                          </View>
                          <Text style={styles.checkLabel} numberOfLines={1}>{item.label}</Text>
                          <Text style={[styles.checkStatus, { color: item.ok ? '#C4667E' : '#D4AF37' }]}>
                            {item.status}
                          </Text>
                        </Pressable>
                      ));
                    })()}
                  </View>
                </>
              ) : (
                <View style={styles.noProfileNote}>
                  <Text style={styles.noProfileText}>
                    Complete your credential onboarding to see verification status.
                  </Text>
                </View>
              )}
            </View>
            </Group>
          </View>
        )}

        {/* ── Provider gallery — its own section, right after Profile
             Strength, so it reads as a distinct, visually prioritized
             step rather than a buried row inside Professional details. ── */}
        {isProvider && providerProfileTab === 'account' && (
          <View style={styles.sectionWrap}>
            <Group title="Your gallery" caption="Show clients your work — aim for at least 3 photos">
            {/* Gallery photos */}
            <View style={{ marginBottom: 4 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={styles.infoIconWrap}>
                    <CameraIcon size={18} color={BRAND} />
                  </View>
                  <Text style={styles.infoLabel}>Profile Gallery</Text>
                </View>
                {galleryPhotos.length < 10 && (
                  <Pressable onPress={addGalleryPhoto} disabled={galleryUploading} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    {galleryUploading
                      ? <ActivityIndicator size="small" color={BRAND} />
                      : <Text style={{ color: BRAND, fontFamily: Fonts.semibold, fontSize: 13 }}>+ Add Photo</Text>
                    }
                  </Pressable>
                )}
              </View>
              {galleryPhotos.length === 0 ? (
                <Pressable onPress={addGalleryPhoto} style={styles.galleryEmpty}>
                  <CameraIcon size={28} color={Colors.tertiaryLabel} />
                  <Text style={styles.galleryEmptyText}>Add photos so clients can see you at work</Text>
                  <Text style={styles.galleryEmptyHint}>Up to 10 photos · Tap to add</Text>
                </Pressable>
              ) : (
                <View style={styles.galleryGrid}>
                  {galleryPhotos.map((url, i) => (
                    <View key={url + i} style={styles.galleryThumb}>
                      <Image source={{ uri: url }} style={styles.galleryThumbImg} contentFit="cover" cachePolicy="memory-disk" />
                      <Pressable
                        style={styles.galleryRemoveBtn}
                        onPress={() => {
                          Alert.alert('Remove photo?', 'This will remove it from your public profile.', [
                            { text: 'Cancel', style: 'cancel' },
                            { text: 'Remove', style: 'destructive', onPress: () => removeGalleryPhoto(url) },
                          ]);
                        }}
                      >
                        <Text style={styles.galleryRemoveBtnText}>✕</Text>
                      </Pressable>
                    </View>
                  ))}
                  {galleryPhotos.length < 10 && (
                    <Pressable style={styles.galleryAddTile} onPress={addGalleryPhoto} disabled={galleryUploading}>
                      {galleryUploading
                        ? <ActivityIndicator color={BRAND} />
                        : <Text style={styles.galleryAddTileText}>+</Text>
                      }
                    </Pressable>
                  )}
                </View>
              )}
            </View>
            </Group>
          </View>
        )}

        {/* ── Provider Documents nav card — Account sub-tab. Folded into the
             public-profile group: documents are what unlock the verification
             badges rendered directly above, so they belong with them rather
             than as a separate equal-weight heading. ── */}
        {isProvider && providerProfileTab === 'account' && (
          <View style={styles.sectionWrapTight}>
            <Pressable
              style={({ pressed }) => [styles.navCard, pressed && { opacity: 0.85 }]}
              onPress={() => nav.navigate('ProviderDocuments')}
            >
              <View style={[styles.navCardIcon, { backgroundColor: '#FCECEF', borderColor: '#F2E7E7' }]}>
                <NoteIcon size={22} color="#C4667E" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.navCardTitle}>My Credential Documents</Text>
                <Text style={styles.navCardSub}>
                  {docCount > 0
                    ? `${docCount} document${docCount !== 1 ? 's' : ''} uploaded`
                    : 'Upload police check, certificates & more'}
                </Text>
              </View>
              <View style={styles.navCardChevron}>
                <Text style={styles.navCardChevronText}>›</Text>
              </View>
            </Pressable>
          </View>
        )}

        {/* ── Section: Provider My Pricing — real, editable per-service list. Business sub-tab.
             Now the opening card of the "Your services" group (pricing is the
             highest-frequency thing an artist edits, so it leads the tab). ── */}
        {isProvider && providerProfileTab === 'business' && (
          <View style={styles.sectionWrap}>
            <Group
              title="Your services"
              caption="What you charge and how clients can book you"
            >
            <Subhead
              title="Pricing"
              action={hasPriceEdits ? (
                <Pressable onPress={savePriceEdits} disabled={pricesSaving} style={styles.saveChangesBtn}>
                  {pricesSaving
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={styles.saveChangesBtnText}>Save changes</Text>}
                </Pressable>
              ) : undefined}
            />
            <View style={styles.card}>
              {servicesLoading ? (
                <View style={{ paddingVertical: 20, alignItems: 'center' }}>
                  <ActivityIndicator color={BRAND} />
                </View>
              ) : services.length === 0 ? (
                <View style={styles.noProfileNote}>
                  <Text style={styles.noProfileText}>
                    You haven't added any priced services yet. Add prices during onboarding, or contact support to add your first service.
                  </Text>
                </View>
              ) : (
                services.map((s, i) => (
                  <View key={s.id}>
                    {i > 0 && <Divider />}
                    <View style={styles.priceRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.priceRowName} numberOfLines={1}>{s.name}</Text>
                        <Text style={styles.priceRowDuration}>{s.durationMin} min</Text>
                      </View>
                      <View style={styles.priceInputWrap}>
                        <Text style={styles.priceInputDollar}>$</Text>
                        <TextInput
                          style={styles.priceInput}
                          value={priceValueFor(s)}
                          onChangeText={v => setPriceEdits(prev => ({ ...prev, [s.id]: v.replace(/[^0-9.]/g, '') }))}
                          keyboardType="decimal-pad"
                          placeholder="0"
                          placeholderTextColor={Colors.tertiaryLabel}
                        />
                      </View>
                    </View>
                  </View>
                ))
              )}
              {services.length > 0 && (
                <>
                  <Divider />
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.infoLabel}>Open to negotiation</Text>
                      <Text style={styles.navCardSub}>Let clients propose a different price when booking</Text>
                    </View>
                    <Switch
                      value={priceNegotiable}
                      disabled={negotiableSaving}
                      onValueChange={async (next) => {
                        setPriceNegotiable(next);
                        setNegotiableSaving(true);
                        try {
                          await apiUpdateProviderPricing({ pricingModel: 'PER_SERVICE', priceNegotiable: next });
                        } catch (e: any) {
                          setPriceNegotiable(!next);
                          Alert.alert('Could not save', e?.message || 'Please try again.');
                        }
                        setNegotiableSaving(false);
                      }}
                      trackColor={{ false: '#D1D5DB', true: '#E9A0B1' }}
                      thumbColor={priceNegotiable ? BRAND : '#F4F4F5'}
                    />
                  </View>
                </>
              )}
            </View>

            {/* Where you work + business hours — real, editable fields. Was
                read-only backend data with no UI to set it, so clients only ever
                saw a blank/tiny address and no hours at all. Kept in the same
                group as pricing: both answer "how do clients book me?". */}
            <Subhead
              title="Where you work"
              action={locationDirty ? (
                <Pressable onPress={() => saveLocationSettings()} disabled={locationSaving} style={styles.saveChangesBtn}>
                  {locationSaving
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={styles.saveChangesBtnText}>Save changes</Text>}
                </Pressable>
              ) : undefined}
            />
            <View style={styles.card}>
              <View style={styles.workToggleRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.infoLabel}>At the client's home</Text>
                  <Text style={styles.navCardSub}>You travel to them</Text>
                </View>
                <Switch
                  value={homeService}
                  onValueChange={(next) => { setHomeService(next); setLocationDirty(true); }}
                  trackColor={{ false: '#D1D5DB', true: '#E9A0B1' }}
                  thumbColor={homeService ? BRAND : '#F4F4F5'}
                />
              </View>
              {homeService && (
                <View style={styles.radiusRow}>
                  <Text style={styles.radiusLabel}>Travel radius</Text>
                  <View style={styles.radiusInputWrap}>
                    <TextInput
                      style={styles.radiusInput}
                      value={serviceRadiusDraft}
                      onChangeText={v => { setServiceRadiusDraft(v.replace(/[^0-9]/g, '')); setLocationDirty(true); }}
                      keyboardType="number-pad"
                      placeholder="10"
                      placeholderTextColor={Colors.tertiaryLabel}
                    />
                    <Text style={styles.radiusUnit}>km</Text>
                  </View>
                </View>
              )}
              <Divider />
              <View style={styles.workToggleRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.infoLabel}>In your salon</Text>
                  <Text style={styles.navCardSub}>Clients come to your address</Text>
                </View>
                <Switch
                  value={salonService}
                  onValueChange={(next) => { setSalonService(next); setLocationDirty(true); }}
                  trackColor={{ false: '#D1D5DB', true: '#E9A0B1' }}
                  thumbColor={salonService ? BRAND : '#F4F4F5'}
                />
              </View>
              {salonService && (
                <View style={styles.addressInputWrap}>
                  <LocationIcon size={16} color={Colors.tertiaryLabel} />
                  <TextInput
                    style={styles.addressInput}
                    value={salonAddressDraft}
                    onChangeText={v => { setSalonAddressDraft(v); setLocationDirty(true); }}
                    placeholder="Street address, city"
                    placeholderTextColor={Colors.tertiaryLabel}
                    multiline
                  />
                </View>
              )}
            </View>

            <Subhead title="Business hours" />
            <View style={styles.card}>
              <ScrollView
                style={styles.hoursScroll}
                nestedScrollEnabled
                showsVerticalScrollIndicator
              >
                {HOUR_DAYS.map((d, i) => (
                  <View key={d.key}>
                    {i > 0 && <Divider />}
                    <View style={styles.hoursRow}>
                      <Text style={styles.hoursDay}>{d.label}</Text>
                      <TextInput
                        style={styles.hoursInput}
                        value={hoursDraft[d.key] ?? ''}
                        onChangeText={v => { setHoursDraft(prev => ({ ...prev, [d.key]: v })); setLocationDirty(true); }}
                        placeholder="Closed"
                        placeholderTextColor={Colors.tertiaryLabel}
                      />
                    </View>
                  </View>
                ))}
              </ScrollView>
              <Divider />
              <Pressable
                style={styles.hoursQuickFill}
                onPress={() => {
                  setHoursDraft({ mon: '9:00 AM - 6:00 PM', tue: '9:00 AM - 6:00 PM', wed: '9:00 AM - 6:00 PM', thu: '9:00 AM - 6:00 PM', fri: '9:00 AM - 6:00 PM', sat: '10:00 AM - 4:00 PM', sun: 'Closed' });
                  setLocationDirty(true);
                }}
              >
                <Text style={styles.hoursQuickFillText}>Use typical 9–6 weekdays</Text>
              </Pressable>
            </View>
            </Group>
          </View>
        )}

        {/* ── Provider public profile (marketing consent) — Business sub-tab.
             Nested under the "Your services" reach group rather than standing as
             a peer top-level section: Vagaro keeps "List Business on Vagaro.com"
             / contact visibility inside Business Profile, not beside it. ── */}
        {isProvider && providerP?.approvedByAdmin && providerProfileTab === 'business' && (
          <View style={styles.sectionWrap}>
            <Group title="Your reach" caption="Where clients can discover you">
            <View style={styles.navCard}>
              <View style={[styles.navCardIcon, { backgroundColor: '#FCECEF', borderColor: '#E9A0B1' }]}>
                <PersonIcon size={22} color={BRAND} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.navCardTitle}>Show me on our public website</Text>
                <Text style={styles.navCardSub}>
                  First name, photo & rating on our public site — never your contact info or location
                </Text>
              </View>
              <Switch
                value={publicProfile}
                disabled={publicSaving}
                onValueChange={async (next) => {
                  setPublicProfile(next);
                  setPublicSaving(true);
                  try {
                    await apiSetPublicProfile(next);
                  } catch (e: any) {
                    setPublicProfile(!next);
                    Alert.alert('Could not save', e?.message || 'Please try again.');
                  }
                  setPublicSaving(false);
                }}
                trackColor={{ false: '#D1D5DB', true: '#E9A0B1' }}
                thumbColor={publicProfile ? BRAND : '#F4F4F5'}
              />
            </View>
            </Group>
          </View>
        )}

        {/* ── Section: Customer Quick Actions ─────────────────────── */}
        {isCustomer && (
          <View style={styles.sectionWrap}>
            <Group title="Quick actions" caption="Everything you do most often">
            <View style={styles.quickActionsGrid}>
              <Pressable style={({ pressed }) => [styles.quickAction, pressed && { opacity: 0.82 }]} onPress={() => nav.navigate('NewBooking')}>
                <View style={[styles.quickActionIcon, { backgroundColor: Colors.brandDeep }]}>
                  <CalendarSVGIcon size={22} color="#fff" />
                </View>
                <Text style={styles.quickActionLabel}>Book Now</Text>
              </Pressable>
              <Pressable style={({ pressed }) => [styles.quickAction, pressed && { opacity: 0.82 }]} onPress={() => nav.navigate('Bookings')}>
                <View style={[styles.quickActionIcon, { backgroundColor: Colors.brandDeep }]}>
                  <CalendarSVGIcon size={22} color="#fff" />
                </View>
                <Text style={styles.quickActionLabel}>My Bookings</Text>
              </Pressable>
              <Pressable style={({ pressed }) => [styles.quickAction, pressed && { opacity: 0.82 }]} onPress={() => nav.navigate('Notifications')}>
                <View style={[styles.quickActionIcon, { backgroundColor: '#B45309' }]}>
                  <BellIcon size={22} color="#fff" />
                </View>
                <Text style={styles.quickActionLabel}>Alerts</Text>
              </Pressable>
              <Pressable style={({ pressed }) => [styles.quickAction, pressed && { opacity: 0.82 }]} onPress={() => nav.navigate('Help')}>
                <View style={[styles.quickActionIcon, { backgroundColor: '#92702A' }]}>
                  <HelpIcon size={22} color="#fff" />
                </View>
                <Text style={styles.quickActionLabel}>Help</Text>
              </Pressable>
            </View>
            </Group>
          </View>
        )}

        {/* ── Section: Customer Trust & Safety ─────────────────────── */}
        {/* Note: a prior "Account Verification" grid here (Phone Verified/Account
            Active/Private Pay/Providers Verified) was removed — it was 4 static
            icons with no real per-user data, duplicating what phone verification
            already shows for real in Personal Info above, and what this section
            already explains properly with real detail. */}
        {isCustomer && (
          <View style={styles.sectionWrap}>
            <Group title="Trust & safety" caption="How we vet every artist on Glow">
            <View style={styles.card}>
              {([
                { Icon: ShieldCheckIcon,        label: 'Background Checked', desc: 'Criminal record check',
                  detail: 'Artists can submit a Criminal Record Check for verification. Our team reviews each document, and artists who clear it carry a gold verified badge on their profile — look for it when you book. Artists without the badge have not completed a background check.' },
                { Icon: CardAccountDetailsIcon, label: 'ID Verified',     desc: 'Government photo ID',
                  detail: 'We confirm each Provider’s identity against a government-issued photo ID (driver’s licence, passport or provincial ID). The name on file must match their banking and certification documents, so you always know exactly who is coming to your home.' },
                { Icon: AccountCheckIcon,       label: 'Admin Approved',  desc: 'Reviewed by our team',
                  detail: 'Beyond automated checks, a Glow team member manually reviews every Provider application — credentials, experience, references and documents — before approving them. No Provider appears in the app until a human has signed off.' },
                { Icon: StarIcon,               label: 'Rating System',   desc: '1–5 stars per visit',
                  detail: 'After each completed visit, clients rate their Provider from 1 to 5 stars and can leave a review. Ratings are visible on every Provider profile and we follow up on any low scores, so quality stays high across the whole network.' },
              ] as const).map((t, i) => (
                <View key={t.label}>
                  {i > 0 && <Divider />}
                  <Pressable
                    style={({ pressed }) => [styles.trustRow, pressed && { opacity: 0.6 }]}
                    onPress={() => {
                      if (Platform.OS !== 'web') Haptics.selectionAsync();
                      setTrustModal({ label: t.label, desc: t.desc, detail: t.detail });
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`${t.label} — tap to learn more`}
                  >
                    <View style={styles.trustIconWrap}>
                      <t.Icon size={18} color={BRAND} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.trustLabel}>{t.label}</Text>
                      <Text style={styles.trustDesc}>{t.desc}</Text>
                    </View>
                    <View style={styles.infoChevronChip}>
                      <Text style={styles.infoChevronChipText}>›</Text>
                    </View>
                  </Pressable>
                </View>
              ))}
            </View>
            </Group>
          </View>
        )}

        {/* ── Section: Admin Portal ─────────────────────────────────── */}
        {isAdmin && (
          <View style={styles.sectionWrap}>
            <Group title="Admin portal" caption="Platform tools">
            <View style={styles.card}>
              <InfoRow
                glyph="monitor-dashboard" label="Admin Dashboard" value="Open admin panel"
                valueColor="#C4667E"
                onPress={() => Linking.openURL('/admin')}
              />
              <Divider />
              <InfoRow glyph="chart-box-outline" label="Stats" value="View platform analytics" />
            </View>
            </Group>
          </View>
        )}

        {/* ── Support / App Info / Legal / Sign Out / Delete Account ──────────
             Account sub-tab for Provider (per spec); unchanged/always-visible
             for Customer. ── */}
        {(!isProvider || providerProfileTab === 'account') && (
        <>
        {/* ── "More" catch-all — Support + App Info + Legal collapsed into one
             deliberately quieter tier at the bottom, instead of three
             full-weight sections sitting beside core account info. StyleSeat
             puts exactly this class of rarely-touched item (plan & billing,
             legal) in a single "Other" group at the bottom of its pro Menu. ── */}
        <View style={styles.sectionWrap}>
          <Group
            title="More"
            caption="Help, legal and app details"
            tone="secondary"
          >
          <Subhead title="Support" />
          <View style={styles.cardQuiet}>
            <InfoRow
              glyph="email-outline" label="Email Us" value="support@glow.app"
              valueColor="#C4667E"
              onPress={() => Linking.openURL('mailto:support@glow.app?subject=Glow Support')}
            />
            <Divider />
            <InfoRow
              glyph="cellphone" label="Call Us" value="+1 (647) 620-9243"
              valueColor="#C4667E"
              onPress={() => Linking.openURL('tel:+16476209243')}
            />
            <Divider />
            <InfoRow glyph="clock-outline" label="Hours" value="24/7" />
            <Divider />
            <InfoRow glyph="translate" label="Languages" value="English" />
          </View>

          <Subhead title="App info" />
          <View style={styles.cardQuiet}>
            <InfoRow glyph="package-variant" label="Version" value={`v${appVersion}`} />
          </View>

          <Subhead title="Legal" />
          <View style={styles.cardQuiet}>
            <InfoRow
              glyph="shield-check" label="Privacy Policy" value=""
              onPress={() => Linking.openURL('https://glow-landing-five.vercel.app/privacy')}
            />
            <Divider />
            <InfoRow
              glyph="card-account-details-outline" label="Terms of Service" value=""
              onPress={() => Linking.openURL('https://glow-landing-five.vercel.app/terms')}
            />
          </View>
          </Group>
        </View>
        </>
        )}

        {/* ── Sign Out — always reachable regardless of Business/Account
             sub-tab; it must never be hidden behind provider tab state. ── */}
        <View style={styles.sectionWrap}>
          <Pressable
            style={({ pressed }) => [styles.signOutBtn, pressed && { opacity: 0.8 }]}
            onPress={handleSignOut}
          >
            <Text style={styles.signOutText}>Sign Out</Text>
          </Pressable>
        </View>

        {/* ── Delete Account (App Store Guideline 5.1.1(v)) ─────────── */}
        <View style={styles.sectionWrap}>
          <Pressable
            style={({ pressed }) => [styles.deleteAccountBtn, pressed && { opacity: 0.7 }]}
            onPress={handleDeleteAccount}
            disabled={deletingAccount}
          >
            {deletingAccount
              ? <ActivityIndicator color="#DC2626" />
              : <Text style={styles.deleteAccountText}>Delete Account</Text>}
          </Pressable>
          <Text style={styles.deleteAccountHint}>
            Permanently deletes your account. Your booking history is retained in
            anonymized form as required by law. This cannot be undone.
          </Text>
        </View>

        <Text style={styles.footer}>
          © {new Date().getFullYear()} Glow · Beauty, on demand{'\n'}{DEFAULT_REGION_NAME}
        </Text>
      </ScrollView>

      {/* Edit text field (name / bio) modal */}
      <Modal visible={!!fieldModal} transparent animationType="slide" onRequestClose={() => setFieldModal(null)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={specStyles.overlay}
        >
          <View style={specStyles.sheet}>
            <Text style={specStyles.title}>{fieldModal?.title}</Text>
            <TextInput
              value={fieldDraft}
              onChangeText={setFieldDraft}
              placeholder={fieldModal?.key === 'instagramHandle' ? 'yourusername' : fieldModal?.title}
              placeholderTextColor={Colors.tertiaryLabel}
              multiline={fieldModal?.multiline}
              autoCapitalize={fieldModal?.key === 'instagramHandle' ? 'none' : 'sentences'}
              autoCorrect={fieldModal?.key !== 'instagramHandle'}
              style={[specStyles.input, fieldModal?.multiline && { height: 110, textAlignVertical: 'top' }]}
              autoFocus
            />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
              <Pressable style={[specStyles.btn, specStyles.btnGhost]} onPress={() => setFieldModal(null)}>
                <Text style={specStyles.btnGhostText}>Cancel</Text>
              </Pressable>
              <Pressable style={[specStyles.btn, specStyles.btnPrimary]} onPress={saveField} disabled={fieldSaving}>
                {fieldSaving ? <ActivityIndicator color="#fff" /> : <Text style={specStyles.btnPrimaryText}>Save</Text>}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Edit languages modal */}
      <Modal visible={langModal} transparent animationType="slide" onRequestClose={() => setLangModal(false)}>
        <View style={specStyles.overlay}>
          <View style={specStyles.sheet}>
            <Text style={specStyles.title}>Languages you speak</Text>
            <Text style={specStyles.sub}>Clients can filter by language.</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 8 }}>
              {LANGUAGE_OPTIONS.map(l => {
                const on = langDraft.includes(l);
                return (
                  <Pressable
                    key={l}
                    onPress={() => setLangDraft(d => on ? d.filter(x => x !== l) : [...d, l])}
                    style={[specStyles.chip, on && specStyles.chipOn]}
                  >
                    <Text style={[specStyles.chipText, on && specStyles.chipTextOn]}>{l}</Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
              <Pressable style={[specStyles.btn, specStyles.btnGhost]} onPress={() => setLangModal(false)}>
                <Text style={specStyles.btnGhostText}>Cancel</Text>
              </Pressable>
              <Pressable style={[specStyles.btn, specStyles.btnPrimary]} onPress={saveLanguages} disabled={fieldSaving}>
                {fieldSaving ? <ActivityIndicator color="#fff" /> : <Text style={specStyles.btnPrimaryText}>Save</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Trust & Safety detail modal */}
      <Modal visible={!!trustModal} transparent animationType="slide" onRequestClose={() => setTrustModal(null)}>
        <View style={specStyles.overlay}>
          <View style={specStyles.sheet}>
            <Text style={specStyles.title}>{trustModal?.label}</Text>
            <Text style={specStyles.sub}>{trustModal?.desc}</Text>
            <Text style={{ fontSize: 14, color: Colors.secondaryLabel, lineHeight: 21, marginTop: 8, marginBottom: 4 }}>
              {trustModal?.detail}
            </Text>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              <Pressable style={[specStyles.btn, specStyles.btnPrimary]} onPress={() => setTrustModal(null)}>
                <Text style={specStyles.btnPrimaryText}>Got it</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit specialties modal */}
      <Modal visible={specModal} transparent animationType="slide" onRequestClose={() => setSpecModal(false)}>
        <View style={specStyles.overlay}>
          <View style={specStyles.sheet}>
            <Text style={specStyles.title}>Your specialties</Text>
            <Text style={specStyles.sub}>Pick the beauty services you shine at — clients see these.</Text>
            <ScrollView style={{ maxHeight: 360 }} contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 8 }}>
              {SPECIALTY_OPTIONS.map(s => {
                const on = specDraft.includes(s);
                return (
                  <Pressable
                    key={s}
                    onPress={() => setSpecDraft(d => on ? d.filter(x => x !== s) : [...d, s])}
                    style={[specStyles.chip, on && specStyles.chipOn]}
                  >
                    <Text style={[specStyles.chipText, on && specStyles.chipTextOn]}>{s}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
              <Pressable style={[specStyles.btn, specStyles.btnGhost]} onPress={() => setSpecModal(false)}>
                <Text style={specStyles.btnGhostText}>Cancel</Text>
              </Pressable>
              <Pressable style={[specStyles.btn, specStyles.btnPrimary]} onPress={saveSpecialties} disabled={specSaving}>
                {specSaving ? <ActivityIndicator color="#fff" /> : <Text style={specStyles.btnPrimaryText}>Save</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  scroll: { flex: 1 },

  // ── Business / Account segmented control (Provider only) ──
  profileTabWrap: { paddingHorizontal: 16, marginTop: 20, alignItems: 'center' },
  // Blush track instead of systemGray6 — keeps the control in the brand palette.
  profileTabPill: {
    flexDirection: 'row',
    backgroundColor: Colors.surfaceBlush,
    borderRadius: R_PILL,
    padding: 4,
    width: '100%',
  },
  profileTabBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: R_PILL,
    alignItems: 'center',
  },
  profileTabBtnActive: {
    backgroundColor: '#fff',
    shadowColor: Colors.shadowSoft,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.10,
    shadowRadius: 8,
    elevation: 2,
  },
  profileTabText: { ...Type.rowLabel, fontSize: 14, fontFamily: Fonts.medium, color: Colors.secondaryLabel },
  profileTabTextActive: { fontFamily: Fonts.semibold, color: BRAND },

  // ── Earnings + availability summary card ──
  earningsCard: {
    backgroundColor: '#fff', borderRadius: R_CARD, padding: 20,
    borderWidth: 1, borderColor: Colors.cardBorder,
    ...SHADOW_CARD,
  },
  earningsTopRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingBottom: 18, marginBottom: 18, borderBottomWidth: 1, borderBottomColor: DIVIDER_C },
  earningsStatusDot: { width: 8, height: 8, borderRadius: 4 },
  earningsStatusText: { ...Type.cardTitle, fontSize: 15, color: VALUE },
  earningsStatusSub: { ...Type.caption, color: Colors.tertiaryLabel, marginTop: 3 },
  earningsToggle: { width: 48, height: 28, borderRadius: 14, justifyContent: 'center', paddingHorizontal: 3 },
  earningsToggleKnob: {
    width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.2, shadowRadius: 3, elevation: 3,
  },
  earningsSplitRow: { flexDirection: 'row', alignItems: 'center' },
  earningsAmount: { ...Type.statNum, fontSize: 24, color: VALUE },
  earningsLabel: { ...Type.overline, fontSize: 10, color: Colors.tertiaryLabel, marginTop: 4, textTransform: 'uppercase' },
  earningsDivider: { width: 1, height: 34, backgroundColor: DIVIDER_C, marginHorizontal: 16 },

  // ── Real per-service pricing list ──
  saveChangesBtn: {
    backgroundColor: Colors.brand, borderRadius: 100,
    paddingHorizontal: 14, paddingVertical: 7,
  },
  saveChangesBtnText: { color: '#fff', fontSize: 12.5, fontFamily: Fonts.semibold },
  priceRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 12, gap: 12,
  },
  priceRowName: { ...Type.rowValue, fontSize: 14.5, color: Colors.label },
  priceRowDuration: { ...Type.caption, fontSize: 12, color: Colors.tertiaryLabel, marginTop: 3 },
  priceInputWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surfaceCream, borderRadius: R_WELL,
    paddingHorizontal: 12, borderWidth: 1, borderColor: Colors.separator,
    minWidth: 76,
  },
  priceInputDollar: { fontSize: 14, fontFamily: Fonts.semibold, color: Colors.secondaryLabel },
  priceInput: {
    flex: 1, fontSize: 14, fontFamily: Fonts.semibold, color: Colors.label,
    paddingVertical: 8, paddingHorizontal: 4, textAlign: 'right',
  },

  // ── Where you work + business hours ──
  workToggleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 12,
  },
  radiusRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingBottom: 14,
  },
  radiusLabel: { fontSize: 13.5, color: Colors.secondaryLabel, fontFamily: Fonts.medium },
  radiusInputWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.surfaceCream, borderRadius: R_WELL,
    paddingHorizontal: 12, borderWidth: 1, borderColor: Colors.separator,
    minWidth: 76,
  },
  radiusInput: {
    fontSize: 14, fontFamily: Fonts.semibold, color: Colors.label,
    paddingVertical: 8, textAlign: 'right', minWidth: 30,
  },
  radiusUnit: { fontSize: 13, color: Colors.tertiaryLabel, fontFamily: Fonts.regular },
  addressInputWrap: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: Colors.surfaceCream, borderRadius: R_WELL,
    paddingHorizontal: 14, paddingVertical: 12, marginBottom: 12,
    borderWidth: 1, borderColor: Colors.separator,
  },
  addressInput: {
    flex: 1, fontSize: 14, fontFamily: Fonts.regular, color: Colors.label,
    minHeight: 20, paddingTop: 0,
  },
  // Capped height + internal ScrollView: 7 rows of hours can run long on
  // small screens, so the list scrolls in place instead of pushing the
  // rest of the page (and the whole card) out of view.
  hoursScroll: { maxHeight: 260 },
  hoursRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 10,
  },
  hoursDay: { fontSize: 14, fontFamily: Fonts.semibold, color: Colors.label, width: 44 },
  hoursInput: {
    flex: 1, fontSize: 13.5, fontFamily: Fonts.regular, color: Colors.label,
    textAlign: 'right', paddingVertical: 6,
  },
  hoursQuickFill: { paddingVertical: 12, alignItems: 'center' },
  hoursQuickFillText: { fontSize: 13, fontFamily: Fonts.semibold, color: BRAND },

  // ── Soft blush hero ──
  hero: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 56,
    overflow: 'hidden',
    borderBottomLeftRadius: 36,
    borderBottomRightRadius: 36,
  },
  heroDecor: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  heroBlob: { position: 'absolute', borderRadius: 999 },
  heroTopRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    minHeight: 40,
  },
  heroMarkWrap: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)',
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  backBtnLabel: {
    color: '#FFFFFF',
    fontSize: 15,
    fontFamily: Fonts.semibold,
  },
  heroBottom: { height: 4 },

  // Avatar — Instagram's profile-header treatment: a large, confident portrait
  // with a clean white ring and a soft halo, rather than a heavy drop-shadowed
  // disc. Ring is thinner (3) and the halo far softer (was 0.4/24 — a hard,
  // muddy shadow that made the avatar look pasted onto the gradient).
  avatarWrap: { position: 'relative', marginBottom: 20 },
  avatarRing: {
    width: 132, height: 132, borderRadius: 66,
    borderWidth: 3, borderColor: '#FFFFFF',
    overflow: 'hidden',
    shadowColor: ROSE_DEEP, shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22, shadowRadius: 30,
    elevation: 10,
  },
  avatarImg:    { width: '100%', height: '100%' },
  avatarCircle: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { color: ROSE_DEEP, fontSize: 46, fontFamily: Fonts.bold, letterSpacing: -1 },
  cameraBadge: {
    position: 'absolute', bottom: 2, right: 2,
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: BRAND,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: '#FFFFFF',
    shadowColor: ROSE_DEEP, shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.22, shadowRadius: 8, elevation: 5,
  },
  addPhotoPill: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16, paddingVertical: 9,
    borderRadius: R_PILL, marginBottom: 14,
    shadowColor: ROSE_DEEP, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12, shadowRadius: 12, elevation: 3,
  },
  addPhotoPillText: { ...Type.caption, fontFamily: Fonts.semibold, color: BRAND },

  avatarUploadOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(163,77,99,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoErrorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#FEF2F2',
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
    marginTop: 6, marginBottom: 8, borderWidth: 1, borderColor: '#FCA5A5',
    maxWidth: 300,
  },
  photoErrorText: { flex: 1, fontSize: 12, fontFamily: Fonts.medium, color: '#DC2626', lineHeight: 16 },
  photoErrorDismiss: { fontSize: 14, fontFamily: Fonts.semibold, color: '#DC2626' },

  // Editorial name treatment — tight tracking, no text-shadow. The old 0.45
  // rose text-shadow smeared the letterforms and was the loudest "2014 app"
  // signal in the hero (Glossier sets names in clean, confident type on flat
  // colour, never embossed).
  heroName: {
    ...Type.heroName,
    color: '#FFFFFF',
    marginBottom: 12,
  },
  heroChipRow: {
    flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center',
    gap: 8, marginBottom: 8,
  },
  glassChip: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 15, paddingVertical: 7,
    borderRadius: R_PILL,
  },
  glassChipText: { ...Type.caption, fontFamily: Fonts.semibold, color: ROSE_DEEP },
  glassChipMuted: {
    backgroundColor: 'rgba(255,255,255,0.20)',
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: R_PILL,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.34)',
  },
  glassChipMutedText: { ...Type.caption, fontFamily: Fonts.medium, color: '#FFFFFF' },

  heroRatingRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10, marginTop: 6,
  },
  heroRatingText: {
    ...Type.caption, fontFamily: Fonts.medium, color: 'rgba(255,255,255,0.95)',
  },

  verifiedBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 15, paddingVertical: 8,
    borderRadius: R_PILL, marginTop: 8,
  },
  verifiedBannerText: { ...Type.body, fontFamily: Fonts.semibold, color: ROSE_DEEP },

  // ── Stats bar ── Instagram's profile stat row: big confident numerals over
  // quiet, wide-tracked labels, separated by hairlines rather than boxed cells.
  statsBar: {
    flexDirection: 'row',
    backgroundColor: CARD,
    marginHorizontal: 16,
    borderRadius: R_CARD,
    marginTop: -30,
    paddingVertical: 20,
    paddingHorizontal: 8,
    ...SHADOW_FLOAT,
    borderWidth: 1, borderColor: Colors.cardBorder,
    marginBottom: 8,
  },
  // Provider profile inserts the earnings card between the hero and this bar
  // (see the earnings summary section above) — the -28 pull-up above was
  // designed for the bar sitting directly under the hero gradient (customer
  // profile) and was clipping into the earnings card's own bottom edge here.
  statsBarBelowEarnings: { marginTop: 12 },
  statCell: { flex: 1, alignItems: 'center', gap: 6 },
  statNum: { ...Type.statNum, color: ROSE_DEEP },
  // Wide-tracked uppercase caption — the "considered" label treatment Sephora
  // and Glossier use under numerals, vs. the old plain 12px semibold.
  statLabel: {
    ...Type.overline, fontSize: 10, color: Colors.tertiaryLabel,
    textTransform: 'uppercase', textAlign: 'center',
  },
  statDivider: { width: 1, height: 36, backgroundColor: DIVIDER_C, alignSelf: 'center' },

  // ── Location card ──
  locationCard: {
    backgroundColor: CARD, borderRadius: R_CARD, padding: 18,
    flexDirection: 'row', alignItems: 'center', gap: 16,
    borderWidth: 1, borderColor: Colors.cardBorder,
    ...SHADOW_CARD,
  },
  locationIconWrap: {
    width: 46, height: 46, borderRadius: R_WELL,
    alignItems: 'center', justifyContent: 'center',
  },
  locationIconOk:  { backgroundColor: ICON_BG },
  locationIconOff: { backgroundColor: Colors.goldSoft },
  locationTitle: { ...Type.cardTitle, color: VALUE, marginBottom: 3 },
  locationSub:   { ...Type.caption, color: Colors.tertiaryLabel, lineHeight: 18 },
  locationCoords: { ...Type.overline, fontSize: 10, color: Colors.tertiaryLabel, marginTop: 5 },
  locationCta: {
    backgroundColor: BRAND, paddingHorizontal: 16, paddingVertical: 10,
    borderRadius: 999,
  },
  locationCtaText: { color: '#fff', fontSize: 14, fontFamily: Fonts.semibold },
  locationOkPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: ICON_BG, paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 999, borderWidth: 1, borderColor: Colors.brandAccent,
  },
  locationOkText: { ...Type.caption, fontFamily: Fonts.semibold, color: BRAND },

  // ── Section ── More air between groups (28 vs 24): Glossier/Pinterest lean
  // on generous vertical rhythm to make a long page feel calm rather than dense.
  sectionWrap: { paddingHorizontal: 16, marginTop: 28 },
  // Continuation of the group directly above — small gap so the card reads as
  // part of that group rather than as a new peer section.
  sectionWrapTight: { paddingHorizontal: 16, marginTop: 12 },

  // ── Beauty profile (Customer only) — skin tone swatches + skin type /
  // preferred-occasion chips, matching the pill styling used elsewhere.
  skinToneRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, marginBottom: 4 },
  skinSwatch: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: 'transparent' },
  skinSwatchActive: { borderColor: Colors.brand },
  chipWrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, marginBottom: 4 },
  beautyChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 100,
    backgroundColor: '#fff', borderWidth: 1, borderColor: Colors.separator,
  },
  beautyChipActive: { backgroundColor: Colors.label, borderColor: Colors.label },
  beautyChipText: { fontSize: 13, fontFamily: Fonts.medium, color: Colors.secondaryLabel },
  beautyChipTextActive: { color: '#fff' },

  // ── Group (primary tier) ──
  // A named tier that owns several cards. The rose accent BAR is replaced by a
  // small gold bloom dot: the bar read as a generic "section rule" widget,
  // while the dot ties the heading to the brand mark without shouting.
  group: {},
  groupSecondary: { opacity: 1 },
  groupHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 14, paddingHorizontal: 4 },
  groupAccent: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: GOLD, marginTop: 9,
  },
  groupTitle: { ...Type.groupTitle, color: VALUE },
  groupCaption: {
    ...Type.caption, color: Colors.tertiaryLabel,
    marginTop: 3, lineHeight: 18,
  },
  // Secondary tier — de-emphasised via colour + weight rather than a blanket
  // opacity (which also washed out the cards underneath).
  groupTitleSecondary: { fontFamily: Fonts.semibold, fontSize: 15, color: LABEL, letterSpacing: -0.2 },
  groupCaptionSecondary: { color: Colors.tertiaryLabel },
  groupBody: { gap: 0 },

  // ── Subhead — a label for a card *inside* a group, not a peer heading. ──
  subheadRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 10, marginTop: 20, paddingHorizontal: 4, minHeight: 26,
  },
  subhead: {
    ...Type.overline,
    color: Colors.tertiaryLabel, textTransform: 'uppercase',
  },

  // Quieter card for the secondary "More" tier — flatter, no lift.
  cardQuiet: {
    backgroundColor: CARD, borderRadius: R_CARD,
    paddingHorizontal: 18, paddingVertical: 16,
    borderWidth: 1, borderColor: Colors.cardBorder,
  },

  // Full-detail entry nested inside the earnings summary card.
  earningsDetailRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginTop: 16, paddingTop: 14,
    borderTopWidth: 1, borderTopColor: DIVIDER_C,
  },
  earningsDetailIcon: {
    width: 32, height: 32, borderRadius: 11,
    backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A',
    alignItems: 'center', justifyContent: 'center',
  },
  earningsDetailTitle: { ...Type.cardTitle, fontSize: 14.5, color: VALUE },
  earningsDetailSub: { ...Type.caption, fontSize: 12, color: Colors.tertiaryLabel, marginTop: 2 },

  // ── Card ── Pinterest card treatment: generous padding, soft warm lift, a
  // hairline border doing the edge definition instead of a heavy shadow.
  card: {
    backgroundColor: CARD, borderRadius: R_CARD,
    paddingHorizontal: 20, paddingVertical: 20,
    ...SHADOW_CARD,
    borderWidth: 1, borderColor: Colors.cardBorder,
  },

  // Subtler in-card rule + more air around it. A full-strength separator inside
  // an already-bordered card chopped the content into stacked boxes.
  divider: { height: 1, backgroundColor: DIVIDER_C, marginVertical: 16 },

  // ── Info row ──
  // Tappable rows use the brand rose icon chip below; informational-only rows
  // switch to infoIconWrapMuted (neutral gray) so "display only" reads at a
  // glance, matching the affordance split used across NearbyJobs/Calendar.
  infoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 56 },
  infoLeft:  { flexDirection: 'row', alignItems: 'center', gap: 14, flexShrink: 0 },
  infoIconWrap: {
    width: 38, height: 38, borderRadius: R_WELL,
    backgroundColor: ICON_BG, alignItems: 'center', justifyContent: 'center',
  },
  // Muted chips now sit on warm blush, not systemGray6. A cool gray chip on a
  // cream page was the single most "system settings" element on the screen.
  infoIconWrapMuted: { backgroundColor: Colors.surfaceCream },
  // Label vs value now differ in WEIGHT (medium vs semibold) and colour, not
  // just colour — so the eye separates "what" from "what it's set to".
  infoLabel: { ...Type.rowLabel, color: LABEL },
  infoRight: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, justifyContent: 'flex-end' },
  infoValue: { ...Type.rowValue, color: VALUE, textAlign: 'right', flexShrink: 1 },
  // Bare chevron glyph — the filled circular chip repeated on every row read as
  // a button, competing with the actual buttons. Sephora/Instagram use a plain
  // light chevron for "drill in".
  infoChevronChip: {
    width: 20, height: 26, alignItems: 'center', justifyContent: 'center',
  },
  infoChevronChipText: { fontSize: 19, color: Colors.brandAccent, fontFamily: Fonts.medium, marginTop: -2 },

  chipRow: { marginTop: 6, marginBottom: 2 },

  // Borderless tinted chip — a rose fill on a rose outline was double-stating
  // the same accent. Sephora/Glossier use flat tinted pills with no stroke.
  verifiedChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: ICON_BG, borderRadius: R_PILL,
    paddingHorizontal: 13, paddingVertical: 7, alignSelf: 'flex-start',
  },
  verifiedChipText: { ...Type.caption, fontFamily: Fonts.semibold, color: BRAND },

  approvalRow: { marginBottom: 6 },
  statusChip: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: 14, borderWidth: 1.5,
    paddingHorizontal: 16, paddingVertical: 10, alignSelf: 'flex-start',
  },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  statusChipText: { fontSize: 14, fontFamily: Fonts.semibold, letterSpacing: -0.1 },

  bioBlock: { paddingVertical: 10, gap: 6 },
  bioLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  bioEditHint: { marginLeft: 'auto', ...Type.caption, fontFamily: Fonts.semibold, color: Colors.brand },
  // Bio gets a genuinely editorial setting — larger line-height and readable
  // body size, the way Glossier sets a personal blurb.
  bioValue: {
    ...Type.body, fontSize: 14, color: Colors.secondaryLabel, lineHeight: 22,
    paddingLeft: 52,
  },
  bioPlaceholder: {
    ...Type.body, color: Colors.tertiaryLabel, lineHeight: 20,
    paddingLeft: 52,
    fontStyle: 'italic',
  },

  // Portfolio grid — Pinterest tile treatment: softer dashed prompt, larger
  // radius on the thumbs so photos read as a gallery, not as form attachments.
  galleryEmpty: {
    backgroundColor: Colors.surfaceCream, borderRadius: R_WELL, borderWidth: 1.5, borderColor: Colors.brandAccent,
    borderStyle: 'dashed', paddingVertical: 30, alignItems: 'center', gap: 8, marginBottom: 6,
  },
  galleryEmptyText: { ...Type.body, fontSize: 14, fontFamily: Fonts.medium, color: Colors.secondaryLabel, textAlign: 'center', marginTop: 4 },
  galleryEmptyHint: { ...Type.caption, fontSize: 12, color: Colors.tertiaryLabel },
  galleryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 6 },
  galleryThumb: { width: 96, height: 96, borderRadius: R_WELL, overflow: 'hidden', position: 'relative' },
  galleryThumbImg: { width: 96, height: 96 },
  galleryRemoveBtn: {
    position: 'absolute', top: 5, right: 5,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: 'rgba(61,35,41,0.62)', alignItems: 'center', justifyContent: 'center',
  },
  galleryRemoveBtnText: { color: '#fff', fontSize: 11, fontFamily: Fonts.semibold },
  galleryAddTile: {
    width: 96, height: 96, borderRadius: R_WELL, borderWidth: 1.5, borderColor: Colors.brandAccent,
    borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surfaceCream,
  },
  galleryAddTileText: { fontSize: 26, color: BRAND, fontFamily: Fonts.light, marginTop: -2 },

  specialtiesBlock: { gap: 11, paddingVertical: 6 },
  specialtiesLabel: { ...Type.overline, color: Colors.tertiaryLabel, textTransform: 'uppercase' },
  specialtiesChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  specialtyChip: {
    backgroundColor: ICON_BG, borderRadius: R_PILL,
    paddingHorizontal: 14, paddingVertical: 8,
  },
  specialtyChipText: { ...Type.caption, fontFamily: Fonts.medium, color: BRAND },

  // De-emphasized on purpose: these are background-checks, not the main content
  // of the artist's own profile — smaller icons, lighter label weight, quieter
  // status color than the pricing/gallery sections above.
  checkGrid: { flexDirection: 'row', gap: 8, marginTop: 8, paddingTop: 4 },
  checkCell: { flex: 1, alignItems: 'center', gap: 4 },
  checkIconWrap: {
    width: 36, height: 36, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  checkIconOk:      { backgroundColor: ICON_BG },
  checkIconPending: { backgroundColor: Colors.goldSoft },
  checkLabel:  { fontSize: 11, fontFamily: Fonts.medium, color: LABEL, textAlign: 'center' },
  checkStatus: { fontSize: 10, fontFamily: Fonts.medium, textAlign: 'center' },

  quickActionsGrid: { flexDirection: 'row', gap: 12 },
  quickAction: {
    flex: 1, alignItems: 'center', gap: 11,
    backgroundColor: CARD, borderRadius: R_CARD, paddingVertical: 22,
    borderWidth: 1, borderColor: Colors.cardBorder,
    ...SHADOW_CARD,
  },
  quickActionIcon: {
    width: 48, height: 48, borderRadius: R_WELL,
    alignItems: 'center', justifyContent: 'center',
  },
  quickActionLabel: {
    ...Type.caption, fontFamily: Fonts.semibold, color: VALUE, textAlign: 'center',
  },

  navCard: {
    backgroundColor: CARD, borderRadius: R_CARD, padding: 18,
    flexDirection: 'row', alignItems: 'center', gap: 16,
    ...SHADOW_CARD,
    borderWidth: 1, borderColor: Colors.cardBorder,
  },
  navCardIcon: {
    width: 46, height: 46, borderRadius: R_WELL,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1,
  },
  navCardTitle: { ...Type.cardTitle, color: VALUE, marginBottom: 3 },
  navCardSub:   { ...Type.caption, color: Colors.tertiaryLabel, lineHeight: 18 },
  navCardChevron: {
    width: 22, height: 30, alignItems: 'center', justifyContent: 'center',
  },
  navCardChevronText: { fontSize: 21, color: Colors.brandAccent, fontFamily: Fonts.medium, marginTop: -2 },

  trustRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, paddingVertical: 5 },
  trustIconWrap: {
    width: 38, height: 38, borderRadius: R_WELL,
    backgroundColor: ICON_BG, alignItems: 'center', justifyContent: 'center',
  },
  trustLabel: { ...Type.rowValue, fontSize: 15, color: VALUE, marginBottom: 3 },
  trustDesc:  { ...Type.body, color: Colors.tertiaryLabel, lineHeight: 19 },

  noProfileNote: { paddingVertical: 8 },
  noProfileText: { fontSize: 14, color: LABEL, lineHeight: 20 },

  // Sign out is a quiet, contained action — a soft rose-tinted card rather than
  // an alarm-red bordered slab. Destructive intent is carried by the text
  // colour alone (Instagram/Glossier keep "log out" visually calm).
  signOutBtn: {
    borderRadius: R_CARD, backgroundColor: CARD,
    borderWidth: 1, borderColor: Colors.cardBorder,
    paddingVertical: 18, alignItems: 'center',
    ...SHADOW_CARD,
  },
  signOutText: { color: Colors.systemRed, fontSize: 16, fontFamily: Fonts.semibold, letterSpacing: -0.2 },

  deleteAccountBtn: {
    borderRadius: R_WELL, backgroundColor: 'transparent',
    paddingVertical: 16, alignItems: 'center', marginTop: 12,
  },
  deleteAccountText: { color: Colors.systemRed, fontSize: 14, fontFamily: Fonts.medium, textDecorationLine: 'underline' },
  deleteAccountHint: { ...Type.caption, fontSize: 11, color: Colors.tertiaryLabel, textAlign: 'center', lineHeight: 16, marginTop: 6, paddingHorizontal: 12 },

  footer: {
    textAlign: 'center', ...Type.caption, fontSize: 11.5, color: Colors.tertiaryLabel,
    marginTop: 36, marginHorizontal: 20, lineHeight: 18,
  },
});

const specStyles = StyleSheet.create({
  // Sheet matched to the refreshed card system: warmer scrim, larger radius,
  // cream wells and Inter throughout (was raw fontWeight + systemGray).
  overlay: { flex: 1, backgroundColor: 'rgba(61,35,41,0.42)', justifyContent: 'flex-end' },
  sheet:   { backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 22, paddingBottom: 34 },
  title:   { ...Type.groupTitle, color: Colors.label },
  sub:     { ...Type.body, color: Colors.tertiaryLabel, marginTop: 5, marginBottom: 8 },
  input:   { borderWidth: 1, borderColor: Colors.separator, backgroundColor: Colors.surfaceCream, borderRadius: R_WELL, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, fontFamily: Fonts.regular, color: Colors.label, marginTop: 8 },
  chip:    { paddingHorizontal: 14, paddingVertical: 9, borderRadius: R_PILL, backgroundColor: Colors.surfaceCream, borderWidth: 1, borderColor: 'transparent' },
  chipOn:  { backgroundColor: Colors.brandLight, borderColor: Colors.brandAccent },
  chipText:   { ...Type.caption, fontFamily: Fonts.medium, color: Colors.secondaryLabel },
  chipTextOn: { fontFamily: Fonts.semibold, color: Colors.brand },
  btn:        { flex: 1, height: 50, borderRadius: R_WELL, alignItems: 'center', justifyContent: 'center' },
  btnGhost:   { backgroundColor: Colors.surfaceCream },
  btnGhostText: { fontSize: 15, fontFamily: Fonts.semibold, color: Colors.label },
  btnPrimary: { backgroundColor: Colors.brand },
  btnPrimaryText: { fontSize: 15, fontFamily: Fonts.semibold, color: '#fff' },
});
