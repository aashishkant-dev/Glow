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
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import * as Localization from 'expo-localization';

export interface RegionCoords {
  lat: number;
  lng: number;
}

export const DEFAULT_REGION: RegionCoords = {
  lat: parseFloat(process.env.EXPO_PUBLIC_REGION_LAT as string) || 27.7172,
  lng: parseFloat(process.env.EXPO_PUBLIC_REGION_LNG as string) || 85.3240,
};

export const DEFAULT_REGION_NAME: string =
  (process.env.EXPO_PUBLIC_REGION_NAME as string | undefined) || 'Kathmandu, Nepal';

// ISO 4217 currency code — deploy-time default (used before login, or if a
// user's country can't be resolved), overridden per-user once signed in (see
// setCurrencyCodeForPhone / setCurrencyCodeFromLocaleHint below).
const DEFAULT_CURRENCY_CODE: string =
  (process.env.EXPO_PUBLIC_CURRENCY as string | undefined) || 'CAD';

// Deploy-time default country (drives regionally-relevant "looks" on Home
// before login/detection, same spirit as DEFAULT_CURRENCY_CODE) — falls back
// to the launch market (Nepal), matching DEFAULT_REGION above.
const DEFAULT_COUNTRY_CODE: string =
  (process.env.EXPO_PUBLIC_REGION_COUNTRY as string | undefined) || 'NP';

let currentCurrencyCode = DEFAULT_CURRENCY_CODE;
// ISO 3166-1 alpha-2, set alongside currency from the same phone/locale
// signals — lets other features (e.g. regionally-relevant "looks" on Home)
// key off the user's actual country instead of re-deriving it themselves.
let currentCountryCode: string | null = DEFAULT_COUNTRY_CODE;

// Several signals can name a country for the same session (device locale at
// boot, a Google/Apple sign-in hint, live GPS, an explicit CountryPicker tap,
// a verified phone number) and they don't all arrive in a fixed order — GPS
// keeps refreshing every few minutes, for instance, and shouldn't be allowed
// to stomp a phone number just because it happened to run more recently. A
// priority number per signal (higher = more trustworthy) replaces the old
// "whoever calls last wins" behaviour: a signal only takes effect if it's at
// least as trustworthy as whatever is currently applied.
const PRIORITY = {
  DEFAULT: 0,
  LOCALE: 1,   // device locale at boot, or a Google/Apple sign-in locale hint
  GPS: 2,      // reverse-geocoded live location — more precise than a locale guess
  PICKER: 3,   // explicit CountryPicker selection during phone signup
  PHONE: 4,    // a real, parseable phone number — the strongest signal
} as const;
let currentPriority: number = PRIORITY.DEFAULT;

// ISO 3166-1 alpha-2 country → ISO 4217 currency. CountryPicker.tsx's phone
// signup only offers CA/US/GB/NP today, but this list is deliberately wider:
// a Google sign-in locale hint (see setCurrencyCodeFromLocaleHint) can name
// any country in the world, not just the four the phone picker supports, and
// a phone number itself can belong to any of them if entered manually.
const COUNTRY_CURRENCY: Record<string, string> = {
  US: 'USD', CA: 'CAD', GB: 'GBP', NP: 'NPR',
  IN: 'INR', PK: 'PKR', BD: 'BDT', LK: 'LKR', BT: 'BTN', MV: 'MVR',
  CN: 'CNY', JP: 'JPY', KR: 'KRW', HK: 'HKD', TW: 'TWD',
  AU: 'AUD', NZ: 'NZD', SG: 'SGD', MY: 'MYR', TH: 'THB', PH: 'PHP', ID: 'IDR', VN: 'VND', MM: 'MMK', KH: 'KHR', LA: 'LAK',
  AE: 'AED', SA: 'SAR', QA: 'QAR', KW: 'KWD', BH: 'BHD', OM: 'OMR', JO: 'JOD', IL: 'ILS', LB: 'LBP',
  FR: 'EUR', DE: 'EUR', ES: 'EUR', IT: 'EUR', NL: 'EUR', BE: 'EUR', IE: 'EUR', PT: 'EUR', AT: 'EUR', FI: 'EUR', GR: 'EUR', LU: 'EUR',
  CH: 'CHF', SE: 'SEK', NO: 'NOK', DK: 'DKK', IS: 'ISK',
  PL: 'PLN', CZ: 'CZK', HU: 'HUF', RO: 'RON', BG: 'BGN', HR: 'EUR', UA: 'UAH',
  RU: 'RUB', TR: 'TRY',
  ZA: 'ZAR', NG: 'NGN', KE: 'KES', GH: 'GHS', EG: 'EGP', MA: 'MAD', ET: 'ETB', TZ: 'TZS', UG: 'UGX',
  BR: 'BRL', MX: 'MXN', AR: 'ARS', CL: 'CLP', CO: 'COP', PE: 'PEN',
};

