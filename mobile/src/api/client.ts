import { Platform } from 'react-native';
import { Storage } from '../utils/storage';

// Registered by AuthProvider — called when any authenticated request returns 401
let _onUnauthorized: (() => void) | null = null;
export function registerUnauthorizedHandler(fn: () => void) { _onUnauthorized = fn; }

export const API_BASE: string = (() => {
  const url = (process.env.EXPO_PUBLIC_API_URL as string | undefined) ?? '';
  if (!url || url.includes('localhost')) {
    if (__DEV__) return 'http://localhost:3000';
    return 'https://glow-backend-production-ae1e.up.railway.app';
  }
  return url;
})();

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

// No-op warmup — kept so import sites don't break
export async function warmBackend(): Promise<void> {}

export function getBackendStatus(): { url: string; provider: 'railway' } {
  return { url: API_BASE, provider: 'railway' };
}

// Prisma Decimal columns (rating, price, payouts…) serialize to JSON STRINGS
// ("4.50"). Screens call .toFixed() on them — on a string that's a fatal JS
// error, which in release builds kills the whole app ("Glow Crashed").
// Walk every response once and coerce known money/rating keys to numbers so
// no endpoint can ever crash the app this way again.
const DECIMAL_KEYS = new Set([
  'rating', 'ratingValue', 'providerRatingValue', 'totalPrice', 'price',
  'platformFee', 'providerPayout', 'tipAmount', 'totalEarned', 'totalSpent',
]);
function sanitizeDecimals(node: any): any {
  if (Array.isArray(node)) { node.forEach(sanitizeDecimals); return node; }
  if (node && typeof node === 'object') {
    for (const k of Object.keys(node)) {
      const v = node[k];
      if (DECIMAL_KEYS.has(k) && typeof v === 'string') {
        const n = parseFloat(v);
        node[k] = Number.isFinite(n) ? n : 0;
      } else if (v && typeof v === 'object') {
        sanitizeDecimals(v);
      }
    }
  }
  return node;
}

async function request<T>(method: Method, path: string, body?: object, auth = true, retries = 1, timeoutMs = 45000): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  let tokenAttached = false;
  if (auth) {
    const token = await Storage.getToken();
    if (token) { headers['Authorization'] = `Bearer ${token}`; tokenAttached = true; }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    clearTimeout(timeout);
    // Cold-start guard: Railway/serverless can return 502/503/504 while the dyno wakes
    // on the FIRST request (this is why OTP "didn't go on the first try" — the send
    // succeeded server-side later, but the first response was a gateway error). Retry
    // these transient upstream errors before surfacing failure.
    if ((res.status === 502 || res.status === 503 || res.status === 504) && retries > 0) {
      await new Promise(r => setTimeout(r, 1500));
      return request<T>(method, path, body, auth, retries - 1, timeoutMs);
    }
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      // Only sign out when the SERVER rejected a real token. A 401 on a request
      // that never carried a token (transient keystore read failure while the
      // device was locked) must not wipe the valid stored session.
      if (res.status === 401 && auth && tokenAttached && _onUnauthorized) {
        _onUnauthorized();
      }
      const message =
        (json as any).error || (json as any).message || `Request failed: ${res.status}`;
      throw new Error(message);
    }
    return sanitizeDecimals(json) as T;
  } catch (err: any) {
    clearTimeout(timeout);
    if (retries > 0 && (err.name === 'AbortError' || err.message?.includes('Network') || err.message?.includes('Failed to fetch'))) {
      await new Promise(r => setTimeout(r, 1000));
      return request<T>(method, path, body, auth, retries - 1, timeoutMs);
    }
    if (err.name === 'AbortError') throw new Error('Connection timed out. Check your internet connection.');
    throw err;
  }
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  name: string;
  role: string;
  phone: string | null;
  photoUrl: string | null;
  onboardingComplete: boolean;
  phoneVerified: boolean;
}

export function apiSendLoginOtp(phone: string) {
  return request<{ message: string }>('POST', '/auth/send-login-otp', { phone }, false, 2);
}

export function apiLogin(payload: { phone: string; otp: string; name?: string; role?: string }) {
  // 2 retries — login is usually the FIRST request, the one that wakes a cold backend.
  return request<{ token: string; user: AuthUser }>('POST', '/auth/login', payload, false, 2);
}

export function apiSendVerifyOtp(phone?: string) {
  return request<{ message: string }>('POST', '/auth/send-verify-otp', phone ? { phone } : undefined);
}

export function apiVerifyPhone(payload: { otp: string; phone?: string }) {
  return request<{ user: AuthUser }>('POST', '/auth/verify-phone', payload);
}

