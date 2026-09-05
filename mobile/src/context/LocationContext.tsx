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
import { reverseGeocodeOSM } from '../utils/reverseGeocode';
import { DEFAULT_REGION, setCurrencyCodeForGpsCountry } from '../utils/region';

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
  /** Resolves with the freshly-fetched coords (or null if denied/unavailable). */
  requestLocation: () => Promise<Coords | null>;
}

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

  const fetchCoords = useCallback(async (): Promise<Coords | null> => {
    let servedLastKnown = false;
    // Hoisted out of the try so the catch can still SEE the last-known
    // position we already served. Previously the catch returned
    // coordsRef.current instead, which is synced by a useEffect and therefore
    // has not updated yet at the moment the catch runs in this same async
    // call — so a first fix returned null while holding a perfectly good
    // coordinate. See the catch for what that broke.
    let served: Coords | null = null;
    try {
      if (Platform.OS === 'web') {
        const c = await getWebPosition();
        if (mountedRef.current) { setCoords(c); setPermissionStatus('granted'); }
        return c;
      } else {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== 'granted') {
          if (mountedRef.current) setPermissionStatus('denied');
          return null;
        }
        // iOS: getCurrentPositionAsync has no timeout and can hang for minutes
        // indoors while CoreLocation waits for a fresh fix — the app looked
        // like "location doesn't work". Serve the OS-cached last known
        // position instantly (seconds old in practice), then refine with a
        // fresh fix capped at 15s so a cold GPS can never wedge this path.
        const last = await Location.getLastKnownPositionAsync().catch(() => null);
        servedLastKnown = !!last;
        let latest: Coords | null = null;
        if (last && mountedRef.current) {
          latest = { lat: last.coords.latitude, lng: last.coords.longitude };
          served = latest;
          setCoords(latest);
          setPermissionStatus('granted');
        }
        const pos = await Promise.race([
          Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(Object.assign(new Error('location timeout'), { code: 3 })), 15_000),
          ),
        ]);
        latest = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        if (mountedRef.current) {
          setCoords(latest);
          setPermissionStatus('granted');
        }
        return latest;
      }
    } catch (e: any) {
      if (!mountedRef.current) return null;
      // A fresh fix failing when we ALREADY have a usable position is not a
      // failure — keep 'granted' so the UI doesn't flash the enable-location UX,
      // and hand back the position we have.
      //
      // Two bugs fixed here, both of which made "Use current location" report
      // "Location unavailable" while a good coordinate was in hand:
      //
      // 1. It returned coordsRef.current, which a useEffect syncs AFTER render.
      //    In this same async call setCoords() has only been queued, so on a
      //    first fix the ref is still null and this returned null. `served` is
      //    a plain local, correct immediately.
      // 2. It only forgave code 3 (our own 15s timeout). A genuine
      //    CoreLocation failure — routine indoors — threw the served position
      //    away instead. Any fresh-fix error is now survivable as long as we
      //    actually have something to serve.
      const fallback = served ?? coordsRef.current;
      if (fallback && (servedLastKnown || coordsRef.current)) return fallback;
      setPermissionStatus(classifyGeoError(e));
      return null;
    }
  }, []);

  const requestLocation = useCallback(async (): Promise<Coords | null> => {
    if (Platform.OS === 'web') {
      try {
        const c = await getWebPosition();
        if (mountedRef.current) { setCoords(c); setPermissionStatus('granted'); }
        return c;
      } catch (e: any) {
        if (mountedRef.current) setPermissionStatus(classifyGeoError(e));
        return null;
      }
    }
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (!mountedRef.current) return null;
    if (status === 'granted') {
      const c = await fetchCoords();
      if (mountedRef.current) setPermissionStatus('granted');
      return c;
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
    return null;
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

  // Refine the currency/country guess from real GPS whenever coords resolve
  // or meaningfully move — the most precise signal available short of an
  // explicit phone number or CountryPicker choice (see region.ts PRIORITY).
  // expo-location's reverseGeocodeAsync always returns [] on web (the
  // Geocoding API was removed from the web shim in Expo SDK 49) — this
  // effect used to just bail out on web entirely, silently leaving GPS-based
  // currency detection permanently broken there ("use current location isn't
  // working"). Use OpenStreetMap's free Nominatim API on web instead, same
  // fallback HomeScreen.tsx/CreateBookingScreen.tsx already use for the
  // identical reason (this app's own city-name pill).
  const lastGeocodedRef = useRef<Coords | null>(null);
  useEffect(() => {
    if (!coords) return;
    if (coords.lat === 0 && coords.lng === 0) return;
    const prev = lastGeocodedRef.current;
    if (prev && Math.abs(prev.lat - coords.lat) < 0.0005 && Math.abs(prev.lng - coords.lng) < 0.0005) return;
    lastGeocodedRef.current = coords;

    if (Platform.OS === 'web') {
      reverseGeocodeOSM(coords.lat, coords.lng)
        .then(osm => { if (osm?.countryCode) setCurrencyCodeForGpsCountry(osm.countryCode); })
        .catch(() => {});
      return;
    }

    // OSM as a gap-filler here too: getting the country wrong (or not at
    // all) means the whole app prices in the wrong currency, and Apple's
    // geocoder returning nothing at all is a real outcome in the places
    // this ships to.
    Location.reverseGeocodeAsync({ latitude: coords.lat, longitude: coords.lng })
      .then(async results => {
        const isoCountryCode = results?.[0]?.isoCountryCode;
        if (isoCountryCode) { setCurrencyCodeForGpsCountry(isoCountryCode); return; }
        const osm = await reverseGeocodeOSM(coords.lat, coords.lng);
        if (osm?.countryCode) setCurrencyCodeForGpsCountry(osm.countryCode);
      })
      .catch(() => {});
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

/** Returns coords or the default-region fallback — never null. */
export function useCoordsOrFallback(): Coords {
  const { coords } = useLocation();
  return coords ?? DEFAULT_REGION;
}
