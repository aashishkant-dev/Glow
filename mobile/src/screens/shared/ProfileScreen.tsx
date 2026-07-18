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
import { NoteIcon, EarningsIcon, BellIcon, HelpIcon } from '../../components/CareIcons';
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
import { apiGetProfile, apiSetPublicProfile, apiUpdateProfile, apiUploadPhoto, UserProfile } from '../../api/client';
import { Storage } from '../../utils/storage';
import { Colors } from '../../utils/colors';

// ── Design tokens ──────────────────────────────────────────────────────────────
const NAVY_DEEP  = '#9C5560';
const NAVY_MID   = '#B76E79';
const BRAND      = '#0EA56F';
const BG         = '#F2F3F7';
const CARD       = '#FFFFFF';
const LABEL      = '#6B7280';
const VALUE      = '#111827';
const DIVIDER_C  = '#F0F1F3';

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
        <Text key={`f${i}`} style={{ fontSize: size, color: '#F59E0B' }}>★</Text>
      ))}
      {half === 1 && <Text style={{ fontSize: size, color: '#F59E0B' }}>⯨</Text>}
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
  };
  return MAP[glyph] ?? PersonIcon;
}

// ── Verified badge ─────────────────────────────────────────────────────────────
function VerifiedChip({ label }: { label: string }) {
  return (
    <View style={styles.verifiedChip}>
      <CheckCircleIcon size={13} color="#16A34A" />
      <Text style={styles.verifiedChipText}>{label}</Text>
    </View>
  );
}

// ── Info row ──────────────────────────────────────────────────────────────────
function InfoRow({
  glyph, label, value, onPress, valueColor,
}: { glyph: string; label: string; value: string; onPress?: () => void; valueColor?: string }) {
  const Wrap = onPress ? Pressable : View;
  const Icon = infoIcon(glyph);
  return (
    <Wrap style={styles.infoRow} onPress={onPress}>
      <View style={styles.infoLeft}>
        <View style={styles.infoIconWrap}><Icon size={18} color={BRAND} /></View>
        <Text style={styles.infoLabel}>{label}</Text>
      </View>
      <View style={styles.infoRight}>
        <Text
          style={[styles.infoValue, valueColor ? { color: valueColor } : undefined]}
          numberOfLines={1}
        >
          {value}
        </Text>
        {onPress && <Text style={styles.infoChevron}>›</Text>}
      </View>
    </Wrap>
  );
}

