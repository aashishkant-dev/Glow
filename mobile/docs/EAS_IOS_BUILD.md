# EAS iOS (Apple) Build Guide — Glow

Run **everything from `mobile/`**. Root has no Expo config.

This app uses **CNG (Continuous Native Generation)** — `ios/` and `android/`
are gitignored. EAS runs `expo prebuild` from `app.json` on the build server.
Do **not** commit a native `ios/` dir; a stale/partial one breaks prebuild.

---

## 0. One-time prerequisites

| Need | Value |
|------|-------|
| Apple Developer account | Paid ($99/yr) — required for device builds & App Store |
| Bundle ID | `app.glow.mobile` (must match `app.json` → `ios.bundleIdentifier`) |
| EAS project | `25965512-6c64-472e-8d96-4b714decadfe` |
| Node | `>= 22` |

```bash
npm i -g eas-cli
eas login
```

---

## 1. Apple credentials (the #1 cause of failures)

Let EAS manage signing — do **not** hand-roll certs.

```bash
cd mobile
eas credentials          # interactive: pick iOS → production
```

EAS will, on first build, create & store remotely:
- **Distribution Certificate**
- **Provisioning Profile** (for `app.glow.mobile`)
- **APNs Key** (push) — REQUIRED because this app uses `expo-notifications`
  + `remote-notification` background mode. Missing APNs key = push fails
  silently at runtime, but build still succeeds.

`eas.json` already sets `"credentialsSource": "remote"` for production. Keep it.

> If `eas credentials` asks for an App Store Connect API key, generate one at
> App Store Connect → Users and Access → Integrations → App Store Connect API,
> role **Admin** or **App Manager**. Saves you from 2FA prompts in CI.

---

## 2. Pre-build checklist (verify BEFORE every build)

```bash
cd mobile
npx expo-doctor          # must be 18/18 pass
npx tsc --noEmit         # no type errors
```

`app.json` → `ios` must contain (already set — don't remove):
- `bundleIdentifier: app.glow.mobile`
- `infoPlist.ITSAppUsesNonExemptEncryption: false` ← else App Store export
  compliance prompt blocks submission
- `infoPlist.NSPhotoLibraryUsageDescription` ← App Store **rejects** without it
  (we use expo-image-picker)
- `infoPlist.NSCameraUsageDescription` ← camera capture
- `infoPlist.NSLocationWhenInUseUsageDescription` ← location matching
- `infoPlist.UIBackgroundModes: [remote-notification, fetch]`

If any usage string is missing, Apple review **rejects** with ITMS-90683.

---

## 3. Build

### Simulator (no Apple account, fast smoke test)
```bash
eas build --platform ios --profile development
```
`development` profile has `ios.simulator: true`. Install the `.app` in iOS
Simulator. Note: push + real camera roll behave differently here.

### Device / internal testers (TestFlight-style, real signing)
```bash
eas build --platform ios --profile preview
```
`preview` = `simulator: false`, internal distribution. Needs registered device
UDIDs OR ad-hoc profile. For >100 testers use TestFlight via production.

### Production (App Store / TestFlight)
```bash
eas build --platform ios --profile production
```
`appVersionSource: remote` → EAS auto-increments `buildNumber`. Do **not** bump
it by hand in `app.json` (stays `1`); bump `version` (`1.0.0`) only for
user-facing releases.

---

## 4. Submit to App Store / TestFlight

```bash
eas submit --platform ios --profile production --latest
```
Requires App Store Connect app record already created with bundle ID
`app.glow.mobile`. First submission auto-goes to TestFlight internal.

---

## 5. Common Apple failures & fixes

| Symptom | Cause | Fix |
|---------|-------|-----|
| Build fails at "prebuild" | stale `ios/` committed | `rm -rf ios` (it's gitignored — CNG regenerates) |
| `No profiles for 'app.glow.mobile'` | creds not set up | `eas credentials` → create provisioning profile |
| `ITSAppUsesNonExemptEncryption` prompt on submit | flag missing | already set to `false` in app.json — keep it |
| ITMS-90683 missing usage description | removed an `NS...UsageDescription` | restore the infoPlist string |
| Push notifications never arrive | no APNs key | `eas credentials` → add Push Key |
| `bundleIdentifier` mismatch | app.json ≠ App Store Connect | make them identical |
| `Invalid Swift support` / pod errors | RN/Expo version drift | `npx expo install --fix` then rebuild |
| 2FA loop in CI | no ASC API key | add App Store Connect API key in `eas credentials` |

---

## 6. After native config changes

Anytime you edit `app.json` `ios.*`, plugins, or add a native dep:
```bash
npx expo install --fix     # align native dep versions to SDK 52
npx expo-doctor            # re-verify 18/18
eas build --platform ios --profile preview
```
No local `expo prebuild` needed — EAS does it. If you must debug prebuild
locally: `npx expo prebuild --platform ios --clean` then **delete `ios/` after**
(never commit it).
