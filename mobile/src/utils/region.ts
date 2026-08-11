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

// ISO 4217 currency code — deploy-time default (used before login, or if a
// user's phone doesn't match a known dial code), overridden per-user once
// signed in (see setCurrencyCodeForPhone below).
const DEFAULT_CURRENCY_CODE: string =
  (process.env.EXPO_PUBLIC_CURRENCY as string | undefined) || 'CAD';

let currentCurrencyCode = DEFAULT_CURRENCY_CODE;

// Dial-code → currency. Mirrors CountryPicker.tsx's supported countries
// (CA/US/UK/NP). +1 covers both CA and US with different currencies — since
// CountryPicker only records the dial code on the phone string (not which of
// the two the user actually picked) and the business is Canada-based, +1
// defaults to CAD rather than trying to guess US vs Canada from area code.
const DIAL_CODE_CURRENCY: [prefix: string, currency: string][] = [
  ['+977', 'NPR'],
  ['+44', 'GBP'],
  ['+1', 'CAD'],
];

function currencyCodeForPhone(phone?: string | null): string {
  if (!phone) return DEFAULT_CURRENCY_CODE;
  const match = DIAL_CODE_CURRENCY.find(([prefix]) => phone.startsWith(prefix));
  return match ? match[1] : DEFAULT_CURRENCY_CODE;
}

/** Called from AuthContext whenever the signed-in user (or their phone) changes. */
export function setCurrencyCodeForPhone(phone?: string | null): void {
  currentCurrencyCode = currencyCodeForPhone(phone);
}

export function getCurrencyCode(): string {
  return currentCurrencyCode;
}
