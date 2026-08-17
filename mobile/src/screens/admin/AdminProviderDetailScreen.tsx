import React, { useEffect, useState } from 'react';
import { Image } from 'expo-image';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  apiGetProviderDetail,
  apiApproveProvider,
  apiRejectProvider,
  apiVerifyDocument,
  apiTogglePoliceCheck,
  ProviderEntry,
} from '../../api/client';
import { Colors } from '../../utils/colors';
import {
  ShieldCheckIcon, MedalIcon, MedicalBagIcon, CardAccountDetailsIcon, NoteIcon, TranslateIcon,
} from '../../components/CareIcons';
import { CalendarSVGIcon, NavigateIcon, SearchIcon, CheckCircleIcon, CloseCircleIcon, DocumentIcon, HourglassIcon } from '../../components/TabIcons';

type IconComp = (p: { size?: number; color?: string }) => React.ReactElement;

// ── Doc type icons + labels ────────────────────────────────────────────────────
// Brand SVG icon per document type (instead of emoji) so the verification UI
// matches the Glow icon system.
const DOC_META: Record<string, { Icon: React.ComponentType<{ size?: number; color?: string }>; label: string; required: boolean }> = {
  police_check:    { Icon: ShieldCheckIcon,         label: 'Police Check Clearance',      required: true },
  provider_certificate: { Icon: MedalIcon,               label: 'Provider Certificate',             required: true },
  first_aid:       { Icon: MedicalBagIcon,          label: 'First Aid / CPR Certificate', required: true },
  drivers_license: { Icon: CardAccountDetailsIcon,  label: "Driver's Licence",            required: false },
  id_card:         { Icon: CardAccountDetailsIcon,  label: 'Government ID',               required: false },
  insurance:       { Icon: NoteIcon,                label: 'Liability Insurance',         required: false },
};

function Divider() {
  return <View style={styles.divider} />;
}

function InfoRow({ Icon, label, value }: { Icon: IconComp; label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoIcon}><Icon size={16} color={Colors.secondaryLabel} /></View>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

// ── Full-screen image viewer modal ────────────────────────────────────────────
function ImageViewer({
  uri, label, visible, onClose,
}: { uri: string; label: string; visible: boolean; onClose: () => void }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={viewer.overlay}>
        <Pressable style={viewer.closeBtn} onPress={onClose}>
          <Text style={viewer.closeTxt}>✕ Close</Text>
        </Pressable>
        <Text style={viewer.label}>{label}</Text>
        <Image source={{ uri }} style={viewer.image} contentFit="contain" cachePolicy="memory-disk" />
      </View>
    </Modal>
  );
}

const viewer = StyleSheet.create({
  overlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  closeBtn: { position: 'absolute', top: 56, right: 20, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8 },
  closeTxt: { color: '#fff', fontSize: 15, fontWeight: '700' },
  label:    { color: '#fff', fontSize: 16, fontWeight: '700', marginBottom: 16, textAlign: 'center' },
  image:    { width: '100%', height: '75%', borderRadius: 12 },
});

