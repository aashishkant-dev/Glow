/**
 * Free reverse geocoding via OpenStreetMap's Nominatim — the same key-free
 * OSM stack the maps already use, and the gap-filler for Apple's geocoder,
 * which routinely returns a null `city` outside large US/EU cities. This app
 * ships to Kathmandu, so that is the normal case here, not the edge case.
 *
 * WHY THIS FILE EXISTS, rather than three inline fetches:
 *
 * Every one of those fetches sent no User-Agent, and Nominatim's usage
 * policy requires an identifying one ("stock User-Agents as set by http
 * libraries will not do"). It does not degrade politely — it answers
 * 403 Access denied. Verified directly against the real service at the
 * app's own region centre:
 *
 *   no User-Agent            -> 403  "Access denied. See .../policies/nominatim/"
 *   User-Agent: Glow/1.0 ... -> 200  city "Kathmandu Metropolitan City",
 *                                    postcode "21255", road "Kailashchaur Marga"
 *
 * So the native gap-filler that was supposed to fix "city and postal code
 * don't autofill" was itself being rejected on every call, and a bare
 * `catch { return null }` turned that into silence indistinguishable from
 * "this address genuinely has no city". Hence also: a real timeout, and a
 * dev-visible reason on failure.
 */
import { Platform } from 'react-native';

// Identifies the app to Nominatim per its usage policy. The bundle
// identifier, not a person or an email — it is enough to identify the
// client and carries no user data.
const NOMINATIM_USER_AGENT = 'Glow/1.0 (com.glowbeauty.app)';

// Nominatim asks for at most 1 request/second and is a volunteer service.
// Every caller in this app is a one-shot on a real user action (open the
// home screen, tap "use current location"), never a poll.
const DEFAULT_TIMEOUT_MS = 8000;

export interface OsmAddress {
  street: string | null;
  city: string | null;
  region: string | null;
  postal: string | null;
  countryCode: string | null;
  /** The raw `address` object, for callers that format their own label. */
  raw: Record<string, string | undefined>;
}

export async function reverseGeocodeOSM(
  lat: number,
  lng: number,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<OsmAddress | null> {
  // Browsers forbid scripts from setting User-Agent and will strip it, but
  // they send a real browser one (and a Referer) of their own, which
  // already satisfies the policy — so only native needs the explicit header.
  const headers: Record<string, string> = { 'Accept-Language': 'en' };
  if (Platform.OS !== 'web') headers['User-Agent'] = NOMINATIM_USER_AGENT;

  // Without this a hung request leaves the caller's spinner up forever with
  // no alert and no way out — there is no default fetch timeout.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
      { headers, signal: controller.signal },
    );
    if (!res.ok) {
      // Loud on purpose. A 403 here is a configuration problem on our side,
      // not a property of the address being looked up, and the previous
      // silent null made those indistinguishable for two rounds of "the
      // city still doesn't autofill".
      console.warn(`[reverseGeocode] Nominatim returned ${res.status} — address lookup unavailable`);
      return null;
    }
    const addr = (await res.json())?.address as Record<string, string | undefined> | undefined;
    if (!addr) return null;
    return {
      street: [addr.house_number, addr.road].filter(Boolean).join(' ') || null,
      // OSM files a place under whichever tag fits its size, so a single
      // `city` lookup misses most of the world.
      city: addr.city || addr.town || addr.village || addr.municipality || addr.suburb || addr.city_district || addr.county || null,
      region: addr.state || addr.region || addr.county || null,
      postal: addr.postcode || null,
      countryCode: addr.country_code ? addr.country_code.toUpperCase() : null,
      raw: addr,
    };
  } catch (err) {
    const aborted = (err as { name?: string })?.name === 'AbortError';
    console.warn(`[reverseGeocode] Nominatim lookup ${aborted ? `timed out after ${timeoutMs}ms` : 'failed'}`,
      aborted ? '' : (err instanceof Error ? err.message : err));
    return null;
  } finally {
    clearTimeout(timer);
  }
}