/** Normalizes then applies a resolved country, setting both the currency and
 *  the raw country code together so the two can never drift out of sync.
 *  Refuses a signal that's less trustworthy than whatever's already applied
 *  (see PRIORITY above) so a stale/weaker source can't undo a stronger one. */
function applyCountry(country: string | null | undefined, priority: number): boolean {
  if (!country) return false;
  const code = country.toUpperCase();
  const currency = COUNTRY_CURRENCY[code];
  if (!currency) return false;
  if (priority < currentPriority) return false;
  currentCountryCode = code;
  currentCurrencyCode = currency;
  currentPriority = priority;
  return true;
}

/** Resolves a phone number's real country (any country, not just CA/US/GB/NP)
 *  via libphonenumber-js — replaces a hand-rolled 3-entry dial-code prefix
 *  table that couldn't tell US from Canada (both +1) and returned nothing for
 *  any country outside NP/GB/+1. */
function countryForPhone(phone?: string | null): string | undefined {
  if (!phone) return undefined;
  try {
    return parsePhoneNumberFromString(phone)?.country;
  } catch {
    return undefined;
  }
}

/** Called from AuthContext whenever the signed-in user's phone changes. A
 *  phone-derived country is the most reliable signal we have, so this always
 *  wins over a locale-based guess — but an unresolvable/absent phone leaves
 *  the current value alone (e.g. a locale hint set right after Google sign-in,
 *  before a phone is on file) rather than snapping back to the deploy default. */
export function setCurrencyCodeForPhone(phone?: string | null): void {
  applyCountry(countryForPhone(phone), PRIORITY.PHONE);
}

// Bare language code (no region subtag, e.g. locale === "ne" not "ne-NP") —
// common on Android/web Google accounts. Only mapped where the language is
// unambiguous enough to guess a country from alone; deliberately excludes
// widely-spoken languages like English or French (spoken natively across many
// countries with different currencies) where guessing wrong is worse than
// falling through to the deploy default.
const LANGUAGE_ONLY_COUNTRY: Record<string, string> = {
  ne: 'NP',
};

/** Best-effort country/currency guess from a Google ID token's `locale` claim
 *  (e.g. "ne-NP", "en-US") — used right after Google sign-in, only until (and
 *  unless) a real phone number is on file. A Google account's language
 *  preference isn't the same thing as where someone actually is, so this is
 *  deliberately a weaker signal than setCurrencyCodeForPhone and never runs
 *  after a phone-derived currency has already been set for this session. */
export function setCurrencyCodeFromLocaleHint(locale?: string | null): void {
  if (!locale) return;
  const [lang, region] = locale.split(/[-_]/);
  applyCountry(region ?? LANGUAGE_ONLY_COUNTRY[lang?.toLowerCase()], PRIORITY.LOCALE);
}

/** Baseline signal applied once at app boot, independent of which sign-in
 *  method is used — Apple's identity token carries no locale claim at all
 *  (unlike Google's, see setCurrencyCodeFromLocaleHint above), so without
 *  this an Apple-only user with no phone on file stayed on the deploy
 *  default until GPS or a phone resolved. The device's own region setting
 *  is available immediately, no network or permission required. */
export function setCurrencyCodeFromDeviceLocale(): void {
  try {
    const region = Localization.getLocales?.()?.[0]?.regionCode;
    applyCountry(region, PRIORITY.LOCALE);
  } catch {
    // Localization API unavailable in this environment — leave current value.
  }
}

/** Highest-precision signal short of an explicit phone/picker: a reverse-
 *  geocoded ISO country from the user's live GPS coords (see LocationContext,
 *  which calls this whenever coords resolve or meaningfully change). Beats a
 *  locale guess since it's the user's actual current location, but still
 *  yields to an explicit phone number or CountryPicker choice. */
export function setCurrencyCodeForGpsCountry(isoCountryCode?: string | null): void {
  applyCountry(isoCountryCode, PRIORITY.GPS);
}

/** Called the moment a user picks a country in CountryPicker.tsx during phone
 *  signup — before they've even typed a number, let alone finished OTP
 *  verification. The picker's own country IS the real country (unlike the
 *  Google locale hint, which is only ever a guess), so this is at least as
 *  trustworthy as the eventual phone-derived value and gets the right
 *  currency showing immediately instead of only after signup completes. */
export function setCurrencyCodeForCountryCode(code: string): void {
  applyCountry(code === 'UK' ? 'GB' : code, PRIORITY.PICKER);
}

/** Called on sign-out so the next signed-out/guest view shows the deploy
 *  default rather than a previous user's currency/country lingering in memory. */
export function resetCurrencyCode(): void {
  currentCurrencyCode = DEFAULT_CURRENCY_CODE;
  currentCountryCode = DEFAULT_COUNTRY_CODE;
  currentPriority = PRIORITY.DEFAULT;
}

export function getCurrencyCode(): string {
  return currentCurrencyCode;
}

/** ISO 3166-1 alpha-2 country code for the signed-in user, or null if never
 *  resolved (no phone yet, no usable locale hint, or deploy default only). */
export function getCountryCode(): string | null {
  return currentCountryCode;
}
