# iOS Testing Guide — Apple Developer Account

> **Goal:** Build and test Glow on real iOS devices using your Apple Developer account **without deploying to production**.

---

## Overview: Two Testing Paths

### Path 1: **Quick Ad Hoc Build** ⚡ (Recommended for initial testing)
- Build once → install on up to **10 test devices**
- No TestFlight approval needed
- **Fastest path** to get the app on real devices
- UDIDs must be pre-registered

### Path 2: **TestFlight Beta Testing** 🧪 (Better for ongoing testing)
- Invite testers via email
- TestFlight manages up to **10,000 testers** per build
- **No UDID registration** needed
- Users can install from TestFlight app
- Apple reviews the build (typically 24–48 hours)

---

## Pre-Build Checklist: What You Need

### ✅ Apple Developer Account Requirements
- [ ] Active Apple Developer Program membership ($99/year)
- [ ] App identifier registered: `app.glow.mobile`
- [ ] Development & Distribution certificates created
- [ ] Provisioning profiles (adhoc + appstore)
- [ ] Devices registered (for ad hoc)

### ✅ Assets & Branding
**Current status:** You have assets in `mobile/assets/`:
- `icon.png` — App icon (1024×1024) ✅
- `splash.png` — Launch screen ✅
- `adaptive-icon.png` — Adaptive icon (Android) ✅
- `notification-icon.png` — Notification badge ✅

**What to verify/provide:**
1. **App Icon** (`icon.png`)
   - Must be 1024×1024 px, PNG, no transparency borders
   - Avoid thin lines, ensure clarity at small sizes
   - **Provide:** Your finalized logo/icon

2. **Splash Screen** (`splash.png`)
   - Recommend: 1242×2208 px (iPhone 12 Pro Max ratio)
   - Should include your brand colors + logo
   - **Provide:** Your branded splash screen

3. **App Name & Description**
   - App name: "Glow" ✅
   - Description: "Book trusted Personal Support Workers near you in Sudbury, Ontario." ✅
   - Both are already configured in `mobile/app.json`

---

## Step-by-Step: Build for iOS Testing

### Phase 1: Verify Your Setup (5 min)

```bash
cd mobile

# Check environment
eas whoami                      # Should show your EAS account
npx expo config --type public   # Verify app config (bundle ID, etc.)

# Diagnostic
npx expo-doctor                 # Should report 18/18 ✅
```

**Expected output for `eas whoami`:**
```
expo | username: aashishkant69s-organization
expo | organizationName: aashishkant69s-organization
```

---

### Phase 2a: Ad Hoc Build (Recommended First)

#### Step 1: Get Device UDIDs from Testers
Ask test devices' owners to provide their UDIDs. On each test device:
1. Connect to a Mac with Xcode
2. Or use: https://www.udidcreator.com/ (online tool)
3. Or ask testers to send you their device UDID from Settings

