> ⚠ SUPERSEDED — use [APP_STORE_SUBMISSION.md](APP_STORE_SUBMISSION.md). This file kept for history; some values here (bundle ID, URLs) are WRONG.

# App Store Launch Checklist

Complete this before submitting to Apple. Fill in actual values as you go.

## 1. App Store Connect Setup

### Basic Info
- [ ] Create Apple Developer account (if not done)
- [ ] Create new App in App Store Connect
- [ ] Bundle ID: `com.glow.app` (matches iOS build)
- [ ] App name: `Glow`
- [ ] Primary language: English
- [ ] Category: Healthcare or Business Services

**Notes:**
```
App Store Connect: https://appstoreconnect.apple.com/
Create new app: "My Apps" → "+" → "New App"
```

---

## 2. App Metadata

**Location:** App Store Connect → Select App → App Information → Localization (English)

### Required Fields

| Field | Max Length | What to fill | Status |
|-------|-----------|---|---|
| **Subtitle** | 30 chars | "Book trusted Providers in Sudbury" | [ ] |
| **Description** | 4000 chars | Full pitch (see template below) | [ ] |
| **Keywords** | 100 chars | "personal care, Provider, Sudbury, elderly care, homecare" | [ ] |
| **Support URL** | — | `https://glow-landing.vercel.app/support` | [ ] |
| **Privacy Policy URL** | — | `https://glow-landing.vercel.app/privacy` | [ ] |
| **Marketing URL** | — | `https://glow-landing.vercel.app` | [ ] |

### Description Template

```
Glow connects families with vetted Personal Support Workers (Providers) 
in Greater Sudbury, Ontario.

[PROBLEM]
Finding reliable, affordable home care is stressful. You need someone 
you can trust, booked quickly, and available when you need them.

[SOLUTION]
Glow makes it simple:
• Browse verified Providers in your area
• Book same-day care in minutes
• Pay just $25/hour (3-hour minimum)
• Real-time location tracking during shifts
• Rate and review caregivers

[WHO IT'S FOR]
Seniors needing daily support. Families juggling work and caregiving. 
Anyone who values affordable, reliable in-home care.

[HOW IT WORKS]
1. Sign up in seconds with your phone number
2. Browse Providers near you with photos and reviews
3. Select a date and time
4. Provider accepts and arrives on time
5. Real-time tracking lets you stay informed

All Providers are background-checked and vetted.

Available in English and French.
```

---

## 3. Screenshots

### Requirements
- **Device sizes:** iPhone 6.7" (required), 6.5" (recommended), 5.5" (recommended)
- **Count:** Min 1, max 10 per device size
- **Format:** PNG or JPG
- **Exact dimensions:**
  - 6.7": 1284 × 2778 px
  - 6.5": 1242 × 2688 px
  - 5.5": 1242 × 2208 px

### Screenshot Content (order matters)

Create 5 screenshots for each device size:

| # | Screen | What to show | File |
|---|--------|---|---|
| 1 | **Sign Up Hero** | Login/signup screen with "Get Started" button, app name visible | `ss_1_hero.png` |
| 2 | **Browse Providers** | List of Providers with photos, ratings, distance, hourly rate | `ss_2_browse.png` |
| 3 | **Book a Shift** | Date/time selector, confirm booking, Provider details | `ss_3_booking.png` |
| 4 | **Live Tracking** | Active shift with Provider location on map, timer running | `ss_4_tracking.png` |
| 5 | **Shift Complete** | Completed booking, rate Provider, receipt | `ss_5_complete.png` |

### How to Capture

**Option A: iPhone Simulator**
```bash
# Open Xcode
# Device → iPhone 15 Pro Max (or 6.7" equivalent)
# Run app: npm run ios
# Cmd + S to take screenshot
# Resize to exact dimensions using Preview or ImageMagick
```

**Option B: Real Device**
- Plug iPhone into Mac
- Screenshots save to Photos
- Resize using Preview app to exact pixel dimensions

