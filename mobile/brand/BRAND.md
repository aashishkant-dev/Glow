# Glow — Brand Theme

The cohesive visual system. Source of truth for colors, type, and logo usage.
Code palette lives in `mobile/src/utils/colors.ts`.

## Logo
- **Primary mark:** location pin containing a white heart — "care, near you."
- **Wordmark:** "Care" (regular) + "Nearby" (bold), set beside the mark.
- **Role marks:** one pin family, three inner symbols —
  - Client → heart · Provider → medical cross · Admin → shield + check.
- Mark and wordmark are separable; the mark alone is the app icon.
- **Never** add gradients/shadows to the SVG marks — they break in React Native.

## Color palette
| Token | Hex | Use |
|---|---|---|
| `brand` | `#057A55` | primary green — mark, primary buttons |
| `brandDark` | `#034E36` | deep green accents |
| header dark | `#0A4A2E` | app header + splash background |
| `brandAccent` | `#10B981` | lighter green highlight |
| `brandLight` | `#ECFDF5` | tinted green surfaces |
| white | `#FFFFFF` | knockouts, text on dark |
| Client accent | `#1B6CA8` | blue — Client role |
| Home Care accent | `#7C3AED` | purple — Home Care / post-discharge |
| (greys) | system | text, borders, cards |

On a dark header the mark is **white**; on light surfaces it's **brand green**.

## Typography
**Plus Jakarta Sans** — now loaded in `App.tsx` via
`@expo-google-fonts/plus-jakarta-sans` (400/500/600/700/800). Wordmark uses
500 Medium ("Care") + 800 ExtraBold ("Nearby").
- Headings / "Nearby" / role labels → SemiBold / Bold
- Body / "Care" → Regular / Medium

## App icons
Regenerated from the primary mark via `mobile/scripts/gen-icons.js`:
- `assets/icon.png` 1024 — full-bleed green tile (iOS)
- `assets/adaptive-icon.png` 1024 — Android foreground, mark in center ~66% safe zone
- `assets/notification-icon.png` 96 — white silhouette (OS-tinted)
- `assets/splash.png` 1284×2778 — mark centered on `#0A4A2E`
- favicons / apple-touch / PWA 192·512 — `assets/` + `web/`

## Do / Don't
- ✅ Flat solid fills, one tint per mark, generous padding, test at 24px.
- ❌ Gradients, drop shadows, filters, `url(#…)` (blank on RN Fabric).
- ❌ Stretching the mark, recoloring the heart, busy backgrounds behind it.
