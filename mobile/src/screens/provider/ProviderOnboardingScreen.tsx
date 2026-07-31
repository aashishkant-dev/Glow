import React, { useEffect, useState } from 'react';
import { Image } from 'expo-image';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { apiSubmitProviderOnboarding, apiSetProviderServices, apiUploadDocument } from '../../api/client';
import { DocumentIcon } from '../../components/TabIcons';
import { useAuth } from '../../context/AuthContext';
import { Colors } from '../../utils/colors';
import { ShieldCheckIcon, KeyIcon } from '../../components/CareIcons';

// ── Design tokens ──────────────────────────────────────────────────────────────
const BRAND      = Colors.brand;
const BRAND_DARK = Colors.brandDark;
const BRAND_SOFT = Colors.brandLight;
const GREEN      = Colors.trustGreen;
const GREEN_SOFT = '#ECFDF5';
const NAVY       = Colors.brandDeep;
const SURFACE    = Colors.systemBackground;
const BG         = Colors.systemGroupedBackground;
const TEXT       = Colors.label;
const MUTED      = Colors.secondaryLabel;
const BORDER     = Colors.separator;
const DANGER     = Colors.systemRed;

// ── Qualification types ────────────────────────────────────────────────────────
const QUAL_TYPES = [
  { key: 'MAKEUP_ARTIST',     label: 'Makeup Artist',     desc: 'Professional makeup artistry',   color: '#B76E79' },
  { key: 'HAIR_STYLIST',      label: 'Hair Stylist',      desc: 'Hair styling and coloring',      color: '#D97706' },
  { key: 'ESTHETICIAN',       label: 'Esthetician',       desc: 'Skin care, facials and waxing',  color: '#0284C7' },
  { key: 'NAIL_TECH',         label: 'Nail Technician',   desc: 'Manicure, pedicure and nail art', color: '#DB2777' },
  { key: 'MEHENDI_ARTIST',    label: 'Mehendi Artist',    desc: 'Bridal and party henna',         color: '#A16207' },
  { key: 'MASSAGE_THERAPIST', label: 'Massage Therapist', desc: 'Relaxation and body massage',    color: '#6366F1' },
  { key: 'COSMETOLOGIST',     label: 'Cosmetologist',     desc: 'All-round beauty professional',  color: '#059669' },
  { key: 'Other',             label: 'Other',             desc: 'Other beauty role',              color: '#64748B' },
] as const;

type QualType = typeof QUAL_TYPES[number]['key'];

// ── Specialty options ──────────────────────────────────────────────────────────
const SPECIALTY_OPTIONS = [
  'Makeup', 'Bridal Makeup', 'Party Makeup',
  'Threading', 'Hair Styling', 'Hair Coloring',
  'Facial', 'Waxing', 'Nails',
  'Mehendi', 'Massage', 'Saree Draping',
];

const LANGUAGE_OPTIONS = ['English', 'French', 'Hindi', 'Nepali', 'Spanish', 'Mandarin', 'Punjabi', 'Arabic'];

// Full document set — kept in sync with ProviderDocumentsScreen DOC_TYPES + Prisma DocType enum.
const STEP4_DOCS = [
  { id: 'id_proof',        label: 'Government ID',                required: true,  hint: 'Passport, photo card or national ID' },
  { id: 'provider_certificate', label: 'Beauty Certificate / Diploma', required: true,  hint: 'Certificate from your academy or institute' },
  { id: 'photo',           label: 'Portfolio Photos',             required: false, hint: 'Your best work — bridal, party, nails, mehendi' },
  { id: 'police_check',    label: 'Police Verification',          required: false, hint: 'Background check if available (< 6 months old)' },
  { id: 'insurance',       label: 'Liability Insurance',          required: false, hint: 'Professional liability if applicable' },
];

const STEP_LABELS = ['Credentials', 'Specialties', 'Details', 'Pricing', 'Documents'];

// ── SVG-style icons as text ────────────────────────────────────────────────────
function DocIcon({ id, done }: { id: string; done?: boolean }) {
  // SVG (not emoji) so it renders consistently across web + native.
  return <DocumentIcon size={24} color={done ? GREEN : BRAND} />;
}

