import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Alert, AppState, Linking, Platform } from 'react-native';
import * as Location from 'expo-location';
import { apiUpdateMyLocation } from '../api/client';
import { Storage } from '../utils/storage';

export interface Coords {
  lat: number;
  lng: number;
}

export type LocationPermissionStatus =
  | 'loading'
  | 'granted'
  | 'denied'
  | 'unavailable';

interface LocationContextValue {
  coords: Coords | null;
  permissionStatus: LocationPermissionStatus;
  requestLocation: () => Promise<void>;
}

const SUDBURY: Coords = { lat: 46.4917, lng: -80.9930 };
const REFRESH_MS = 5 * 60 * 1000; // 5 minutes

const LocationContext = createContext<LocationContextValue | undefined>(undefined);

/**
 * Silent web permission check — never triggers the browser prompt.
 * 'unknown' = Permissions API unavailable (old Safari); treat as 'prompt'.
 */
export async function webGeoPermissionState(): Promise<'granted' | 'prompt' | 'denied' | 'unknown'> {
  try {
    if (typeof navigator === 'undefined' || !navigator.permissions?.query) return 'unknown';
    const s = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
    return s.state as 'granted' | 'prompt' | 'denied';
  } catch {
    return 'unknown';
  }
}

async function getWebPosition(): Promise<Coords> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      const err = new Error('geolocation unavailable');
      (err as any).code = 'UNAVAILABLE';
      reject(err);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      err => reject(err),
      { timeout: 10000, maximumAge: 60000 },
    );
  });
}

function classifyGeoError(e: any): LocationPermissionStatus {
  if (e?.code === 'UNAVAILABLE') return 'unavailable';
  if (e?.code === 2) return 'unavailable';  // POSITION_UNAVAILABLE
  if (e?.code === 3) return 'unavailable';  // TIMEOUT — transient, not a permission problem
  if (e?.code === 1) return 'denied';       // PERMISSION_DENIED
  return 'denied';
}

