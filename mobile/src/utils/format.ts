/** "MAKEUP_ARTIST" → "Makeup Artist". Backend enums are SCREAMING_SNAKE_CASE;
 * every customer-facing surface should show them title-cased with spaces. */
export function humanizeQualification(raw?: string | null): string {
  if (!raw) return '';
  return raw.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

import { CURRENCY_CODE } from './region';

// Cached per currency code — Intl.NumberFormat construction isn't free and
// CURRENCY_CODE never changes at runtime (env-configured, one deployment).
const currencyFormatterCache: Record<string, Intl.NumberFormat> = {};
function getCurrencyFormatter(code: string, maximumFractionDigits: number): Intl.NumberFormat {
  const key = `${code}:${maximumFractionDigits}`;
  if (!currencyFormatterCache[key]) {
    currencyFormatterCache[key] = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: code,
      minimumFractionDigits: maximumFractionDigits,
      maximumFractionDigits,
    });
  }
  return currencyFormatterCache[key];
}

/**
 * formatCurrency(45) => "$45.00" (CAD, default) / "₹45.00" (if deployed with
 * EXPO_PUBLIC_CURRENCY=INR). Display-only — the underlying number is never
 * converted, only relabeled with the deployment's configured currency symbol
 * and format. Falls back to a plain "$" prefix if the currency code or
 * Intl.NumberFormat itself is unavailable (some RN JS engines ship without
 * full ICU data for every currency).
 */
export function formatCurrency(amount: number, opts?: { decimals?: number }): string {
  const decimals = opts?.decimals ?? 2;
  try {
    return getCurrencyFormatter(CURRENCY_CODE, decimals).format(amount);
  } catch {
    return `$${amount.toFixed(decimals)}`;
  }
}
