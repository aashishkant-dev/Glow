> ⚠ SUPERSEDED — use [APP_STORE_SUBMISSION.md](APP_STORE_SUBMISSION.md). This file kept for history; some values here (bundle ID, URLs) are WRONG.

# Glow — App Store / Play Store Launch Checklist

Last updated: 2026-06-28. Keep this doc as the single source of truth for every
store submission. Work top to bottom.

---

## 0. TL;DR — the exact commands

```bash
cd mobile

# iOS — autoIncrement bumps the build number automatically (remote appVersionSource),
# so you must REBUILD (you can't re-submit an old binary; the build number is baked in).
eas build  --profile production --platform ios
eas submit --profile production --platform ios --latest

# Android (AAB for Play Store)
eas build  --profile production --platform android
eas submit --profile production --platform android --latest
```

> `expo doctor` warnings (patch version drift, `@types/jest`) DO NOT block submission.
> The build artifact is what gets reviewed, not the doctor check.

---

## 1. Why the first submit failed (and how it's fixed)

```
Build number 1 for app version 1.0.0 has already been used.
```

- Build numbers must be unique per version on App Store Connect.
- Fixed by `"autoIncrement": true` on the production profile in `mobile/eas.json`.
- Because `eas.json` uses `appVersionSource: "remote"`, EAS Cloud tracks the real
  build number and bumps it **at build time**. `app.json`'s `buildNumber` /
  `versionCode` are ignored.
- **Consequence:** to get a new build number you must run `eas build` again. You
  cannot patch an existing binary.

---

## 2. App Review reviewer access (CRITICAL — without this they can't test)

Login is phone + Twilio OTP, which a reviewer can't reliably receive. There is a
hardcoded demo account that bypasses Twilio:

| Field | Value |
|-------|-------|
| Phone | `+1 555 555 0100` |
| OTP code | `000000` |

- Override via env: `DEMO_REVIEW_PHONE`, `DEMO_REVIEW_OTP` (Railway variables).
- The account auto-provisions on first login (role CUSTOMER, name "App Reviewer").
- Put this in **App Store Connect → App Review Information → Notes**:

  > Demo login: phone +1 555 555 0100, verification code 000000.
  > To test account deletion: Profile tab → scroll to bottom → Delete Account → confirm twice.

---

## 3. Account Deletion (Guideline 5.1.1(v) — auto-reject without it) ✅ DONE

Implemented:
- **UI:** Profile → "Delete Account" (two-step confirm).
- **API:** `DELETE /account` (any signed-in role).
- **Behaviour (soft-delete + anonymize):**
  - Active bookings → CANCELLED + REFUNDED
  - Uploaded documents (police check, ID, certs) → **hard deleted** (sensitive PII)
  - User row → anonymized (name "Deleted User", phone freed + suffixed, email/photo/
    emergency contacts wiped), `deletedAt` set → can never log in again
  - Completed bookings + Provider earnings → kept in anonymized form (legal/tax/payment retention)

Migration: `prisma/migrations/20260628010000_add_user_deleted_at/` (runs automatically
on Railway deploy via `railway.toml` startCommand).

---

## 4. Permissions hygiene ✅ DONE

- Removed unused `NSMicrophoneUsageDescription` (no audio feature → Apple rejects unused permissions).
- Remaining iOS permission strings (location, photo, camera) all map to real features.
- **Background location** (`UIBackgroundModes: ["location"]`) is the highest-scrutiny item.
  In App Review notes, justify it:
  > Background location is used ONLY during an active care visit, so the client can
  > track the Provider's live arrival. It is not collected at any other time.
  If review pushes back hard, consider dropping background location to foreground-only.

---

## 5. Things YOU still need to provide (not code) — the "legal papers"

These live in App Store Connect / Play Console, NOT in the app build:

### 5a. Privacy Policy (REQUIRED — both stores)
- A public URL. Must describe: what you collect (phone, name, location, photos,
  uploaded ID/police-check docs), why, how it's stored, retention, and how users
  delete their data.
- Host on the landing site, e.g. `https://ca.glow.app/privacy`.
- Enter the URL in: App Store Connect → App Privacy, and Play Console → Store listing.

### 5b. Terms of Service / EULA (RECOMMENDED, effectively required for a paid marketplace)
- Covers: the $25/hr private-pay terms, 3hr minimum, cancellation/refund policy,
  that Glow connects clients + independent Providers, liability/disclaimers,
  dispute resolution, governing law (Ontario, Canada).
- Host at `https://ca.glow.app/terms`. Link it in-app (a row in Profile/Help) and
  at signup ("By continuing you agree to our Terms & Privacy Policy").

### 5c. App Privacy "Nutrition Labels" (REQUIRED — App Store Connect questionnaire)
Declare data collection truthfully:
- Contact Info → Phone number (account), Name
- Location → Precise location (app functionality)
- User Content → Photos, Documents (ID / police check)
- Identifiers → User ID
- Mark whether each is linked to identity (yes) and used for tracking (no).

### 5d. Health-data / care disclaimer
- You are NOT a medical provider; Providers provide personal support, not medical care.
- State this in Terms + ideally an onboarding line, so Apple doesn't classify it as
  a medical app with extra requirements.

### 5e. Business / legal (Canada)
- Verify you can legally operate a Provider marketplace in Ontario (worker classification:
  Providers as independent contractors vs employees — get advice).
- Insurance / liability coverage for the platform.
- If you take payment: PCI-compliant processor (Stripe) — never store raw card data.
- WSIB / tax handling for Provider payouts.
- These don't block the App Store but are real launch blockers for a care business.
  **Talk to a lawyer + accountant for 5e.**

### 5f. Support contact (REQUIRED)
- Support URL + email. Already in-app: support@glow.app, +1 (647) 620-9243, 24/7.
- Add a marketing URL (landing page) in App Store Connect.

---

## 6. Store listing assets (gather before submit)

- App icon (1024×1024, no alpha) — App Store Connect.
- Screenshots: iPhone 6.7" + 6.5" (required sizes). Android: phone screenshots.
- App description, keywords, subtitle, promotional text.
- Age rating questionnaire.
- Category: Medical or Lifestyle (Lifestyle avoids extra medical scrutiny).

---

## 7. Pre-submit verification (run before every build)

```bash
# backend
node -c src/routes/auth.js && node -c src/routes/customer.js && node -c src/routes/provider.js
npx prisma validate

# mobile
cd mobile && npx tsc --noEmit -p tsconfig.json && npm test
```

---

## 8. Status snapshot (2026-06-28)

| Item | Status |
|------|--------|
| autoIncrement build numbers | ✅ done |
| iOS ascAppId for non-interactive submit | ✅ done (6779246235) |
| Account deletion (UI + API + migration) | ✅ done |
| Reviewer demo account + OTP bypass | ✅ done |
| Unused mic permission removed | ✅ done |
| Notifications persisted server-side | ✅ done |
| Map / address / online-status fixes | ✅ done |
| Privacy Policy URL | ⬜ YOU provide |
| Terms of Service URL | ⬜ YOU provide |
| App Privacy nutrition labels | ⬜ YOU fill in ASC |
| Screenshots + listing copy | ⬜ YOU provide |
| Legal/business (5e) | ⬜ lawyer + accountant |
| iOS rebuild + submit | ⬜ run command in §0 |
