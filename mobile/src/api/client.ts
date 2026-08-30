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
      const errWithCode: any = new Error(message);
      // A distinct machine-readable code (LOW_IMAGE_QUALITY, QUOTA_EXCEEDED,
      // etc. — see routes/skin.js) alongside the human message, so a screen
      // that needs to render a specific state (not just show `message` in
      // an Alert) can branch on `err.code` without parsing text.
      if ((json as any).code) errWithCode.code = (json as any).code;
      throw errWithCode;
    }
    return sanitizeDecimals(json) as T;
  } catch (err: any) {
    clearTimeout(timeout);
    // Case-INSENSITIVE and broadened on purpose — confirmed live that iOS's
    // actual native error text is "The network connection was lost."
    // (lowercase "network"), which the old exact-case, narrow substring
    // check never matched. That meant a textbook-retryable transient drop
    // fell straight through to the raw native exception message shown to
    // the user ("fetch failed: UnexpectedException: The network connection
    // was lost. (at ExpoModulesCore/Promise.swift:56)") instead of ever
    // getting its intended retry.
    const isNetworkError = err.name === 'AbortError' || /network|failed to fetch|connection was lost|offline/i.test(err.message || '');
    if (retries > 0 && isNetworkError) {
      await new Promise(r => setTimeout(r, 1000));
      return request<T>(method, path, body, auth, retries - 1, timeoutMs);
    }
    if (err.name === 'AbortError') {
      const e: any = new Error('Connection timed out. Check your internet connection.');
      e.code = 'TIMEOUT';
      throw e;
    }
    // Retries exhausted (or none configured) — a raw native exception
    // string is not something a user should ever see verbatim.
    if (isNetworkError) {
      const e: any = new Error('Connection lost. Check your internet and try again.');
      e.code = 'NETWORK_ERROR';
      throw e;
    }
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
  return request<{ token: string; user: AuthUser; requiresPhoneVerification?: boolean; locale?: string }>('POST', '/auth/google', payload, false, 2);
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
  // Look catalog IDs (data/looks.ts) this artist confirmed they can create.
  capableLooks?: string[];
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

// Editable any time after onboarding too (Looks tab) — same upsert endpoint,
// just this one field.
export function apiUpdateCapableLooks(capableLooks: string[]) {
  return request<{ message: string }>('POST', '/auth/provider-profile', { capableLooks });
}

// ─── Provider Looks (self-served packages, distinct from the curated
//     data/looks.ts catalog above) ─────────────────────────────────────────

export interface LookMediaItem { type: 'photo' | 'video'; url: string; }

export interface ProviderLookItem {
  id: string;
  name: string;
  vibe: string | null;
  serviceType: string;
  // Which specialty categories (see data/categories.ts) this look should
  // surface under besides its one pricing-linked serviceType — a bridal
  // look with an updo is legitimately both "Bridal" and "Hair" work, but
  // serviceType alone can only name one for booking purposes.
  categories?: string[];
  price: number;
  durationMin: number | null;
  includes: string[];
  // Up to 5, in display order — [0] is the cover shown on the card, the rest
  // are a swipeable gallery. Can mix photos and short video clips. Empty
  // when the look uses a theme instead.
  media: LookMediaItem[];
  // Short marketing label ("Bestseller", "Bridal Special") shown on the
  // card — how an artist packages a look as a promoted offer.
  badge?: string | null;
  themeFrom: string | null;
  themeTo: string | null;
  createdAt: string;
  likeCount?: number;
  commentCount?: number;
}

export function apiGetMyLooks() {
  return request<{ looks: ProviderLookItem[] }>('GET', '/jobs/looks');
}

// A look's media item is either a fresh shot (base64, gets uploaded) or a
// reference to a photo/video the artist already posted (url, reused as-is)
// — the same photo can back both a Post and one or more Looks at once.
export type LookMediaInput = { type: 'photo' | 'video'; base64: string; mimeType?: string } | { type: 'photo' | 'video'; url: string };

export function apiCreateLook(payload: {
  name: string;
  vibe?: string;
  serviceType: string;
  categories?: string[];
  price: number;
  durationMin?: number;
  includes?: string[];
  media?: LookMediaInput[];
  filter?: string;
  themeFrom?: string;
  themeTo?: string;
  badge?: string;
  // Samples the cover photo's own colors server-side (sharp resamples the
  // whole image to one pixel) instead of using themeFrom/themeTo — the
  // card's tint then always matches what's actually in the photo.
  autoTheme?: boolean;
}) {
  return request<{ look: ProviderLookItem }>('POST', '/jobs/looks', payload);
}

export function apiDeleteLook(lookId: string) {
  return request<{ success: boolean }>('DELETE', `/jobs/looks/${lookId}`);
}

// "Post into a look instead of the feed" — appends one photo or video to an
// existing look's gallery, either a fresh shot or a reused existing post.
// Used by PostsScreen's create flow as an alternative destination to
// apiCreatePost, and by the look editor's "+" tile.
export function apiAddLookMedia(
  lookId: string,
  item: { photoBase64?: string; videoBase64?: string; videoMimeType?: string; existingUrl?: string; existingType?: 'photo' | 'video' },
  filter?: string,
  autoTheme?: boolean,
) {
  return request<{ look: ProviderLookItem }>('POST', `/jobs/looks/${lookId}/photos`, { ...item, filter, autoTheme });
}

export function apiDeleteLookMedia(lookId: string, index: number) {
  return request<{ look: ProviderLookItem }>('DELETE', `/jobs/looks/${lookId}/media/${index}`);
}

// Edits an existing look's details — name/vibe/service/price/duration/
// includes/badge/theme. Media is managed incrementally (apiAddLookMedia /
// apiDeleteLookMedia), not through this call.
export function apiUpdateLook(lookId: string, payload: {
  name?: string;
  vibe?: string;
  serviceType?: string;
  categories?: string[];
  price?: number;
  durationMin?: number;
  includes?: string[];
  badge?: string;
  themeFrom?: string;
  themeTo?: string;
  // When present, REPLACES the look's whole gallery in one commit — the
  // edit sheet stages every photo/crop locally and sends the final array
  // only on "Save changes", the same one-commit model as creating a look.
  media?: LookMediaInput[];
  filter?: string;
  autoTheme?: boolean;
}) {
  return request<{ look: ProviderLookItem }>('PATCH', `/jobs/looks/${lookId}`, payload);
}

// A "look like" is scoped to (artist, look) — liking "Bridal Glow" under one
// artist is independent of liking the same catalog entry under another.
// lookKey is "catalog:<data/looks.ts id>" or "custom:<ProviderLook.id>".
export function apiLikeLook(providerId: string, lookKey: string) {
  return request<{ success: boolean }>('POST', `/providers/${providerId}/looks/${encodeURIComponent(lookKey)}/like`);
}

export function apiUnlikeLook(providerId: string, lookKey: string) {
  return request<{ success: boolean }>('DELETE', `/providers/${providerId}/looks/${encodeURIComponent(lookKey)}/like`);
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
  // Multi-service bundle for ONE booking on ONE date. Multi-date bookings send
  // one call per date, each carrying this same bundle — see CreateBookingScreen.
  services: { name: string; serviceItemId?: string | null }[];
  scheduledAt: string;
  lat?: number;
  lng?: number;
  providerId?: string;
  address?: string;
  notes?: string;
  // Negotiated offer against the SUMMED total of `services`, not per line item.
  proposedPrice?: number;
  // data/looks.ts catalog ID when this came from "Book this look" — lets the
  // backend prefer artists who confirmed this specific look (see notifyNearbyProviders).
  lookId?: string;
  // A specific artist-owned ProviderLook (their own priced package). When set,
  // the backend re-prices the whole booking from THIS look's price/duration —
  // see resolveProviderLookBooking — so `services` above is only a display
  // fallback, never trusted for price in this path.
  providerLookId?: string;
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
  // data/looks.ts catalog IDs this artist confirmed during onboarding —
  // used to rank artists who can do a specific booked look first.
  capableLooks?: string[];
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
  capableLooks?: string[];
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

// One service line item on a booking. Every booking has >= 1. The Booking's own
// `serviceType`/`hours`/`totalPrice` remain denormalized summaries of these —
// use them for compact displays, use `services` for itemized breakdowns.
export interface BookingServiceLine {
  _id: string;
  serviceItemId: string | null;
  name: string;
  price: number;
  durationMin: number;
}

export interface Booking {
  _id: string;
  customer: {
    _id: string; name: string; phone: string; rating?: number; ratingCount?: number; photoUrl?: string;
    // Surfaced to the artist so they can prep the right products/shades for
    // the client before arriving — not shown to the artist until they have
    // an active booking with this customer (see the selects in provider.js).
    skinTone?: 'FAIR' | 'LIGHT' | 'MEDIUM' | 'TAN' | 'DEEP' | 'RICH';
    skinType?: 'DRY' | 'OILY' | 'COMBINATION' | 'NORMAL' | 'SENSITIVE';
  };
  provider?: { _id: string; name: string; phone: string; rating?: number; ratingCount?: number; photoUrl?: string };
  serviceType: string;
  hours: number;
  // data/looks.ts catalog ID when this booking came from "Book this look"
  // rather than the generic service picker — look it up client-side to show
  // the artist what look reference the client actually wants (see JobDetailScreen).
  lookId?: string | null;
  // The joined ProviderLook itself (not just an id) when the booking was
  // "book this look" against one of the ARTIST'S OWN packages rather than
  // the shared catalog — lookId above only ever covers the catalog case, so
  // an artist's own "Bridal Glam" package request had nowhere to surface at
  // all until this was added. Present only on responses whose query
  // included the relation (booking detail, nearby-jobs, requests).
  providerLook?: { id: string; name: string; vibe: string | null; includes: string[]; media: LookMediaItem[] } | null;
  // Optional: only present on responses whose query included the relation
  // (booking detail, my-bookings, my-jobs, nearby-jobs, requests, accept).
  // Always fall back to `serviceType` when absent.
  services?: BookingServiceLine[];
  scheduledAt: string;
  lat: number;
  lng: number;
  // Provider → client distance, computed server-side when both sides have
  // real coordinates. Present on /jobs/requests and /bookings/:id (Provider only).
  distanceKm?: number;
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
    // data/looks.ts catalog IDs this artist confirmed they can create.
    capableLooks?: string[];
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

// Pre-booking inquiry — "message this artist" from their profile or a look,
// before any date is picked. Same Message rows as booking chat, just
// threaded by the (customer, provider) pair instead of a bookingId — see
// the schema comment on Message.bookingId.
export function apiGetInquiryMessages(otherUserId: string) {
  return request<{ messages: ChatMessage[] }>('GET', `/messages/inquiry/${otherUserId}`);
}

export interface InquiryThread {
  otherUserId: string;
  otherName: string;
  otherPhotoUrl: string | null;
  lastMessage: string;
  lastMessageAt: string;
  unread: boolean;
}

export function apiGetInquiryThreads() {
  return request<{ threads: InquiryThread[] }>('GET', '/messages/inquiries');
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
  // Exactly one is set — a post is either a photo or a short in-app-camera
  // video, never both.
  photoUrl: string | null;
  videoUrl?: string | null;
  caption: string | null;
  category?: string | null;
  likeCount: number;
  commentCount?: number;
  createdAt: string;
  provider?: { id: string; name?: string; photoUrl?: string };
  service?: { id: string; name: string; price: number } | null;
  isLikedByMe?: boolean;
}

export function apiCreatePost(payload: { photoBase64?: string; videoBase64?: string; mimeType?: string; caption?: string; serviceId?: string; category?: string; filter?: string }) {
  return request<{ post: Post }>('POST', '/posts', payload);
}

export function apiDeletePost(postId: string) {
  return request<{ success: boolean }>('DELETE', `/posts/${postId}`);
}

export function apiUpdatePostCategory(postId: string, category: string) {
  return request<{ post: Post }>('PATCH', `/posts/${postId}`, { category });
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

export function apiGetExplorePosts(sort: 'recent' | 'top', cursor?: string, limit = 20, category?: string) {
  const params = new URLSearchParams({
    sort, limit: String(limit),
    ...(cursor ? { cursor } : {}),
    ...(category ? { category } : {}),
  });
  return request<{ posts: Post[]; nextCursor: string | null }>('GET', `/posts/explore?${params.toString()}`);
}

// Posts the current user has liked — the read side of apiLikePost, backing
// the Saved screen's Posts tab.
export function apiGetLikedPosts(cursor?: string, limit = 20) {
  const params = new URLSearchParams({ limit: String(limit), ...(cursor ? { cursor } : {}) });
  return request<{ posts: Post[]; nextCursor: string | null }>('GET', `/posts/liked?${params.toString()}`);
}

// A self-served look (badge, theme, gallery, video) from any approved
// artist — without this, that content only exists behind a direct visit to
// one artist's profile, never surfaced the way curated data/looks.ts is.
export interface ExploreLookItem {
  id: string;
  name: string;
  vibe: string | null;
  serviceType: string;
  price: number;
  durationMin: number | null;
  includes: string[];
  media: LookMediaItem[];
  badge?: string | null;
  themeFrom: string | null;
  themeTo: string | null;
  likeCount: number;
  commentCount?: number;
  provider: { id: string; name: string; photoUrl?: string | null };
}

export function apiGetExploreLooks(sort: 'recent' | 'top' = 'recent', cursor?: string, limit = 20) {
  const params = new URLSearchParams({ sort, limit: String(limit), ...(cursor ? { cursor } : {}) });
  return request<{ looks: ExploreLookItem[]; nextCursor: string | null }>('GET', `/posts/explore-looks?${params.toString()}`);
}

// ─── Comments ─────────────────────────────────────────────────────────────────
// Attach to either a Post or a ProviderLook — pass exactly one of postId /
// providerLookId to every function below.

export interface CommentItem {
  id: string;
  text: string;
  postId: string | null;
  providerLookId: string | null;
  createdAt: string;
  user: { id: string; name: string; photoUrl?: string | null; role: string };
}

export function apiGetComments(target: { postId?: string; providerLookId?: string }, cursor?: string, limit = 30) {
  const params = new URLSearchParams({
    limit: String(limit),
    ...(target.postId ? { postId: target.postId } : {}),
    ...(target.providerLookId ? { providerLookId: target.providerLookId } : {}),
    ...(cursor ? { cursor } : {}),
  });
  return request<{ comments: CommentItem[]; nextCursor: string | null }>('GET', `/comments?${params.toString()}`);
}

export function apiAddComment(target: { postId?: string; providerLookId?: string }, text: string) {
  return request<{ comment: CommentItem }>('POST', '/comments', { ...target, text });
}

export function apiDeleteComment(commentId: string) {
  return request<{ success: boolean }>('DELETE', `/comments/${commentId}`);
}

// ─── Provider Reviews & Tips ───────────────────────────────────────────────────────

export function apiGetProviderReviews(providerId: string) {
  return request<{ reviews: { rating: number; comment: string; createdAt: string; customerName: string; serviceType: string }[] }>(
    'GET', `/jobs/provider/${providerId}/reviews`
  );
}

// Repeat vs first-time signal for the provider's "review details" screen —
// only resolves for a client this provider has an actual booking with.
export function apiGetClientHistory(customerId: string) {
  return request<{ totalCompletedBookings: number; bookingsWithMe: number; memberSince: string }>(
    'GET', `/jobs/customer/${customerId}/history`
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
    customerPhotoUrl?: string | null;
    createdAt: string;
  }[];
  // Pricing
  pricingModel: 'PER_SERVICE' | 'HOURLY';
  hourlyRate?: number;
  priceNegotiable: boolean;
  services: { name: string; price: number; durationMin: number }[];
  // data/looks.ts catalog IDs this artist confirmed during onboarding they can
  // create — rendered on the public profile as their "Looks I create" packages.
  capableLooks?: string[];
  // Self-served looks this artist built themselves (see ProviderLook) — merged
  // alongside capableLooks in the same section, both rendered via LookTile.
  customLooks?: ProviderLookItem[];
  // lookKey ("catalog:<id>" | "custom:<id>") → like count, and which of those
  // keys the current viewer has liked — see LookLike schema comment.
  lookLikes?: Record<string, number>;
  myLikedLookKeys?: string[];
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
    photoUrl: string | null;
    videoUrl?: string | null;
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
  bookingId?: string | null;
  senderId: string;
  senderName: string;
  senderRole: 'CUSTOMER' | 'Provider';
  text: string;
  createdAt: string;
  read: boolean;
}

// ─── My Space — AI skin scans ──────────────────────────────────────────────
// Analysis is computed free/on-device-style (pixel color math + a short
// quiz — see src/utils/skinAnalysis.js on the backend), never a paid vision
// API call. Cosmetic guidance only, not a medical diagnosis.

export type SkinToneValue = 'FAIR' | 'LIGHT' | 'MEDIUM' | 'TAN' | 'DEEP' | 'RICH';
export type SkinTypeValue = 'DRY' | 'OILY' | 'COMBINATION' | 'NORMAL' | 'SENSITIVE';

export interface SkinRecommendation {
  category: string;
  title: string;
  note: string;
}

// Perfect Corp's own SD-tier concern names (src/utils/perfectCorpClient.js's
// DST_ACTIONS) — used directly as this app's tab keys rather than inventing
// a translation layer, per the product decision to use the vendor's real
// field names. 'pore'/'wrinkle'/'acne' etc., not 'pores'/'wrinkles'.
export type SkinHeatmapConcernKey = 'pore' | 'moisture' | 'wrinkle' | 'acne' | 'texture' | 'age_spot' | 'redness';

// One concern's full read — see src/utils/skinConcernContent.js for where
// label/verdict/education/tips come from (shared, severity-banded copy —
// same content regardless of which engine below produced the number).
export interface SkinHeatmapConcern {
  url: string;
  label: string;
  // Short tab-bar label — same as `label` for most concerns, distinct where
  // the full label ("Fine Lines & Wrinkles") is too long for a pill.
  tabLabel: string;
  // 'perfectcorp' when this concern's severity/mask came from the real
  // Perfect Corp AI Skin Diagnostic API; 'estimated' when the free
  // heuristic fallback produced it (vendor not configured, or the live
  // call failed for this scan — see SkinScan.heatmapSourceReason). The UI
  // must visibly label an 'estimated' result — never present it with the
  // same confidence as a licensed vendor read.
  source: 'perfectcorp' | 'estimated';
  // The two ends of THIS concern's own severity gradient bar (e.g.
  // {low:'Even Tone', high:'Flushed'} for redness) — never a generic
  // Low/High pair reused across concerns.
  gradientLabels: { low: string; high: string };
  // 0-1, the 85th percentile of severity across this concern's assessable
  // pixels — deliberately not a plain mean (see skinHeatmaps.js's own
  // comment: a real, localized flag shouldn't get averaged away by a much
  // larger calm area). Drives the vertical gradient bar's marker position.
  // The SAME z-score-derived scale and band thresholds apply across every
  // concern, so comparing severity between concerns (e.g. to sort the
  // Summary tab worst-first) is comparing like with like.
  severity: number;
  // severity rescaled to 0-100, for display where a percent-like number
  // reads more naturally than a 0-1 float.
  severityScore: number;
  band: 'clear' | 'mild' | 'moderate' | 'notable';
  verdict: string;
  education: string;
  // 2-4 short, actionable tips (ingredient categories, not specific SKUs —
  // there's no product catalog to link yet).
  tips: string[];
  // A SEPARATE axis from severity — how much to trust this particular
  // read, not how bad it is. On the 'estimated' path this is computed from
  // real signals (zone coverage + pixel area); on the 'perfectcorp' path
  // Perfect Corp's SD schema doesn't publish a per-concern confidence
  // field, so this reflects "a licensed vision model produced this," not a
  // fabricated precision claim — zoneFraction/pixelCount are only ever
  // populated on the 'estimated' path (undefined on 'perfectcorp').
  confidence: { level: 'low' | 'medium' | 'high'; zoneFraction?: number; pixelCount?: number };
  // Perfect Corp's raw 0-100 score for this concern (higher = healthier) —
  // only present on the 'perfectcorp' path. Kept alongside `severity`
  // (which is already inverted/normalized for the gradient bar) so a
  // future screen can show the vendor's own number verbatim if useful.
  rawScore?: number;
  uiScore?: number;
  // Per-zone severity for this concern, worst-first — powers tap-to-
  // highlight (tap a zone, that region's heatmap brightens while the rest
  // dims — see SkinConcernTabs.tsx's ZoneHighlightMask). `zone` matches
  // skinZones.ts's ZoneKey (forehead/nose/chin/cheekL/cheekR/underEyeL/
  // underEyeR/jawline). Real, computed data on the 'estimated' path;
  // always [] on 'perfectcorp' so far — Perfect Corp's SD schema doesn't
  // have confirmed per-zone output yet (no successful live response has
  // been checked), so there's nothing to show rather than a guess. An
  // empty array means "no tappable zones for this concern," not an error.
  zoneBreakdown: { zone: string; label: string; severity: number; band: 'clear' | 'mild' | 'moderate' | 'notable' }[];
}

export interface SkinScan {
  id: string;
  // Which physical person this scan belongs to — see SkinProfile below. A
  // shared-device account (family sharing one phone) can have more than one.
  profileId: string;
  photoUrl: string;
  skinTone: SkinToneValue;
  skinType: SkinTypeValue;
  concerns: string[];
  // A warm, specific one-liner about this photo (real AI observation when
  // the Gemini vision path produced this scan; a plain templated line from
  // the free heuristic otherwise — never blank either way).
  summary: string;
  // Set only when a previous scan existed to compare against at analysis
  // time. Null on a first-ever scan, or when the free heuristic (no
  // cross-photo comparison ability) produced this one.
  progressNote: string | null;
  // '' from the free heuristic (no per-zone reading ability) — populated on
  // the Gemini path only.
  hydrationLevel: '' | 'LOW' | 'MODERATE' | 'HIGH';
  // 8-zone breakdown (forehead/nose/chin/cheekL/cheekR/underEyeL/underEyeR/
  // jawline) as of the granular zone rework — a given scan only ever
  // populates whichever zones the photo actually showed something in,
  // never all 8. tZone/cheeks/underEye are the old 3-zone shape, only ever
  // present on scans saved before that rework (see skinZones.ts).
  zoneNotes: {
    forehead?: string; nose?: string; chin?: string;
    cheekL?: string; cheekR?: string;
    underEyeL?: string; underEyeR?: string;
    jawline?: string;
    tZone?: string; cheeks?: string; underEye?: string;
  };
  // The face region actually used for analysis, as 0–1 fractions of the
  // photo — from on-device face detection when available, or the fixed
  // guide-oval fallback otherwise. {} on scans from before this field
  // existed.
  faceBox: { x?: number; y?: number; width?: number; height?: number };
  // Per-zone marker rects (0–1 fractions of the photo, same space as
  // faceBox) derived from real ML Kit landmark/contour points on THIS
  // photo — see deriveZoneMarkers in skinZones.ts. Only whichever zones the
  // client could actually place; null on scans from before this existed, or
  // when detection didn't yield usable geometry, in which case every zone
  // falls back to the ZONE_RECTS proportion estimate as it always has.
  zoneMarkers: Partial<Record<'forehead' | 'nose' | 'chin' | 'cheekL' | 'cheekR' | 'underEyeL' | 'underEyeR' | 'jawline', { x: number; y: number; width: number; height: number }>> | null;
  // Interim heuristic heatmap overlays — replaces the old point-marker
  // system entirely (see src/utils/skinHeatmaps.js on the backend). `url`
  // is a transparent PNG the exact same pixel dimensions as `photoUrl`, so
  // it stacks directly with no coordinate math. A concern absent from this
  // object had no assessable pixels for this scan (heavy occlusion,
  // extreme pose) — the results screen must show that concern as "not
  // assessed," never fall back to a guess. Null on scans from before this
  // existed.
  heatmaps: Partial<Record<SkinHeatmapConcernKey, SkinHeatmapConcern>> | null;
  // 'perfectcorp' when `heatmaps` came from the real vendor API for this
  // scan, 'estimated' when the free heuristic fallback produced it — see
  // each SkinHeatmapConcern's own `source` for the identical per-concern
  // value (kept at both levels so a screen can show one banner without
  // reading into an arbitrary concern first). Undefined on scans from
  // before this existed — treat as 'estimated' (the old heuristic-only
  // era) for display purposes.
  heatmapSource?: 'perfectcorp' | 'estimated';
  // Why heatmapSource is 'estimated' for this specific scan — only present
  // when it is. Drives the result screen's banner copy.
  heatmapSourceReason?: 'not_configured' | 'network_error' | 'timeout' | 'quota_exceeded' | 'server_error';
  recommendations: SkinRecommendation[];
  notes: string;
  createdAt: string;
}

// `faceRegion` is the {x,y,width,height} (0–1 fractions of the photo) the
// on-screen alignment oval maps to — see SkinScanCamera.tsx. Optional; the
// backend falls back to a generous center crop without it. `zoneMarkers`
// (same shape as SkinScan.zoneMarkers above) is the client's own
// landmark-derived zone positions for this exact photo, if detection
// produced any — persisted as-is so the result screen (now, and any future
// visit to this same scan) can anchor markers to real geometry instead of a
// proportion estimate.
export function apiScanSkin(payload: {
  photoBase64: string;
  mimeType?: string;
  faceRegion?: { x: number; y: number; width: number; height: number };
  zoneMarkers?: Partial<Record<'forehead' | 'nose' | 'chin' | 'cheekL' | 'cheekR' | 'underEyeL' | 'underEyeR' | 'jawline', { x: number; y: number; width: number; height: number }>>;
  notes?: string;
}) {
  // isNewProfile: true when the backend's face-match decided this photo
  // doesn't match anyone previously scanned on this account and started a
  // fresh SkinProfile for them — see SkinScanCamera's onComplete handler.
  // 70s, not 60s — confirmed against real production logs (railway logs
  // --http --path /skin/scan) that a legitimately-completing request can
  // take up to ~36s even with the backend's own internal timeouts (Gemini
  // capped at 25s, reference-photo fetches at 10s each), and one request
  // was client-canceled at exactly 59.9s — right at the old ceiling,
  // killing a request that may well have finished a moment later. The real
  // fix is the backend actually being faster (see skin.js's Gemini-sized
  // image resize), but this stops the client from being the thing that
  // kills an otherwise-successful slow-but-still-working request.
  return request<{ scan: SkinScan; bookCategory: string; isNewProfile: boolean }>('POST', '/skin/scan', payload, true, 1, 70000);
}

export function apiGetSkinScans(profileId?: string, cursor?: string, limit = 20) {
  const params = new URLSearchParams({ limit: String(limit), ...(cursor ? { cursor } : {}), ...(profileId ? { profileId } : {}) });
  return request<{ scans: SkinScan[]; nextCursor: string | null }>('GET', `/skin/scans?${params.toString()}`);
}

export function apiGetLatestSkinScan(profileId?: string) {
  const params = profileId ? `?${new URLSearchParams({ profileId }).toString()}` : '';
  return request<{ scan: SkinScan | null }>('GET', `/skin/latest${params}`);
}

export function apiDeleteSkinScan(scanId: string) {
  return request<{ success: boolean }>('DELETE', `/skin/scans/${scanId}`);
}

// ─── My Space — skin profiles ───────────────────────────────────────────────
// A "profile" is one physical person scanning on this account — almost every
// account only ever has one, but a shared device (family sharing a phone)
// can have more. Created automatically server-side when a scan's face
// doesn't match anyone already known on the account; never created directly.

export interface SkinProfile {
  id: string;
  label: string;
  scanCount: number;
  latestPhotoUrl: string | null;
  latestScanAt: string | null;
  createdAt: string;
  // A self-set focus with a target check-in date — null when no goal is
  // active. See apiSetSkinGoal / apiClearSkinGoal.
  goalText: string | null;
  goalSetAt: string | null;
  goalCheckInAt: string | null;
}

export function apiGetSkinProfiles() {
  return request<{ profiles: SkinProfile[] }>('GET', '/skin/profiles');
}

export function apiRenameSkinProfile(profileId: string, label: string) {
  return request<{ profile: { id: string; label: string } }>('PATCH', `/skin/profiles/${profileId}`, { label });
}

export function apiSetSkinGoal(profileId: string, goalText: string, checkInDays: number) {
  return request<{ profile: { id: string; goalText: string; goalSetAt: string; goalCheckInAt: string } }>(
    'PATCH', `/skin/profiles/${profileId}/goal`, { goalText, checkInDays },
  );
}

export function apiClearSkinGoal(profileId: string) {
  return request<{ profile: { id: string; goalText: null } }>('PATCH', `/skin/profiles/${profileId}/goal`, { goalText: null });
}
