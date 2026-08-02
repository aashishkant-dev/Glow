/** "MAKEUP_ARTIST" → "Makeup Artist". Backend enums are SCREAMING_SNAKE_CASE;
 * every customer-facing surface should show them title-cased with spaces. */
export function humanizeQualification(raw?: string | null): string {
  if (!raw) return '';
  return raw.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}
