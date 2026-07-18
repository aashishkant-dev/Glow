# Prompt — regenerate ALL Glow in-app icons in the brand-kit style

Paste this into Claude Code (in the repo). It rebuilds every line-icon in
`mobile/src/components/CareIcons.tsx` so they match the brand kit's icon system
exactly: **24×24 grid · stroke-width 1.9 · round caps & joins · `fill="none"` ·
single tintable `color`**. The 3 role marks (`CustomerMark`/`ProviderMark`/`AdminMark`)
and the `PinIcon` pin shape are ALREADY brand-correct — do not touch them.

---

## MASTER PROMPT

> You are refining the icon set in `mobile/src/components/CareIcons.tsx` for the
> Glow app. Make **every line/UI icon** obey ONE consistent system, taken
> from our brand kit (`docs/Glow Brand Kit.html`, the `<symbol id="i-*">`
> defs):
>
> **HARD RULES (every icon):**
> - `viewBox="0 0 24 24"`, props `{ size = 24, color = Colors.brand }`.
> - **Stroke 1.9**, `strokeLinecap="round"`, `strokeLinejoin="round"`, `fill="none"`.
>   Use `stroke={color}` — NEVER a gradient, filter, shadow, or `url(#…)` (they
>   render blank in react-native-svg on the New Architecture / Fabric).
> - Optical weight even across the set; legible at 22px. Keep paths minimal.
> - One `color` drives the whole glyph (no hard-coded hex inside icons).
> - Keep each exported function name + its `{ size, color }` signature unchanged
>   (they're imported across screens and in `SERVICE_ICON_MAP`). API stays stable.
>
> **DO NOT TOUCH:** `CustomerMark`, `ProviderMark`, `AdminMark` (filled pin marks),
> `PIN_PATH`, and the `PinIcon` pin geometry — already brand-final.
>
> **Reuse the brand-kit glyphs verbatim** where one matches (copy the `d=`/shape
> from the matching `#i-*` symbol), then redraw the rest in the same hand:
>
> | CareIcons export        | Brand-kit `#i-*` to reuse / match |
> |-------------------------|-----------------------------------|
> | FindJobsIcon            | `#i-search`                       |
> | EarningsIcon            | `#i-wallet`                       |
> | ProfileIcon             | `#i-user`                         |
> | HelpIcon                | `#i-chat` (or a `?` in a circle)  |
> | BellIcon                | `#i-bell`                         |
> | NoteIcon                | `#i-clipboard`                    |
> | HospitalIcon            | `#i-cross` (rounded-square cross) |
> | PulseIcon               | heartbeat line (match `#i-heart` weight) |
> | ShieldCheckIcon         | `#i-shield`                       |
> | PinIcon (24px UI one)   | `#i-pin`                          |
> | CreditCardIcon          | `#i-wallet` family                |
> | AccountCheckIcon        | `#i-user` + small check           |
> | MedicalBagIcon          | bag + `#i-cross`                  |
> | CheckDecagramIcon       | `#i-shield` check, or badge+check |
> | EmailIcon               | envelope, 1.9 round               |
> | MonitorDashboardIcon    | `#i-settings`/screen, match weight|
> | ChartBoxIcon            | bars in rounded box               |
> | PhoneCheckIcon          | `#i-phone` + check                |
> | CardAccountDetailsIcon  | id card                           |
> | BriefcaseAccountIcon    | briefcase + person                |
> | PhoneMobileIcon         | phone (match `#i-phone` hand)     |
> | KeyIcon, MedalIcon, TranslateIcon, ClockIcon (`#i-clock`), PackageIcon | redraw to match |
>
> **The 7 SERVICE icons** (used in `SERVICE_ICON_MAP`, shown on booking cards) —
> redraw these as a clean matched family, same 1.9-round system, each instantly
> readable at 24px:
> - **PersonalCareIcon** → hand cradling a heart (care/bathing/hygiene).
> - **CompanionIcon** → two people / `#i-users`.
> - **MealIcon** → plate + fork & knife.
> - **MedicationIcon** → pill / capsule (split capsule reads best).
> - **HousekeepingIcon** → simple broom or sparkle+surface.
> - **MobilityIcon** → walking cane / person-with-support (NOT the wheelchair
>   emoji look — a dignified mobility-assist glyph).
> - **PostSurgeryIcon** → `#i-cross` in a rounded square, or bandage/plus.
>
> **Process:**
> 1. Read `docs/Glow Brand Kit.html` (the `#i-*` symbol block ~lines 277-296)
>    and the current `mobile/src/components/CareIcons.tsx`.
> 2. Rewrite each non-mark icon's `<Svg>` body to the system above. Keep the
>    `Colors` import and component exports intact.
> 3. Run `cd mobile && npx tsc --noEmit` — must pass.
> 4. (Optional preview) render a contact sheet: a script that drops every icon
>    into one SVG/PNG on a light card so I can eyeball consistency before commit.
>
> Output the edited `CareIcons.tsx`. Solid flat strokes only. No gradients/filters.

---

## After Claude Code finishes
- `cd mobile && npx tsc --noEmit`
- Smoke-render on web (`npm run web`) — booking cards + tab bar show new glyphs.
- Real check is a native build (Fabric): `eas build --profile preview --platform android`.
  Stroke icons that render on web but vanish on device = a gradient/`fill` slipped
  in; re-check the offending icon obeys `fill="none"` + `stroke={color}` only.

## Brand-kit icon spec (for reference)
`viewBox 0 0 24 24` · `stroke-width 1.9` · `stroke-linecap/linejoin round` ·
`fill none` · `stroke currentColor`. In our code `currentColor` → `stroke={color}`.