export function apiGoogleSignIn(payload: { idToken: string; role?: 'CUSTOMER' | 'Provider' }) {
  return request<{ token: string; user: AuthUser; requiresPhoneVerification?: boolean }>('POST', '/auth/google', payload, false, 2);
}

export function apiAppleSignIn(payload: { idToken: string; role?: 'CUSTOMER' | 'Provider'; name?: string }) {
  return request<{ token: string; user: AuthUser; requiresPhoneVerification?: boolean }>('POST', '/auth/apple', payload, false, 2);
}

export function apiSubmitProviderOnboarding(payload: {
  qualificationType: string;
  licenseNumber?: string;
  collegeName?: string;
  experienceYears?: number;
  specialties?: string[];
  certifications?: string[];
  firstAidCertified?: boolean;
  driversLicense?: boolean;
  ownTransportation?: boolean;
  bio?: string;
  languages?: string[];
  photos?: string[];
  pricingModel?: 'PER_SERVICE' | 'HOURLY';
  hourlyRate?: number;
  priceNegotiable?: boolean;
}) {
  return request<{ message: string }>('POST', '/auth/provider-profile', payload);
}

export interface ProviderServiceItem {
  id: string;
  name: string;
  price: number;
  durationMin: number;
  active: boolean;
}

export function apiGetProviderServices() {
  return request<{ services: ProviderServiceItem[] }>('GET', '/jobs/services');
}

export function apiSetProviderServices(services: { name: string; price: number; durationMin?: number }[]) {
  return request<{ services: { name: string; price: number; durationMin: number; active: boolean }[] }>(
    'PUT', '/jobs/services', { services },
  );
}

export function apiUpdateProviderPricing(payload: {
  pricingModel: 'PER_SERVICE' | 'HOURLY';
  hourlyRate?: number;
  priceNegotiable?: boolean;
}) {
  return request<{ pricingModel: string; hourlyRate: number; priceNegotiable: boolean }>('PATCH', '/jobs/pricing', payload);
}

export type BusinessHours = Partial<Record<'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun', string>>;

export function apiUpdateProviderLocationSettings(payload: {
  homeService?: boolean;
  salonService?: boolean;
  salonAddress?: string;
  serviceRadiusKm?: number;
  businessHours?: BusinessHours;
}) {
  return request<{
    homeService: boolean;
    salonService: boolean;
    salonAddress: string;
    serviceRadiusKm: number;
    businessHours: BusinessHours;
  }>('PATCH', '/jobs/location-settings', payload);
}

// ─── Customer ─────────────────────────────────────────────────────────────────

export function apiCreateBooking(payload: {
  serviceType: string;
  hours: number;
  scheduledAt: string;
  lat?: number;
  lng?: number;
  providerId?: string;
  address?: string;
  notes?: string;
  proposedPrice?: number;
}) {
  return request<{ booking: Booking }>('POST', '/bookings', payload);
}

export function apiMyBookings(nocache = false) {
  return request<{ bookings: Booking[] }>('GET', nocache ? '/bookings/my?nocache=1' : '/bookings/my');
}

export function apiGetBooking(id: string, nocache = false) {
  return request<{ booking: Booking }>('GET', nocache ? `/bookings/${id}?nocache=1` : `/bookings/${id}`);
}

export function apiCancelBooking(id: string) {
  return request<{ booking: Booking }>('PATCH', `/bookings/${id}/cancel`);
}

// Assign a different Provider to an existing REQUESTED booking (e.g. after a decline).
export function apiReassignBooking(id: string, providerId: string) {
  return request<{ booking: Booking }>('POST', `/bookings/${id}/reassign`, { providerId });
}

// Defence against Prisma Decimal fields arriving as JSON strings ("4.50") —
// calling .toFixed() on a string is a fatal error that crashes release builds.
function numify<T extends { rating?: any }>(o: T): T {
  if (o && o.rating != null && typeof o.rating !== 'number') {
    const n = parseFloat(String(o.rating));
    o.rating = Number.isFinite(n) ? n : 0;
  }
  return o;
}

export function apiNearbyProviders(lat?: number, lng?: number) {
  const params = lat != null && lng != null ? `?lat=${lat}&lng=${lng}` : '';
  return request<{ providers: NearbyProvider[] }>('GET', `/providers/nearby${params}`)
    .then(r => ({ ...r, providers: (r.providers ?? []).map(numify) }));
}

export function apiGetMyBookings(params?: { status?: string }) {
  const qs = params?.status ? `?status=${params.status}` : '';
  return request<{ bookings: Booking[] }>('GET', `/bookings/my${qs}`);
}

export function apiRateBooking(payload: { bookingId: string; rating: number; comment?: string }) {
  return request<{ message: string }>('POST', '/ratings', payload);
}