// ── Status chip ────────────────────────────────────────────────────────────────
function StatusChip({ status }: { status: 'pending' | 'approved' | 'rejected' }) {
  const config = {
    pending:  { bg: '#FFF7ED', border: '#FED7AA', text: '#EA580C', label: 'Pending Review' },
    approved: { bg: '#F0FDF4', border: '#BBF7D0', text: '#16A34A', label: 'Approved' },
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

export function ProfileScreen() {
  const { user, signOut, updatePhoto, photoUri: authPhotoUri, token } = useAuth();
  const insets = useSafeAreaInsets();
  const nav    = useNavigation<any>();

  const [photoUri,       setPhotoUri]       = useState<string | null>(authPhotoUri);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoError,     setPhotoError]     = useState<string | null>(null);
  const [profile,        setProfile]        = useState<UserProfile | null>(null);
  const [docCount,       setDocCount]       = useState(0);
  const [specModal,      setSpecModal]      = useState(false);
  const [specDraft,      setSpecDraft]      = useState<string[]>([]);
  const [specSaving,     setSpecSaving]     = useState(false);
  // Generic single-field text editor (name, bio) — a real modal + TextInput so it
  // works on iOS AND Android (Alert.prompt is iOS-only).
  const [fieldModal,     setFieldModal]     = useState<null | { key: 'name' | 'bio'; title: string; value: string; multiline?: boolean }>(null);
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
  const [galleryUploading, setGalleryUploading] = useState(false);

  const LANGUAGE_OPTIONS = ['English', 'French', 'Hindi', 'Nepali', 'Spanish', 'Mandarin', 'Punjabi', 'Arabic'];

  function openField(key: 'name' | 'bio', title: string, current: string, multiline = false) {
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
    'Dementia Care', "Alzheimer's Care", 'Post-Surgery Support',
    'Palliative / Hospice Care', 'Pediatric Care', 'Wound Care',
    'Medication Administration', 'Mobility Assistance', 'Spinal Cord Injury',
    'ABI (Brain Injury)', 'Autism Support', 'Stroke Recovery',
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
      aspect: [4, 3],
      quality: 0.8,
      base64: true,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    if (!asset.base64) { Alert.alert('Could not read image'); return; }
    setGalleryUploading(true);
    try {
      const { photoUrl } = await apiUploadPhoto(asset.base64, asset.mimeType ?? 'image/jpeg');
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

  useEffect(() => {
    Storage.getPhotoUri().then(uri => { if (uri && uri.length > 4) setPhotoUri(uri); });
    if (!token) return;
    apiGetProfile().then(res => {
      setProfile(res.user);
      if (res.user.providerProfile?.photos?.length) setGalleryPhotos(res.user.providerProfile.photos);
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
  }, [token]);

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
        const { photoUrl } = await apiUploadPhoto(base64Data, finalMime);
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

  const roleLabel = isCustomer ? 'Client' : isProvider ? 'Provider Professional' : 'Administrator';
  const roleColor = isCustomer ? '#2563EB' : isProvider ? BRAND : '#7C3AED';
  const roleBg    = isCustomer ? '#EFF6FF' : isProvider ? '#ECFDF5' : '#F5F3FF';
  const roleBorder = isCustomer ? '#BFDBFE' : isProvider ? '#A7F3D0' : '#DDD6FE';
  const initial   = user?.name?.[0]?.toUpperCase() ?? '?';
  const accountId = user?.id ? `CN-${user.id.slice(-6).toUpperCase()}` : '—';
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

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: insets.bottom + 48 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Hero gradient header ─────────────────────────────────── */}
        <LinearGradient
          colors={[NAVY_DEEP, NAVY_MID]}
          style={[styles.hero, { paddingTop: insets.top + 10 }]}
        >
          {/* Back button */}
          {nav.canGoBack() && (
            <Pressable
              style={styles.backBtn}
              onPress={() => nav.goBack()}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <ArrowBackIcon size={20} color="rgba(255,255,255,0.8)" />
              <Text style={styles.backBtnLabel}>Back</Text>
            </Pressable>
          )}

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
                  colors={[roleColor, roleColor + 'CC']}
                  style={styles.avatarCircle}
                >
                  <Text style={styles.avatarInitial}>{initial}</Text>
                </LinearGradient>
              )}
              {/* Upload overlay */}
              {photoUploading && (
                <View style={styles.avatarUploadOverlay}>
                  <ActivityIndicator color="#fff" size="large" />
                </View>
              )}
            </View>
            {/* Camera badge */}
            {!photoUploading && (
              <View style={styles.cameraBadge}>
                <View style={styles.cameraBadgeInner}>
                  <CameraIcon size={15} color={BRAND} />
                </View>
              </View>
            )}
          </Pressable>

          {/* Hint when no photo — nudges users to add one (was easy to miss) */}
          {!photoUri && !photoUploading && (
            <Pressable onPress={showPhotoOptions} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: -6, marginBottom: 10 }}>
              <CameraIcon size={14} color={BRAND} />
              <Text style={[styles.addPhotoHint, { marginTop: 0, marginBottom: 0 }]}>Add a profile photo</Text>
            </Pressable>
          )}

          {/* Photo upload error */}
          {photoError && (
            <View style={styles.photoErrorBanner}>
              <Text style={styles.photoErrorText}>{photoError}</Text>
              <Pressable onPress={() => setPhotoError(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={styles.photoErrorDismiss}>✕</Text>
              </Pressable>
            </View>
          )}

          {/* Name */}
          <Text style={styles.heroName}>{user?.name ?? '—'}</Text>

          {/* Role pill — only for Provider/Admin (customers don't need a "Client" tag) */}
          {!isCustomer && (
            <View style={[styles.rolePill, { backgroundColor: roleBg, borderColor: roleBorder }]}>
              <Text style={[styles.rolePillText, { color: roleColor }]}>{roleLabel}</Text>
            </View>
          )}

          {/* Provider: star rating inline */}
          {isProvider && providerRating > 0 && (
            <View style={styles.heroRatingRow}>
              {renderStars(providerRating, 14)}
              <Text style={styles.heroRatingText}>
                {providerRating.toFixed(1)}
                {providerRatingCount > 0 ? ` · ${providerRatingCount} reviews` : ''}
              </Text>
            </View>
          )}

          {/* Provider: Verified Professional banner — pill with shield */}
          {isProvider && providerP?.approvedByAdmin && (
            <View style={styles.verifiedBanner}>
              <ShieldCheckIcon size={15} color="#fff" />
              <Text style={styles.verifiedBannerText}>Verified Professional</Text>
            </View>
          )}

          {/* Member since */}
          {memberSince ? (
            <Text style={styles.memberSince}>Member since {memberSince}</Text>
          ) : null}

          <View style={styles.heroBottom} />
        </LinearGradient>

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
              <Text style={styles.statLabel}>Hours of Care</Text>
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

        {isProvider && (
          <View style={styles.statsBar}>
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

        {/* ── Section: Personal Info ───────────────────────────────── */}
        <View style={styles.sectionWrap}>
          <Text style={styles.sectionLabel}>Personal Info</Text>
          <View style={styles.card}>
            {/* Tappable name row for inline edit */}
            <Pressable style={styles.infoRow} onPress={handleEditName}>
              <View style={styles.infoLeft}>
                <View style={styles.infoIconWrap}><PersonIcon size={18} color={BRAND} /></View>
                <Text style={styles.infoLabel}>Name</Text>
              </View>
              <View style={styles.infoRight}>
                <Text style={styles.infoValue} numberOfLines={1}>{user?.name ?? '—'}</Text>
                <Text style={styles.infoChevron}>›</Text>
              </View>
            </Pressable>
            <Divider />
            <InfoRow glyph="cellphone" label="Phone" value={user?.phone ?? '—'} />
            <View style={styles.chipRow}>
              <VerifiedChip label="OTP Verified" />
            </View>
            <Divider />
            <InfoRow glyph="key-variant" label="Account ID" value={accountId} />
          </View>
        </View>

        {/* ── Profile Strength card (Provider only) ────────────────────── */}
        {isProvider && (
          <View style={styles.sectionWrap}>
            <Text style={styles.sectionLabel}>Profile Strength</Text>
            <ProfileStrength
              providerProfile={providerP}
              hasPhoto={!!photoUri}
              phoneVerified
              onFixBio={() => openField('bio', 'About you', providerP?.bio ?? '', true)}
              onFixLanguages={() => { setLangDraft(providerP?.languages ?? []); setLangModal(true); }}
              onFixSpecialties={() => { setSpecDraft(providerP?.specialties ?? []); setSpecModal(true); }}
              onFixDocuments={() => nav.navigate('ProviderDocuments')}
            />
          </View>
        )}

        {/* ── Section: Provider Professional Profile ───────────────────── */}
        {isProvider && (
          <View style={styles.sectionWrap}>
            <Text style={styles.sectionLabel}>Professional Profile</Text>
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
                        <Text style={{ color: Colors.brand, fontSize: 13, fontWeight: '700' }}>Edit</Text>
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
                          Tap to add your care specialties
                        </Text>
                      )}
                    </Pressable>
                    <Divider />
                  </>

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
                            : <Text style={{ color: BRAND, fontWeight: '700', fontSize: 13 }}>+ Add Photo</Text>
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
                  <Divider />

                  {/* Verification grid — 4 even cells */}
                  <View style={styles.checkGrid}>
                    {([
                      // Once admin approves the Provider, their documents are verified —
                      // so all these read "Cleared" (no more stuck First Aid Pending).
                      { Icon: MedicalBagIcon,         label: 'First Aid',  ok: providerP.approvedByAdmin || !!providerP.certifications?.includes('firstAid') },
                      { Icon: ShieldCheckIcon,        label: 'Police',     ok: providerP.approvedByAdmin || !!providerP.policeCheckCleared },
                      { Icon: CardAccountDetailsIcon, label: 'ID',         ok: providerP.approvedByAdmin },
                      { Icon: CheckDecagramIcon,      label: 'Approved',   ok: providerP.approvedByAdmin },
                    ] as const).map(item => (
                      <View key={item.label} style={styles.checkCell}>
                        <View style={[styles.checkIconWrap, item.ok ? styles.checkIconOk : styles.checkIconPending]}>
                          {item.ok
                            ? <item.Icon size={22} color="#16A34A" />
                            : <ClockIcon size={22} color="#F59E0B" />
                          }
                        </View>
                        <Text style={styles.checkLabel} numberOfLines={1}>{item.label}</Text>
                        <Text style={[styles.checkStatus, { color: item.ok ? '#16A34A' : '#F59E0B' }]}>
                          {item.ok ? 'Cleared' : 'Pending'}
                        </Text>
                      </View>
                    ))}
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
          </View>
        )}

        {/* ── Section: Provider Documents nav card ─────────────────────── */}
        {isProvider && (
          <View style={styles.sectionWrap}>
            <Text style={styles.sectionLabel}>Documents</Text>
            <Pressable
              style={({ pressed }) => [styles.navCard, pressed && { opacity: 0.85 }]}
              onPress={() => nav.navigate('ProviderDocuments')}
            >
              <View style={[styles.navCardIcon, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}>
                <NoteIcon size={22} color="#2563EB" />
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

        {/* ── Section: Provider Earnings nav card ──────────────────────── */}
        {isProvider && (
          <View style={styles.sectionWrap}>
            <Text style={styles.sectionLabel}>Earnings</Text>
            <Pressable
              style={({ pressed }) => [styles.navCard, pressed && { opacity: 0.85 }]}
              onPress={() => nav.navigate('Earnings')}
            >
              <View style={[styles.navCardIcon, { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' }]}>
                <EarningsIcon size={22} color="#D97706" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.navCardTitle}>My Earnings</Text>
                <Text style={styles.navCardSub}>View history, charts & monthly goal</Text>
              </View>
              <View style={styles.navCardChevron}>
                <Text style={styles.navCardChevronText}>›</Text>
              </View>
            </Pressable>
          </View>
        )}

        {/* ── Section: Provider public profile (marketing consent) ─────── */}
        {isProvider && providerP?.approvedByAdmin && (
          <View style={styles.sectionWrap}>
            <Text style={styles.sectionLabel}>Visibility</Text>
            <View style={styles.navCard}>
              <View style={[styles.navCardIcon, { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' }]}>
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
                trackColor={{ false: '#D1D5DB', true: '#A7F3D0' }}
                thumbColor={publicProfile ? BRAND : '#F4F4F5'}
              />
            </View>
          </View>
        )}

        {/* ── Section: Customer Quick Actions ─────────────────────── */}
        {isCustomer && (
          <View style={styles.sectionWrap}>
            <Text style={styles.sectionLabel}>Quick Actions</Text>
            <View style={styles.quickActionsGrid}>
              <Pressable style={({ pressed }) => [styles.quickAction, pressed && { opacity: 0.82 }]} onPress={() => nav.navigate('NewBooking')}>
                <View style={[styles.quickActionIcon, { backgroundColor: '#ECFDF5' }]}>
                  <CalendarSVGIcon size={22} color={Colors.onlineGreen} />
                </View>
                <Text style={styles.quickActionLabel}>Book Now</Text>
              </Pressable>
              <Pressable style={({ pressed }) => [styles.quickAction, pressed && { opacity: 0.82 }]} onPress={() => nav.navigate('BookingsTab')}>
                <View style={[styles.quickActionIcon, { backgroundColor: '#EFF6FF' }]}>
                  <NoteIcon size={22} color="#2563EB" />
                </View>
                <Text style={styles.quickActionLabel}>My Bookings</Text>
              </Pressable>
              <Pressable style={({ pressed }) => [styles.quickAction, pressed && { opacity: 0.82 }]} onPress={() => nav.navigate('Notifications')}>
                <View style={[styles.quickActionIcon, { backgroundColor: '#FEF9C3' }]}>
                  <BellIcon size={22} color="#CA8A04" />
                </View>
                <Text style={styles.quickActionLabel}>Alerts</Text>
              </Pressable>
              <Pressable style={({ pressed }) => [styles.quickAction, pressed && { opacity: 0.82 }]} onPress={() => nav.navigate('Help')}>
                <View style={[styles.quickActionIcon, { backgroundColor: '#F5F3FF' }]}>
                  <HelpIcon size={22} color="#7C3AED" />
                </View>
                <Text style={styles.quickActionLabel}>Help</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* ── Section: Customer Account Verification ───────────────── */}
        {isCustomer && (
          <View style={styles.sectionWrap}>
            <Text style={styles.sectionLabel}>Account Verification</Text>
            <View style={styles.card}>
              <View style={styles.verifyGrid}>
                {([
                  { Icon: PhoneCheckIcon,  label: 'Phone\nVerified' },
                  { Icon: AccountCheckIcon, label: 'Account\nActive' },
                  { Icon: CreditCardIcon,  label: 'Private\nPay' },
                  { Icon: ShieldCheckIcon, label: 'Providers\nVerified' },
                ] as const).map(item => (
                  <View key={item.label} style={styles.verifyCell}>
                    <View style={styles.verifyCellIcon}>
                      <item.Icon size={22} color={BRAND} />
                    </View>
                    <Text style={styles.verifyCellLabel}>{item.label}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        )}

        {/* ── Section: Customer Trust & Safety ─────────────────────── */}
        {isCustomer && (
          <View style={styles.sectionWrap}>
            <Text style={styles.sectionLabel}>Trust & Safety</Text>
            <View style={styles.card}>
              {([
                { Icon: ShieldCheckIcon,        label: 'Police Checked',  desc: 'All Providers pass criminal record check',
                  detail: 'Every Provider on Glow must submit a valid Criminal Record Check (Vulnerable Sector) before they can accept bookings. Our team verifies each document and re-checks it on renewal. Providers who can’t clear a police check are never matched with clients.' },
                { Icon: CardAccountDetailsIcon, label: 'ID Verified',     desc: 'Government-issued ID confirmed',
                  detail: 'We confirm each Provider’s identity against a government-issued photo ID (driver’s licence, passport or provincial ID). The name on file must match their banking and certification documents, so you always know exactly who is coming to your home.' },
                { Icon: AccountCheckIcon,       label: 'Admin Approved',  desc: 'Manually reviewed by our team',
                  detail: 'Beyond automated checks, a Glow team member manually reviews every Provider application — credentials, experience, references and documents — before approving them. No Provider appears in the app until a human has signed off.' },
                { Icon: StarIcon,               label: 'Rating System',   desc: '1–5 stars after every session',
                  detail: 'After each completed visit, clients rate their Provider from 1 to 5 stars and can leave a review. Ratings are visible on every Provider profile and we follow up on any low scores, so quality stays high across the whole network.' },
              ] as const).map((t, i) => (
                <View key={t.label}>
                  {i > 0 && <Divider />}
                  <Pressable
                    style={({ pressed }) => [styles.trustRow, pressed && { opacity: 0.6 }]}
                    onPress={() => setTrustModal({ label: t.label, desc: t.desc, detail: t.detail })}
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
                    <Text style={styles.infoChevron}>›</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ── Section: Admin Portal ─────────────────────────────────── */}
        {isAdmin && (
          <View style={styles.sectionWrap}>
            <Text style={styles.sectionLabel}>Admin Portal</Text>
            <View style={styles.card}>
              <InfoRow
                glyph="monitor-dashboard" label="Admin Dashboard" value="Open admin panel"
                valueColor="#2563EB"
                onPress={() => Linking.openURL('/admin')}
              />
              <Divider />
              <InfoRow glyph="chart-box-outline" label="Stats" value="View platform analytics" />
            </View>
          </View>
        )}

        {/* ── Section: Support ──────────────────────────────────────── */}
        <View style={styles.sectionWrap}>
          <Text style={styles.sectionLabel}>Support</Text>
          <View style={styles.card}>
            <InfoRow
              glyph="email-outline" label="Email Us" value="support@glow.app"
              valueColor="#2563EB"
              onPress={() => Linking.openURL('mailto:support@glow.app?subject=Glow Support')}
            />
            <Divider />
            <InfoRow
              glyph="cellphone" label="Call Us" value="+1 (647) 620-9243"
              valueColor="#2563EB"
              onPress={() => Linking.openURL('tel:+16476209243')}
            />
            <Divider />
            <InfoRow glyph="clock-outline" label="Hours" value="24/7" />
            <Divider />
            <InfoRow glyph="translate" label="Languages" value="English · Français" />
          </View>
        </View>

        {/* ── Section: App Info ─────────────────────────────────────── */}
        <View style={styles.sectionWrap}>
          <Text style={styles.sectionLabel}>App Info</Text>
          <View style={styles.card}>
            <InfoRow glyph="package-variant" label="Version" value={`v${appVersion}`} />
            <Divider />
            <InfoRow glyph="map" label="Region" value="Greater Sudbury, ON 🇨🇦" />
            <Divider />
            <InfoRow glyph="map-marker" label="Coverage" value="15 km radius" />
          </View>
        </View>

        {/* ── Section: Legal ─────────────────────────────────────────── */}
        <View style={styles.sectionWrap}>
          <Text style={styles.sectionLabel}>Legal</Text>
          <View style={styles.card}>
            <InfoRow
              glyph="shield-check" label="Privacy Policy" value=""
              onPress={() => Linking.openURL('https://ca.glow.app/privacy')}
            />
            <Divider />
            <InfoRow
              glyph="card-account-details-outline" label="Terms of Service" value=""
              onPress={() => Linking.openURL('https://ca.glow.app/terms')}
            />
          </View>
        </View>

        {/* ── Sign Out ──────────────────────────────────────────────── */}
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
          © {new Date().getFullYear()} Glow · Professional Provider Services{'\n'}Greater Sudbury, ON
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
              placeholder={fieldModal?.title}
              placeholderTextColor={Colors.tertiaryLabel}
              multiline={fieldModal?.multiline}
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
            <Text style={specStyles.sub}>Pick the care you're trained for — clients see these.</Text>
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

  // ── Hero ──
  hero: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 36,
  },
  backBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    marginBottom: 16,
  },
  backBtnLabel: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 15,
    fontWeight: '600',
  },
  heroBottom: { height: 4 },

  // Avatar with white ring + depth shadow
  avatarWrap: { position: 'relative', marginBottom: 16 },
  avatarRing: {
    width: 132, height: 132, borderRadius: 66,
    borderWidth: 3, borderColor: '#FFFFFF',
    overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35, shadowRadius: 16,
    elevation: 10,
  },
  avatarImg:    { width: 124, height: 124, borderRadius: 62 },
  avatarCircle: { width: 124, height: 124, borderRadius: 62, alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { color: '#fff', fontSize: 48, fontWeight: '800' },
  addPhotoHint: { fontSize: 13, fontWeight: '700', color: BRAND, marginTop: -6, marginBottom: 10 },
  cameraBadge: {
    position: 'absolute', bottom: 4, right: 4,
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.15)',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3, shadowRadius: 4, elevation: 4,
  },
  cameraBadgeInner: {
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center',
  },
  cameraBadgeText: { fontSize: 14, fontWeight: '800', color: '#000000', lineHeight: 18 },

  // Avatar upload overlay + error
  avatarUploadOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 49,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoErrorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#FEF2F2',
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
    marginTop: 10, borderWidth: 1, borderColor: '#FCA5A5',
    maxWidth: 300,
  },
  photoErrorText: { flex: 1, fontSize: 12, color: '#DC2626', fontWeight: '500', lineHeight: 16 },
  photoErrorDismiss: { fontSize: 14, color: '#DC2626', fontWeight: '700' },

  heroName: {
    color: '#FFFFFF', fontSize: 24, fontWeight: '800',
    letterSpacing: -0.3, marginBottom: 10,
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },

  rolePill: {
    paddingHorizontal: 16, paddingVertical: 6,
    borderRadius: 20, borderWidth: 1,
    marginBottom: 12,
  },
  rolePillText: { fontSize: 13, fontWeight: '700' },

  heroRatingRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10,
  },
  heroRatingText: {
    color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: '600',
  },

  verifiedBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#0EA56F',
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 20, marginBottom: 10,
  },
  verifiedBannerIcon: { color: '#FFFFFF', fontSize: 13 },
  verifiedBannerText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },

  memberSince: {
    color: 'rgba(255,255,255,0.45)', fontSize: 12, fontWeight: '500',
  },

  // ── Stats bar ──
  statsBar: {
    flexDirection: 'row',
    backgroundColor: CARD,
    marginHorizontal: 16,
    borderRadius: 18,
    marginTop: -18,
    paddingVertical: 18,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08, shadowRadius: 12, elevation: 5,
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.04)',
    marginBottom: 8,
  },
  statCell: { flex: 1, alignItems: 'center', gap: 3 },
  statNum: { fontSize: 22, fontWeight: '800', color: VALUE, letterSpacing: -0.5 },
  statLabel: { fontSize: 11, color: LABEL, fontWeight: '600', textAlign: 'center' },
  statDivider: { width: 1, height: 36, backgroundColor: DIVIDER_C },

  // ── Section ──
  sectionWrap: { paddingHorizontal: 16, marginTop: 24 },
  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: LABEL,
    textTransform: 'uppercase', letterSpacing: 1,
    marginBottom: 8, paddingHorizontal: 2,
  },

  // ── Card ──
  card: {
    backgroundColor: CARD, borderRadius: 18,
    paddingHorizontal: 16, paddingVertical: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 10, elevation: 2,
  },

  divider: { height: 1, backgroundColor: DIVIDER_C, marginVertical: 12 },

  // ── Info row ──
  infoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 },
  // Fixed-ish left column keeps every row's label flush; long values (e.g. the
  // bio in "About you") truncate in the right column instead of squeezing the
  // label or shoving the chevron out of line.
  infoLeft:  { flexDirection: 'row', alignItems: 'center', gap: 12, flexShrink: 0 },
  infoIconWrap: {
    width: 32, height: 32, borderRadius: 10,
    backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center',
  },
  infoIcon:  { fontSize: 15 },
  infoLabel: { fontSize: 15, color: LABEL, fontWeight: '500' },
  infoRight: { flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1, justifyContent: 'flex-end' },
  infoValue: { fontSize: 15, fontWeight: '600', color: VALUE, textAlign: 'right', flexShrink: 1 },
  infoChevron: { fontSize: 20, color: '#D1D5DB' },

  chipRow: { marginTop: 6, marginBottom: 2 },

  // ── Verified chip ──
  verifiedChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#F0FDF4', borderRadius: 8, borderWidth: 1, borderColor: '#BBF7D0',
    paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start',
  },
  verifiedChipText: { fontSize: 12, fontWeight: '600', color: '#16A34A' },

  // ── Status chip ──
  approvalRow: { marginBottom: 4 },
  statusChip: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: 12, borderWidth: 1.5,
    paddingHorizontal: 14, paddingVertical: 8, alignSelf: 'flex-start',
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusChipText: { fontSize: 14, fontWeight: '700' },

  // ── Bio block (full-width) ──
  bioBlock: { paddingVertical: 10, gap: 6 },
  bioLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  bioEditHint: { marginLeft: 'auto', fontSize: 13, fontWeight: '700', color: Colors.brand },
  bioValue: {
    fontSize: 14, color: '#374151', lineHeight: 21, fontWeight: '400',
    paddingLeft: 44, // visually aligns under the label text (icon 32 + gap 12)
  },
  bioPlaceholder: {
    fontSize: 13, color: '#9CA3AF', lineHeight: 19,
    paddingLeft: 44,
    fontStyle: 'italic',
  },

  // ── Gallery ──
  galleryEmpty: {
    backgroundColor: '#F8FAFC', borderRadius: 14, borderWidth: 1, borderColor: '#E5E7EB',
    borderStyle: 'dashed', paddingVertical: 24, alignItems: 'center', gap: 6, marginBottom: 4,
  },
  galleryEmptyText: { fontSize: 13, color: Colors.secondaryLabel, fontWeight: '600', textAlign: 'center', marginTop: 4 },
  galleryEmptyHint: { fontSize: 11, color: Colors.tertiaryLabel },
  galleryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  galleryThumb: { width: 88, height: 88, borderRadius: 10, overflow: 'hidden', position: 'relative' },
  galleryThumbImg: { width: 88, height: 88 },
  galleryRemoveBtn: {
    position: 'absolute', top: 4, right: 4,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center',
  },
  galleryRemoveBtnText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  galleryAddTile: {
    width: 88, height: 88, borderRadius: 10, borderWidth: 2, borderColor: BRAND,
    borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F0FDF4',
  },
  galleryAddTileText: { fontSize: 28, color: BRAND, fontWeight: '300', marginTop: -2 },

  // ── Specialties ──
  specialtiesBlock: { gap: 8, paddingVertical: 4 },
  specialtiesLabel: { fontSize: 12, fontWeight: '700', color: LABEL, textTransform: 'uppercase', letterSpacing: 0.5 },
  specialtiesChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  specialtyChip: {
    backgroundColor: '#EFF6FF', borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 4,
    borderWidth: 1, borderColor: '#BFDBFE',
  },
  specialtyChipText: { fontSize: 12, fontWeight: '600', color: '#1D4ED8' },

  // ── Check grid ──
  checkGrid: { flexDirection: 'row', gap: 8, marginTop: 8, paddingTop: 4 },
  checkCell: { flex: 1, alignItems: 'center', gap: 5 },
  checkIconWrap: {
    width: 46, height: 46, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  checkIconOk:      { backgroundColor: '#D1FAE5' },
  checkIconPending: { backgroundColor: '#FEF3C7' },
  checkIcon:   { fontSize: 22 },
  checkLabel:  { fontSize: 11, fontWeight: '700', color: VALUE, textAlign: 'center' },
  checkStatus: { fontSize: 10, fontWeight: '600', textAlign: 'center' },

  // ── Quick actions grid ──
  quickActionsGrid: {
    flexDirection: 'row', gap: 10,
  },
  quickAction: {
    flex: 1, alignItems: 'center', gap: 8,
    backgroundColor: CARD, borderRadius: 16, paddingVertical: 16,
    borderWidth: 1, borderColor: '#E5E7EB',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  quickActionIcon: {
    width: 44, height: 44, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  quickActionLabel: {
    fontSize: 11, fontWeight: '700', color: VALUE, textAlign: 'center',
  },

  // ── Nav cards (Docs/Earnings) ──
  navCard: {
    backgroundColor: CARD, borderRadius: 18, padding: 16,
    flexDirection: 'row', alignItems: 'center', gap: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 10, elevation: 2,
    borderWidth: 1.5, borderColor: '#E5E7EB',
  },
  navCardIcon: {
    width: 48, height: 48, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1,
  },
  navCardTitle: { fontSize: 15, fontWeight: '700', color: VALUE, marginBottom: 3 },
  navCardSub:   { fontSize: 12, color: LABEL },
  navCardChevron: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center',
  },
  navCardChevronText: { fontSize: 18, color: '#9CA3AF', fontWeight: '600' },

  // ── Verify grid (Customer) ──
  verifyGrid: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 6 },
  verifyCell: { alignItems: 'center', gap: 4, flex: 1 },
  verifyCellIcon: {
    width: 48, height: 48, borderRadius: 16,
    backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center',
  },
  verifyCellStatus: { fontSize: 16, color: '#16A34A', fontWeight: '700' },
  verifyCellLabel:  { fontSize: 11, fontWeight: '600', color: LABEL, textAlign: 'center', lineHeight: 14 },

  // ── Trust rows ──
  trustRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 2 },
  trustIconWrap: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center',
  },
  trustLabel: { fontSize: 14, fontWeight: '600', color: VALUE, marginBottom: 2 },
  trustDesc:  { fontSize: 12, color: LABEL, lineHeight: 18 },

  // ── No profile note ──
  noProfileNote: { paddingVertical: 8 },
  noProfileText: { fontSize: 14, color: LABEL, lineHeight: 20 },

  // ── Sign out ──
  signOutBtn: {
    borderRadius: 16, backgroundColor: CARD,
    borderWidth: 2, borderColor: '#FF3B30',
    paddingVertical: 18, alignItems: 'center',
    shadowColor: '#FF3B30', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 8, elevation: 2,
  },
  signOutText: { color: '#FF3B30', fontSize: 16, fontWeight: '700' },

  deleteAccountBtn: {
    borderRadius: 16, backgroundColor: 'transparent',
    paddingVertical: 16, alignItems: 'center', marginTop: 12,
  },
  deleteAccountText: { color: '#DC2626', fontSize: 15, fontWeight: '700', textDecorationLine: 'underline' },
  deleteAccountHint: { fontSize: 11, color: '#9CA3AF', textAlign: 'center', lineHeight: 16, marginTop: 4, paddingHorizontal: 12 },

  footer: {
    textAlign: 'center', fontSize: 11, color: '#B8BBC4',
    marginTop: 28, marginHorizontal: 20, lineHeight: 16,
  },
});

const specStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet:   { backgroundColor: '#fff', borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, paddingBottom: 34 },
  title:   { fontSize: 19, fontWeight: '800', color: Colors.label },
  sub:     { fontSize: 13, color: Colors.secondaryLabel, marginTop: 4, marginBottom: 8 },
  input:   { borderWidth: 1, borderColor: Colors.systemGray4, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: Colors.label, marginTop: 6 },
  chip:    { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20, backgroundColor: Colors.systemGray6, borderWidth: 1, borderColor: 'transparent' },
  chipOn:  { backgroundColor: Colors.brandLight, borderColor: Colors.brand },
  chipText:   { fontSize: 13, fontWeight: '600', color: Colors.secondaryLabel },
  chipTextOn: { color: Colors.brand },
  btn:        { flex: 1, height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  btnGhost:   { backgroundColor: Colors.systemGray6 },
  btnGhostText: { fontSize: 15, fontWeight: '700', color: Colors.label },
  btnPrimary: { backgroundColor: Colors.brand },
  btnPrimaryText: { fontSize: 15, fontWeight: '800', color: '#fff' },
});