#### Step 2: Register Devices in Apple Developer
1. Go to **[Apple Developer Console](https://developer.apple.com/account)**
2. **Certificates, Identifiers & Profiles** → **Devices**
3. Click **+** → Register a new device
4. Add each test device UDID + device name
5. Generate a new **Ad Hoc Provisioning Profile** after registering

#### Step 3: Trigger EAS Build for Ad Hoc
```bash
cd mobile

# Build for ad hoc distribution (device)
# EAS will ask for your Apple credentials
eas build --platform ios --profile preview

# Status & download link will appear
# Once done, you'll get an .ipa file download link
```

> **Note:** If prompted for Apple credentials, EAS stores them securely for future builds.

#### Step 4: Distribute to Testers
- Download the `.ipa` file
- Send it to testers (via email, Dropbox, etc.)
- Testers install via **Xcode** or **Apple Configurator 2**

---

### Phase 2b: TestFlight Build (Better for Team Testing)

#### Step 1: Build for App Store
```bash
cd mobile

# Create a release build (will be reviewed by Apple)
eas build --platform ios --profile production

# Check build status
eas build:list                  # View all your builds
```

#### Step 2: Submit to TestFlight
```bash
cd mobile

# Submit for TestFlight review
eas submit --platform ios --profile production

# First time: EAS will prompt for App Store Connect credentials
```

#### Step 3: Invite Testers in App Store Connect
1. Go to **[App Store Connect](https://appstoreconnect.apple.com)**
2. **My Apps** → **Glow** → **TestFlight**
3. Under **Builds** → select the build you just submitted
4. Add internal testers (your team) or external testers (up to 10k)
5. They'll receive an email with TestFlight invite link

#### Step 4: Testers Download via TestFlight App
- Testers tap the link → "Open in TestFlight"
- TestFlight app downloads & installs on their device
- Testers can leave feedback directly

---

## Build Configuration: What's Already Set Up

### Current `eas.json` Profiles

| Profile | Purpose | Device | API |
|---------|---------|--------|-----|
| `preview` | Ad hoc testing | Real device | `https://api.glow.app` |
| `production` | App Store / TestFlight | Real device | `https://api.glow.app` |
| `development` | Dev client + simulator | Simulator | `https://api.glow.app` |

**Current API endpoint:** `https://api.glow.app`  
> **Note:** When you go to production, update this to your production API (e.g., `https://api.glow.app`)

### iOS Configuration in `app.json`
```json
"ios": {
  "bundleIdentifier": "app.glow.mobile",
  "buildNumber": "1",
  "supportsTablet": false
}
```

---

## What to Verify Before Testing

### Backend API Connectivity
Test users should verify the API is reachable:
```bash
# From phone browser or app logs
curl https://api.glow.app/health

# Should return: 200 OK + JSON response
```

### Permissions (iOS)
The app requests:
- **Location** — for Provider discovery & arrival tracking ✅ Configured
- **Photos** — for profile pictures ✅ Configured
- **Camera** — for profile photo capture ✅ Configured
- **Notifications** — for bookings & messages ✅ Configured

Users will see permission prompts on first launch. This is **normal**.

### Features to Test on iOS
- [ ] Login / signup
- [ ] Location services (Provider discovery)
- [ ] Photo upload (profile)
- [ ] Booking flow
- [ ] Notifications
- [ ] GPS tracking (during active job)
- [ ] Offline behavior (if applicable)

---

## Troubleshooting

### **Build fails: "Certificate not found"**
- EAS manages certificates for you
- First build will prompt for Apple credentials
- Answer yes → EAS creates certificates automatically

### **App crashes on launch**
- Check backend API is reachable (see section above)
- Review app logs in Xcode or via `eas logs`
- Run: `npx expo-doctor`

### **Tester can't install (Ad Hoc)**
- Verify their device UDID was added to provisioning profile
- Device must be on the same Wi-Fi as the provisioning profile
- Try Apple Configurator 2 instead of Xcode

### **TestFlight build rejected**
- Common reasons: content policy, privacy, crash on launch
- Apple will email rejection reason
- Fix issue + rebuild with incremented build number

---

## Build Number Management

Each iOS build needs a **unique build number**. Currently set to `"1"` in `app.json`:

```json
"buildNumber": "1"
```

**How to increment:**
1. For **internal testing** (preview/ad hoc): No need to increment, EAS manages it
2. For **App Store** (production): Increment before each submit
   ```json
   "buildNumber": "2"
   ```

> **Tip:** Use `"buildNumber": "remote"` to let EAS auto-increment.

---

## Next Steps

### Immediate (Today)
1. [ ] Verify Apple Developer account active
2. [ ] Collect test device UDIDs
3. [ ] Run `eas whoami` + `npx expo-doctor`
4. [ ] Choose: Ad Hoc (fast) or TestFlight (managed)

### Build & Deploy (Day 1)
1. [ ] Run: `eas build --platform ios --profile preview` (Ad Hoc)
   - OR: `eas build --platform ios --profile production` (TestFlight)
2. [ ] Download `.ipa` (Ad Hoc) or submit to TestFlight
3. [ ] Distribute to testers

### Testing (Day 1–3)
1. [ ] Testers install app
2. [ ] Test login, location, booking flow
3. [ ] Collect feedback on bugs / UX
4. [ ] Iterate on code if needed (re-run build)

### Production Later
- Update API endpoint in `eas.json` → `https://api.glow.app`
- Prepare app store listing (screenshots, description, privacy policy)
- Increment version when ready for App Store submission

---

## Assets Checklist

**Before final production build, provide:**

| Asset | Size | Format | Status |
|-------|------|--------|--------|
| App Icon | 1024×1024 | PNG | ✅ Have `icon.png` |
| Splash Screen | 1242×2208 | PNG | ✅ Have `splash.png` |
| App Store Screenshots | 1170×2532 | PNG | ❓ Needed for production |
| Privacy Policy URL | – | HTTPS | ❓ Needed for production |
| Support Email | – | Email | ❓ Needed for production |
| App Description | – | Text | ✅ Configured |

---

## Questions to Clarify

Before we proceed, please provide:

1. **Test Devices:** How many devices? Do you have UDIDs?
2. **Testing Timeline:** When do you want to start testing?
3. **Testers:** Is this internal team only, or external beta testers?
4. **API Environment:** Should testing use `glow.onrender.com` or a staging server?
5. **Branding Assets:** Do you want to update the splash screen or icon?

---

## Commands Quick Reference

```bash
cd mobile

# Verify setup
eas whoami
npx expo-doctor

# Build for testing
eas build --platform ios --profile preview          # Ad Hoc
eas build --platform ios --profile production       # TestFlight

# View builds
eas build:list
eas build:view <BUILD_ID>

# Download logs
eas logs --build-id <BUILD_ID>

# Submit to TestFlight
eas submit --platform ios --profile production
```

---

## Support

For detailed Expo + EAS docs, see:
- [Expo Documentation](https://docs.expo.dev/)
- [EAS Build for iOS](https://docs.expo.dev/build/setup/#ios)
- [EAS Submit (App Store)](https://docs.expo.dev/build/submit-to-app-stores/)
