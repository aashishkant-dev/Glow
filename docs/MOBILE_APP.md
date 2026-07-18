# Mobile App — Build & Run Guide

The Glow mobile app is an **Expo SDK 52** React Native app. It lives entirely in the [`mobile/`](../mobile/) folder.

> ## ⚠️ The one rule
> **Always run `expo` and `eas` from inside `mobile/`. Never from the repo root.**
>
> The repo root used to have a stray `app.json` / `eas.json` that pointed at a phantom "backend" app (bundle id `…glowbackend`). That config has been deleted. The **only** Expo project is `mobile/`, identified as:
> - **App name:** Glow
> - **Bundle ID / package:** `ca.glow.app`
> - **EAS project ID:** `25965512-6c64-472e-8d96-4b714decadfe`
> - **Owner:** `aashishkant69s-organization`
>
> If `eas build` ever asks about a project called *glowbackend* or shows id `7b0176c6…`, you are in the wrong directory or logged into the wrong account.

---

## Prerequisites

```bash
# Install the EAS CLI once (global)
npm install -g eas-cli

# Log in to your Expo account (the one that owns aashishkant69s-organization)
eas login
eas whoami            # confirm the right account
```

Node 20+ recommended for the Expo toolchain. The app itself is pinned to: Expo `52.0.49`, React Native `0.76.9`, React `18.3.1` (all coherent — `npx expo-doctor` should pass).

---

## Run locally (development)

```bash
cd mobile
npm install
npx expo start          # press 'a' for Android emulator, 'i' for iOS sim, or scan QR in Expo Go
```

Point the app at a backend by setting `mobile/.env`:
```
EXPO_PUBLIC_API_URL=http://<your-LAN-ip>:3000     # local backend
# or
EXPO_PUBLIC_API_URL=https://api.glow.app    # production backend
```

Or from the repo root, `./dev.sh` starts the backend **and** Expo web together and auto-points the app at localhost.

---

## Build the native app (the "turn it into an app" step)

Native builds run on **EAS Build** (Expo's cloud) — you do **not** need Xcode or Android Studio locally. Build profiles are defined in [`mobile/eas.json`](../mobile/eas.json).

```bash
cd mobile

# Android — installable APK for testing (recommended first build)
eas build --platform android --profile preview

# Android — Play Store bundle (.aab)
eas build --platform android --profile production

# iOS — needs an Apple Developer account ($99/yr); EAS handles signing
eas build --platform ios --profile production

# Both at once
eas build --platform all --profile production
```

When the build finishes, EAS prints a URL:
- **`preview` (APK):** download the `.apk` to an Android phone and install it directly.
- **`production` (AAB/IPA):** submit to the stores (next section).

### Build profiles (from `mobile/eas.json`)

| Profile | Android | iOS | API URL baked in |
|---------|---------|-----|------------------|
| `development` | APK + dev client | simulator | `https://api.glow.app` |
| `preview` | APK | device | `https://api.glow.app` |
| `production` | AAB (remote creds) | device (remote creds) | `https://api.glow.app` |

> The API URL is set per-profile via `EXPO_PUBLIC_API_URL` in `eas.json`. Update it there if your backend URL changes.

---

## Submit to the app stores

```bash
cd mobile

# Google Play (uses the production AAB; track: internal per eas.json submit config)
eas submit --platform android --latest

# Apple App Store
eas submit --platform ios --latest
```

First-time submission requires store credentials (Play service account JSON / Apple App Store Connect API key). EAS walks you through it interactively.

---

## Over-the-air (OTA) updates

The app is configured for EAS Update (`expo.updates.url` in `app.json`, runtimeVersion policy `appVersion`). To push a JS-only update without a new store build:

```bash
cd mobile
eas update --branch production --message "describe the change"
```

(OTA updates can change JS/assets only — native code changes still require a new `eas build`.)

---

## Build the PWA (web)

The same codebase exports to a web PWA, deployed to Vercel (`https://glow.vercel.app`).

```bash
cd mobile
npm run build:web     # = npx expo export -p web  +  scripts/post-web-build.js
```

`post-web-build.js` layers the PWA assets from `mobile/web/` (manifest, service worker, icons) onto `dist/` and injects the install meta tags — without it the export is not installable. Deploy the result to Vercel:

```bash
npm run deploy        # build:web, then npx vercel --prod
```

CI builds the web bundle directly — see [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) (`working-directory: mobile`, `npx expo export --platform web`).

---

## Troubleshooting

| Symptom | Cause / Fix |
|---------|-------------|
| `eas build` references *glowbackend* or id `7b0176c6…` | You're running from the repo root or wrong dir. `cd mobile` first. |
| `eas build` can't find a project | Run `eas init` inside `mobile/` only if the `extra.eas.projectId` in `mobile/app.json` is missing — it should already be `25965512…`. |
| Native build fails on dependency versions | Run `cd mobile && npx expo install --fix` then `npx expo-doctor`. |
| App can't reach the backend | Check `EXPO_PUBLIC_API_URL` — in dev it's `mobile/.env`, in builds it's the profile's `env` in `eas.json`. |
| Web export missing assets | Run `node scripts/generate-assets.js` in `mobile/` first. |

---

*See [`ARCHITECTURE.md`](ARCHITECTURE.md) for how the mobile app fits with the backend, landing, and admin apps.*
