import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// JWT lives in the OS secure keystore on native (Keychain/Keystore). SecureStore
// isn't available on web, so the PWA falls back to AsyncStorage. SecureStore keys
// can't contain '/' or '@', so the token uses a plain alphanumeric key.
const SECURE_TOKEN_KEY = 'glow_token';
const isWeb = Platform.OS === 'web';

// In-memory cache: the iOS Keychain is unreadable while the device is locked
// (default WHEN_UNLOCKED accessibility) and background location can wake the
// app in that state — a per-request SecureStore read then returns null and the
// request goes out unauthenticated, gets a 401, and wrongly signs the user out.
// Cache the token for the life of the process; only hit the keystore cold.
let _tokenCache: string | null | undefined; // undefined = not loaded yet

async function secureGet(): Promise<string | null> {
  if (_tokenCache !== undefined) return _tokenCache;
  if (isWeb) {
    _tokenCache = await AsyncStorage.getItem(KEYS.TOKEN);
    return _tokenCache;
  }
  try {
    const t = await SecureStore.getItemAsync(SECURE_TOKEN_KEY);
    if (t !== null) {
      _tokenCache = t; // never cache a transient keystore miss
      // Re-save to upgrade existing entries to AFTER_FIRST_UNLOCK accessibility.
      secureSet(t).catch(() => {});
    }
    return t;
  } catch { return null; }
}
async function secureSet(token: string): Promise<void> {
  _tokenCache = token;
  if (isWeb) { await AsyncStorage.setItem(KEYS.TOKEN, token); return; }
  try {
    // AFTER_FIRST_UNLOCK: readable while the device is locked (after first
    // unlock since boot) — needed for background-location API calls.
    await SecureStore.setItemAsync(SECURE_TOKEN_KEY, token, {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
    });
  } catch {}
}
async function secureDelete(): Promise<void> {
  _tokenCache = null;
  if (isWeb) { await AsyncStorage.removeItem(KEYS.TOKEN); return; }
  try { await SecureStore.deleteItemAsync(SECURE_TOKEN_KEY); } catch {}
}

const KEYS = {
  TOKEN: '@glow/token',
  USER: '@glow/user',
  PHOTO_URI: '@glow/photo_uri',
  DOCUMENTS: '@glow/documents',
  LANG: '@glow/lang',
  INSTALL_DISMISSED: '@glow/install_dismissed',
  LOCATION_PROMPTED: '@glow/location_prompted',
} as const;

export interface StoredDocument {
  id: string;
  label: string;
  uri: string;
  dataUrl?: string;   // base64 fallback so the preview always renders on native
  uploadedAt: string;
}

export interface StoredUser {
  id: string;
  name: string;
  phone?: string;
  phoneVerified?: boolean;
  role: 'CUSTOMER' | 'Provider' | 'ADMIN' | 'SALON';
  onboardingComplete?: boolean;
  photoUrl?: string;
  skinTone?: 'FAIR' | 'LIGHT' | 'MEDIUM' | 'TAN' | 'DEEP' | 'RICH';
  skinType?: 'DRY' | 'OILY' | 'COMBINATION' | 'NORMAL' | 'SENSITIVE';
  preferredOccasions?: string[];
}

export const Storage = {
  async saveAuth(token: string, user: StoredUser): Promise<void> {
    await secureSet(token);
    await AsyncStorage.setItem(KEYS.USER, JSON.stringify(user));
  },

  async getToken(): Promise<string | null> {
    const t = await secureGet();
    if (t) return t;
    // One-time migration: token previously stored in AsyncStorage (plaintext).
    // Move it into SecureStore, then remove the plaintext copy.
    if (!isWeb) {
      const legacy = await AsyncStorage.getItem(KEYS.TOKEN);
      if (legacy) {
        await secureSet(legacy);
        await AsyncStorage.removeItem(KEYS.TOKEN);
        return legacy;
      }
    }
    return null;
  },

  async getUser(): Promise<StoredUser | null> {
    const raw = await AsyncStorage.getItem(KEYS.USER);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as StoredUser;
    } catch {
      return null;
    }
  },

  async clearAuth(): Promise<void> {
    await secureDelete();
    // 'cn_notifications' is ChatUnreadContext's NOTIF_STORAGE_KEY (legacy
    // pre-rebrand name, not in the @glow/ namespace above) — cleared here too.
    // On web, AsyncStorage backs onto localStorage, which is scoped to the
    // browser origin, not the signed-in user: without this, signing out and a
    // different account signing in on the same browser inherited (and even
    // re-persisted back to storage via the notifications merge) the PREVIOUS
    // user's locally-cached notifications — a real cross-account data leak.
    await AsyncStorage.multiRemove([KEYS.TOKEN, KEYS.USER, 'cn_notifications']);
  },

  async savePhotoUri(uri: string): Promise<void> {
    await AsyncStorage.setItem(KEYS.PHOTO_URI, uri);
  },

  async getPhotoUri(): Promise<string | null> {
    return AsyncStorage.getItem(KEYS.PHOTO_URI);
  },

  async clearPhotoUri(): Promise<void> {
    await AsyncStorage.removeItem(KEYS.PHOTO_URI);
  },

  async getDocuments(): Promise<StoredDocument[]> {
    const raw = await AsyncStorage.getItem(KEYS.DOCUMENTS);
    if (!raw) return [];
    try { return JSON.parse(raw) as StoredDocument[]; } catch { return []; }
  },

  async saveDocument(doc: StoredDocument): Promise<void> {
    const docs = await Storage.getDocuments();
    const idx = docs.findIndex(d => d.id === doc.id);
    if (idx >= 0) docs[idx] = doc; else docs.push(doc);
    await AsyncStorage.setItem(KEYS.DOCUMENTS, JSON.stringify(docs));
  },

  async removeDocument(id: string): Promise<void> {
    const docs = await Storage.getDocuments();
    await AsyncStorage.setItem(KEYS.DOCUMENTS, JSON.stringify(docs.filter(d => d.id !== id)));
  },

  async clearDocuments(): Promise<void> {
    await AsyncStorage.removeItem(KEYS.DOCUMENTS);
  },

  async saveLang(lang: string): Promise<void> {
    await AsyncStorage.setItem(KEYS.LANG, lang);
  },

  async getLang(): Promise<string | null> {
    return AsyncStorage.getItem(KEYS.LANG);
  },

  async saveInstallDismissed(): Promise<void> {
    await AsyncStorage.setItem(KEYS.INSTALL_DISMISSED, '1');
  },

  async getInstallDismissed(): Promise<boolean> {
    const v = await AsyncStorage.getItem(KEYS.INSTALL_DISMISSED);
    return v === '1';
  },

  async saveLocationPrompted(): Promise<void> {
    await AsyncStorage.setItem(KEYS.LOCATION_PROMPTED, '1');
  },

  async getLocationPrompted(): Promise<boolean> {
    const v = await AsyncStorage.getItem(KEYS.LOCATION_PROMPTED);
    return v === '1';
  },
};
