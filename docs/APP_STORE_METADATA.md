> ⚠ SUPERSEDED — use [APP_STORE_SUBMISSION.md](APP_STORE_SUBMISSION.md). This file kept for history; some values here (bundle ID, URLs) are WRONG.

# App Store Connect Metadata Checklist

Fill this in before submission.

## General
- [x] App Name: "Glow"
- [x] Subtitle: "Personal Support Workers"
- [x] Keywords: "Provider, personal support, caregiving, companionship, Sudbury, Ontario"
- [x] Description: 

Glow connects customers in Greater Sudbury with vetted Personal Support Workers (Providers) for affordable, flexible companionship and personal care.

Whether you need help with daily tasks, errands, appointments, or just friendly conversation, Glow puts trusted Providers at your fingertips. All Providers are vetted through background checks and verified in the Greater Sudbury area.

Starting at just $25/hour with a 3-hour minimum booking, you can find and book a Provider in seconds. Real-time location sharing lets you know exactly when your Provider is arriving.

Glow is not a medical service. Providers provide companionship and personal support, not nursing or clinical care.

**Key Features:**
• Browse vetted Providers and their availability in real-time
• Book instantly with transparent $25/hour pricing
• Receive real-time updates on your Provider's arrival
• Secure account with two-factor verification
• Rate and review Providers after each booking
• Flexible cancellation with 24-hour notice

Download Glow today and experience affordable, trustworthy personal support in Greater Sudbury.

## Privacy
- [x] Privacy Policy URL: https://ca.glow.app/privacy
- [x] Privacy policy effective date: June 30, 2026

## App Privacy Questionnaire (Section 5.1.1)
Location Data:
- [ ] Precise location: YES (required for Provider matching)
- [ ] Approximate location: YES
- [ ] Used for tracking: NO

Contact Info:
- [ ] Name: YES (booking, communication)
- [ ] Email: YES (notifications, support)
- [ ] Phone: YES (OTP, emergency contact)

User-Generated Content:
- [ ] Photos/documents: YES (police check, ID verification)
- [ ] Data retained: 90 days post-account deletion (per privacy policy)

Identifiers:
- [ ] User ID: YES (internal booking tracking)
- [ ] Device ID: NO

## Version & Build
- [x] Version number: 1.0.0
- [x] Build number: auto-increment enabled in app.json
- [x] Min iOS: 16.0 (per app.json)

## Release Notes
- [x] Filled in App Store Connect: "Initial launch: find vetted Providers in Greater Sudbury"

## Screenshots & Preview
- [ ] 6.7" (or 6.5") iPhone screenshots (5-7 total, showing: home, search, booking, profile)
- [ ] iPad screenshots if applicable (app must run on iPad if set in app.json, currently false)
- [ ] App preview video (optional, 30s max)
- [ ] Icon (1024×1024, no alpha channel, fits safe area)

## Age Rating
- [x] Completed IARC questionnaire: 4+ rating (no violence/drugs/inappropriate content)
  - Select "None Indicated" for all content categories in IARC form

## Review Notes (CRITICAL for App Store reviewer)
Paste this verbatim in "Notes" field:

---
**Background Location Usage**

This app uses background location updates to help Personal Support Workers (Providers) broadcast their real-time availability to customers when actively working (while a booking is in progress). Background location is only enabled when the Provider explicitly accepts a booking and remains only while that booking is active. When the app is backgrounded or the booking is completed, location tracking stops immediately.

This is essential for customer safety and service reliability — customers need to know when their Provider is on the way or nearby.

**Test Account for Review**

To test the app's full flow, use the following reviewer account:

- Phone: +1 555 555 0100
- OTP: 000000
- Role: CUSTOMER (auto-provisions on first login, name "App Reviewer")

Steps:
1. Sign up with the phone number above, use verification code 000000.
2. Complete Provider onboarding if testing as Provider (name, hourly rate, availability).
3. Search for available Providers as customer.
4. Create a test booking and observe location broadcast.
5. To test account deletion: Profile tab → scroll to bottom → Delete Account → confirm twice.

---

## Legal
- [x] Terms of Service URL: https://ca.glow.app/terms
- [x] EULA: Uses Terms of Service above

## Compliance & Testing
Before submitting:
- [ ] Run `npm run build:web` in mobile/ and test PWA locally
- [ ] Run `eas build --platform ios --profile production` and test on physical device (or simulator)
- [ ] Confirm account deletion works (delete test account, re-login fails)
- [ ] Confirm location broadcast works (book as customer, accept as Provider in another device/simulator, see location update)
- [ ] Confirm OTP works (sign up with real phone or test number)
- [ ] Check no console errors in Xcode
- [ ] Confirm Profile → Privacy Policy / Terms of Service rows open the correct URLs
- [ ] Confirm signup screen shows the Terms/Privacy agreement text above the Continue button