export function AdminProviderDetailScreen() {
  const nav    = useNavigation<any>();
  const route  = useRoute<any>();
  const insets = useSafeAreaInsets();
  const { providerId } = route.params as { providerId: string };

  const [provider,       setProvider]       = useState<ProviderEntry | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [actingOn,  setActingOn]  = useState<string | null>(null);
  const [viewerUri, setViewerUri] = useState<string | null>(null);
  const [viewerLbl, setViewerLbl] = useState('');

  function goBack() {
    if (nav.canGoBack()) nav.goBack();
    else nav.navigate('AdminHome');
  }

  async function load() {
    try {
      const { provider: data } = await apiGetProviderDetail(providerId);
      setProvider(data);
    } catch {}
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const isApproved     = provider?.profile?.approvedByAdmin ?? false;
  const policeCleared  = provider?.profile?.policeCheckCleared ?? false;
  const docs           = provider?.profile?.submittedDocuments ?? [];
  const verifiedCount  = docs.filter(d => d.verifiedByAdmin).length;
  const requiredDocs   = Object.entries(DOC_META).filter(([, m]) => m.required).map(([k]) => k);
  const allRequiredIn  = requiredDocs.every(k => docs.find(d => d.docType === k));

  async function handleApprove() {
    const doIt = async () => {
      setActingOn('approve');
      try {
        await apiApproveProvider(providerId);
        await load();
      } catch (e: any) {
        const msg = (e as any).message || 'Could not approve';
        if (Platform.OS === 'web') alert(msg); else Alert.alert('Error', msg);
      }
      setActingOn(null);
    };
    if (Platform.OS === 'web') {
      if (window.confirm(`Approve ${provider?.name} as a verified Provider?`)) doIt();
    } else {
      Alert.alert('Approve Provider', `Approve ${provider?.name}?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Approve', onPress: doIt },
      ]);
    }
  }

  async function handleReject() {
    const doIt = async () => {
      setActingOn('reject');
      try {
        await apiRejectProvider(providerId);
        await load();
      } catch (e: any) {
        const msg = (e as any).message || 'Could not reject';
        if (Platform.OS === 'web') alert(msg); else Alert.alert('Error', msg);
      }
      setActingOn(null);
    };
    if (Platform.OS === 'web') {
      if (window.confirm(`Reject / revoke ${provider?.name}?`)) doIt();
    } else {
      Alert.alert('Reject Provider', `Remove approval for ${provider?.name}?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Reject', style: 'destructive', onPress: doIt },
      ]);
    }
  }

  async function handleVerifyDoc(docType: string, verified: boolean, documentId?: string) {
    setActingOn(`doc_${docType}`);
    try {
      await apiVerifyDocument(providerId, { docType, verified, documentId });
      await load();
    } catch (e: any) {
      const msg = (e as any).message || 'Could not update';
      if (Platform.OS === 'web') alert(msg); else Alert.alert('Error', msg);
    }
    setActingOn(null);
  }

  async function handlePoliceCheck(cleared: boolean) {
    setActingOn('police');
    try {
      await apiTogglePoliceCheck(providerId, cleared);
      await load();
    } catch (e: any) {
      const msg = (e as any).message || 'Could not update';
      if (Platform.OS === 'web') alert(msg); else Alert.alert('Error', msg);
    }
    setActingOn(null);
  }

  if (loading) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={Colors.systemPurple} />
        <Text style={styles.loadingText}>Loading Provider details…</Text>
      </View>
    );
  }

  if (!provider) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <Text style={styles.errorText}>Provider not found</Text>
        <Pressable onPress={goBack} style={styles.backBtnFallback}>
          <Text style={styles.backBtnFallbackText}>← Go Back</Text>
        </Pressable>
      </View>
    );
  }

  const initial = provider.name?.[0]?.toUpperCase() ?? '?';

  return (
    <View style={styles.container}>
      {/* ── Full-screen image viewer ─────────────────────────────── */}
      {viewerUri && (
        <ImageViewer
          uri={viewerUri}
          label={viewerLbl}
          visible={!!viewerUri}
          onClose={() => setViewerUri(null)}
        />
      )}

      {/* ── Header ─────────────────────────────────────────────────── */}
      <LinearGradient
        colors={['#1E1B4B', '#3730A3', '#4338CA']}
        style={[styles.header, { paddingTop: insets.top + 8 }]}
      >
        <Pressable style={styles.backBtn} onPress={goBack}>
          <Text style={styles.backBtnText}>← Workers</Text>
        </Pressable>

        <View style={styles.heroRow}>
          <View style={styles.heroAvatar}>
            {provider.profile?.photoUrl ? (
              <Image source={{ uri: provider.profile.photoUrl }} style={styles.heroAvatarImg} contentFit="cover" cachePolicy="memory-disk" transition={150} />
            ) : (
              <Text style={styles.heroAvatarText}>{initial}</Text>
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroName}>{provider.name}</Text>
            <Text style={styles.heroPhone}>{provider.phone}</Text>
            {(provider.ratingCount ?? 0) > 0 && (
              <Text style={styles.heroRating}>★ {provider.rating?.toFixed(1)} · {provider.ratingCount} ratings</Text>
            )}
          </View>
          <View style={[styles.statusPill, { backgroundColor: isApproved ? '#16A34A' : '#EA580C' }]}>
            <Text style={styles.statusPillText}>{isApproved ? '✓ Approved' : '⏳ Pending'}</Text>
          </View>
        </View>

        {/* Stats strip */}
        <View style={styles.statsStrip}>
          <View style={styles.statItem}>
            <Text style={styles.statVal}>{docs.length}</Text>
            <Text style={styles.statLabel}>Docs Submitted</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statVal}>{verifiedCount}</Text>
            <Text style={styles.statLabel}>Verified</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <View style={{ alignItems: 'center' }}>
              {policeCleared
                ? <CheckCircleIcon size={22} color="#fff" />
                : <HourglassIcon size={22} color="#fff" />}
            </View>
            <Text style={styles.statLabel}>Police Check</Text>
          </View>
        </View>
      </LinearGradient>

      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Approval banner / action buttons ─────────────────────── */}
        {!allRequiredIn && docs.length === 0 && (
          <View style={styles.noDocsBanner}>
            <View style={styles.noDocsBannerIcon}><CloseCircleIcon size={20} color={Colors.systemOrange ?? '#D97706'} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.noDocsBannerTitle}>No Documents Submitted Yet</Text>
              <Text style={styles.noDocsBannerSub}>The Provider hasn't uploaded any credential documents from the app. You can still approve based on their onboarding profile below.</Text>
            </View>
          </View>
        )}

        {allRequiredIn && !isApproved && (
          <View style={styles.readyBanner}>
            <View style={styles.readyBannerIcon}><CheckCircleIcon size={20} color={Colors.onlineGreen} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.readyBannerTitle}>All 3 required documents received</Text>
              <Text style={styles.readyBannerSub}>Review each document below, then approve this Provider.</Text>
            </View>
          </View>
        )}

        <View style={styles.actionRow}>
          <Pressable
            style={[styles.approveBtn, isApproved && styles.approveBtnDone, actingOn === 'approve' && { opacity: 0.7 }]}
            onPress={handleApprove}
            disabled={actingOn !== null}
          >
            {actingOn === 'approve'
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={styles.approveBtnText}>{isApproved ? '✓ Provider Approved' : 'Approve Provider'}</Text>
            }
          </Pressable>
          <Pressable
            style={[styles.rejectBtn, actingOn === 'reject' && { opacity: 0.7 }]}
            onPress={handleReject}
            disabled={actingOn !== null}
          >
            {actingOn === 'reject'
              ? <ActivityIndicator color="#DC2626" size="small" />
              : <Text style={styles.rejectBtnText}>{isApproved ? '✗ Revoke Approval' : '✗ Reject'}</Text>
            }
          </Pressable>
        </View>

        {/* ══════════════════════════════════════════════════════════════
            DOCUMENTS — the main review section
        ════════════════════════════════════════════════════════════════ */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Credential Documents · {docs.length} submitted · {verifiedCount} verified
          </Text>

          {docs.length === 0 ? (
            <View style={styles.emptyDocsCard}>
              <View style={styles.emptyDocsIcon}><DocumentIcon size={40} color={Colors.tertiaryLabel} /></View>
              <Text style={styles.emptyDocsTitle}>No documents yet</Text>
              <Text style={styles.emptyDocsSub}>
                Once the Provider uploads their documents from the app (My Documents screen), they will appear here for you to review.
              </Text>
            </View>
          ) : (
            docs.map(doc => {
              const meta      = DOC_META[doc.docType];
              const isVerif   = doc.verifiedByAdmin;
              const actionKey = `doc_${doc.docType}`;

              return (
                <View key={doc.docType} style={[styles.docCard, isVerif && styles.docCardVerified]}>
                  {/* Doc header */}
                  <View style={styles.docHeader}>
                    <View style={styles.docIcon}>
                      {meta?.Icon ? <meta.Icon size={22} color={Colors.brand} /> : <NoteIcon size={22} color={Colors.brand} />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.docLabel}>{doc.label || meta?.label || doc.docType}</Text>
                      <Text style={styles.docDate}>
                        Submitted {new Date(doc.submittedAt).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </Text>
                      {isVerif && doc.verifiedAt && (
                        <Text style={styles.docVerifDate}>Verified {new Date(doc.verifiedAt).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}</Text>
                      )}
                    </View>
                    <View style={[styles.docBadge, { backgroundColor: isVerif ? '#DCFCE7' : '#FEF3C7' }]}>
                      <Text style={[styles.docBadgeText, { color: isVerif ? '#15803D' : '#92400E' }]}>
                        {isVerif ? '✓ Verified' : '⏳ Review'}
                      </Text>
                    </View>
                  </View>

                  {/* ── DOCUMENT IMAGE (tap to fullscreen) ──────────── */}
                  {(doc.url || doc.dataUrl) ? (
                    <Pressable
                      style={styles.docImgWrap}
                      onPress={() => { setViewerLbl(doc.label || meta?.label || doc.docType); setViewerUri(doc.url || doc.dataUrl || null); }}
                    >
                      <Image
                        source={{ uri: doc.url || doc.dataUrl || '' }}
                        style={styles.docImg}
                        contentFit="cover"
                        cachePolicy="memory-disk"
                      />
                      <View style={styles.docImgOverlay}>
                        <View style={[styles.docImgZoomChip, { flexDirection: 'row', alignItems: 'center', gap: 4 }]}>
                          <SearchIcon size={13} color="#fff" />
                          <Text style={styles.docImgZoomText}>Tap to view full size</Text>
                        </View>
                      </View>
                    </Pressable>
                  ) : (
                    <View style={styles.docNoImg}>
                      <View style={styles.docNoImgIcon}><DocumentIcon size={28} color={Colors.tertiaryLabel} /></View>
                      <Text style={styles.docNoImgText}>No image uploaded for this document</Text>
                    </View>
                  )}

                  {/* Verify / Unverify */}
                  <View style={styles.docActionRow}>
                    {!isVerif ? (
                      <Pressable
                        style={[styles.verifyBtn, actingOn === actionKey && { opacity: 0.7 }]}
                        onPress={() => handleVerifyDoc(doc.docType, true, doc.documentId)}
                        disabled={actingOn !== null}
                      >
                        {actingOn === actionKey
                          ? <ActivityIndicator size="small" color="#fff" />
                          : <Text style={styles.verifyBtnText}>Mark Verified</Text>
                        }
                      </Pressable>
                    ) : (
                      <Pressable
                        style={[styles.unverifyBtn, actingOn === actionKey && { opacity: 0.7 }]}
                        onPress={() => handleVerifyDoc(doc.docType, false, doc.documentId)}
                        disabled={actingOn !== null}
                      >
                        <Text style={styles.unverifyBtnText}>✗ Mark Unverified</Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              );
            })
          )}
        </View>

        {/* ── Police Check toggle ───────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Police Check</Text>
          <View style={styles.card}>
            <View style={styles.toggleRow}>
              <View style={styles.toggleLeft}>
                <View style={styles.toggleIcon}><ShieldCheckIcon size={22} color={Colors.brand} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.toggleLabel}>Police Check Cleared</Text>
                  <Text style={styles.toggleSub}>RCMP / OPP criminal record check confirmed</Text>
                </View>
              </View>
              <Pressable
                style={[styles.togglePill, policeCleared ? styles.toggleOn : styles.toggleOff, actingOn === 'police' && { opacity: 0.7 }]}
                onPress={() => handlePoliceCheck(!policeCleared)}
                disabled={actingOn !== null}
              >
                {actingOn === 'police'
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.togglePillText}>{policeCleared ? '✓ Cleared' : 'Mark Cleared'}</Text>
                }
              </Pressable>
            </View>
          </View>
        </View>

        {/* ── Credential info ───────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Onboarding Profile</Text>
          <View style={styles.card}>
            <InfoRow Icon={MedalIcon} label="Qualification" value={provider.profile?.qualificationType ?? 'Provider'} />
            {(provider.profile?.licenseNumber || '') && (
              <>
                <Divider />
                <InfoRow Icon={CardAccountDetailsIcon} label="Licence #" value={provider.profile!.licenseNumber!} />
              </>
            )}
            {(provider.profile?.collegeName || '') && (
              <>
                <Divider />
                <InfoRow Icon={MedalIcon} label="College" value={provider.profile!.collegeName!} />
              </>
            )}
            {!!provider.profile?.experienceYears && (
              <>
                <Divider />
                <InfoRow Icon={CalendarSVGIcon} label="Experience" value={`${provider.profile.experienceYears} years`} />
              </>
            )}
            {(provider.profile?.languages?.length ?? 0) > 0 && (
              <>
                <Divider />
                <InfoRow Icon={TranslateIcon} label="Languages" value={provider.profile!.languages!.join(', ')} />
              </>
            )}
            {provider.profile?.firstAidCertified && (
              <>
                <Divider />
                <InfoRow Icon={MedicalBagIcon} label="First Aid" value="Self-reported certified" />
              </>
            )}
            {provider.profile?.ownTransportation && (
              <>
                <Divider />
                <InfoRow Icon={NavigateIcon} label="Own Vehicle" value="Yes" />
              </>
            )}
          </View>
        </View>

        {/* ── Specialties ───────────────────────────────────────────── */}
        {(provider.profile?.specialties?.length ?? 0) > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Specialties</Text>
            <View style={[styles.card, { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }]}>
              {provider.profile!.specialties!.map(s => (
                <View key={s} style={styles.chip}>
                  <Text style={styles.chipText}>{s}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {provider.profile?.bio ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Bio</Text>
            <View style={styles.card}>
              <Text style={styles.bioText}>{provider.profile.bio}</Text>
            </View>
          </View>
        ) : null}

        {/* ── Final approve at bottom so admin approves AFTER reviewing ── */}
        <View style={styles.bottomApprove}>
          <Text style={styles.bottomApproveHint}>
            {isApproved
              ? 'This Provider is currently approved and can accept bookings.'
              : 'After reviewing all documents above, approve or reject this Provider.'}
          </Text>
          <View style={styles.actionRow}>
            <Pressable
              style={[styles.approveBtn, isApproved && styles.approveBtnDone, actingOn === 'approve' && { opacity: 0.7 }]}
              onPress={handleApprove}
              disabled={actingOn !== null}
            >
              {actingOn === 'approve'
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.approveBtnText}>{isApproved ? '✓ Approved' : 'Approve Provider'}</Text>
              }
            </Pressable>
            <Pressable
              style={[styles.rejectBtn, actingOn === 'reject' && { opacity: 0.7 }]}
              onPress={handleReject}
              disabled={actingOn !== null}
            >
              {actingOn === 'reject'
                ? <ActivityIndicator color="#DC2626" size="small" />
                : <Text style={styles.rejectBtnText}>{isApproved ? '✗ Revoke' : '✗ Reject'}</Text>
              }
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F7' },
  centered:  { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { fontSize: 14, color: Colors.secondaryLabel },
  errorText:   { fontSize: 16, color: Colors.secondaryLabel },
  backBtnFallback: { backgroundColor: Colors.systemBlue, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10 },
  backBtnFallbackText: { color: '#fff', fontWeight: '700' },

  // Header
  header: { paddingHorizontal: 20, paddingBottom: 20 },
  backBtn: { marginBottom: 14 },
  backBtnText: { color: 'rgba(255,255,255,0.7)', fontSize: 15, fontWeight: '600' },

  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 },
  heroAvatar: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: '#7C3AED', alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: 'rgba(255,255,255,0.35)', overflow: 'hidden',
  },
  heroAvatarImg:  { width: 64, height: 64, borderRadius: 32 },
  heroAvatarText: { color: '#fff', fontSize: 26, fontWeight: '800' },
  heroName:   { color: '#fff', fontSize: 20, fontWeight: '800', marginBottom: 2 },
  heroPhone:  { color: 'rgba(255,255,255,0.65)', fontSize: 13 },
  heroRating: { color: 'rgba(255,255,255,0.8)', fontSize: 13, marginTop: 2 },

  statusPill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  statusPillText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  statsStrip: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 14, padding: 14,
  },
  statItem:   { flex: 1, alignItems: 'center', gap: 2 },
  statVal:    { color: '#fff', fontSize: 20, fontWeight: '900' },
  statLabel:  { color: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: '600', textAlign: 'center' },
  statDivider:{ width: 1, height: 32, backgroundColor: 'rgba(255,255,255,0.2)' },

  // Body
  body: { padding: 16, gap: 0 },

  // Banners
  noDocsBanner: {
    flexDirection: 'row', gap: 12, alignItems: 'flex-start',
    backgroundColor: '#FFF7ED', borderRadius: 16, padding: 16, marginBottom: 12,
    borderWidth: 1.5, borderColor: '#FED7AA',
  },
  noDocsBannerIcon:  { },
  noDocsBannerTitle: { fontSize: 14, fontWeight: '800', color: '#92400E', marginBottom: 4 },
  noDocsBannerSub:   { fontSize: 13, color: '#B45309', lineHeight: 18 },

  readyBanner: {
    flexDirection: 'row', gap: 12, alignItems: 'center',
    backgroundColor: '#F0FDF4', borderRadius: 16, padding: 16, marginBottom: 12,
    borderWidth: 1.5, borderColor: '#86EFAC',
  },
  readyBannerIcon:  { },
  readyBannerTitle: { fontSize: 14, fontWeight: '800', color: '#15803D', marginBottom: 2 },
  readyBannerSub:   { fontSize: 13, color: '#16A34A' },

  // Action row
  actionRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  approveBtn: {
    flex: 1, backgroundColor: '#059669', borderRadius: 14,
    paddingVertical: 16, alignItems: 'center',
    shadowColor: '#059669', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  approveBtnDone: { backgroundColor: '#16A34A' },
  approveBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  rejectBtn: {
    flex: 1, backgroundColor: '#fff', borderRadius: 14, paddingVertical: 16, alignItems: 'center',
    borderWidth: 2, borderColor: '#FCA5A5',
  },
  rejectBtnText: { color: '#DC2626', fontSize: 15, fontWeight: '700' },

  // Section
  section: { marginBottom: 20 },
  sectionTitle: {
    fontSize: 11, fontWeight: '700', color: '#888',
    textTransform: 'uppercase', letterSpacing: 0.8,
    marginBottom: 10, paddingHorizontal: 4,
  },

  card: {
    backgroundColor: '#fff', borderRadius: 18, paddingHorizontal: 16, paddingVertical: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 2,
  },
  divider: { height: 1, backgroundColor: '#f0f0f0', marginVertical: 10 },

  // InfoRow
  infoRow:   { flexDirection: 'row', alignItems: 'center', gap: 10 },
  infoIcon:  { width: 22 },
  infoLabel: { flex: 1, fontSize: 14, color: '#666' },
  infoValue: { fontSize: 14, fontWeight: '600', color: '#111827', textAlign: 'right' },

  // Empty docs
  emptyDocsCard: {
    backgroundColor: '#fff', borderRadius: 18, padding: 32, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 2,
  },
  emptyDocsIcon:  { marginBottom: 12 },
  emptyDocsTitle: { fontSize: 16, fontWeight: '800', color: Colors.label, marginBottom: 8 },
  emptyDocsSub:   { fontSize: 13, color: Colors.secondaryLabel, textAlign: 'center', lineHeight: 20 },

  // Document cards
  docCard: {
    backgroundColor: '#fff', borderRadius: 18, padding: 16, marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 10, elevation: 3,
    borderWidth: 2, borderColor: '#E5E7EB',
  },
  docCardVerified: { borderColor: '#86EFAC' },

  docHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 12 },
  docIcon:   { marginTop: 2, width: 30, alignItems: 'center' },
  docLabel:  { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 3 },
  docDate:   { fontSize: 12, color: '#6B7280' },
  docVerifDate: { fontSize: 12, color: '#059669', fontWeight: '600', marginTop: 3 },
  docBadge:     { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, alignSelf: 'flex-start' },
  docBadgeText: { fontSize: 12, fontWeight: '700' },

  // Document image
  docImgWrap: {
    height: 220, borderRadius: 14, overflow: 'hidden',
    backgroundColor: '#111', marginBottom: 12,
    borderWidth: 2, borderColor: '#E5E7EB',
  },
  docImg: { width: '100%', height: '100%' },
  docImgOverlay: { position: 'absolute', bottom: 10, left: 10, right: 10, alignItems: 'center' },
  docImgZoomChip: {
    backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 7,
  },
  docImgZoomText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  docNoImg: {
    height: 100, borderRadius: 14, backgroundColor: '#F9FAFB',
    alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 12,
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  docNoImgIcon: { },
  docNoImgText: { fontSize: 13, color: '#9CA3AF', textAlign: 'center' },

  docActionRow: { gap: 8 },
  verifyBtn: {
    backgroundColor: '#059669', borderRadius: 12, paddingVertical: 13, alignItems: 'center',
  },
  verifyBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  unverifyBtn: {
    backgroundColor: '#FFF7ED', borderRadius: 12, paddingVertical: 13, alignItems: 'center',
    borderWidth: 1.5, borderColor: '#FED7AA',
  },
  unverifyBtnText: { color: '#EA580C', fontSize: 14, fontWeight: '700' },

  // Police check toggle
  toggleRow:  { flexDirection: 'row', alignItems: 'center', gap: 12 },
  toggleLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  toggleIcon: { marginRight: 10 },
  toggleLabel:{ fontSize: 15, fontWeight: '600', color: '#111827' },
  toggleSub:  { fontSize: 12, color: '#888', marginTop: 2 },
  togglePill: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20, minWidth: 120, alignItems: 'center' },
  toggleOn:   { backgroundColor: '#059669' },
  toggleOff:  { backgroundColor: '#6B7280' },
  togglePillText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  // Bottom approve
  bottomApprove: { marginTop: 8 },
  bottomApproveHint: { fontSize: 13, color: Colors.secondaryLabel, textAlign: 'center', marginBottom: 12, lineHeight: 19 },

  // Chips
  chip: {
    backgroundColor: '#EFF6FF', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5,
    borderWidth: 1, borderColor: '#BFDBFE',
  },
  chipText: { fontSize: 13, fontWeight: '600', color: '#1D4ED8' },
  bioText:  { fontSize: 14, color: '#374151', lineHeight: 21 },
});
