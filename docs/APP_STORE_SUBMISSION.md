# Glow — App Store Submission (single source of truth)

Last updated: 2026-07-08. Supersedes `APP_STORE_LAUNCH.md`, `APP_STORE_LAUNCH_CHECKLIST.md`,
and `APP_STORE_METADATA.md` — those had contradictory bundle IDs/URLs; every value
below is verified against the actual repo config.

Everything in **PASTE** blocks goes verbatim into App Store Connect.

---

## 0. Verified facts (from repo — do not "correct" these from older docs)

| Item | Value | Source |
|---|---|---|
| iOS bundle ID | `app.glow.mobile` | `mobile/app.json` |
| Android package | `app.glow.mobile` | `mobile/app.json` |
| App version | 1.0.1 (build auto-increments remotely) | `mobile/app.json`, `eas.json` |
| ASC App ID | 6779246235 | `mobile/eas.json` |
| Apple Team ID | HK8LQXCZQC | `mobile/eas.json` |
| API base (prod) | `https://api.glow.app` (Railway) | — |
| Landing / legal URLs | `https://ca.glow.app` | Vercel `glow-landing` |
| Demo reviewer login | `DEMO_REVIEW_PHONE` / `DEMO_REVIEW_OTP` env on Railway **prod** | `src/routes/auth.js` |

⚠ **Name conflict note (2026-07-08):** "Glow: Assistance Locator" (Beracah USA LLC,
US resource directory) exists on the App Store. Unrelated category, no trademark found —
not a legal blocker. But if ASC rejects the bare name "Glow" as taken/too similar,
submit as **"Glow: Home Care"**. The suffix also boosts search.

---

## 1. App Information

| Field | PASTE |
|---|---|
| Name | `Glow` (fallback: `Glow: Home Care`) |
| Subtitle (30 chars) | `Book trusted Providers in Sudbury` |
| Primary language | English (Canada) |
| Category | **Lifestyle** (avoids medical-app scrutiny; we are explicitly non-medical) |
| Secondary category | Health & Fitness (optional — leave blank if unsure) |
| Content rights | Does not contain third-party content |
| Age rating | 4+ ("None Indicated" on all IARC categories; User-Generated Content: reviews — moderated) |

## 2. URLs

| Field | PASTE |
|---|---|
| Privacy Policy URL | `https://ca.glow.app/privacy` |
| Terms (EULA) | `https://ca.glow.app/terms` (use as custom EULA or leave Apple standard) |
| Support URL | `https://ca.glow.app/support` |
| Marketing URL | `https://ca.glow.app` |

Verify all four return 200 from a phone browser before submitting.

## 3. Keywords (100 chars max)

**PASTE:**
```
Provider,home care,personal support worker,senior care,elderly,caregiver,Sudbury,Ontario,companionship
```

## 4. Description (4000 chars max)

**PASTE:**
```
Glow connects families in Greater Sudbury, Ontario with vetted Personal Support Workers (Providers) for affordable, flexible in-home care.

Finding reliable home care is stressful. Glow makes it simple: browse verified Providers near you, book in minutes, and stay informed with real-time arrival tracking.

HOW IT WORKS
1. Sign up in seconds with your phone number
2. Browse Providers near you — photos, ratings, experience, languages
3. Pick a date and time and book
4. Your Provider accepts and you can track their arrival live
5. Rate and review after every visit

WHAT PROVIDERS HELP WITH
• Companionship and friendly conversation
• Personal care and hygiene assistance
• Meal preparation and light housekeeping
• Errands and appointment accompaniment
• Respite for family caregivers

WHY GLOW
• Transparent pricing: $25/hour with a 3-hour minimum
• Every Provider is vetted: police check (vulnerable sector), certification, and identity verified
• Real-time location updates during visits
• Secure phone-number sign-in with verification codes
• Available in English and French

FOR PROVIDERS
Set your availability, accept jobs near you, and track your earnings — all in one app.

Glow is not a medical service. Providers provide companionship and personal support, not nursing or clinical care.

Serving Greater Sudbury and surrounding communities within 15 km.
```

**Promotional text (170 chars, editable without review):**
```
Trusted, background-checked Providers in Greater Sudbury — book affordable in-home care in minutes. $25/hr, 3-hour minimum.
```

