import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { apiSavePushToken, apiGetBooking } from '../api/client';
import { navigationRef } from './navigationRef';

const PROJECT_ID: string =
  (Constants.expoConfig?.extra?.eas?.projectId as string) ??
  '25965512-6c64-472e-8d96-4b714decadfe';

// Set the foreground-notification handler ONCE at module load (native only). Doing it
// here — not only inside initNotifications — guarantees foreground pushes show even
// before/without sign-in flow timing. iOS needs shouldShowBanner/shouldShowList (SDK 52).
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }) as any,
  });
}

/**
 * Call once after sign-in for any role.
 * Requests permission, gets push token with projectId, saves to server.
 * Works on Android, iOS, and web PWA (Expo SDK 52 handles web push via same API).
 */
export async function initNotifications(): Promise<void> {
  // Web PWA: request browser Notification permission, then register SW push if available
  if (Platform.OS === 'web') {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission === 'denied') return;
    if (Notification.permission === 'default') {
      // Must be triggered from a user-gesture context; best-effort here
      await (Notification as any).requestPermission().catch(() => {});
    }
    // Try to register a service-worker push subscription for background notifications
    if ('serviceWorker' in navigator && 'PushManager' in window && Notification.permission === 'granted') {
      try {
        const reg = await navigator.serviceWorker.ready;
        // Check if already subscribed
        const existing = await reg.pushManager.getSubscription();
        if (!existing) {
          // We don't have a VAPID key set up — skip push subscription
          // Browser notifications via Notification API work when app is open (foreground)
          // Background push requires VAPID server setup; use socket.io for real-time instead
        }
      } catch {
        // Not critical — in-app banner + foreground Notification API still works
      }
    }
    return;
  }

  // Handler is set at module load (see top of file).
  if (Platform.OS === 'android') {
    // General alerts, approvals, status updates.
    await Notifications.setNotificationChannelAsync('default', {
      name: 'General',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#0066FF',
      sound: 'default',
    });
    // New nearby job alerts — MAX importance for heads-up pop-over.
    await Notifications.setNotificationChannelAsync('jobs', {
      name: 'New Job Alerts',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 300, 100, 300],
      lightColor: '#0066FF',
      sound: 'default',
      enableLights: true,
      enableVibrate: true,
    });
    // Dedicated booking requests to a Provider.
    await Notifications.setNotificationChannelAsync('requests', {
      name: 'Booking Requests',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 300, 100, 300],
      lightColor: '#0066FF',
      sound: 'default',
      enableLights: true,
      enableVibrate: true,
    });
    // In-booking chat messages.
    await Notifications.setNotificationChannelAsync('chat', {
      name: 'Messages',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 150],
      lightColor: '#0066FF',
      sound: 'default',
    });
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;
  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') return;

  try {
    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId: PROJECT_ID });
    await apiSavePushToken(tokenData.data);
  } catch (e) {
    console.warn('[notifications] push token registration failed:', e);
  }
}

/**
 * Schedule an immediate local notification (foreground alert).
 * No-op on web.
 */
export function scheduleLocal(
  title: string,
  body: string,
  data: Record<string, string> = {},
): void {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body, icon: '/icon-192.png', tag: data.bookingId ?? title });
    }
    return;
  }
  Notifications.scheduleNotificationAsync({
    content: { title, body, data, sound: 'default' },
    trigger: null,
  }).catch(() => {});
}

/**
 * Register the notification-tap listener for deep linking.
 * Call once per role navigator. Returns subscription — call .remove() on unmount.
 */
export function addTapListener(
  role: 'Provider' | 'CUSTOMER',
): Notifications.EventSubscription {
  return Notifications.addNotificationResponseReceivedListener(async response => {
    if (!navigationRef.isReady()) return;
    const data = (response.notification.request.content.data ?? {}) as Record<string, string>;

    if (role === 'Provider') {
      if (data.type === 'approved') {
        (navigationRef as any).navigate('ProviderHome');
      } else if (data.type === 'request') {
        (navigationRef as any).navigate('Requests');
      } else if (data.type === 'job') {
        (navigationRef as any).navigate('ProviderHome', { screen: 'NearbyJobs' });
      } else if (data.bookingId) {
        (navigationRef as any).navigate('ProviderHome', { screen: 'MyJobs' });
      }
      return;
    }

    if (role === 'CUSTOMER' && data.bookingId) {
      try {
        const { booking } = await apiGetBooking(data.bookingId);
        // For an in-progress booking (Provider accepted / on the way / arrived) deep-link
        // straight to live Tracking — that's what the customer wants to see when the
        // Provider says "I'm on my way / arrived". Completed/other → booking detail.
        const active = ['REQUESTED', 'ACCEPTED', 'ON_MY_WAY', 'STARTED'].includes(booking.status);
        if (active) {
          (navigationRef as any).navigate('Tracking', {
            bookingId: booking._id,
            bookingLocation: booking.lat ? { lat: booking.lat, lng: booking.lng } : undefined,
          });
        } else {
          (navigationRef as any).navigate('BookingDetail', { booking });
        }
      } catch {
        (navigationRef as any).navigate('Home');
      }
    }
  });
}
