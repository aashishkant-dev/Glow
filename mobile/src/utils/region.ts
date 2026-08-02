/**
 * Default service-region config — the map centre and display name used ONLY
 * as a last resort when neither the user nor a Provider has shared real GPS
 * yet. Every screen that previously hardcoded its own city/coords (some said
 * Sudbury, some said Kathmandu — they disagreed) now reads this single
 * source, driven by build-time env vars so a new deployment can launch in a
 * different city without touching source.
 *
 * Mirrors the backend's DEFAULT_REGION_LAT/LNG/NAME (src/routes/customer.js,
 * src/routes/provider.js) — keep both in sync when changing the launch city.
 */
export interface RegionCoords {
  lat: number;
  lng: number;
}

export const DEFAULT_REGION: RegionCoords = {
  lat: parseFloat(process.env.EXPO_PUBLIC_REGION_LAT as string) || 46.4917,
  lng: parseFloat(process.env.EXPO_PUBLIC_REGION_LNG as string) || -80.9930,
};

export const DEFAULT_REGION_NAME: string =
  (process.env.EXPO_PUBLIC_REGION_NAME as string | undefined) || 'Greater Sudbury, ON';

// ISO 4217 currency code for this deployment — one platform, one currency,
// set at deploy time. Not per-user: this app serves a single region (see
// module doc above), there's no country field on User, and customers/artists
// in one booking are always in the same market.
export const CURRENCY_CODE: string =
  (process.env.EXPO_PUBLIC_CURRENCY as string | undefined) || 'CAD';
