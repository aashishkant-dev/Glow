import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';
import { apiMyJobs, apiUpdateProviderLocation, apiUpdateMyLocation } from '../api/client';
import {
  startBackgroundLocation,
  stopBackgroundLocation,
} from '../services/backgroundLocation';
import { webGeoPermissionState } from '../context/LocationContext';

const ACTIVE_STATUSES = ['ACCEPTED', 'ON_MY_WAY', 'STARTED'];
const JOB_POLL_MS = 20_000;  // refresh which booking is active
const SEND_MS     = 5_000;   // how often to push GPS while a job is active
// After this many consecutive job-poll failures, nil the active booking id so
// we don't keep broadcasting stale updates for a booking that ended server-side
// (e.g. session expired and the API returns 401 every tick).
const MAX_JOB_POLL_FAILURES = 5;

/**
 * App-wide Provider live-location broadcast.
 *
 * Previously the only GPS sender lived inside ProviderDashboardScreen, so a Provider who
 * navigated to any other screen (JobDetail, Earnings…) stopped transmitting and
 * the customer's tracking map froze. This hook lifts that responsibility to the
 * navigation root: while the Provider has an active job AND the app is foregrounded,
 * it pushes location every 5s regardless of the visible screen.
 *
 * Background coverage: when an active job is detected it also starts an OS-driven
 * background location task (see services/backgroundLocation) so updates continue
 * when the phone is locked / the app is backgrounded while the Provider drives. That
 * task requires "Always" permission; if the Provider declines, this foreground loop
 * still covers the app-open case. No-ops for non-Provider roles and on web.
 */