export function LocationProvider({ children }: { children: React.ReactNode }) {
  const [coords, setCoords] = useState<Coords | null>(null);
  const [permissionStatus, setPermissionStatus] =
    useState<LocationPermissionStatus>('loading');
  const mountedRef = useRef(false);
  // Read by fetchCoords (a stable callback) to know whether a last-known
  // position was already served when the fresh fix times out.
  const coordsRef = useRef<Coords | null>(null);
  useEffect(() => { coordsRef.current = coords; }, [coords]);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const fetchCoords = useCallback(async () => {
    let servedLastKnown = false;
    try {
      if (Platform.OS === 'web') {
        const c = await getWebPosition();
        if (mountedRef.current) { setCoords(c); setPermissionStatus('granted'); }
      } else {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== 'granted') {
          if (mountedRef.current) setPermissionStatus('denied');
          return;
        }
        // iOS: getCurrentPositionAsync has no timeout and can hang for minutes
        // indoors while CoreLocation waits for a fresh fix — the app looked
        // like "location doesn't work". Serve the OS-cached last known
        // position instantly (seconds old in practice), then refine with a
        // fresh fix capped at 15s so a cold GPS can never wedge this path.
        const last = await Location.getLastKnownPositionAsync().catch(() => null);
        servedLastKnown = !!last;
        if (last && mountedRef.current) {
          setCoords({ lat: last.coords.latitude, lng: last.coords.longitude });
          setPermissionStatus('granted');
        }
        const pos = await Promise.race([
          Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(Object.assign(new Error('location timeout'), { code: 3 })), 15_000),
          ),
        ]);
        if (mountedRef.current) {
          setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          setPermissionStatus('granted');
        }
      }
    } catch (e: any) {
      if (!mountedRef.current) return;
      // A fresh-fix timeout with a last-known position already served is not a
      // failure — keep 'granted' so the UI doesn't flash the enable-location UX.
      if (e?.code === 3 && (servedLastKnown || coordsRef.current)) return;
      setPermissionStatus(classifyGeoError(e));
    }
  }, []);

  const requestLocation = useCallback(async () => {
    if (Platform.OS === 'web') {
      try {
        const c = await getWebPosition();
        if (mountedRef.current) { setCoords(c); setPermissionStatus('granted'); }
      } catch (e: any) {
        if (mountedRef.current) setPermissionStatus(classifyGeoError(e));
      }
      return;
    }
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (!mountedRef.current) return;
    if (status === 'granted') {
      await fetchCoords();
      if (mountedRef.current) setPermissionStatus('granted');
    } else if (status === 'denied') {
      if (mountedRef.current) setPermissionStatus('denied');
      Alert.alert(
        'Location Permission Required',
        'Please enable location access in Settings to find nearby Providers.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openURL('app-settings:') },
        ]
      );
    }
  }, [fetchCoords]);

  // On mount: check permission without showing a dialog.
  // If already granted → fetch coords immediately so screens see 'granted' right away.
  useEffect(() => {
    if (Platform.OS === 'web') {
      // NEVER auto-prompt on load: calling getCurrentPosition while the browser
      // permission is still "prompt" re-opens the permission dialog on every
      // app open ("app randomly asks for location"). Only fetch silently when
      // already granted; otherwise wait for an explicit requestLocation() tap.
      webGeoPermissionState().then(state => {
        if (!mountedRef.current) return;
        if (state === 'granted') {
          getWebPosition()
            .then(c => {
              if (mountedRef.current) { setCoords(c); setPermissionStatus('granted'); }
            })
            .catch(() => {
              if (mountedRef.current) setPermissionStatus('denied');
            });
        } else {
          setPermissionStatus('denied');
        }
      });
      return;
    }
    Location.getForegroundPermissionsAsync().then(({ status, canAskAgain }) => {
      if (!mountedRef.current) return;
      if (status === 'granted') {
        fetchCoords();
      } else if (status === 'undetermined' && canAskAgain) {
        // LocationProvider only mounts once the user is authenticated, so this
        // is the "ask right after login" moment. Native OS dialogs show at most
        // once per install (unlike the web 'prompt' state that re-asks every
        // load — which is why the web branch above never auto-prompts), so
        // requesting here can't nag. On iOS this was previously never called:
        // the app silently stayed 'denied' and location never worked.
        Location.requestForegroundPermissionsAsync().then(({ status: s }) => {
          // The system dialog IS the location prompt — record it so HomeScreen's
          // custom sheet doesn't pop up 800ms later and ask a second time.
          Storage.saveLocationPrompted().catch(() => {});
          if (!mountedRef.current) return;
          if (s === 'granted') fetchCoords();
          else setPermissionStatus('denied');
        }).catch(() => {
          if (mountedRef.current) setPermissionStatus('denied');
        });
      } else {
        setPermissionStatus('denied');
      }
    }).catch(() => {
      if (mountedRef.current) setPermissionStatus('denied');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-check permission when the app returns to the foreground. Users who tap
  // "Open Settings to Enable" grant location in iOS Settings and come back —
  // without this, permissionStatus stays 'denied' and the Enable Location
  // sheet never goes away.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = AppState.addEventListener('change', state => {
      if (state !== 'active') return;
      Location.getForegroundPermissionsAsync().then(({ status }) => {
        if (!mountedRef.current) return;
        if (status === 'granted') fetchCoords();
      }).catch(() => {});
    });
    return () => sub.remove();
  }, [fetchCoords]);

  // Refresh every 5 minutes
  useEffect(() => {
    if (permissionStatus !== 'granted') return;
    const t = setInterval(fetchCoords, REFRESH_MS);
    return () => clearInterval(t);
  }, [fetchCoords, permissionStatus]);

  // Persist the user's canonical location to the backend whenever real coords
  // resolve. Fixes "X km away" never showing on the Provider side: a CUSTOMER never
  // had user.lat/lng saved, so bookings created without live GPS fell back to
  // 0/0 and distance couldn't be computed. Fire-and-forget — if the user isn't
  // authenticated yet the request 401s and the .catch swallows it. Deduped so
  // we only write when the position meaningfully changes.
  const lastSentRef = useRef<Coords | null>(null);
  useEffect(() => {
    if (!coords) return;
    if (coords.lat === 0 && coords.lng === 0) return;
    const prev = lastSentRef.current;
    if (prev && Math.abs(prev.lat - coords.lat) < 0.0005 && Math.abs(prev.lng - coords.lng) < 0.0005) return;
    lastSentRef.current = coords;
    apiUpdateMyLocation(coords.lat, coords.lng).catch(() => {});
  }, [coords]);

  return (
    <LocationContext.Provider value={{ coords, permissionStatus, requestLocation }}>
      {children}
    </LocationContext.Provider>
  );
}

export function useLocation(): LocationContextValue {
  const ctx = useContext(LocationContext);
  if (!ctx) throw new Error('useLocation must be used within LocationProvider');
  return ctx;
}

/** Returns coords or Sudbury fallback — never null. */
export function useCoordsOrFallback(): Coords {
  const { coords } = useLocation();
  return coords ?? SUDBURY;
}
