# Local Testing Guide

Everything needed to run + test Glow locally. Written after a full live-test session so future runs skip the trial-and-error.

---

## 0. Prerequisites in `.env` (root)

The backend is **Prisma + PostgreSQL**. `.env` MUST have `DATABASE_URL`. If you only see `MONGODB_URI`, it's **stale** (old Mongo backend) — the code ignores it.

```bash
# .env (root) — required
DATABASE_URL="postgresql://postgres:<pw>@kodama.proxy.rlwy.net:25911/railway"   # dev DB, PUBLIC host
JWT_SECRET="<64-char random>"
```

> **Railway gotcha:** use the **public** connection URL (`*.proxy.rlwy.net:<port>`), NOT the `*.railway.internal:5432` one. Internal only resolves inside Railway's network; your laptop can't reach it.

`.env` is git-ignored — safe to keep the URL there.

---

## 1. Start the backend

```bash
# from repo root
npm start            # node src/server.js → port 3000
# health: curl http://localhost:3000/health  → {"status":"ok","services":{"postgres":"ok","redis":"ok"}}
```
DB already has tables (migrations applied). If a fresh DB: `npx prisma migrate deploy` first.

---

## 2. Seed an admin (to approve Providers)

```bash
npm run seed:admin                 # username "admin", password "devadmin123"
# or: ADMIN_USERNAME=you ADMIN_PASSWORD=pass npm run seed:admin
```
Idempotent. Log in at the web admin panel's `/admin/login`. Admin model lives in Postgres `Admin` table.

---

## 3. Run the web app against the LOCAL backend

⚠️ **Two build-env traps** (cost real time — read this):

1. **`expo export` runs in production mode** → it reads `.env.production`, NOT `.env`. `.env.production` has `EXPO_PUBLIC_API_URL=""`, so the build falls back to the prod API. To point the web build at your local backend, **set the env inline** AND move `.env.production` aside, AND clear Metro cache:

2. **`client.ts` ignores any URL containing `localhost`** in production builds (`if (url.includes('localhost')) ... return api.glow.app`). So you MUST use **`127.0.0.1`**, not `localhost`.

Working command:
```bash
cd mobile
mv .env.production .env.production.bak 2>/dev/null || true
EXPO_PUBLIC_API_URL=http://127.0.0.1:3000 npx expo export -p web --clear
node scripts/post-web-build.js
# verify the bundle baked the right URL:
grep -ro "127.0.0.1:3000" dist/_expo/static/js/web/*.js   # should match
# serve it:
npx serve dist -l 4599
# RESTORE after testing:
mv .env.production.bak .env.production 2>/dev/null || true
```
Backend `CORS_ORIGIN=*` so `localhost:4599 → 127.0.0.1:3000` works.

> Service worker caches aggressively. In the browser, before reloading a new build: DevTools → Application → unregister SW + clear site data. (In automated testing, run `navigator.serviceWorker.getRegistrations()` → unregister, then `caches.keys()` → delete.)

---

## 4. Test accounts + OTP

- **OTP is printed to the backend console** in dev (no Twilio). Find it: `grep "\[OTP\]" <backend-log>` → e.g. `[OTP] +17055551234 → 514776`.
- **Register a Provider** quickly via API:
  ```bash
  curl -s -X POST http://localhost:3000/auth/login \
    -H "Content-Type: application/json" \
    -d '{"phone":"+17055551234","name":"Test Provider","role":"Provider"}'
  # then grep the OTP from the log and verify in the UI (Returning → phone → OTP)
  ```
- Roles: `CUSTOMER`, `Provider`, `SALON` (self-register). `ADMIN` cannot self-register — use `npm run seed:admin`.

---

## 5. Full Provider → approval flow (what to test)

1. Register Provider (above) → log in → completes onboarding (4 steps) → lands on **Provider Dashboard**.
2. New Provider = `approvedByAdmin: false` → Dashboard shows "Awaiting Admin Approval".
3. Log into the **web admin panel** (`admin`/`devadmin123`) → Provider list → approve the account. A new registration appears immediately (registration busts the admin-list cache).
4. Back in the app, the Provider is approved → can accept jobs.

> Onboarding-complete is the stored `onboardingComplete` flag (set by `POST /auth/provider-profile`). It does NOT depend on the optional license number (that bug was fixed — see commit history).

---

## 6. Deploying to dev.glow.app

The dev site is a Vercel deploy of `glow-pwa` (rootDirectory `mobile`), aliased to `dev.glow.app`. It talks to the **prod** backend (`api.glow.app`), so data created from dev hits the prod DB — UI testing is safe, data-writing is not.

```bash
cd mobile
npm run build:web                 # uses .env.production → api.glow.app (correct for dev site)
npx vercel deploy --prebuilt
npx vercel alias set <printed-url> dev.glow.app
```
After deploy, bump `mobile/web/sw.js` CACHE version if clients see stale UI (see [`CACHING.md`](CACHING.md)).

---

## Quick reference

```bash
# local backend + DB
npm start                                    # :3000
npm run seed:admin                           # admin / devadmin123

# web app → LOCAL backend (note 127.0.0.1, not localhost; move .env.production aside)
cd mobile && mv .env.production .env.production.bak
EXPO_PUBLIC_API_URL=http://127.0.0.1:3000 npx expo export -p web --clear && node scripts/post-web-build.js
npx serve dist -l 4599
mv .env.production.bak .env.production        # restore

# OTP: grep "\[OTP\]" in backend output
```

See also: [`DEPLOY_DEV.md`](DEPLOY_DEV.md), [`CACHING.md`](CACHING.md), [`MOBILE_APP.md`](MOBILE_APP.md).
