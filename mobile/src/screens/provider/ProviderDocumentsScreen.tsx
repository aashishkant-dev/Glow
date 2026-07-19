import React, { useCallback, useEffect, useState } from 'react';
import { Image } from 'expo-image';
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { apiUploadDocument, apiGetMyDocuments } from '../../api/client';
import { Storage, StoredDocument } from '../../utils/storage';
import { Colors } from '../../utils/colors';
import { CheckCircleIcon } from '../../components/TabIcons';
import {
  ShieldCheckIcon, MedalIcon, MedicalBagIcon, CardAccountDetailsIcon, NoteIcon,
} from '../../components/CareIcons';
import { DEFAULT_REGION_NAME } from '../../utils/region';

// ── Document types required from Providers ─────────────────────────────────────────
const DOC_TYPES: {
  id: string;
  label: string;
  sublabel: string;
  Icon: React.ComponentType<{ size?: number; color?: string }>;
  required: boolean;
}[] = [
  // Keep this list in sync with:
  //   - ProviderOnboardingScreen STEP4_DOCS (required: true)
  //   - ProviderDashboardScreen REQUIRED_DOCS array
  // If a doc's required flag differs across those three places the dashboard's
  // progress bar and the onboarding gate will contradict each other.
  { id: 'police_check',    label: 'Police Check Clearance',      sublabel: 'RCMP/OPP criminal record check — required', Icon: ShieldCheckIcon,        required: true },
  { id: 'provider_certificate', label: 'Provider Certificate',             sublabel: 'Official credential from your college',      Icon: MedalIcon,              required: true },
  { id: 'first_aid_cert',  label: 'First Aid / CPR Certificate', sublabel: 'Valid St. John Ambulance or Red Cross cert', Icon: MedicalBagIcon,         required: true },
  { id: 'driver_license',  label: "Driver's Licence",            sublabel: 'Ontario G or G2 — both sides',              Icon: CardAccountDetailsIcon, required: false },
  // Required — must match ProviderOnboardingScreen STEP4_DOCS and ProviderDashboardScreen REQUIRED_DOCS.
  // Previously listed as required:false here, which caused the progress counter
  // to show 3/3 even when Government ID was missing.
  { id: 'id_proof',        label: 'Government ID',               sublabel: 'Passport, Ontario Photo Card, or health card', Icon: CardAccountDetailsIcon, required: true },
  { id: 'insurance',       label: 'Liability Insurance',         sublabel: 'Professional liability / E&O if applicable', Icon: NoteIcon,               required: false },
];

// HTML element aliases — TypeScript doesn't know about these in RN context
// but Expo web compiles with react-dom so they work at runtime.
const _Label = 'label' as any;
const _Input = 'input' as any;
const _Span  = 'span'  as any;

// Web-only: hold File objects in memory (avoids localStorage quota issues with base64)
const webFileCache = new Map<string, { file: File; previewUrl: string }>();

