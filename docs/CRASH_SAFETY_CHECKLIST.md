# Crash-Safety Checklist — "will this change break the app?"

The live iOS app (App Store build 4) gets JS fixes **over-the-air** (EAS Update). A bad
OTA bundle crashes the app on launch for every user until you push a fixed update —
there is no app-store review to catch it. This checklist is how we make sure that
never happens.

**TL;DR: green CI = safe. CI now runs the exact checks below on every push.**

---

## 1. The three delivery channels — know which one your change rides

| Change touches | Ships via | Crash blast radius |
|---|---|---|
| `mobile/src/**` (JS/TS only) | **OTA** (`eas update`) + PWA deploy | Live App Store users + glow.app |
| `mobile/app.json`, `mobile/package.json` deps, `eas.json`, native modules | **EAS native build + App Store submission** — OTA CANNOT deliver this | New binary only; old builds keep old behavior |
| `landing/**` | Vercel deploy | ca.glow.app only, no app risk |
| `src/**` (backend) | Railway auto-deploy from main | API downtime — app shows errors but doesn't crash |

⚠️ **The dangerous combo:** changing `mobile/src` code that *depends on* a new native
module or config in the same commit. OTA delivers the JS to OLD binaries that lack the
native side → **instant crash on launch**. CI's "OTA safety check" job warns on every
push that touches native-affecting files. When you see that warning, do NOT rely on
the auto-OTA — build first.

## 2. What CI verifies on every push (the automated gate)

- **Mobile crash gate** — `tsc --noEmit` + `expo export -p ios -p android`. This
  produces the exact bundle an OTA would ship; if Metro can't build it, the job fails
  **before** anything reaches users. Red X here = "the app WOULD crash".
- **OTA safety check** — warns (yellow annotation on the commit) when native-affecting
  files changed, meaning OTA can't deliver the change.
- **PWA bundle assertions** — fonts relocated out of `assets/node_modules` (else all
  icons render blank on Vercel), no dev API URL in the prod bundle.
- **Backend** — `node --check` every file, Jest, `prisma validate`, secret scan.
- **Post-deploy verification (main)** — after deploying, CI *fails loudly* if:
  API `/health` ≠ 200 (3 min retry), landing down, PWA bundle 404s, PWA points at the
  dev DB, icon fonts 404, admin down. A green deploy job means prod is actually alive.
- **Auto-OTA** — when `mobile/src` changed on main and checks pass, CI publishes the
  OTA update itself (needs `EXPO_TOKEN` secret — see §5).

## 3. Manual pre-ship checklist (for local / emergency deploys)

```bash
# 1. Types
cd mobile && npx tsc --noEmit

# 2. The bundle OTA would ship — this is the crash check
npx expo export -p ios -p android --output-dir /tmp/native-check

# 3. PWA build + font relocation + dev-URL check (script does all three)
cd .. && bash tests/deploy-prod-pwa.sh        # builds, verifies, deploys prod PWA

# 4. OTA publish (only after 1+2 pass)
cd mobile && EXPO_PUBLIC_API_URL=https://api.glow.app \
  npx eas-cli update --branch production --environment production --message "fix: ..."

# 5. Landing
cd landing && npm run build && vercel deploy --prod --yes --scope aashishkants-projects
# then: vercel alias set <url> glow-landing.vercel.app

# 6. Live smoke (all systems)
bash scripts/system-check.sh
```

## 4. If a bad OTA ships anyway — rollback in <2 minutes

```bash
cd mobile
# List recent updates; find the last good group
npx eas-cli update:list --branch production --limit 5
# Republish the last good update group (instant rollback)
npx eas-cli update:republish --group <GOOD_GROUP_ID> --non-interactive
```
Users recover on next app relaunch (updates apply on the 2nd launch after download).

## 5. One-time setup still needed

- **`EXPO_TOKEN` repo secret** — required for CI auto-OTA. Create at
  https://expo.dev → Account settings → Access tokens, then:
  `gh secret set EXPO_TOKEN`. Until set, CI prints a yellow "OTA skipped" warning and
  you must publish manually (§3 step 4).

## 6. Rules of thumb

- Never bump an Expo SDK / native dependency in the same commit as JS bug fixes.
- `runtimeVersion` policy is `appVersion` (1.0.1): OTA only reaches binaries whose
  `version` in app.json matches. Bumping `version` silently orphans OTA for old builds.
- Prod PWA must be built with `EXPO_PUBLIC_API_URL=https://api.glow.app`
  (otherwise logins hit the dev DB — CI asserts this).
- The PWA post-build step (`scripts/post-web-build.js`) is mandatory, not cosmetic.
- Schema changes: `prisma migrate dev` locally, commit the migration; CI runs
  `migrate deploy` against prod after tests pass.
