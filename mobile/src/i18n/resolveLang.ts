import type { Lang } from './strings';

export function resolveInitialLang(
  saved: string | null,
  deviceLocale: string | null | undefined,
): Lang {
  if (saved === 'en' || saved === 'fr') return saved;
  if (deviceLocale && deviceLocale.toLowerCase().startsWith('fr')) return 'fr';
  return 'en';
}
