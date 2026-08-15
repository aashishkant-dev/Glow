import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Storage, StoredUser } from '../utils/storage';
import { connectSocket, disconnectSocket } from '../utils/socket';
import { initNotifications, addPushTokenRefreshListener } from '../utils/notifications';
import { registerUnauthorizedHandler } from '../api/client';
import { setCurrencyCodeForPhone, setCurrencyCodeFromDeviceLocale, resetCurrencyCode, subscribeCurrencyChange } from '../utils/region';

interface AuthState {
  token: string | null;
  user: StoredUser | null;
  isLoading: boolean;
  photoUri: string | null;
}

interface AuthContextValue extends AuthState {
  signIn: (token: string, user: StoredUser) => Promise<void>;
  signOut: () => Promise<void>;
  updatePhoto: (uri: string | null) => void;
  updateUser: (patch: Partial<StoredUser>) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    token: null, user: null, isLoading: true, photoUri: null,
  });

  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.storage && typeof (navigator.storage as any).persist === 'function') {
      (navigator.storage as any).persist();
    }
    // Baseline currency guess from the device's own region setting, before
    // anything else (phone, GPS, sign-in) has a chance to resolve — matters
    // most for Apple sign-in, whose identity token carries no locale at all.
    setCurrencyCodeFromDeviceLocale();
    const sub = addPushTokenRefreshListener();
    (async () => {
      const [token, user, photoUri] = await Promise.all([
        Storage.getToken(),
        Storage.getUser(),
        Storage.getPhotoUri(),
      ]);
      // Prefer server photoUrl over local photoUri
      const resolvedPhoto = user?.photoUrl || photoUri;
      setState({ token, user, isLoading: false, photoUri: resolvedPhoto ?? null });
      // Reconnect socket if already signed in (e.g. app reopen)
      if (token) connectSocket(token);
      if (token) initNotifications().catch(() => {});
    })();
    return () => sub?.remove();
  }, []);

  const signIn = useCallback(async (token: string, user: StoredUser) => {
    await Storage.saveAuth(token, user);
    const photoUri = user.photoUrl || (await Storage.getPhotoUri());
    setState(s => ({ ...s, token, user, isLoading: false, photoUri: photoUri ?? null }));
    connectSocket(token);
    initNotifications().catch(() => {});
  }, []);

  const signOut = useCallback(async () => {
    disconnectSocket();
    await Storage.clearAuth();
    await Storage.clearDocuments();
    await Storage.clearPhotoUri();
    resetCurrencyCode();
    setState({ token: null, user: null, isLoading: false, photoUri: null });
  }, []);

  // Register global 401 handler so expired tokens auto sign-out
  useEffect(() => {
    registerUnauthorizedHandler(signOut);
  }, [signOut]);

  // Currency follows the signed-in user's phone country code (see region.ts)
  // — covers initial load, sign-in, sign-out (falls back to deploy default),
  // and any phone change from updateUser in one place.
  useEffect(() => {
    setCurrencyCodeForPhone(state.user?.phone);
  }, [state.user?.phone]);

  // region.ts's currency/country state is plain module state, not React
  // state — a screen that already rendered before a slower signal (GPS
  // especially, which needs a permission + fetch round-trip) resolved would
  // otherwise keep showing the old currency indefinitely. AuthProvider sits
  // at the root of the authenticated app, so bumping its own state here
  // forces every mounted screen below it to re-render and pick up the fresh
  // value the next time it calls formatCurrency/getCurrencyCode.
  const [, setCurrencyTick] = useState(0);
  useEffect(() => subscribeCurrencyChange(() => setCurrencyTick(t => t + 1)), []);

  const updatePhoto = useCallback((uri: string | null) => {
    setState(s => {
      const updatedUser = s.user ? { ...s.user, photoUrl: uri ?? undefined } : s.user;
      // Persist the updated user (not just the raw photoUri) so a reload's
      // `Storage.getUser()` doesn't hand back a stale `photoUrl` that then
      // wins over the fresh one in the init-load precedence check below.
      if (s.token && updatedUser) Storage.saveAuth(s.token, updatedUser).catch(() => {});
      return { ...s, photoUri: uri, user: updatedUser };
    });
    if (uri) Storage.savePhotoUri(uri).catch(() => {});
    else Storage.clearPhotoUri().catch(() => {});
  }, []);

  // Returns a Promise so callers that navigate right after an update (e.g.
  // ProviderOnboarding finishing) can await the write actually landing —
  // otherwise a refresh in that narrow window can read back the pre-update
  // value from storage and re-trigger whatever gate the patch was meant to clear.
  const updateUser = useCallback((patch: Partial<StoredUser>) => {
    let pending: Promise<void> = Promise.resolve();
    setState(s => {
      if (!s.user) return s;
      const updated = { ...s.user, ...patch };
      // Caught internally (not rethrown) so existing fire-and-forget callers
      // stay safe, while callers that need the write to land before
      // navigating can still `await updateUser(...)`.
      pending = Storage.saveAuth(s.token!, updated).catch(() => {});
      return { ...s, user: updated };
    });
    return pending;
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, signIn, signOut, updatePhoto, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