export function apiRateCustomer(payload: { bookingId: string; rating: number; comment?: string }) {
  return request<{ message: string }>('POST', `/jobs/${payload.bookingId}/rate-customer`, {
    rating: payload.rating,
    comment: payload.comment,
  });
}

export function apiGetAvailableProviders() {
  return request<{ count: number; providers: AvailableProvider[] }>('GET', '/providers/available')
    .then(r => ({ ...r, providers: (r.providers ?? []).map(numify) }));
}

// ─── Provider ──────────────────────────────────────────────────────────────────────

export function apiNearbyJobs(coords?: { lat: number; lng: number }) {
  const qs = coords ? `?lat=${coords.lat}&lng=${coords.lng}` : '';
  return request<{ bookings: Booking[]; approvedByAdmin: boolean }>('GET', `/jobs/nearby${qs}`);
}

export function apiMyJobs(params?: { status?: string; since?: string; nocache?: boolean }) {
  const qs = new URLSearchParams();
  if (params?.status)   qs.set('status', params.status);
  if (params?.since)    qs.set('since', params.since);
  if (params?.nocache)  qs.set('nocache', '1');
  const query = qs.toString() ? `?${qs.toString()}` : '';
  return request<{ bookings: Booking[] }>('GET', `/jobs/my${query}`);
}

// 45s timeout for critical actions that may hit serverless cold starts
const COLD_START_TIMEOUT = 45000;

export function apiAcceptJob(id: string) {
  return request<{ booking: Booking }>('POST', `/jobs/${id}/accept`, undefined, true, 1, COLD_START_TIMEOUT);
}

// Persistent inbox of dedicated requests addressed to this Provider (replaces flash card).
export function apiGetRequests() {
  return request<{ requests: Booking[]; count: number; approvedByAdmin: boolean }>('GET', '/jobs/requests');
}

export function apiSkipJob(id: string, reason?: string) {
  return request<{ ok: boolean }>('POST', `/jobs/${id}/skip`, reason ? { reason } : undefined);
}

export function apiStartJob(id: string) {
  return request<{ booking: Booking }>('POST', `/jobs/${id}/start`, undefined, true, 1, COLD_START_TIMEOUT);
}

export function apiCompleteJob(id: string, serviceNotes?: string) {
  return request<{ booking: Booking }>('POST', `/jobs/${id}/complete`, serviceNotes ? { serviceNotes } : undefined, true, 1, COLD_START_TIMEOUT);
}

export function apiToggleAvailability(available: boolean) {
  return request<{ message: string }>('PATCH', '/jobs/availability', { available });
}

export function apiSetPublicProfile(publicProfile: boolean) {
  return request<{ message: string; publicProfile: boolean }>('PATCH', '/jobs/public-profile', { publicProfile });
}

// ─── Profile ──────────────────────────────────────────────────────────────────

export async function apiGetProfile(): Promise<{ user: UserProfile }> {
  const raw = await request<{ user: Record<string, any>; providerProfile?: Record<string, any> | null }>('GET', '/profile');
  if (raw.providerProfile) (raw.user as any).providerProfile = raw.providerProfile;
  return { user: raw.user as UserProfile };
}

export function apiSavePushToken(pushToken: string) {
  return request<{ message: string }>('PATCH', '/profile/push-token', { pushToken });
}

export interface ServerNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  bookingId: string | null;
  read: boolean;
  createdAt: string;
}

// Durable notification history. Merged with live socket events client-side so the
// list is complete even for events that fired while the app was closed.
export function apiGetNotifications() {
  return request<{ notifications: ServerNotification[]; unreadCount: number }>('GET', '/notifications');
}

export function apiMarkNotificationsRead() {
  return request<{ message: string }>('PATCH', '/notifications/read');
}

// Permanently delete the signed-in user's account (App Store requirement).
export function apiDeleteAccount() {
  return request<{ message: string }>('DELETE', '/account');
}

export function apiUpdateProfile(payload: {
  name?: string;
  bio?: string;
  instagramHandle?: string;
  languages?: string[];
  specialties?: string[];
  photoUrl?: string;
  photos?: string[];
  skinTone?: 'FAIR' | 'LIGHT' | 'MEDIUM' | 'TAN' | 'DEEP' | 'RICH';
  skinType?: 'DRY' | 'OILY' | 'COMBINATION' | 'NORMAL' | 'SENSITIVE';
  preferredOccasions?: string[];
}) {
  return request<{ user: UserProfile }>('PATCH', '/profile', payload);
}

// ─── Documents ────────────────────────────────────────────────────────────────