export function ProviderDocumentsScreen() {
  const insets   = useSafeAreaInsets();
  const nav      = useNavigation<any>();
  const [docs,       setDocs]       = useState<StoredDocument[]>([]);
  const [uploading,  setUploading]  = useState<string | null>(null);
  const [serverDocs, setServerDocs] = useState<Record<string, { status: string; rejectionReason?: string; url?: string; submittedAt?: string }>>({});
  // web: track which docs uploaded directly to server (bypasses AsyncStorage)
  const [webUploaded, setWebUploaded] = useState<Record<string, { previewUrl: string; uploadedAt: string }>>({});

  // Build serverDocs map (status + url) from the API response — reused by focus + after upload.
  function applyServerDocs(documents: { docType: string; status: string; rejectionReason?: string; url?: string; previewUrl?: string; submittedAt?: string }[]) {
    const map: Record<string, { status: string; rejectionReason?: string; url?: string; submittedAt?: string }> = {};
    // previewUrl = cloud url, or base64 dataUrl fallback (so the photo survives reload in dev).
    documents.forEach(d => { map[d.docType] = { status: d.status, rejectionReason: d.rejectionReason, url: d.previewUrl || d.url, submittedAt: d.submittedAt }; });
    setServerDocs(map);
  }

  // Load local docs once on mount
  useEffect(() => {
    Storage.getDocuments().then(setDocs);
  }, []);

  // Refresh server doc status every time the screen is focused
  useFocusEffect(useCallback(() => {
    apiGetMyDocuments().then(r => applyServerDocs(r.documents)).catch(() => {});
  }, []));

  const requiredDone  = DOC_TYPES.filter(t =>
    t.required && (
      docs.find(d => d.id === t.id) ||
      webUploaded[t.id] ||
      serverDocs[t.id]?.status === 'APPROVED' ||
      serverDocs[t.id]?.status === 'PENDING'
    )
  ).length;
  const requiredTotal = DOC_TYPES.filter(t => t.required).length;
  const progressPct   = Math.round((requiredDone / requiredTotal) * 100);
  // Auto-submit model: a doc is "submitted" the moment it's uploaded (web on
  // select, native in uploadDocNative). All required docs uploaded = fully submitted.
  const allSubmitted  = requiredDone === requiredTotal;

  // ── Compress an image data-URL via canvas ──────────────────────────────────
  async function compressDataUrl(rawDataUrl: string): Promise<string> {
    if (!rawDataUrl.startsWith('data:') || typeof document === 'undefined') return rawDataUrl;
    return new Promise<string>((resolve) => {
      const img = new (window as any).Image();
      img.onload = () => {
        const MAX = 1200;
        const scale = Math.min(1, MAX / Math.max(img.naturalWidth || MAX, img.naturalHeight || MAX));
        const canvas = document.createElement('canvas');
        canvas.width  = Math.round(img.naturalWidth  * scale);
        canvas.height = Math.round(img.naturalHeight * scale);
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.6));
      };
      img.onerror = () => resolve(rawDataUrl);
      img.src = rawDataUrl;
    });
  }

  // ── Save a processed URI to local storage and update state ────────────────
  // Also store a base64 dataUrl when available: the picker's content://file:// uri
  // can become unreadable after the picker session, leaving a BLANK preview even
  // though the upload succeeded. A stored dataUrl always renders.
  async function saveDoc(docType: typeof DOC_TYPES[0], stableUri: string, dataUrl?: string) {
    const doc: StoredDocument = {
      id:         docType.id,
      label:      docType.label,
      uri:        stableUri,
      dataUrl,
      uploadedAt: new Date().toISOString(),
    };
    await Storage.saveDocument(doc);
    setDocs(await Storage.getDocuments());
  }

  // ── WEB: upload directly to server on file select (no AsyncStorage) ────────
  // Bypasses localStorage entirely — avoids 5MB quota issues with base64 images.
  async function handleWebFile(e: any, docType: typeof DOC_TYPES[0]) {
    const file: File | undefined = e.target?.files?.[0];
    if (e.target) e.target.value = '';
    if (!file) return;

    setUploading(docType.id);
    try {
      // Generate preview URL for display
      const previewUrl = URL.createObjectURL(file);
      webFileCache.set(docType.id, { file, previewUrl });

      // Upload directly to server — no AsyncStorage involved
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload  = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      await apiUploadDocument({
        docType: docType.id,
        label: docType.label,
        dataUrl,
        mimeType: file.type,
        fileName: file.name,
      });

      setWebUploaded(prev => ({
        ...prev,
        [docType.id]: { previewUrl, uploadedAt: new Date().toISOString() },
      }));

      // Refresh server status (incl. url for preview)
      apiGetMyDocuments().then(r => applyServerDocs(r.documents)).catch(() => {});

    } catch (err: any) {
      console.error('[ProviderDocuments] web upload error:', err);
      webFileCache.delete(docType.id);
      alert(`Upload failed: ${err?.message ?? 'Please try again.'}`);
    }
    setUploading(null);
  }

  // ── NATIVE: pick + upload to server immediately (auto-submit) ──────────────
  async function uploadDocNative(docType: typeof DOC_TYPES[0]) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // System picker (SDK 52) needs no read permission. Requesting it asks for
    // WRITE access and a prior denial wrongly blocks uploads.
    let result;
    try {
      result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.4,
        base64: true,
      });
    } catch {
      Alert.alert('Error', 'Could not open photo library. Please try again.');
      return;
    }
    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    setUploading(docType.id);
    try {
      const mimeType = asset.mimeType ?? 'image/jpeg';
      const dataUrl  = asset.base64
        ? `data:${mimeType};base64,${asset.base64}`
        : asset.uri;
      // Keep a local copy for offline preview — store the base64 dataUrl so the
      // thumbnail always renders (the raw asset.uri can go stale → blank preview).
      await saveDoc(docType, asset.uri, asset.base64 ? dataUrl : undefined);
      // …and upload to the server right away — no separate submit step.
      await apiUploadDocument({
        docType: docType.id,
        label: docType.label,
        uri: asset.uri,
        dataUrl,
        mimeType,
        fileName: `${docType.id}_${Date.now()}.jpg`,
      });
      // Mark stored doc as submitted + refresh server status (incl. url for preview)
      await Storage.saveDocument({ ...(await Storage.getDocuments()).find(d => d.id === docType.id)!, submitted: true } as any);
      const r = await apiGetMyDocuments();
      applyServerDocs(r.documents);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      Alert.alert('Upload Failed', err?.message ?? 'Could not upload the document. Please try again.');
    }
    setUploading(null);
  }

  async function removeDoc(docId: string, label: string) {
    if (Platform.OS === 'web') {
      if (window.confirm(`Remove ${label}?`)) {
        const cached = webFileCache.get(docId);
        if (cached) URL.revokeObjectURL(cached.previewUrl);
        webFileCache.delete(docId);
        setWebUploaded(prev => { const n = { ...prev }; delete n[docId]; return n; });
      }
    } else {
      Alert.alert('Remove Document', `Remove "${label}"?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: async () => {
          await Storage.removeDocument(docId);
          setDocs(await Storage.getDocuments());
        }},
      ]);
    }
  }

  return (
    <View style={styles.container}>
      {/* ── Header ─────────────────────────────────────────────────── */}
      <LinearGradient
        colors={[Colors.brandDark, Colors.brand]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.header, { paddingTop: insets.top + 16 }]}
      >
        <Pressable style={styles.backBtn} onPress={() => nav.goBack()}>
          <Text style={styles.backBtnText}>← Back</Text>
        </Pressable>

        <View style={styles.headerBody}>
          <Text style={styles.headerTitle}>My Documents</Text>
          <Text style={styles.headerSub}>Upload credentials for admin verification</Text>
        </View>

        <View style={styles.progressWrap}>
          <View style={styles.progressRow}>
            <Text style={styles.progressLabel}>Required documents</Text>
            <Text style={styles.progressCount}>{requiredDone}/{requiredTotal} uploaded</Text>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progressPct}%` as any }]} />
          </View>
        </View>

        {allSubmitted ? (
          <View style={styles.submittedBanner}>
            <Text style={styles.submittedBannerIcon}>✅</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.submittedBannerTitle}>Documents Submitted to Admin</Text>
              <Text style={styles.submittedBannerSub}>Our team will review within 1–2 business days</Text>
            </View>
          </View>
        ) : null}
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {/* ── Instruction card ───────────────────────────────────────── */}
        <View style={styles.infoCard}>
          <View style={styles.infoCardLeft}>
            <Text style={styles.infoCardIcon}>ℹ️</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.infoCardTitle}>How it works</Text>
            <Text style={styles.infoCardText}>
              Upload clear photos of each document. Required docs (marked ✱) must be submitted before accepting jobs.
            </Text>
          </View>
        </View>

        {/* ── Document list ──────────────────────────────────────────── */}
        {DOC_TYPES.map(docType => {
          const server     = serverDocs[docType.id];               // source of truth (survives reload, has url)
          const localWeb   = webUploaded[docType.id];              // this-session web upload (fresh objectURL)
          const localNative= docs.find(d => d.id === docType.id);  // native local copy
          // "Uploaded" if the server has it (any non-rejected status) OR we have a local copy.
          const uploaded   = !!server && server.status !== 'REJECTED'
            ? true
            : (Platform.OS === 'web' ? !!localWeb : !!localNative);
          // Preview: prefer the fresh local image, else the server URL (so past-session docs still show).
          const previewUri = Platform.OS === 'web'
            ? (localWeb?.previewUrl || server?.url)
            : ((localNative as any)?.dataUrl || localNative?.uri || server?.url);
          const uploadedAt = Platform.OS === 'web'
            ? (localWeb?.uploadedAt || server?.submittedAt)
            : (localNative?.uploadedAt || server?.submittedAt);
          const isLoading    = uploading === docType.id;
          const btnLabel     = isLoading ? 'Uploading…' : uploaded ? 'Replace Photo' : 'Upload Photo';

          return (
            <View key={docType.id} style={[styles.docCard, uploaded && styles.docCardUploaded]}>
              {/* Top row */}
              <View style={styles.docCardTop}>
                <View style={[styles.docIconWrap, { backgroundColor: uploaded ? '#ECFDF5' : '#F9FAFB' }]}>
                  <docType.Icon size={24} color={uploaded ? Colors.brand : Colors.secondaryLabel} />
                </View>
                <View style={styles.docCardInfo}>
                  <View style={styles.docCardTitleRow}>
                    <Text style={styles.docCardTitle}>{docType.label}</Text>
                    {docType.required && serverDocs[docType.id]?.status === 'APPROVED' ? (
                      <View style={[styles.requiredBadge, { backgroundColor: '#D1FAE5', borderColor: '#6EE7B7' }]}>
                        <Text style={[styles.requiredBadgeText, { color: '#065F46' }]}>✓ Approved</Text>
                      </View>
                    ) : docType.required && (
                      <View style={styles.requiredBadge}>
                        <Text style={styles.requiredBadgeText}>Required</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.docCardSub}>{docType.sublabel}</Text>
                  {uploadedAt && (
                    <Text style={styles.docUploadedDate}>
                      Uploaded {new Date(uploadedAt).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </Text>
                  )}
                  {uploaded && serverDocs[docType.id] && (
                    <Text style={[
                      styles.docUploadedDate,
                      { color: serverDocs[docType.id].status === 'APPROVED' ? '#059669' : serverDocs[docType.id].status === 'REJECTED' ? '#DC2626' : '#D97706' }
                    ]}>
                      {serverDocs[docType.id].status === 'APPROVED' ? '✅ Admin Approved' : serverDocs[docType.id].status === 'REJECTED' ? `❌ Rejected${serverDocs[docType.id].rejectionReason ? ': ' + serverDocs[docType.id].rejectionReason : ''}` : '⏳ Under Review'}
                    </Text>
                  )}
                  {serverDocs[docType.id]?.status === 'APPROVED' && (
                    <View style={styles.approvedBadge}>
                      <CheckCircleIcon size={16} color={Colors.onlineGreen} />
                      <Text style={styles.approvedText}>Approved by Admin</Text>
                    </View>
                  )}
                </View>
              </View>

              {/* Document preview */}
              {uploaded && previewUri && (
                <View style={styles.docPreviewWrap}>
                  <Image source={{ uri: previewUri }} style={styles.docPreview} contentFit="cover" cachePolicy="memory-disk" />
                  <View style={styles.docPreviewOverlay}>
                    <View style={[styles.docPreviewBadge, { flexDirection: 'row', alignItems: 'center', gap: 4 }]}>
                      <CheckCircleIcon size={13} color="#fff" />
                      <Text style={styles.docPreviewBadgeText}>Saved</Text>
                    </View>
                  </View>
                </View>
              )}

              {/* Action buttons */}
              <View style={styles.docCardActions}>
                {uploaded && (
                  <Pressable style={styles.removeBtn} onPress={() => removeDoc(docType.id, docType.label)} hitSlop={8}>
                    <Text style={styles.removeBtnText}>Remove</Text>
                  </Pressable>
                )}

                {Platform.OS === 'web' ? (
                  // ── Web: native <label>+<input type="file"> ──────────────────
                  // iOS Safari requires a native interactive element (not a div/Pressable)
                  // to open the file picker on the first tap, especially for cards that
                  // have been scrolled into view.
                  <_Label
                    htmlFor={`upload-${docType.id}`}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flex: 1, minHeight: 48,
                      paddingHorizontal: 20, paddingVertical: 14, borderRadius: 12,
                      backgroundColor: uploaded ? '#ECFDF5' : '#B76E79',
                      border: uploaded ? '1.5px solid #86EFAC' : 'none',
                      cursor: isLoading ? 'default' : 'pointer',
                      opacity: isLoading ? 0.6 : 1,
                      userSelect: 'none',
                      WebkitTapHighlightColor: 'transparent',
                    }}
                  >
                    <_Input
                      type="file"
                      id={`upload-${docType.id}`}
                      accept="image/*,application/pdf"
                      disabled={isLoading}
                      style={{ display: 'none' }}
                      onChange={(e: any) => handleWebFile(e, docType)}
                    />
                    <_Span style={{
                      fontSize: 15, fontWeight: '700',
                      color: uploaded ? '#059669' : '#fff',
                      pointerEvents: 'none',
                    }}>
                      {btnLabel}
                    </_Span>
                  </_Label>
                ) : (
                  // ── Native: expo-image-picker ─────────────────────────────
                  <Pressable
                    style={[
                      styles.uploadBtn,
                      uploaded ? styles.uploadBtnReplace : styles.uploadBtnNew,
                      isLoading && { opacity: 0.6 },
                      !uploaded && { flex: 1 },
                    ]}
                    onPress={() => uploadDocNative(docType)}
                    disabled={isLoading}
                  >
                    <Text style={[styles.uploadBtnText, uploaded ? styles.uploadBtnTextReplace : styles.uploadBtnTextNew]}>
                      {btnLabel}
                    </Text>
                  </Pressable>
                )}
              </View>
            </View>
          );
        })}

        {/* ── Status card (auto-submit: no manual submit needed) ──────── */}
        <View style={styles.submitSection}>
          {allSubmitted ? (
            <View style={styles.doneCard}>
              <View style={styles.doneCardIcon}><CheckCircleIcon size={44} color={Colors.onlineGreen} /></View>
              <Text style={styles.doneCardTitle}>All Documents Submitted</Text>
              <Text style={styles.doneCardSub}>
                Each document is sent to the Glow admin team as soon as you upload it.
                Our team will review within 1–2 business days. You can still replace any document above.
              </Text>
            </View>
          ) : (
            <View style={styles.pendingUploadCard}>
              <Text style={styles.pendingUploadTitle}>
                Upload your required documents
              </Text>
              <Text style={styles.pendingUploadSub}>
                {requiredDone}/{requiredTotal} uploaded — each one is submitted for review automatically.
                You'll be notified when your account is approved.
              </Text>
            </View>
          )}
        </View>

        <Text style={styles.footer}>
          © {new Date().getFullYear()} Glow · {DEFAULT_REGION_NAME}
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F7' },

  header: { paddingHorizontal: 20, paddingBottom: 24 },
  backBtn: { marginBottom: 16 },
  backBtnText: { color: 'rgba(255,255,255,0.75)', fontSize: 15, fontWeight: '600' },
  headerBody: { marginBottom: 20 },
  headerTitle: { color: '#fff', fontSize: 30, fontWeight: '900', letterSpacing: -0.5, marginBottom: 4 },
  headerSub: { color: 'rgba(255,255,255,0.65)', fontSize: 14 },

  progressWrap: { marginBottom: 16 },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  progressLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '600' },
  progressCount: { color: '#fff', fontSize: 13, fontWeight: '800' },
  progressTrack: { height: 6, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#34D399', borderRadius: 3 },

  submittedBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: 'rgba(16,185,129,0.2)', borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: 'rgba(52,211,153,0.4)',
  },
  submittedBannerIcon: { fontSize: 24 },
  submittedBannerTitle: { color: '#fff', fontSize: 14, fontWeight: '800', marginBottom: 2 },
  submittedBannerSub: { color: 'rgba(255,255,255,0.65)', fontSize: 12 },
  readyBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  readyBannerIcon: { fontSize: 20 },
  readyBannerText: { color: '#fff', fontSize: 13, fontWeight: '700', flex: 1 },

  body: { padding: 16, gap: 12, paddingBottom: 40 },

  infoCard: {
    flexDirection: 'row', gap: 12, alignItems: 'flex-start',
    backgroundColor: '#EFF6FF', borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: '#BFDBFE',
  },
  infoCardLeft: { paddingTop: 2 },
  infoCardIcon: { fontSize: 20 },
  infoCardTitle: { fontSize: 14, fontWeight: '700', color: '#1E40AF', marginBottom: 4 },
  infoCardText: { fontSize: 13, color: '#3B82F6', lineHeight: 19 },

  docCard: {
    backgroundColor: '#fff', borderRadius: 20, padding: 18, gap: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 10, elevation: 3,
    borderWidth: 1.5, borderColor: '#E5E7EB',
  },
  docCardUploaded: { borderColor: '#A7F3D0', shadowColor: '#059669', shadowOpacity: 0.1 },
  docCardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  docIconWrap: {
    width: 52, height: 52, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#E5E7EB', flexShrink: 0,
  },
  docTypeIcon: { fontSize: 26 },
  docCardInfo: { flex: 1 },
  docCardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' },
  docCardTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  requiredBadge: {
    backgroundColor: '#FEF3C7', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2,
    borderWidth: 1, borderColor: '#FCD34D',
  },
  requiredBadgeText: { fontSize: 11, fontWeight: '700', color: '#92400E' },
  docCardSub: { fontSize: 13, color: '#6B7280', lineHeight: 18, marginBottom: 4 },
  docUploadedDate: { fontSize: 12, color: '#059669', fontWeight: '600' },
  approvedBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  approvedText: { color: Colors.onlineGreen, fontSize: 13, fontWeight: '700' },

  docPreviewWrap: { borderRadius: 14, overflow: 'hidden', height: 160, backgroundColor: '#F3F4F6', position: 'relative' },
  docPreview: { width: '100%', height: '100%' },
  docPreviewOverlay: { position: 'absolute', top: 10, right: 10 },
  docPreviewBadge: {
    backgroundColor: '#059669', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4,
  },
  docPreviewBadgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  docCardActions: { flexDirection: 'row', gap: 10 },
  // Subtle text-only remove (no loud red box)
  removeBtn: {
    paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  removeBtnText: { fontSize: 14, fontWeight: '600', color: Colors.tertiaryLabel },
  // Upload/Replace — consistent height + radius across web/native
  uploadBtn: { paddingHorizontal: 20, paddingVertical: 14, borderRadius: 12, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  uploadBtnNew: { backgroundColor: Colors.brand, flex: 1 },
  uploadBtnReplace: { backgroundColor: Colors.brandLight, borderWidth: 1.5, borderColor: '#86EFAC', flex: 1 },
  uploadBtnText: { fontSize: 15, fontWeight: '700' },
  uploadBtnTextNew: { color: '#fff' },
  uploadBtnTextReplace: { color: '#059669' },

  submitSection: { gap: 12, marginTop: 4 },

  doneCard: {
    backgroundColor: '#F0FDF4', borderRadius: 20, padding: 24,
    alignItems: 'center', borderWidth: 1.5, borderColor: '#A7F3D0', gap: 10,
  },
  doneCardIcon: { marginBottom: 8 },
  doneCardTitle: { fontSize: 18, fontWeight: '800', color: '#065F46', textAlign: 'center' },
  doneCardSub: { fontSize: 14, color: '#047857', textAlign: 'center', lineHeight: 21 },

  pendingUploadCard: {
    backgroundColor: Colors.cardBackground, borderRadius: 20, padding: 20,
    borderWidth: 1, borderColor: Colors.cardBorder, gap: 6,
  },
  pendingUploadTitle: { fontSize: 16, fontWeight: '800', color: Colors.label },
  pendingUploadSub: { fontSize: 13, color: Colors.secondaryLabel, lineHeight: 19 },

  footer: { textAlign: 'center', fontSize: 11, color: '#9CA3AF', marginTop: 8 },
});
