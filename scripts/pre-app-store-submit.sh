#!/bin/bash
# Pre-App Store Submission Verification
# Run from the repo root: ./scripts/pre-app-store-submit.sh

set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "Pre-App Store Submission Verification"
echo "========================================="

echo "1. Checking TypeScript compilation (mobile)..."
cd "$ROOT_DIR/mobile"
npx tsc --noEmit -p tsconfig.json
echo "OK: TypeScript compiles"

echo "2. Checking landing page builds..."
cd "$ROOT_DIR/landing"
npm run build
echo "OK: Landing page builds"

echo "3. Verifying privacy/terms routes exist..."
if [ ! -f "app/privacy/page.tsx" ]; then
  echo "FAIL: Missing landing/app/privacy/page.tsx"
  exit 1
fi
if [ ! -f "app/terms/page.tsx" ]; then
  echo "FAIL: Missing landing/app/terms/page.tsx"
  exit 1
fi
echo "OK: Privacy & Terms pages exist"

echo "4. Checking mobile/app.json for critical config..."
cd "$ROOT_DIR/mobile"
if grep -q "YOUR_GOOGLE_MAPS_ANDROID_API_KEY" app.json 2>/dev/null; then
  echo "WARNING: Placeholder Google Maps key still in app.json — replace before Android build"
fi
if ! grep -q '"autoIncrement": true' eas.json 2>/dev/null; then
  echo "FAIL: mobile/eas.json missing autoIncrement: true on the production profile (build number won't auto-increment)"
  exit 1
fi
echo "OK: app.json / eas.json config looks sane"

echo "5. Checking for sensitive data in auth logging..."
cd "$ROOT_DIR"
if grep -rEn "console\.log.*\b(otp|OTP|password|token)\b" src/routes/auth.js src/services 2>/dev/null; then
  echo "WARNING: Possible sensitive data in console.log — review before submit"
fi

echo "6. Verifying ProfileScreen has privacy/terms links..."
if grep -q "Privacy Policy" mobile/src/screens/shared/ProfileScreen.tsx; then
  echo "OK: ProfileScreen links present"
else
  echo "FAIL: ProfileScreen missing privacy/terms links"
  exit 1
fi

echo "7. Verifying signup screen has Terms/Privacy agreement text..."
if grep -q "Terms of Service" mobile/src/screens/auth/PhoneScreen.tsx; then
  echo "OK: Signup agreement text present"
else
  echo "FAIL: PhoneScreen missing Terms/Privacy agreement text"
  exit 1
fi

echo ""
echo "All checks passed. Ready for EAS build."
echo ""
echo "Next steps:"
echo "1. Fill docs/APP_STORE_METADATA.md (screenshots, app name, description, etc.)"
echo "2. Paste review notes from docs/APP_STORE_METADATA.md into App Store Connect -> Notes field"
echo "3. Run: cd mobile && eas build --profile production --platform ios"
echo "4. Run: cd mobile && eas submit --profile production --platform ios --latest"
