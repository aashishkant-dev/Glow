# Glow — Brand Kit Brief (for Claude Design)

Goal: a **complete, professional brand kit** — main logo, wordmark, all 3 role
marks, app-icon variants, and a cohesive theme. Copy the **MASTER PROMPT** below
into Claude Design, attach the asset files, paste the result back to me.

---

## What Glow is
Private-pay **Provider (Personal Support Worker)** home-care platform — Greater Sudbury,
Ontario. Books trusted caregivers for elderly / post-discharge clients. Brand feel:
**trustworthy, warm, professional, healthcare-grade.** Bilingual EN/FR. Out-polish
the competitor carenara.com.

## What to design (the full set)
1. **Primary logo** — refined pin+heart mark ("care, near you").
2. **Wordmark lockup** — mark + "Glow" (Care regular, Nearby bold).
3. **Three role marks (a matched family, same visual language):**
   - **Client** → pin + heart (book care)
   - **Provider Professional** → pin + medical/care symbol (the worker)
   - **Admin** → pin + shield/verified (trust/oversight)
4. **App-icon variants** — full-bleed (iOS), adaptive foreground (Android, mark in
   center ~66% safe zone), monochrome/notification silhouette.
5. **Theme** — confirm/refine the palette + pick the wordmark font (see below).

## Starting assets (attach ALL of these)
| File | What it is |
|---|---|
| `glow-mark.svg` / `-512.png` | current primary pin+heart mark |
| `mark-client.svg` / `-512.png` | current Client mark |
| `mark-provider.svg` / `-512.png` | current Provider mark (pin + cross) |
| `mark-admin.svg` / `-512.png` | current Admin mark (pin + shield + check) |
| `marks-contact-sheet.png` | all 3 role marks side by side |
| `../../screenshot/i like this.jpeg` | the look/feel to match (green header + wordmark) |

These are the **"before."** Keep the pin-based family + heart concept — refine to
premium. Do NOT go abstract/busy (a prior "arch over pin" was rejected).

## Brand colors (use exactly)
| Token | Hex | Use |
|---|---|---|
| Brand green | `#057A55` | primary mark fill |
| Brand dark | `#034E36` | deep accents / dark headers |
| Header dark | `#0A4A2E` | app header / splash background |
| Brand accent | `#10B981` | lighter green highlight |
| White | `#FFFFFF` | knockouts / mark on dark |
| (Client tint) | `#1B6CA8` | Client card uses a blue accent |
| (Admin/HomeCare) | `#7C3AED` | purple accent for Home Care |

## ⛔ HARD CONSTRAINTS (or it breaks in the app)
1. **SVG, flat solid fills ONLY.** NO gradients (`<linearGradient>` / `url(#…)`),
   NO filters, shadows, or masks — they render **blank** in React Native
   (react-native-svg, New Architecture). Solid colors / layered solid shapes only.
2. Legible at **24px** (tab), **44px** (header), **1024px** (app icon).
3. `viewBox="0 0 112 112"` for every mark (drops straight into the code).
4. Each mark must work **mono-tinted** (one `color` prop drives the fill) — so the
   Client mark renders in blue, Provider in green, etc. Keep a white/transparent knockout
   for the inner symbol.
5. App-icon-safe: mark within the **center ~66%** (Android masks to circle/squircle).
6. Keep mark and wordmark **separable** (icon alone = app icon).

---

## ✅ MASTER PROMPT — paste into Claude Design

> You are a senior brand designer. Design a cohesive, professional **brand kit**
> for **Glow**, a trusted private-pay home-care (Provider) platform in Sudbury,
> Ontario. Feel: warm, trustworthy, healthcare-grade, modern — a well-funded health
> startup. Out-polish the competitor carenara.com.
>
> Build on the attached marks (a **location pin** containing a symbol). Keep this
> pin-based family and the heart concept — refine to crisp, balanced, premium. Do
> not go abstract or cluttered (a prior "arch over pin" was rejected).
>
> **Work in two steps:**
>
> **STEP 1 — Decide.** Explore **2–3 distinct directions** for the primary pin+heart
> mark (e.g. softer/rounded vs. sharper/geometric vs. a refined classic). Show each
> small (24px) and large, on green and white. Briefly weigh them and **pick the one
> you recommend** for a credible healthcare brand — state why. Choose a final color
> palette (start from the brand colors below) and a wordmark font (Plus Jakarta Sans,
> Poppins, or Manrope).
>
> **STEP 2 — Deliver the full set** in the chosen direction, all in one consistent
> visual language:
> 1. **Primary logo** — refined pin + heart (brand green `#057A55`, white heart).
> 2. **Wordmark lockup** — mark + "Glow" (Care regular, Nearby bold) in the
>    chosen font.
> 3. **Role marks (matched trio, same pin silhouette + weight):** Client = pin+heart;
>    Provider Professional = pin+medical/care symbol; Admin = pin+shield/verified check.
> 4. **App icon variants** — full-bleed on a `#057A55` tile; adaptive-foreground
>    (mark centered in the middle ~66% on transparent); white monochrome silhouette.
>
> **Output rules:** every deliverable as **SVG, flat solid fills only — absolutely
> no gradients, filters, shadows, or masks** (they break in React Native).
> `viewBox="0 0 112 112"` for each mark. Each mark must work as a single tintable
> color (white/transparent knockout for the inner symbol). Show each on green and on
> white, and give me the **raw SVG markup** for every mark + the wordmark. Keep paths
> clean and minimal. End with the final palette + font name.

---

## Fonts — pick one (free, app-ready). My pick: **Plus Jakarta Sans**.
| Font | Vibe | Expo package |
|---|---|---|
| **Plus Jakarta Sans** ⭐ | modern, friendly, premium SaaS | `@expo-google-fonts/plus-jakarta-sans` |
| Poppins | geometric, rounded, approachable | `@expo-google-fonts/poppins` |
| Manrope | soft-modern, healthcare-friendly | `@expo-google-fonts/manrope` |
| Inter | neutral, clean, ultra-legible | `@expo-google-fonts/inter` |

Use SemiBold/Bold for "Nearby" + the role labels; Regular/Medium for body.

---

## Hand the result back to me
When Claude Design returns the SVGs, do ONE of:
- **Paste the SVG markup** for each mark into our chat, OR
- **Save files** to `mobile/brand/` as `final-mark.svg`, `final-client.svg`,
  `final-provider.svg`, `final-admin.svg`, `final-wordmark.svg`, and tell me the **font**.

Then I will:
1. Wire the marks into `GlowLogo.tsx` + `CareIcons.tsx` (Client/Provider/Admin),
   preserving the `{ size, color }` API.
2. Install + load the chosen Google font; apply it to the wordmark.
3. Run `scripts/gen-icons.js` → regenerate ALL app icons (iOS / Android adaptive /
   web-PWA / splash / notification / favicon) from the final mark.
4. `tsc` + rebuild (EAS) so it's verified on device.

## File map (what's where)
- Brief + prompt:        `mobile/brand/README-LOGO-BRIEF.md`  ← you are here
- Theme/palette doc:     `mobile/brand/BRAND.md`
- Current marks (before): `mobile/brand/mark-*.svg` + `*-512.png` + `marks-contact-sheet.png`
- Primary mark:          `mobile/brand/glow-mark.svg`
- Put finals here:       `mobile/brand/final-*.svg`
- Icon generator:        `mobile/scripts/gen-icons.js`  (one command = all icons)
- Live app icons:        `mobile/assets/*.png`, `mobile/web/*`
- Re-export current set: `node mobile/brand/export-current-marks.js`