// ── Step indicator ─────────────────────────────────────────────────────────────
function StepIndicator({ step }: { step: number }) {
  return (
    <View style={styles.stepWrap}>
      <View style={styles.stepTrack}>
        <View style={[styles.stepFill, { width: `${((step - 1) / 4) * 100}%` as any }]} />
      </View>
      <View style={styles.stepRow}>
        {[1, 2, 3, 4, 5].map(s => (
          <View key={s} style={styles.stepItem}>
            <View style={[
              styles.stepDot,
              step > s && styles.stepDotDone,
              step === s && styles.stepDotCurrent,
            ]}>
              {step > s
                ? <Text style={styles.stepCheck}>✓</Text>
                : <Text style={[styles.stepNum, step >= s && styles.stepNumActive]}>{s}</Text>
              }
            </View>
            <Text style={[styles.stepLabel, step >= s && styles.stepLabelActive]}>
              {STEP_LABELS[s - 1]}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ── Upload state per doc ───────────────────────────────────────────────────────
interface DocState {
  uri: string | null;
  uploadedUrl: string | null;
  uploading: boolean;
  error: string | null;
}

function initDocStates(): Record<string, DocState> {
  const out: Record<string, DocState> = {};
  for (const d of STEP4_DOCS) out[d.id] = { uri: null, uploadedUrl: null, uploading: false, error: null };
  return out;
}

export function ProviderOnboardingScreen() {
  const nav    = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { user, updateUser } = useAuth();

  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);

  // Step 1
  const [qualType, setQualType]     = useState<QualType>('MAKEUP_ARTIST');
  const [licenseNum, setLicenseNum] = useState('');
  const [college, setCollege]       = useState('');
  const [experience, setExperience] = useState('');

  // Step 2
  const [specialties, setSpecialties] = useState<string[]>([]);
  const [languages, setLanguages]     = useState<string[]>(['English']);
  const [bio, setBio]                 = useState('');

  // Step 3
  const [firstAid, setFirstAid]     = useState(false);
  const [ownCar, setOwnCar]         = useState(false);

  // Step 4 — Pricing (per-service only — every Artist prices their own menu)
  const [servicePrices, setServicePrices]     = useState<Record<string, string>>({});
  const [priceNegotiable, setPriceNegotiable] = useState(false);

  // Step 5 — per-doc upload state
  const [docStates, setDocStates] = useState<Record<string, DocState>>(initDocStates);

  const [loading, setLoading] = useState(false);

  function toggleSpecialty(s: string) {
    if (Platform.OS !== 'web') Haptics.selectionAsync();
    setSpecialties(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);
  }

  function toggleLanguage(l: string) {
    if (Platform.OS !== 'web') Haptics.selectionAsync();
    setLanguages(prev => prev.includes(l) ? prev.filter(x => x !== l) : [...prev, l]);
  }

  function setDocField(id: string, fields: Partial<DocState>) {
    setDocStates(prev => ({ ...prev, [id]: { ...prev[id], ...fields } }));
  }

  async function submitProfile() {
    setLoading(true);
    try {
      await apiSubmitProviderOnboarding({
        qualificationType: qualType,
        licenseNumber:     licenseNum.trim(),
        collegeName:       college.trim(),
        experienceYears:   Number(experience) || 0,
        specialties,
        languages:         languages.length > 0 ? languages : ['English'],
        bio:               bio.trim(),
        firstAidCertified: firstAid,
        ownTransportation: ownCar,
        pricingModel:      'PER_SERVICE',
        priceNegotiable,
      });
      // Persist the per-service menu typed in step 4. This was the bug: prices
      // were captured in state but never sent, so every artist fell back to the
      // hourly default. Profile is already saved above, so a price failure
      // warns instead of blocking the flow — prices can be re-set from Profile.
      const services = Object.entries(servicePrices)
        .map(([name, v]) => ({ name, price: Number(String(v).replace(/[^0-9.]/g, '')) }))
        .filter(s => s.name && Number.isFinite(s.price) && s.price > 0);
      if (services.length > 0) {
        try {
          await apiSetProviderServices(services);
        } catch (e: any) {
          Alert.alert('Prices not saved', 'Your profile was saved, but service prices could not be. You can set them later from your profile.');
        }
      }
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setStep(5);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Could not save your profile. Please try again.');
    }
    setLoading(false);
  }

  async function uploadDoc(docType: typeof STEP4_DOCS[0]) {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // No permission request needed: launchImageLibraryAsync uses the OS system
    // picker (SDK 52). Requesting media-library permission here asks for WRITE
    // access; a prior "Deny" then wrongly blocks uploads.
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.6,
      base64: true,
    });

    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];

    setDocField(docType.id, { uri: asset.uri, uploading: true, error: null });

    try {
      // Build dataUrl for API
      let dataUrl = '';
      const mimeType = asset.mimeType ?? 'image/jpeg';

      if (Platform.OS === 'web') {
        if (asset.base64) {
          dataUrl = `data:${mimeType};base64,${asset.base64}`;
        } else if (asset.uri.startsWith('blob:') && typeof FileReader !== 'undefined') {
          const resp = await fetch(asset.uri);
          const blob = await resp.blob();
          dataUrl = await new Promise<string>((res, rej) => {
            const r = new FileReader();
            r.onload = () => res(r.result as string);
            r.onerror = rej;
            r.readAsDataURL(blob);
          });
        } else {
          dataUrl = asset.uri;
        }
      } else {
        if (asset.base64) {
          dataUrl = `data:${mimeType};base64,${asset.base64}`;
        } else {
          dataUrl = asset.uri;
        }
      }

      const res = await apiUploadDocument({
        docType:  docType.id,
        label:    docType.label,
        uri:      Platform.OS !== 'web' ? asset.uri : undefined,
        dataUrl,
        mimeType,
        fileName: `${docType.id}-${Date.now()}.jpg`,
      });

      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setDocField(docType.id, {
        uri:         asset.uri,
        uploadedUrl: res.document.url,
        uploading:   false,
        error:       null,
      });
    } catch (err: any) {
      console.error('[ProviderOnboarding] upload error:', err);
      setDocField(docType.id, {
        uploading: false,
        error: err.message || 'Upload failed. Please try again.',
      });
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }

  async function finishOnboarding() {
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    // Update BOTH the persisted store AND the in-memory AuthContext user.
    // Previously this only wrote Storage directly, leaving the React `user` state
    // (which ProviderNavigator's onboarding gate reads) stale at onboardingComplete=false.
    // On any re-mount of ProviderNavigator the stale value re-routed an already-onboarded
    // Provider back to the registration form. updateUser persists to Storage too.
    updateUser({ onboardingComplete: true });
    nav.reset({ index: 0, routes: [{ name: 'ProviderHome' as never }] });
  }

  const footerLabel =
    step === 1 ? 'Continue →' :
    step === 2 ? 'Continue →' :
    step === 3 ? 'Continue →' :
    step === 4 ? 'Submit Profile' :
    'Go to Dashboard →';

  function handleFooterNext() {
    if (step === 1) setStep(2);
    else if (step === 2) setStep(3);
    else if (step === 3) setStep(4);
    else if (step === 4) submitProfile();
    else finishOnboarding();
  }

  function handleFooterBack() {
    if (step === 2) setStep(1);
    else if (step === 3) setStep(2);
    else if (step === 4) setStep(3);
  }

  const anyUploading = Object.values(docStates).some(d => d.uploading);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ flex: 1, backgroundColor: BG }}>
        <ScrollView
          contentContainerStyle={{ paddingBottom: 24 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Header ── */}
          <LinearGradient
            colors={[BRAND_DARK, BRAND]}
            style={[styles.header, { paddingTop: insets.top + 24 }]}
          >
            <View style={styles.headerBadge}>
              <Text style={styles.headerBadgeText}>Step {step} of 5</Text>
            </View>
            <Text style={styles.headerTitle}>Provider Verification</Text>
            <Text style={styles.headerSub}>
              {step === 1 ? 'Tell us about your credential' :
               step === 2 ? 'Specialties & languages' :
               step === 3 ? 'Final details' :
               step === 4 ? 'Set your prices' :
               'Upload your documents'}
            </Text>
            <StepIndicator step={step} />
          </LinearGradient>

          <View style={styles.body}>

            {/* ── STEP 1: Qualification ── */}
            {step === 1 && (
              <>
                <Text style={styles.sectionTitle}>Your Qualification</Text>
                <Text style={styles.sectionSub}>Select your primary beauty specialty.</Text>

                <View style={styles.qualGrid}>
                  {QUAL_TYPES.map(q => {
                    const active = qualType === q.key;
                    return (
                      <Pressable
                        key={q.key}
                        style={[styles.qualCard, active && { borderColor: q.color, borderLeftColor: q.color, backgroundColor: q.color + '0D' }]}
                        onPress={() => {
                          if (Platform.OS !== 'web') Haptics.selectionAsync();
                          setQualType(q.key);
                        }}
                      >
                        {active && <View style={[styles.qualActiveDot, { backgroundColor: q.color }]} />}
                        <Text style={[styles.qualLabel, active && { color: q.color }]}>{q.label}</Text>
                        <Text style={styles.qualDesc} numberOfLines={2}>{q.desc}</Text>
                      </Pressable>
                    );
                  })}
                </View>

                <Text style={styles.fieldLabel}>CERTIFICATION NUMBER <Text style={styles.optional}>(Optional)</Text></Text>
                <TextInput
                  style={styles.input}
                  value={licenseNum}
                  onChangeText={setLicenseNum}
                  placeholder="e.g. CERT123456"
                  placeholderTextColor="#94A3B8"
                  autoCapitalize="characters"
                  returnKeyType="next"
                />

                <Text style={styles.fieldLabel}>ISSUING ACADEMY <Text style={styles.optional}>(Optional)</Text></Text>
                <TextInput
                  style={styles.input}
                  value={college}
                  onChangeText={setCollege}
                  placeholder="e.g. Blanche Macdonald Centre"
                  placeholderTextColor="#94A3B8"
                  autoCapitalize="words"
                  returnKeyType="next"
                />

                <Text style={styles.fieldLabel}>YEARS OF EXPERIENCE</Text>
                <TextInput
                  style={styles.input}
                  value={experience}
                  onChangeText={setExperience}
                  placeholder="0"
                  placeholderTextColor="#94A3B8"
                  keyboardType="number-pad"
                  maxLength={2}
                  returnKeyType="done"
                />
              </>
            )}

            {/* ── STEP 2: Specialties ── */}
            {step === 2 && (
              <>
                <Text style={styles.sectionTitle}>Specialties & Languages</Text>
                <Text style={styles.sectionSub}>Select everything that applies to your practice.</Text>

                <Text style={styles.fieldLabel}>BEAUTY SPECIALTIES</Text>
                <View style={styles.chipGrid}>
                  {SPECIALTY_OPTIONS.map(s => {
                    const active = specialties.includes(s);
                    return (
                      <Pressable
                        key={s}
                        style={[styles.chip, active && styles.chipActive]}
                        onPress={() => toggleSpecialty(s)}
                      >
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>{s}</Text>
                      </Pressable>
                    );
                  })}
                </View>

                <Text style={styles.fieldLabel}>LANGUAGES</Text>
                <View style={styles.chipGrid}>
                  {LANGUAGE_OPTIONS.map(l => {
                    const active = languages.includes(l);
                    return (
                      <Pressable
                        key={l}
                        style={[styles.chip, active && styles.chipActive]}
                        onPress={() => toggleLanguage(l)}
                      >
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>{l}</Text>
                      </Pressable>
                    );
                  })}
                </View>

                <Text style={styles.fieldLabel}>SHORT BIO <Text style={styles.optional}>(Optional)</Text></Text>
                <TextInput
                  style={[styles.input, styles.bioInput]}
                  value={bio}
                  onChangeText={setBio}
                  placeholder="Brief description of your experience and approach to care…"
                  placeholderTextColor="#94A3B8"
                  multiline
                  numberOfLines={4}
                  maxLength={400}
                />
                <Text style={styles.charCount}>{bio.length}/400</Text>
              </>
            )}

            {/* ── STEP 3: Details ── */}
            {step === 3 && (
              <>
                <Text style={styles.sectionTitle}>Almost Done</Text>
                <Text style={styles.sectionSub}>These details help clients find the right match.</Text>

                <View style={styles.card}>
                  {[
                    { label: 'First Aid / CPR Certified', sub: 'Valid certificate (optional)', value: firstAid, set: setFirstAid },
                    { label: 'Own Transportation',         sub: 'Vehicle to travel to clients', value: ownCar, set: setOwnCar },
                  ].map((item, i) => (
                    <View key={item.label}>
                      {i > 0 && <View style={styles.divider} />}
                      <View style={styles.switchRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.switchLabel}>{item.label}</Text>
                          <Text style={styles.switchSub}>{item.sub}</Text>
                        </View>
                        <Switch
                          value={item.value}
                          onValueChange={v => {
                            if (Platform.OS !== 'web') Haptics.selectionAsync();
                            item.set(v);
                          }}
                          trackColor={{ false: '#E2E8F0', true: GREEN + '60' }}
                          thumbColor={item.value ? GREEN : '#CBD5E1'}
                        />
                      </View>
                    </View>
                  ))}
                </View>

                <View style={styles.infoBox}>
                  <Text style={styles.infoBoxIcon}>ℹ️</Text>
                  <Text style={styles.infoBoxText}>
                    Your profile will be reviewed within 1–2 business days. You can browse the app while we verify.
                  </Text>
                </View>
              </>
            )}

            {/* ── STEP 4: Pricing ── */}
            {step === 4 && (
              <>
                <Text style={styles.sectionTitle}>Set Your Prices</Text>
                <Text style={styles.sectionSub}>Set a price for each service you offer. Clients see the exact amount before booking. You can change this later from your profile.</Text>

                <Text style={styles.fieldLabel}>SERVICE PRICES ($)</Text>
                {specialties.length === 0 ? (
                  <View style={[styles.infoBox, { backgroundColor: '#FEF3C7', borderColor: '#FCD34D' }]}>
                    <Text style={styles.infoBoxIcon}>⚠️</Text>
                    <Text style={[styles.infoBoxText, { color: '#92400E' }]}>
                      No specialties selected yet. Go back to Step 2 to select specialties, then set prices for each.
                    </Text>
                  </View>
                ) : (
                  specialties.map(s => (
                    <View key={s} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                      <Text style={{ flex: 1, fontSize: 14, fontWeight: '600', color: TEXT }}>{s}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Text style={{ fontSize: 16, fontWeight: '800', color: GREEN }}>$</Text>
                        <TextInput
                          style={[styles.input, { width: 90, textAlign: 'right' }]}
                          value={servicePrices[s] || ''}
                          onChangeText={v => setServicePrices(prev => ({ ...prev, [s]: v }))}
                          placeholder="—"
                          placeholderTextColor="#CBD5E1"
                          keyboardType="number-pad"
                          maxLength={5}
                        />
                      </View>
                    </View>
                  ))
                )}
                <View style={[styles.infoBox, { marginTop: 6 }]}>
                  <Text style={styles.infoBoxIcon}>💡</Text>
                  <Text style={styles.infoBoxText}>
                    Set a fixed price for each service. Clients see the exact amount before booking.
                  </Text>
                </View>

                {/* Negotiable toggle */}
                <View style={[styles.card, { marginTop: 20 }]}>
                  <View style={styles.switchRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.switchLabel}>Allow Price Negotiation</Text>
                      <Text style={styles.switchSub}>Clients can propose a different price when booking</Text>
                    </View>
                    <Switch
                      value={priceNegotiable}
                      onValueChange={v => {
                        if (Platform.OS !== 'web') Haptics.selectionAsync();
                        setPriceNegotiable(v);
                      }}
                      trackColor={{ false: '#E2E8F0', true: GREEN + '60' }}
                      thumbColor={priceNegotiable ? GREEN : '#CBD5E1'}
                    />
                  </View>
                </View>
              </>
            )}

            {/* ── STEP 5: Account Created + Documents ── */}
            {step === 5 && (
              <>
                {/* "You're in!" celebration banner */}
                <View style={styles.celebrationCard}>
                  <View style={styles.celebrationIcon}>
                    <Text style={{ fontSize: 36 }}>🎉</Text>
                  </View>
                  <Text style={styles.celebrationTitle}>You're in!</Text>
                  <Text style={styles.celebrationSub}>
                    Your account is created and your profile is live. Upload your documents below to get verified faster — or skip for now and do it later.
                  </Text>
                </View>

                <Text style={styles.sectionTitle}>Upload Documents</Text>
                <Text style={styles.sectionSub}>
                  Required items are marked{' '}
                  <Text style={{ color: DANGER, fontWeight: '700' }}>*</Text>
                  . You can add more from your profile later.
                </Text>

                {STEP4_DOCS.map(doc => {
                  const ds = docStates[doc.id];
                  const isDone = !!ds.uploadedUrl;
                  const isLoading = ds.uploading;

                  return (
                    <View key={doc.id} style={[styles.docCard, isDone && styles.docCardDone]}>
                      <View style={styles.docHeader}>
                        <View style={[styles.docIconBubble, isDone && { backgroundColor: '#DCFCE7', borderColor: '#86EFAC' }]}>
                          <DocIcon id={doc.id} done={isDone} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Text style={styles.docLabel}>{doc.label}</Text>
                            {doc.required && <Text style={{ color: DANGER, fontWeight: '800', fontSize: 14 }}>*</Text>}
                            {isDone && (
                              <View style={styles.uploadedBadge}>
                                <Text style={styles.uploadedBadgeText}>Uploaded</Text>
                              </View>
                            )}
                          </View>
                          <Text style={styles.docHint}>{doc.hint}</Text>
                        </View>
                      </View>

                      {ds.error && (
                        <View style={styles.errorBox}>
                          <Text style={styles.errorText}>{ds.error}</Text>
                        </View>
                      )}

                      {ds.uri && !isLoading && (
                        <Image source={{ uri: ds.uri }} style={styles.docPreview} contentFit="cover" cachePolicy="memory-disk" />
                      )}

                      <Pressable
                        style={[
                          styles.uploadBtn,
                          isDone && styles.uploadBtnReplace,
                          isLoading && { opacity: 0.65 },
                        ]}
                        onPress={() => uploadDoc(doc)}
                        disabled={isLoading}
                      >
                        {isLoading
                          ? (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                              <ActivityIndicator size="small" color={isDone ? GREEN : '#fff'} />
                              <Text style={[styles.uploadBtnText, isDone && styles.uploadBtnTextReplace]}>Uploading…</Text>
                            </View>
                          )
                          : (
                            <Text style={[styles.uploadBtnText, isDone && styles.uploadBtnTextReplace]}>
                              {isDone ? '↑ Replace Photo' : '↑ Upload Photo'}
                            </Text>
                          )
                        }
                      </Pressable>
                    </View>
                  );
                })}

                {/* "Skip for now" button */}
                <Pressable
                  style={({ pressed }) => [styles.skipBtn, pressed && { opacity: 0.7 }]}
                  onPress={finishOnboarding}
                >
                  <Text style={styles.skipBtnText}>Skip for now</Text>
                </Pressable>
              </>
            )}

          </View>
        </ScrollView>

        {/* ── Sticky footer ── */}
        <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
          {step > 1 && step < 5 && (
            <Pressable style={styles.backBtn} onPress={handleFooterBack} accessibilityRole="button">
              <Text style={styles.backBtnText}>← Back</Text>
            </Pressable>
          )}
          <Pressable
            style={[styles.nextBtn, (loading || anyUploading) && { opacity: 0.65 }]}
            onPress={handleFooterNext}
            disabled={loading || anyUploading}
            accessibilityRole="button"
          >
            <LinearGradient
              colors={[BRAND_DARK, BRAND]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={styles.nextBtnGrad}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.nextBtnText}>{footerLabel}</Text>
              }
            </LinearGradient>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  // Header
  header: {
    paddingHorizontal: 24,
    paddingBottom: 32,
    alignItems: 'center',
  },
  headerBadge: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 5,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  headerBadgeText: { color: '#fff', fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
  headerTitle: { color: '#fff', fontSize: 26, fontWeight: '800', marginBottom: 6, letterSpacing: -0.3 },
  headerSub: { color: 'rgba(255,255,255,0.65)', fontSize: 14, marginBottom: 24 },

  // Step indicator
  stepWrap: { width: '100%', gap: 10 },
  stepTrack: {
    width: '100%', height: 3, borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)', overflow: 'hidden',
  },
  stepFill: { height: '100%', backgroundColor: '#fff', borderRadius: 2 },
  stepRow: { flexDirection: 'row', justifyContent: 'space-between' },
  stepItem: { alignItems: 'center', gap: 5, flex: 1 },
  stepDot: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center', justifyContent: 'center',
  },
  stepDotDone: { backgroundColor: '#fff', borderColor: '#fff' },
  stepDotCurrent: { backgroundColor: '#fff', borderColor: '#fff', shadowColor: '#fff', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.5, shadowRadius: 8, elevation: 5 },
  stepNum: { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.4)' },
  stepNumActive: { color: NAVY },
  stepCheck: { fontSize: 12, fontWeight: '800', color: NAVY },
  stepLabel: { fontSize: 9, fontWeight: '600', color: 'rgba(255,255,255,0.4)', textAlign: 'center', textTransform: 'uppercase', letterSpacing: 0.3 },
  stepLabelActive: { color: 'rgba(255,255,255,0.85)' },

  // Body
  body: { padding: 20, gap: 0 },
  sectionTitle: { fontSize: 22, fontWeight: '800', color: TEXT, marginBottom: 6, letterSpacing: -0.3 },
  sectionSub: { fontSize: 14, color: MUTED, marginBottom: 24, lineHeight: 21 },

  fieldLabel: {
    fontSize: 11, fontWeight: '700', color: MUTED,
    textTransform: 'uppercase', letterSpacing: 0.8,
    marginTop: 20, marginBottom: 10,
  },
  optional: { color: '#94A3B8', fontWeight: '500', textTransform: 'none' },

  // Qual grid
  qualGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 4 },
  qualCard: {
    width: '47%',
    backgroundColor: SURFACE,
    borderRadius: 14, padding: 14,
    borderWidth: 1.5, borderColor: BORDER,
    borderLeftWidth: 4, borderLeftColor: 'transparent',
    minHeight: 80,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
    position: 'relative',
  },
  qualActiveDot: {
    position: 'absolute', top: 10, right: 10,
    width: 8, height: 8, borderRadius: 4,
  },
  qualLabel: { fontSize: 15, fontWeight: '800', color: TEXT, marginBottom: 4 },
  qualDesc: { fontSize: 11, color: MUTED, lineHeight: 15 },

  // Input
  input: {
    backgroundColor: SURFACE, borderRadius: 14,
    paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 16, color: TEXT,
    borderWidth: 1.5, borderColor: BORDER,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
  },
  bioInput: { height: 120, textAlignVertical: 'top', paddingTop: 14 },
  charCount: { fontSize: 11, color: '#94A3B8', textAlign: 'right', marginTop: 4 },

  // Chips
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 9,
    borderRadius: 22, backgroundColor: SURFACE,
    borderWidth: 1.5, borderColor: BORDER,
    minHeight: 44, justifyContent: 'center',
  },
  chipActive: { backgroundColor: BRAND_SOFT, borderColor: BRAND },
  chipText: { fontSize: 13, fontWeight: '600', color: MUTED },
  chipTextActive: { color: BRAND_DARK, fontWeight: '700' },

  // Card (step 3)
  card: {
    backgroundColor: SURFACE, borderRadius: 18,
    paddingHorizontal: 18, paddingVertical: 14,
    borderWidth: 1, borderColor: BORDER,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  divider: { height: 1, backgroundColor: BORDER, marginVertical: 14 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 4, minHeight: 44 },
  switchLabel: { fontSize: 15, fontWeight: '600', color: TEXT, marginBottom: 2 },
  switchSub: { fontSize: 12, color: MUTED },

  // Info box
  infoBox: {
    flexDirection: 'row', gap: 12, alignItems: 'flex-start',
    backgroundColor: BRAND_SOFT, borderRadius: 14,
    padding: 16, marginTop: 20,
    borderWidth: 1, borderColor: '#A7F3D0',
  },
  infoBoxIcon: { marginRight: 2 },
  infoBoxText: { flex: 1, fontSize: 13, color: BRAND_DARK, lineHeight: 19 },

  // KYC security banner (step 4)
  secureBanner: {
    flexDirection: 'row', gap: 12, alignItems: 'flex-start',
    backgroundColor: NAVY, borderRadius: 16, padding: 16, marginTop: 16,
  },
  secureBannerIcon: { width: 26, alignItems: 'center' },
  secureBannerTitle: { fontSize: 14, fontWeight: '800', color: '#fff', marginBottom: 3 },
  secureBannerText: { fontSize: 12, color: 'rgba(255,255,255,0.8)', lineHeight: 18 },

  verifyChecklist: { marginTop: 14, marginBottom: 4, gap: 10 },
  verifyCheckRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  verifyCheckDot: {
    width: 22, height: 22, borderRadius: 11, backgroundColor: '#DCFCE7',
    alignItems: 'center', justifyContent: 'center',
  },
  verifyCheckTick: { color: '#166534', fontWeight: '800', fontSize: 12 },
  verifyCheckText: { fontSize: 13, color: '#475569', fontWeight: '500', flex: 1 },

  // Doc cards (step 4)
  docCard: {
    backgroundColor: SURFACE, borderRadius: 18,
    padding: 16, marginBottom: 14,
    borderWidth: 1.5, borderColor: BORDER,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
    gap: 12,
  },
  docCardDone: { borderColor: '#86EFAC' },
  docHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  docIconBubble: {
    width: 50, height: 50, borderRadius: 14,
    backgroundColor: '#F8FAFC',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: BORDER, flexShrink: 0,
  },
  docLabel: { fontSize: 15, fontWeight: '700', color: TEXT, marginBottom: 4 },
  docHint: { fontSize: 12, color: '#94A3B8', lineHeight: 16 },
  uploadedBadge: {
    backgroundColor: '#DCFCE7', borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 2,
    borderWidth: 1, borderColor: '#86EFAC',
  },
  uploadedBadgeText: { fontSize: 11, fontWeight: '700', color: GREEN },
  docPreview: {
    width: '100%', height: 130, borderRadius: 12,
    backgroundColor: '#F1F5F9',
  },
  uploadBtn: {
    paddingVertical: 14, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: BRAND,
    minHeight: 44,
  },
  uploadBtnReplace: {
    backgroundColor: GREEN_SOFT,
    borderWidth: 1.5, borderColor: '#86EFAC',
  },
  uploadBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  uploadBtnTextReplace: { color: GREEN },
  errorBox: {
    backgroundColor: '#FEF2F2', borderRadius: 10,
    padding: 10, borderWidth: 1, borderColor: '#FCA5A5',
  },
  errorText: { fontSize: 13, color: DANGER, fontWeight: '500' },

  // Footer
  footer: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 20, paddingTop: 14,
    backgroundColor: SURFACE,
    borderTopWidth: 1, borderTopColor: BORDER,
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.06, shadowRadius: 12, elevation: 8,
  },
  backBtn: {
    width: 72, height: 52, justifyContent: 'center', alignItems: 'center',
    borderRadius: 14, borderWidth: 1.5, borderColor: BORDER,
    backgroundColor: SURFACE, minHeight: 44,
  },
  backBtnText: { fontSize: 15, fontWeight: '600', color: MUTED },
  nextBtn: { flex: 1, height: 52, borderRadius: 14, overflow: 'hidden', minHeight: 44 },
  nextBtnGrad: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  nextBtnText: { color: '#fff', fontSize: 16, fontWeight: '700', letterSpacing: -0.2 },

  celebrationCard: {
    backgroundColor: Colors.brandLight,
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  celebrationIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  celebrationTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: Colors.label,
    marginBottom: 8,
  },
  celebrationSub: {
    fontSize: 14,
    color: Colors.secondaryLabel,
    textAlign: 'center',
    lineHeight: 21,
  },
  skipBtn: {
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 12,
  },
  skipBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.secondaryLabel,
  },
});