**Release notes (What's New):**
```
Initial release: find and book vetted Personal Support Workers in Greater Sudbury.
```

## 5. App Privacy (nutrition labels)

Declare exactly this — matches what the app actually collects:

| Data | Collected | Linked to identity | Tracking | Purpose |
|---|---|---|---|---|
| Phone number | Yes | Yes | No | Account/auth (OTP) |
| Name | Yes | Yes | No | App functionality |
| Email | Yes (optional) | Yes | No | Support/notifications |
| Precise location | Yes | Yes | No | Provider matching + live arrival during active bookings |
| Photos / documents | Yes (Provider only: police check, certs, ID, profile photo) | Yes | No | Identity/credential verification |
| User ID | Yes | Yes | No | App functionality |
| Health data | **No** (do not declare — we store no health records) | — | — | — |
| Device ID / advertising data | No | — | — | — |

Data retention: account deletion anonymizes the user and hard-deletes uploaded
documents (see §7). "Used for tracking" = **No** everywhere (no ads, no data brokers).

## 6. App Review Information

- Contact: your name, `support@glow.app`, +1 (647) 620-9243
- Sign-in required: **Yes** → provide demo account:

**PASTE into Notes (fill the two placeholders from Railway env `DEMO_REVIEW_PHONE` / `DEMO_REVIEW_OTP`):**
```
DEMO ACCOUNT
Phone: <DEMO_REVIEW_PHONE>
Verification code: <DEMO_REVIEW_OTP>
This reserved number bypasses SMS delivery and always accepts the code above.
The same number can sign in as a Client or as a Provider (choose the role on the
sign-up screen) so you can review both sides of the marketplace. The Provider side
is pre-approved. The account has existing bookings, an incoming job request,
earnings history, and notifications so every screen is populated.

BACKGROUND LOCATION
Background location runs ONLY while a Provider has an active, accepted booking, so
the client can track the Provider's live arrival for safety. It starts when a
booking becomes active and stops immediately when the visit completes or is
cancelled. It is never collected outside an active visit. Foreground location
is used to show nearby Providers.

PAYMENTS
Glow books real-world, in-person personal support services (App Store
Review Guideline 3.1.5 — physical services). Payment is settled directly
between client and worker outside the app; the app does not sell digital
content and does not use in-app purchase.

NON-MEDICAL
Providers provide companionship and personal support only — not nursing or clinical
care. The app stores no health records.

ACCOUNT DELETION (Guideline 5.1.1(v))
Profile tab → scroll to bottom → Delete Account → confirm twice. Uploaded
documents are hard-deleted; the account is anonymized and can never log in again.

SUGGESTED REVIEW FLOW
1. Sign in as Client with the demo number → browse Providers → open a profile.
2. Bookings tab → see the upcoming and completed bookings; open the completed
   one to see rating/receipt.
3. Sign out → sign in again choosing Provider → see the incoming job request,
   My Jobs, and Earnings screens.
```

## 7. Pre-submit gate (run every time)

```bash
# 1. Seed demo data on PROD DB (idempotent; re-run any time)
ALLOW_PROD_SEED=1 DATABASE_URL=<railway prod url> DEMO_REVIEW_PHONE=<same as Railway> \
  node scripts/seed-demo.js

# 2. Verify demo login against prod API
curl -s https://api.glow.app/auth/login -H 'Content-Type: application/json' \
  -d '{"phone":"<DEMO_REVIEW_PHONE>"}'          # expect 200
# then verify-otp with DEMO_REVIEW_OTP → expect a JWT

# 3. Repo checks
./scripts/pre-app-store-submit.sh

# 4. Build + submit (from mobile/ ONLY — root has no Expo config)
cd mobile
eas build  --profile production --platform ios
eas submit --profile production --platform ios --latest
```

Notes:
- Build numbers are remote + auto-increment: a rejected build can never be
  re-submitted — always `eas build` again.
- After approval: `ALLOW_PROD_SEED=1 node scripts/cleanup-demo.js` removes demo
  Providers/bookings (keeps the reviewer account for re-reviews; `--purge-reviewer` to
  remove it too). When real Providers onboard, purge the fake ones before marketing.

## 8. Screenshots

Required: **6.7" (1290×2796 or 1284×2778)**. 6.5" (1242×2688) recommended. 5–7 images.

| # | Screen | Notes |
|---|---|---|
| 1 | Customer home / browse Providers | Seeded Providers give real names, ratings, distances |
| 2 | Provider public profile | Bio, specialties, languages, rating |
| 3 | Booking flow (date/time/hours) | Shows $25/hr × 3 hr minimum transparently |
| 4 | Live tracking map | Use the ACCEPTED seeded booking |
| 5 | Completed booking + rating | Seeded completed booking |
| 6 | Provider earnings screen (optional) | Shows the worker side |

Capture on the PWA (`https://glow.vercel.app`) at iPhone viewport or the
iOS simulator; resize with ImageMagick:
`convert in.png -resize 1290x2796! out.png`. No debug UI, no empty states, no
placeholder text.

Icon: 1024×1024, no alpha — already in `mobile/assets/`.

## 9. Status board

| Item | Status |
|---|---|
| Account deletion (5.1.1(v)) | ✅ shipped |
| Demo reviewer bypass + rate limit | ✅ shipped (env vars set on Railway) |
| Demo seed data script | ✅ `scripts/seed-demo.js` (run against prod before submit) |
| Permissions hygiene (no unused strings) | ✅ shipped |
| Privacy/Terms/Support pages live | ✅ ca.glow.app |
| autoIncrement + ascAppId | ✅ eas.json |
| Nutrition labels filled in ASC | ⬜ you (§5) |
| Metadata + review notes pasted | ⬜ you (§1–6) |
| Screenshots | ⬜ you (§8) |
| Prod seed run + demo login verified | ⬜ (§7) |
| eas build + submit | ⬜ (§7) |
