import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Storage, StoredUser } from '../utils/storage';
import { connectSocket, disconnectSocket } from '../utils/socket';
import { initNotifications } from '../utils/notifications';
import { registerUnauthorizedHandler } from '../api/client';

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
  updateUser: (patch: Partial<StoredUser>) => void;
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
    setState({ token: null, user: null, isLoading: false, photoUri: null });
  }, []);

  // Register global 401 handler so expired tokens auto sign-out
  useEffect(() => {
    registerUnauthorizedHandler(signOut);
  }, [signOut]);

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

  const updateUser = useCallback((patch: Partial<StoredUser>) => {
    setState(s => {
      if (!s.user) return s;
      const updated = { ...s.user, ...patch };
      Storage.saveAuth(s.token!, updated).catch(() => {});
      return { ...s, user: updated };
    });
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