export async function apiUploadDocument(payload: { docType: string; label: string; dataUrl?: string; uri?: string; mimeType?: string; fileName?: string }) {
  const token = await Storage.getToken();
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const form = new FormData();
  form.append('docType', payload.docType);
  form.append('label', payload.label);

  const mime = payload.mimeType ?? (payload.dataUrl?.startsWith('data:') ? payload.dataUrl.split(';')[0].split(':')[1] : undefined) ?? 'image/jpeg';
  const ext  = (mime.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
  const name = payload.fileName ?? `doc_${Date.now()}.${ext}`;

  if (Platform.OS !== 'web') {
    // ── NATIVE (APK) ──────────────────────────────────────────────────────────
    // RN multipart needs a { uri, name, type } file object pointing at a file
    // the OS can actually read. The picker's asset.uri can be a content:// or a
    // photo-picker URI that fetch/FormData cannot stream → empty body → upload
    // "fails". The bulletproof path: take the base64 we already have (picker is
    // called with base64:true) and write it to a stable cache file, then upload
    // that file://. We only fall back to the raw uri if no base64 was provided.
    let fileUri = payload.uri;
    const b64 =
      payload.dataUrl?.startsWith('data:') && payload.dataUrl.includes(',')
        ? payload.dataUrl.split(',')[1]
        : undefined;
    if (b64) {
      // expo-file-system SDK 54+: the default export is the new File/Directory
      // class API — it has NO writeAsStringAsync/cacheDirectory. The classic
      // functional API now lives at 'expo-file-system/legacy'. Requiring the
      // bare module left fileUri as a data: URL, which RN's native FormData
      // cannot serialize → "unsupported FormDataPart implementation" on every
      // upload. Write the base64 to a real file:// and upload that.
      try {
        // Prefer legacy functional API (exists SDK 54+); fall back to bare
        // module for older SDKs that still expose writeAsStringAsync on default.
        let FS: any;
        try { FS = require('expo-file-system/legacy'); }
        catch { FS = require('expo-file-system'); }
        if (FS?.writeAsStringAsync && (FS.cacheDirectory || FS.documentDirectory)) {
          const dir = FS.cacheDirectory ?? FS.documentDirectory;
          const tmp = `${dir}upload_${Date.now()}.${ext}`;
          await FS.writeAsStringAsync(tmp, b64, { encoding: FS.EncodingType?.Base64 ?? 'base64' });
          fileUri = tmp;
        } else {
          // New File API path (SDK 54+ default export).
          const { File, Paths } = require('expo-file-system');
          if (File && Paths) {
            const f = new File(Paths.cache, `upload_${Date.now()}.${ext}`);
            f.write(Uint8Array.from(atob(b64), c => c.charCodeAt(0)));
            fileUri = f.uri;
          }
        }
      } catch (e) {
        // FileSystem unavailable — fall through to the raw picker uri below.
      }
    }
    // We must NOT append a data: URI as a file part — RN native FormData rejects
    // it ("unsupported FormDataPart implementation"). Only a content://, file://
    // or http(s):// uri is streamable. If all we have is a data: URL, bail with a
    // clear error rather than producing the cryptic native crash.
    if (fileUri?.startsWith('data:')) fileUri = undefined;
    if (!fileUri && payload.uri && !payload.uri.startsWith('data:')) {
      fileUri = payload.uri;
    }
    if (!fileUri) throw new Error('Could not prepare file for upload');

    // Prefer expo-file-system's native multipart uploader: RN's FormData
    // { uri } file parts still throw "unsupported FormDataPart implementation"
    // on iOS even with a file:// uri. uploadAsync streams the file natively
    // and never touches RN FormData.
    let uploadAsyncErr: any = null;
    try {
      let FS: any;
      try { FS = require('expo-file-system/legacy'); }
      catch { FS = require('expo-file-system'); }
      if (FS?.uploadAsync) {
        const up = await FS.uploadAsync(`${API_BASE}/documents/upload`, fileUri, {
          httpMethod: 'POST',
          uploadType: FS.FileSystemUploadType?.MULTIPART ?? 1,
          fieldName:  'file',
          mimeType:   mime,
          parameters: { docType: payload.docType, label: payload.label },
          headers,
        });
        const json = (() => { try { return JSON.parse(up.body || '{}'); } catch { return {}; } })();
        if (up.status < 200 || up.status >= 300) {
          throw new Error(json.error || json.message || `Upload failed: ${up.status}`);
        }
        return json as { message: string; document: { id: string; docType: string; status: string; url: string; submittedAt: string } };
      }
    } catch (e: any) {
      // Real server rejection → surface it.
      if (e?.message?.startsWith('Upload failed') || /required|invalid|too large|unsupported file/i.test(e?.message || '')) throw e;
      uploadAsyncErr = e;
    }

    // uploadAsync unavailable or crashed. NEVER fall back to RN FormData { uri }
    // here — on iOS that path always dies with the cryptic native
    // "Unsupported FormDataPart implementation". Instead POST the base64 we
    // already have as plain JSON (backend decodes dataUrl server-side).
    if (b64) {
      const res = await fetch(`${API_BASE}/documents/upload`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          docType:  payload.docType,
          label:    payload.label,
          fileName: name,
          dataUrl:  `data:${mime};base64,${b64}`,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((json as any).error || (json as any).message || `Upload failed: ${res.status}`);
      return json as { message: string; document: { id: string; docType: string; status: string; url: string; submittedAt: string } };
    }

    // No base64 at all: Android's RN FormData handles { uri } parts fine;
    // iOS does not — surface the real uploadAsync error instead of the
    // guaranteed FormDataPart crash.
    if (Platform.OS === 'ios') {
      throw new Error(uploadAsyncErr?.message || 'Upload failed. Please try again.');
    }
    form.append('file', { uri: fileUri, name, type: mime } as any);
  } else if (payload.dataUrl) {
    // Web (and the fallback when only a data:/blob: URL exists): build a Blob.
    let fileBlob: Blob;
    if (
      payload.dataUrl.startsWith('blob:') ||
      payload.dataUrl.startsWith('http:') ||
      payload.dataUrl.startsWith('https:') ||
      payload.dataUrl.startsWith('file:')
    ) {
      const resp = await fetch(payload.dataUrl);
      fileBlob = await resp.blob();
    } else if (payload.dataUrl.startsWith('data:')) {
      const b64    = payload.dataUrl.includes(',') ? payload.dataUrl.split(',')[1] : payload.dataUrl;
      const binary = atob(b64);
      const bytes  = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      fileBlob = new Blob([bytes], { type: mime });
    } else {
      const resp = await fetch(payload.dataUrl);
      fileBlob = await resp.blob();
    }
    form.append('file', fileBlob, name);
  } else {
    throw new Error('No file to upload');
  }

  const res = await fetch(`${API_BASE}/documents/upload`, { method: 'POST', headers, body: form });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = (json as any).error || (json as any).message || `Upload failed: ${res.status}`;
    throw new Error(message);
  }
  return json as { message: string; document: { id: string; docType: string; status: string; url: string; submittedAt: string } };
}

export function apiGetMyDocuments() {
  return request<{ documents: { id: string; docType: string; label: string; status: 'PENDING' | 'APPROVED' | 'REJECTED'; url?: string; previewUrl?: string; submittedAt: string; rejectionReason?: string }[] }>('GET', '/documents/my-documents');
}

// ─── Admin ────────────────────────────────────────────────────────────────────

export function apiGetProviders(approved?: boolean) {
  const qs = approved !== undefined ? `?approved=${approved}` : '';
  return request<{ providers: ProviderEntry[] }>('GET', `/admin/providers${qs}`);
}

export function apiGetProviderDetail(id: string) {
  return request<{ provider: ProviderEntry }>('GET', `/admin/providers/${id}`);
}

export function apiApproveProvider(id: string) {
  return request<{ message: string }>('POST', `/admin/providers/${id}/approve`);
}

export function apiRejectProvider(id: string) {
  return request<{ message: string }>('POST', `/admin/providers/${id}/reject`);
}

export function apiVerifyDocument(providerId: string, payload: { docType: string; verified: boolean; rejectionNote?: string; documentId?: string }) {
  return request<{ message: string; docType: string }>('POST', `/admin/providers/${providerId}/verify-document`, payload);
}

export function apiTogglePoliceCheck(providerId: string, cleared: boolean) {
  return request<{ message: string; policeCheckCleared: boolean }>('PATCH', `/admin/providers/${providerId}/police-check`, { cleared });
}

export function apiGetAllBookings(params?: { status?: string; page?: number; limit?: number }) {
  const qs = new URLSearchParams();
  if (params?.status) qs.set('status', params.status);
  if (params?.page) qs.set('page', String(params.page));
  if (params?.limit) qs.set('limit', String(params.limit));
  const q = qs.toString();
  return request<{ bookings: Booking[]; total: number }>('GET', `/admin/bookings${q ? `?${q}` : ''}`);
}

// ─── Provider Earnings ─────────────────────────────────────────────────────────────

export interface EarningsBreakdownItem {
  _id: string;
  date: string;
  customerName: string;
  serviceType: string;
  hours: number;
  totalPrice: number;
  platformFee: number;
  providerPayout: number;
  status: string;
  paymentStatus: string;
}

export interface EarningsData {
  totalEarned: number;
  pendingRelease: number;
  available: number;
  withdrawn: number;
  breakdown: EarningsBreakdownItem[];
}

export function apiGetEarnings() {
  return request<EarningsData>('GET', '/jobs/earnings');
}

export interface WithdrawResult {
  withdrawn: number;
  available: number;
  totalWithdrawn: number;
  message: string;
}

export function apiWithdrawEarnings() {
  return request<WithdrawResult>('POST', '/jobs/earnings/withdraw');
}

export interface PayoutMethod {
  payoutEmail: string;
  payoutMethod: 'ETRANSFER' | 'STRIPE' | 'OTHER';
  configured: boolean;
}

export function apiGetPayoutMethod() {
  return request<PayoutMethod>('GET', '/jobs/payout-method');
}

export function apiSetPayoutMethod(payoutEmail: string) {
  return request<PayoutMethod>('PATCH', '/jobs/payout-method', { payoutEmail });
}

// ─── Admin Payouts ────────────────────────────────────────────────────────────

export interface Payout {
  _id: string;
  providerId: { _id: string; name: string; phone: string; email?: string };
  amount: number;
  bookingIds: string[];
  status: 'PENDING' | 'PROCESSING' | 'PAID';
  method: 'ETRANSFER' | 'STRIPE' | 'OTHER';
  adminNote: string;
  createdAt: string;
  paidAt?: string;
}

export interface PayoutQueueItem {
  provider: { _id: string; name: string; phone: string; email?: string };
  bookings: string[];
  totalOwed: number;
}

export function apiGetPayouts(status?: string) {
  const qs = status ? `?status=${status}` : '';
  return request<{ payouts: Payout[] }>('GET', `/admin/payouts${qs}`);
}

export function apiGetPayoutQueue() {
  return request<{ queue: PayoutQueueItem[] }>('GET', '/admin/payouts/queue');
}

export function apiCreatePayout(providerId: string, bookingIds: string[]) {
  return request<{ payout: Payout }>('POST', '/admin/payouts', { providerId, bookingIds });
}

export function apiMarkPayoutPaid(payoutId: string, method: string, adminNote?: string) {
  return request<{ payout: Payout }>('POST', `/admin/payouts/${payoutId}/mark-paid`, { method, adminNote });
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AvailableProvider {
  _id: string;
  name: string;
  rating: number;
  ratingCount: number;
  lat: number;
  lng: number;
  qualificationType: string;
  photoUrl?: string;
  experienceYears?: number;
  specialties?: string[];
  bio?: string;
  collegeName?: string;
  licenseNumber?: string;
  approvedByAdmin?: boolean;
  policeCheckCleared?: boolean;
  firstAidCertified?: boolean;
  distanceKm?: number;
  available?: boolean;
  hasLocation?: boolean;
  online?: boolean;
  // Pricing
  pricingModel?: 'PER_SERVICE' | 'HOURLY';
  hourlyRate?: number;
  priceNegotiable?: boolean;
  services?: { name: string; price: number; durationMin: number }[];
}

export interface NearbyProvider {
  id: string;
  name: string;
  rating: number;
  lat: number;
  lng: number;
  distanceKm: number;
  specialties: string[];
  photoUrl?: string;
  policeCheckCleared?: boolean;
  experienceYears?: number;
  // Pricing
  pricingModel?: 'PER_SERVICE' | 'HOURLY';
  hourlyRate?: number;
  priceNegotiable?: boolean;
}

export interface SubmittedDocument {
  docType: string;
  label: string;
  url?: string;      // Vercel Blob URL (new uploads)
  dataUrl?: string;  // legacy base64 (old uploads)
  submittedAt: string;
  verifiedByAdmin: boolean;
  verifiedAt?: string;
  rejectionNote?: string;
  documentId?: string;
}

export interface Booking {
  _id: string;
  customer: { _id: string; name: string; phone: string; rating?: number; photoUrl?: string };
  provider?: { _id: string; name: string; phone: string; rating?: number; ratingCount?: number; photoUrl?: string };
  serviceType: string;
  hours: number;
  scheduledAt: string;
  lat: number;
  lng: number;
  address?: string;
  notes?: string;
  urgency?: 'routine' | 'urgent' | 'emergency';
  recipientName?: string;
  status: 'REQUESTED' | 'ACCEPTED' | 'ON_MY_WAY' | 'STARTED' | 'COMPLETED' | 'CANCELLED';
  totalPrice: number;
  platformFee?: number;
  providerPayout?: number;
  paymentStatus: string;
  ratingGiven?: boolean;
  ratingValue?: number | null;
  providerRatingGiven?: boolean;
  providerRatingValue?: number | null;
  createdAt: string;
  updatedAt?: string;
  startedAt?: string | null; // set when the Provider starts the session — used for the early-completion warning
  distanceKm?: number;
  hasConflict?: boolean;
}

export interface UserProfile {
  id: string;
  name: string;
  phone: string;
  role: string;
  rating?: number;
  ratingCount?: number;
  createdAt?: string;
  // Customer stats
  totalBookings?: number;
  totalHours?: number;
  totalSpent?: number;
  // Provider stats
  totalSessions?: number;
  totalEarned?: number;
  // Beauty profile (customer)
  skinTone?: 'FAIR' | 'LIGHT' | 'MEDIUM' | 'TAN' | 'DEEP' | 'RICH';
  skinType?: 'DRY' | 'OILY' | 'COMBINATION' | 'NORMAL' | 'SENSITIVE';
  preferredOccasions?: string[];
  providerProfile?: {
    approvedByAdmin: boolean;
    availability: boolean;
    publicProfile?: boolean;
    certifications: string[];
    experienceYears: number;
    bio?: string;
    instagramHandle?: string;
    languages?: string[];
    photoUrl?: string;
    photos?: string[];
    specialties?: string[];
    policeCheckCleared?: boolean;
    pricingModel?: 'PER_SERVICE' | 'HOURLY';
    hourlyRate?: number;
    priceNegotiable?: boolean;
    homeService?: boolean;
    salonService?: boolean;
    salonAddress?: string;
    serviceRadiusKm?: number;
    businessHours?: BusinessHours;
  };
}

export interface ProviderEntry {
  _id: string;
  name: string;
  phone: string;
  rating: number;
  ratingCount: number;
  isVerified: boolean;
  profile?: {
    approvedByAdmin: boolean;
    availability: boolean;
    certifications: string[];
    experienceYears: number;
    bio?: string;
    languages?: string[];
    photoUrl?: string;
    specialties?: string[];
    policeCheckCleared?: boolean;
    qualificationType?: string;
    licenseNumber?: string;
    collegeName?: string;
    firstAidCertified?: boolean;
    driversLicense?: boolean;
    ownTransportation?: boolean;
    insuranceVerified?: boolean;
    submittedDocuments?: SubmittedDocument[];
  };
}

export async function apiUpdateProviderLocation(bookingId: string, lat: number, lng: number): Promise<void> {
  await request<void>('PATCH', '/jobs/location', { bookingId, lat, lng });
}

// Always-on Provider location (no active booking) → keeps user.lat/lng fresh so
// "X km away" on Requests/Find Jobs works before any job is accepted.
export async function apiUpdateMyLocation(lat: number, lng: number): Promise<void> {
  await request<void>('PATCH', '/jobs/my-location', { lat, lng });
}

export interface TrackingData {
  status: string;
  paymentStatus?: string;
  openToPool?: boolean;
  ratingGiven?: boolean;
  providerLocation: { lat: number; lng: number; updatedAt: string } | null;
  provider: {
    _id: string;
    name: string;
    phone: string;
    rating: number;
    ratingCount: number;
    photoUrl: string | null;
    experienceYears: number;
    specialties: string[];
    languages: string[];
    certifications: string[];
    policeCheckCleared: boolean;
  } | null;
  booking: {
    serviceType: string;
    scheduledAt: string;
    hours: number;
    totalPrice: number;
    platformFee?: number;
    providerPayout?: number;
    address: string;
  };
}

export async function apiGetTracking(bookingId: string): Promise<TrackingData> {
  return request<TrackingData>('GET', `/bookings/${bookingId}/tracking`);
}

// ─── Messages ─────────────────────────────────────────────────────────────────

export function apiGetMessages(bookingId: string) {
  return request<{ messages: ChatMessage[] }>('GET', `/messages/${bookingId}`);
}

export function apiGetUnreadCount(bookingId: string) {
  return request<{ count: number }>('GET', `/messages/${bookingId}/unread`);
}

// ─── On My Way ────────────────────────────────────────────────────────────────

export function apiOnMyWay(jobId: string) {
  return request<{ booking: Booking }>('POST', `/jobs/${jobId}/on-my-way`, undefined, true, 1, COLD_START_TIMEOUT);
}

// ─── Photo Upload ─────────────────────────────────────────────────────────────

export function apiUploadPhoto(photoBase64: string, mimeType = 'image/jpeg', purpose: 'avatar' | 'gallery' = 'avatar') {
  return request<{ photoUrl: string }>('POST', '/profile/photo', { photoBase64, mimeType, purpose });
}

// ─── Posts ────────────────────────────────────────────────────────────────────

export interface Post {
  id: string;
  photoUrl: string;
  caption: string | null;
  likeCount: number;
  createdAt: string;
  provider?: { id: string; name?: string; photoUrl?: string };
  service?: { id: string; name: string; price: number } | null;
  isLikedByMe?: boolean;
}

export function apiCreatePost(payload: { photoBase64: string; mimeType?: string; caption?: string; serviceId?: string }) {
  return request<{ post: Post }>('POST', '/posts', payload);
}

export function apiDeletePost(postId: string) {
  return request<{ success: boolean }>('DELETE', `/posts/${postId}`);
}

export function apiGetMyPosts() {
  return request<{ posts: Post[] }>('GET', '/posts/mine');
}

export function apiLikePost(postId: string) {
  return request<{ success: boolean }>('POST', `/posts/${postId}/like`);
}

export function apiUnlikePost(postId: string) {
  return request<{ success: boolean }>('DELETE', `/posts/${postId}/like`);
}

export function apiGetExplorePosts(sort: 'recent' | 'top', cursor?: string, limit = 20) {
  const params = new URLSearchParams({ sort, limit: String(limit), ...(cursor ? { cursor } : {}) });
  return request<{ posts: Post[]; nextCursor: string | null }>('GET', `/posts/explore?${params.toString()}`);
}

// ─── Provider Reviews & Tips ───────────────────────────────────────────────────────

export function apiGetProviderReviews(providerId: string) {
  return request<{ reviews: { rating: number; comment: string; createdAt: string; customerName: string; serviceType: string }[] }>(
    'GET', `/jobs/provider/${providerId}/reviews`
  );
}

export interface ProviderPublicProfile {
  id: string;
  profileId: string;
  name: string;
  photoUrl?: string;
  photos: string[];
  rating: number;
  ratingCount: number;
  qualificationType: string;
  licenseNumber?: string;
  collegeName?: string;
  experienceYears?: number;
  specialties: string[];
  bio?: string;
  instagramHandle?: string;
  policeCheckCleared: boolean;
  firstAidCertified: boolean;
  completedBookings: number;
  recentRatings: {
    id: string;
    rating: number;
    comment: string;
    customerName: string;
    createdAt: string;
  }[];
  // Pricing
  pricingModel: 'PER_SERVICE' | 'HOURLY';
  hourlyRate?: number;
  priceNegotiable: boolean;
  services: { name: string; price: number; durationMin: number }[];
  // Where they work + rough location — 0/0 means ungeocoded (never rendered as a real point).
  homeService?: boolean;
  salonService?: boolean;
  salonAddress?: string;
  serviceRadiusKm?: number;
  businessHours?: BusinessHours;
  lat?: number;
  lng?: number;
  posts?: {
    id: string;
    photoUrl: string;
    caption: string | null;
    likeCount: number;
    createdAt: string;
    service: { id: string; name: string; price: number } | null;
  }[];
}

export function apiGetProviderPublicProfile(providerId: string) {
  return request<{ provider: ProviderPublicProfile }>('GET', `/providers/${providerId}/public`);
}

// ─── Public (no auth) ─────────────────────────────────────────────────────────

export interface PublicProviderCard {
  id: string;
  name: string;
  photoUrl: string;
  rating: number | null;
  ratingCount: number;
  completedVisits: number;
  qualificationType: string;
  experienceYears: number;
  bio: string;
  specialties: string[];
  languages: string[];
  policeCheckCleared: boolean;
  firstAidCertified: boolean;
  startingPrice?: number;
  lat?: number;
  lng?: number;
}

export function apiPublicProviders() {
  return request<{ total: number; providers: PublicProviderCard[] }>('GET', '/public/providers');
}

export function apiFavoriteProvider(providerId: string) {
  return request<void>('POST', `/providers/${providerId}/favorite`);
}

export function apiUnfavoriteProvider(providerId: string) {
  return request<void>('DELETE', `/providers/${providerId}/favorite`);
}

export function apiGetFavorites() {
  return request<{ providers: PublicProviderCard[] }>('GET', '/favorites');
}

export interface CatalogService {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  basePrice: number;
  durationMin: number;
  popular: boolean;
}

export interface CatalogCategory {
  id: string;
  name: string;
  slug: string;
  icon?: string;
  services: CatalogService[];
}

export function apiPublicCatalog() {
  return request<{ categories: CatalogCategory[] }>('GET', '/public/catalog');
}


export interface ChatMessage {
  _id: string;
  bookingId: string;
  senderId: string;
  senderName: string;
  senderRole: 'CUSTOMER' | 'Provider';
  text: string;
  createdAt: string;
  read: boolean;
}
