# Glow — Expo / EAS Build & Deploy Commands

> ⚠️ **Always run from `mobile/`.** The repo root has no Expo config — running `expo`/`eas`
> from root builds nothing useful. `cd mobile` first, every time.

## Project identity (from `mobile/app.json` + `mobile/eas.json`)
| | |
|---|---|
| App name / slug | Glow / `glow` |
| Bundle id (iOS) + package (Android) | `ca.glow.app` |
| EAS projectId | `25965512-6c64-472e-8d96-4b714decadfe` |
| Owner (EAS org) | `aashishkant69s-organization` |
| URL scheme (deep links) | `glow://` |
| API baked into every build | `EXPO_PUBLIC_API_URL=https://api.glow.app` (set per-profile in `eas.json`) |
| App version source | `remote` (EAS manages build number) |

---

## 0. One-time setup
```bash
cd mobile
npm install                 # install deps
npm install -g eas-cli      # EAS CLI (or: npx eas-cli@latest …)
eas login                   # log in to the aashishkant69s-organization account
eas whoami                  # confirm you're logged in
```

## 1. Local development
```bash
cd mobile
npx expo start              # Metro bundler — scan QR with Expo Go / dev client
npx expo start --web        # run the web/PWA locally
npx expo start -c           # start + clear Metro cache (use when bundler acts stale)
```
Run backend + web together from repo root: `./dev.sh`.

## 2. Native builds (EAS) — three profiles in `eas.json`

| Profile | Android | iOS | Use |
|---|---|---|---|
| `development` | APK, dev client | simulator | debugging on a device with the dev client |
| `preview` | APK | device | share a testable APK internally (no store) |
| `production` | AAB (app-bundle) | device, remote creds | Play Store / App Store release |

```bash
cd mobile

# Android APK to test on a phone (download link when done)
eas build --platform android --profile preview

# Android release bundle (.aab) for Google Play
eas build --platform android --profile production

# iOS (needs Apple credentials; EAS manages them remotely)
eas build --platform ios --profile production

# Both platforms at once
eas build --platform all --profile production

# Dev client build (for `expo start --dev-client`)
eas build --platform android --profile development
```
- Builds run in the cloud; the CLI prints a dashboard URL + a download link when finished.
- Check status anytime: `eas build:list`  ·  view one: `eas build:view`.

## 3. Submit to stores
```bash
cd mobile
eas submit --platform android --profile production   # → Play Console "internal" track
eas submit --platform ios --profile production       # → App Store Connect
```
First submit asks for store credentials / service-account key (Android) — EAS stores them after.

## 4. OTA updates (EAS Update — ship JS without a new store build)
```bash
cd mobile
# Push an update to installed apps on the same runtimeVersion (= appVersion):
eas update --branch production --message "fix: …"
eas update --branch preview    --message "test: …"
```
> Only JS/asset changes ship via Update. Native changes (new permission, SDK bump,
> new native module) require a fresh `eas build`.

## 5. Web / PWA (Vercel — separate from native)
```bash
cd mobile
EXPO_PUBLIC_API_URL=https://api.glow.app npm run build:web   # → mobile/dist/
```
- `npm run build:web` = `expo export -p web` + `scripts/post-web-build.js` (PWA assets, font relocation, SW).
- **Prod PWA deploy:** `bash tests/deploy-prod-pwa.sh` (builds prod URL, verifies no dev URL, deploys, aliases `glow.app`).
- **Dev PWA deploy:** `bash tests/deploy-dev-pwa.sh` (→ `glow-dev-pwa.vercel.app`).
- ⚠️ `git push` does **not** deploy the PWA — it's a prebuilt Vercel deploy, must run the script. See `[[prod-pwa-api-url-leak]]`.

## 6. Health / sanity checks
```bash
cd mobile
npx expo-doctor             # should report 18/18 — run before any build
npx tsc --noEmit            # type check
npm run lint                # eslint (eslint-config-expo)
npx expo config --type public   # prints resolved app config (name, bundle id, projectId)
```

---

## Native dirs / CNG note
`mobile/android` and `mobile/ios` are **gitignored** (Continuous Native Generation). `app.json`
is the single source of truth — EAS runs `expo prebuild` during the build. Don't commit native
dirs. If you need them locally: `npx expo prebuild`.

## Common gotchas
- "Won't build / wrong app" → you ran `eas` from repo root. `cd mobile`.
- expo-doctor flags a package version → `npx expo install --check` then `npx expo install <pkg>`.
- Stale Metro bundle → `npx expo start -c`.
- New permission / native module added but OTA update didn't apply it → needs a full `eas build`, not `eas update`.
