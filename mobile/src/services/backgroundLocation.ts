import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { apiUpdateProviderLocation } from '../api/client';

/**
 * Background Provider location updates — keeps the customer's tracking map live even
 * when the Provider's phone is locked or the app is backgrounded while they drive.
 *
 * The foreground path (useProviderLocationBroadcast) handles the app-open case. This
 * module supplements it with an OS-driven background location task that runs
 * under a foreground service (Android) / `location` background mode (iOS).
 *
 * Headless-safe: the task module is imported for its side effect (defineTask)
 * at app startup. It reads the active booking id from AsyncStorage (React state
 * is unavailable in the background JS context) and posts via apiUpdateProviderLocation,
 * which itself pulls the auth token from SecureStore + base URL from env.
 *
 * Web is a no-op — there is no RN background task on web.
 */

export const BACKGROUND_LOCATION_TASK = 'glow-background-location';
const ACTIVE_BOOKING_KEY = '@glow/active-booking-id';

// ── Persisted active booking id (the only state shared with the headless task) ──
export async function setBackgroundActiveBooking(bookingId: string | null): Promise<void> {
  try {
    if (bookingId) await AsyncStorage.setItem(ACTIVE_BOOKING_KEY, bookingId);
    else await AsyncStorage.removeItem(ACTIVE_BOOKING_KEY);
  } catch {
    // storage failure is non-fatal — foreground path still broadcasts
  }
}

async function getBackgroundActiveBooking(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(ACTIVE_BOOKING_KEY);
  } catch {
    return null;
  }
}

// ── The background task (defined once, at module load, top-level) ──
// Native only. TaskManager isn't available on web and defineTask would throw.
if (Platform.OS !== 'web') {
  TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }: any) => {
    if (error) return;
    const bookingId = await getBackgroundActiveBooking();
    if (!bookingId) return; // job ended — nothing to report (stop is also requested below)

    const locations = data?.locations;
    if (!locations || locations.length === 0) return;
    // Use the most recent fix only — no point replaying a batch.
    const { latitude, longitude } = locations[locations.length - 1].coords;
    try {
      await apiUpdateProviderLocation(bookingId, latitude, longitude);
    } catch {
      // network/auth error — next OS callback retries
    }
  });
}

/**
 * Start background location updates for an active job. Idempotent. Requires the
 * caller to already hold FOREGROUND permission; this requests BACKGROUND ("Always")
 * permission and silently no-ops if the user declines (foreground path still works).
 */
export async function startBackgroundLocation(bookingId: string): Promise<void> {
  if (Platform.OS === 'web') return;
  await setBackgroundActiveBooking(bookingId);
  try {
    // Never surface the "Always allow" OS dialog out of the blue: only escalate
    // to background permission when foreground location was already granted
    // (i.e. the Provider has knowingly enabled location for the app).
    const fg = await Location.getForegroundPermissionsAsync();
    if (fg.status !== 'granted') return;
    const { status } = await Location.requestBackgroundPermissionsAsync();
    if (status !== 'granted') return; // user kept it foreground-only — that's fine

    const already = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK).catch(() => false);
    if (already) return;

    await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
      accuracy: Location.Accuracy.Balanced,
      // iOS: tell CoreLocation this is a Provider driving to a visit so it tunes the
      // sensor profile for navigation and doesn't auto-pause us mid-trip.
      activityType: Location.ActivityType.OtherNavigation,
      // Throttle so we don't drain the battery — ~every 15s / 50m, whichever first.
      timeInterval: 15_000,
      distanceInterval: 50,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true, // iOS: blue bar, required honesty
      foregroundService: {
        notificationTitle: 'Glow — sharing your location',
        notificationBody: 'Your client can see your arrival while you\'re on this job.',
        notificationColor: '#B76E79',
      },
    });
  } catch {
    // start failure (e.g. perms race) — foreground broadcast still covers app-open
  }
}

/** Stop background location updates and clear the persisted booking id. */
export async function stopBackgroundLocation(): Promise<void> {
  if (Platform.OS === 'web') return;
  await setBackgroundActiveBooking(null);
  try {
    const started = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK).catch(() => false);
    if (started) await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
  } catch {
    // already stopped / task unknown — nothing to do
  }
}