**Resize with ImageMagick:**
```bash
# For 6.7" (1284 × 2778)
convert input.png -resize 1284x2778 -gravity center -extent 1284x2778 ss_6_7inch.png

# For 6.5" (1242 × 2688)
convert input.png -resize 1242x2688 -gravity center -extent 1242x2688 ss_6_5inch.png
```

### What NOT to do
- [ ] Don't show onboarding tutorials (skip initial walkthrough)
- [ ] Don't use fake "Lorem Ipsum" data
- [ ] Don't show admin/dev features
- [ ] Don't include watermarks or debug info
- [ ] Don't show empty states (populate with real-looking data)

### Upload Screenshots to App Store Connect
- Location: App Store Connect → Localization → Screenshots
- Add for each device size (start with 6.7")
- Reorder so most important first

---

## 4. App Preview Video (Optional but Recommended)

**Duration:** 15–30 seconds  
**Specs:** 1080 × 1920 (9:16), H.264 codec, 30 fps  
**File size:** < 500 MB

**Script (example):**
```
[0s] "Finding Providers shouldn't be hard"
[3s] Show: Customer opens app, sees list of Providers
[7s] "Book in minutes"
[10s] Show: Customer selects date, time, confirms
[13s] "Real-time tracking"
[17s] Show: Provider accepted, map with location, timer
[22s] "Trust built on verified profiles"
[25s] Show: Reviews, ratings, completed shifts
[28s] "Glow. Care made simple."
```

**How to create:**
1. Record screen on iPhone or simulator (iOS Control Center)
2. Edit in iMovie, Premiere, or CapCut
3. Add text overlays, music (royalty-free)
4. Export as H.264, 1080p, 30fps
5. Upload to App Store Connect

---

## 5. Landing Page Requirements

All URLs in App Store metadata must be live and accessible.

### Pages to Create

#### `/privacy` — Privacy Policy
- [ ] Data collection (location, phone, profile info)
- [ ] How data is stored and protected
- [ ] GDPR/privacy law compliance (Canada)
- [ ] Third-party services (Twilio SMS, Vercel Blob)
- [ ] User rights (access, deletion, etc.)

**Template location:** `landing/app/privacy/page.tsx`

#### `/terms` — Terms of Service
- [ ] Booking cancellation policy
- [ ] Provider vetting process
- [ ] User responsibilities
- [ ] Liability limits
- [ ] Age requirements (18+ or parent consent)
- [ ] Acceptable use policy

**Template location:** `landing/app/terms/page.tsx`

#### `/support` — Support/FAQ
- [ ] How to book
- [ ] How to cancel
- [ ] Refund policy
- [ ] Contact form or email
- [ ] FAQ section

**Template location:** `landing/app/support/page.tsx`

### Verification
- [ ] Visit each URL in browser (not localhost)
- [ ] Links work from both desktop and mobile
- [ ] No 404 errors
- [ ] Privacy policy is complete and legal

---

## 6. Build & Code Preparation

### Version Bump
- [ ] Open `mobile/app.json`
- [ ] Update version: `"version": "1.0.0"` (or next version)
- [ ] Commit: `git commit -m "Bump version to 1.0.0 for App Store submission"`

### iOS Build

**Check Info.plist for required permissions:**
- [ ] Location permission text: `NSLocationWhenInUseUsageDescription`
  - Example: "Glow needs your location to match you with nearby Providers and track shifts in real-time."
- [ ] Camera permission (if profile photo upload): `NSCameraUsageDescription`
  - Example: "Glow needs camera access to take profile photos."
- [ ] Contacts permission (if auto-fill): `NSContactsUsageDescription`

**File:** `mobile/ios/Glow/Info.plist`

### API URL Verification
- [ ] Check `mobile/.env.production` (if exists)
- [ ] Ensure `EXPO_PUBLIC_API_URL=https://api.glow.app`
- [ ] NO dev/localhost URLs in prod build
- [ ] All auth endpoints hit production database

### Deep Links (if any)
- [ ] Test booking links work: `glow://booking/12345`
- [ ] Test Provider profile links: `glow://provider/67890`

### Build for App Store

**Option A: Using EAS (recommended)**
```bash
cd mobile
eas build --platform ios --distribution appstore
# Follow prompts
# Download .ipa file when ready
```

**Option B: Manual Xcode build**
```bash
cd mobile
npm run build:ios -- --production
# Open in Xcode, sign with production cert
# Product → Archive → Upload to App Store
```

---

## 7. Compliance & Review Preparation

### Legal
- [ ] Privacy Policy reviewed (comply with Canadian PIPEDA)
- [ ] Terms of Service reviewed by lawyer (if possible)
- [ ] Age gate set to 18+ (or add parent consent flow)

### Guidelines
- [ ] No third-party payment (use in-app purchase or external payment link)
- [ ] No health claims ("cure", "diagnose", "treat")
- [ ] Provider credentials disclosed (background checks, not licensed RNs)
- [ ] Contact info visible on landing page

### Testing
- [ ] Sign up flow works end-to-end
- [ ] Booking completes without errors
- [ ] Location permission popup shows correct text
- [ ] All links in metadata are live
- [ ] No crashes on demo device

### App Review Notes (in App Store Connect)
Add a note for Apple reviewers if anything needs explanation:
```
Glow is a marketplace for Personal Support Workers (Providers) 
in Ontario. Users book hourly in-home care services.

- Test account (customer): +1 647 620-9243
- Test account (Provider): [provide credentials]
- Login does NOT require app installation for testing

All Providers are background-checked before approval.
```

---

## 8. Final Submission

### Before Clicking Submit
- [ ] All metadata filled (no empty required fields)
- [ ] Screenshots uploaded (min 5 per device size)
- [ ] Build uploaded (.ipa file)
- [ ] Privacy Policy URL live
- [ ] Terms URL live
- [ ] Support email/form works
- [ ] Version number matches build
- [ ] Content rating completed (Apple's form)

### Content Rating Questionnaire
- [ ] Medical/health info: "Minimal"
- [ ] User-generated content: "Yes" (reviews)
- [ ] Other: Follow Apple's prompts

### Submit
1. Go to App Store Connect → Your App → Build
2. Select build → Add to version
3. Click "Submit for Review"
4. Wait for Apple (typically 24–48 hours)

**Status tracking:** Check email or App Store Connect dashboard

---

## 9. After Approval

- [ ] App lives on App Store
- [ ] Update landing page with App Store badge/link
- [ ] Post in social media
- [ ] Send to beta testers
- [ ] Monitor for crashes (Xcode Organizer → Crashes)

---

## Timeline Estimate

| Task | Time |
|------|------|
| Write metadata + screenshots | 2–4 hours |
| Create landing pages (privacy/terms/support) | 1–2 hours |
| Deploy landing page | 15 min |
| Build for App Store | 30 min |
| Apple review | 24–48 hours |
| **Total** | **~4–7 hours active work** |

---

## Helpful Links

- **App Store Connect:** https://appstoreconnect.apple.com/
- **Apple App Review Guidelines:** https://developer.apple.com/app-store/review/guidelines/
- **Privacy Policy Generator:** https://www.iubenda.com/ (Canada-compliant)
- **Simulator screenshot sizes:** https://developer.apple.com/design/human-interface-guidelines/ios/
- **EAS Documentation:** https://docs.expo.dev/eas-update/introduction/

---

## Notes

- Metadata changes are **fast** (no re-review needed after approval)
- Screenshots can be updated without new build
- App Store Connect is the **only** place you configure all this — nothing in code
- Keep `landing/` and `mobile/` versions in sync for consistency

---

**Last updated:** 2026-07-01  
**Status:** [ ] In Progress | [ ] Complete
