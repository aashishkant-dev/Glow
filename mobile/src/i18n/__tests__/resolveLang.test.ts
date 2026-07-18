import { resolveInitialLang } from '../resolveLang';

describe('resolveInitialLang', () => {
  it('uses a valid saved preference over the device locale', () => {
    expect(resolveInitialLang('fr', 'en-US')).toBe('fr');
    expect(resolveInitialLang('en', 'fr-CA')).toBe('en');
  });

  it('falls back to device locale when no saved preference', () => {
    expect(resolveInitialLang(null, 'fr-CA')).toBe('fr');
    expect(resolveInitialLang(null, 'fr')).toBe('fr');
    expect(resolveInitialLang(null, 'en-CA')).toBe('en');
  });

  it('defaults to en for unknown / missing locale and ignores invalid saved values', () => {
    expect(resolveInitialLang(null, null)).toBe('en');
    expect(resolveInitialLang(null, undefined)).toBe('en');
    expect(resolveInitialLang('de', 'es-ES')).toBe('en');
  });
});