export function useProviderLocationBroadcast(role: string | undefined) {
  // Latest active booking id, read by the send loop without re-subscribing it.
  const activeJobIdRef = useRef<string | null>(null);
  // Count consecutive job-poll failures. Reset to 0 on any success.
  const pollFailureCountRef = useRef(0);
  // On web: track whether the browser's geolocation API returned PERMISSION_DENIED
  // (code 1). Once denied we stop calling getCurrentPosition on every 5s tick
  // — there is no point and it floods the browser console.
  const webGeoPermDeniedRef = useRef(false);
  // Mirror cache for 'granted': once granted, skip the permissions query on
  // every 5s tick (the answer won't change mid-session).
  const webGeoPermGrantedRef = useRef(false);

  useEffect(() => {
    if (role !== 'Provider') return;
    // Guard: on web, window is always defined in a real browser. This handles
    // any hypothetical SSR path where `window` may be missing. The previous
    // version had `typeof window === 'undefined' && Platform.OS === 'web'`
    // which can never both be true simultaneously — corrected to `||`.
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return;

    let jobTimer: ReturnType<typeof setInterval> | undefined;
    let sendTimer: ReturnType<typeof setInterval> | undefined;
    let cancelled = false;

    // Sync the OS background-location task to the active job. Starting it is
    // idempotent; only act on transitions so we don't re-request perms each poll.
    function syncBackgroundTask(nextId: string | null) {
      const prevId = activeJobIdRef.current;
      if (nextId === prevId) return;
      if (Platform.OS === 'web') return;
      if (nextId) startBackgroundLocation(nextId).catch(() => {});
      else stopBackgroundLocation().catch(() => {});
    }

    async function refreshActiveJob() {
      try {
        const { bookings } = await apiMyJobs();
        if (cancelled) return;
        pollFailureCountRef.current = 0; // reset streak on success
        const active = bookings.find(b => ACTIVE_STATUSES.includes(b.status));
        const nextId = active?._id ?? null;
        syncBackgroundTask(nextId);
        activeJobIdRef.current = nextId;
      } catch {
        if (!cancelled) {
          pollFailureCountRef.current += 1;
          // After MAX_JOB_POLL_FAILURES consecutive failures we assume the active
          // booking is no longer valid (session expired, server unreachable).
          // Clear the id so sendLocation() becomes a no-op until the next success.
          if (pollFailureCountRef.current >= MAX_JOB_POLL_FAILURES) {
            syncBackgroundTask(null);
            activeJobIdRef.current = null;
          }
        }
      }
    }

    // Push the freshest coords: ALWAYS update the Provider's canonical location (so
    // "X km away" on Requests/Find Jobs works even with no active job), and ALSO
    // push the live booking location when a job is active (for customer tracking).
    function pushCoords(lat: number, lng: number) {
      if (cancelled) return;
      apiUpdateMyLocation(lat, lng).catch(() => {});
      const bookingId = activeJobIdRef.current;
      if (bookingId) apiUpdateProviderLocation(bookingId, lat, lng).catch(() => {});
    }

    async function sendLocation() {
      if (Platform.OS === 'web') {
        if (!navigator.geolocation) return;
        // Once we know permission is denied, stop asking every 5s — the answer
        // won't change until the user manually re-enables it in browser settings.
        if (webGeoPermDeniedRef.current) return;
        // Silent permission check first: calling getCurrentPosition while the
        // browser is still in the "prompt" state re-opens the permission dialog
        // on every 5s tick. Broadcast only once the user has granted (via an
        // explicit requestLocation() elsewhere); 'unknown' (no Permissions API)
        // falls through to preserve old behaviour on legacy browsers.
        if (!webGeoPermGrantedRef.current) {
          const permState = await webGeoPermissionState();
          if (permState === 'denied') { webGeoPermDeniedRef.current = true; return; }
          if (permState === 'prompt') return;
          if (permState === 'granted') webGeoPermGrantedRef.current = true;
        }
        navigator.geolocation.getCurrentPosition(
          pos => pushCoords(pos.coords.latitude, pos.coords.longitude),
          err => {
            // GeolocationPositionError codes:
            //   1 = PERMISSION_DENIED  — permanent until user re-enables
            //   2 = POSITION_UNAVAILABLE — transient hardware/signal issue
            //   3 = TIMEOUT — transient; retry next tick
            if (err.code === 1) {
              webGeoPermDeniedRef.current = true;
            }
          },
          { timeout: 4000, maximumAge: 10_000 },
        );
      } else {
        try {
          const Location = await import('expo-location');
          const { status } = await Location.getForegroundPermissionsAsync();
          if (status !== 'granted') return;
          const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          pushCoords(pos.coords.latitude, pos.coords.longitude);
        } catch {
          // Permission revoked mid-session / GPS hardware unavailable — skip tick.
        }
      }
    }

    function start() {
      if (jobTimer || sendTimer) return; // double-start guard
      refreshActiveJob();
      sendLocation();
      jobTimer  = setInterval(refreshActiveJob, JOB_POLL_MS);
      sendTimer = setInterval(sendLocation, SEND_MS);
    }

    function stop() {
      if (jobTimer)  { clearInterval(jobTimer);  jobTimer  = undefined; }
      if (sendTimer) { clearInterval(sendTimer); sendTimer = undefined; }
    }

    // Pause loops while backgrounded so we don't spam failing geolocation calls.
    const onAppState = (state: AppStateStatus) => {
      if (state === 'active') start();
      else stop();
    };
    const sub = AppState.addEventListener('change', onAppState);

    // AppState.currentState can be 'unknown' on web at the very first render tick.
    // Treat anything that isn't an explicit background/inactive as foreground so
    // the hook starts immediately on both web and native.
    if (AppState.currentState !== 'background' && AppState.currentState !== 'inactive') {
      start();
    }

    return () => {
      cancelled = true;
      sub.remove();
      stop();
      // Tear down the background task too (e.g. role change / logout). If a job
      // is genuinely still active the next mount's poll will restart it.
      if (Platform.OS !== 'web') stopBackgroundLocation().catch(() => {});
      activeJobIdRef.current = null;
      pollFailureCountRef.current = 0;
    };
  }, [role]);
}
