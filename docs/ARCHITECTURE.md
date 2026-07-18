# Architecture

Glow is a **monorepo** with four independent apps in one Git repository. They do not share a build system — each is deployed separately. Understanding the boundaries prevents the most common mistakes (e.g. running Expo from the wrong folder, or assuming `api/` is the live backend).

```
project/
├── src/          → Backend API   (Node + Express + Prisma/PostgreSQL)   → Railway
├── mobile/       → Mobile app    (Expo SDK 52 RN)                       → EAS (native) + Vercel (PWA)
├── landing/      → Landing site  (Next.js)                              → Vercel
├── admin/        → Admin panel   (static HTML/CSS/JS)                   → Vercel
├── api/          → ⚠️ LEGACY Vercel wrapper (MongoDB) — does NOT match src/. Do not use.
├── prisma/       → DB schema + migrations (used by src/)
├── e2e/          → Playwright end-to-end tests
├── docs/         → This documentation
└── dev.sh        → Local dev launcher (backend + mobile web together)
```

---

## The four apps

### 1. Backend API — `src/`
- **Stack:** Node.js 22, Express, **Prisma ORM over PostgreSQL**, JWT auth, OTP via Twilio, Stripe (tracked-only in MVP), Socket.IO, ioredis.
- **Entry:** `src/server.js` → `npm start`. Express app assembled in `src/app.js`.
- **DB:** Prisma client in `src/lib/prisma.js`; schema in `prisma/schema.prisma` (`provider = "postgresql"`). Migrate with `npx prisma migrate deploy`.
- **Deploy:** Railway, auto-deploy from `main`. Config in `railway.toml` (Nixpacks, `npm start`, health `/health`).
- **Health:** `GET /health` → `{ status, services: { postgres, redis } }`.

### 2. Mobile app — `mobile/`
- **Stack:** Expo SDK 52, React Native 0.76.9, React 18.3.1, React Navigation. Identity `ca.glow.app`, EAS project `25965512…`.
- **Two outputs from one codebase:**
  - **Native** (iOS/Android) via **EAS Build** → app stores. Profiles in `mobile/eas.json`.
  - **PWA** (web) via `npx expo export -p web` → `mobile/dist/` → **Vercel** (`glow.vercel.app`).
- **Navigation:** `RootNavigator` → `Customer` / `Provider` / `Admin` / `Auth` navigators (role-based).
- **Build guide:** [`MOBILE_APP.md`](MOBILE_APP.md). **Run `expo`/`eas` only from `mobile/`.**

### 3. Landing site — `landing/`
- **Stack:** Next.js. Marketing/SEO front door.
- **Deploy:** Vercel → `glow-landing.vercel.app`. Separate Vercel project from the PWA.

### 4. Admin panel — `admin/`
- **Stack:** Static `index.html` + `app.js` + `styles.css`. No build step.
- **Deploy:** Vercel (static), `glow-admin.vercel.app`.

---

## Deploy targets at a glance

| App | Folder | Platform | URL | Trigger |
|-----|--------|----------|-----|---------|
| Backend | `src/` | Railway | `api.glow.app` | push to `main` |
| Mobile PWA | `mobile/` | Vercel | `glow.vercel.app` | Vercel build of `dist/` |
| Mobile native | `mobile/` | EAS | App Store / Play | manual `eas build` |
| Landing | `landing/` | Vercel | `glow-landing.vercel.app` | push to `main` |
| Admin | `admin/` | Vercel | `glow-admin.vercel.app` | push to `main` |

> After a Vercel deploy, alias the new URL: `vercel alias set <new-url> glow.vercel.app` (PWA) or `… glow-landing.vercel.app` (landing).

---

## Environment variable flow

| Where | File / location | Contains | Committed? |
|-------|-----------------|----------|------------|
| Backend local | `.env` (root) | `DATABASE_URL`, `JWT_SECRET`, Twilio, Stripe | ❌ git-ignored |
| Backend prod | Railway dashboard | same | ❌ platform-stored |
| Mobile dev | `mobile/.env` | `EXPO_PUBLIC_API_URL` | ❌ git-ignored |
| Mobile build | `mobile/eas.json` → `build.<profile>.env` | `EXPO_PUBLIC_API_URL` | ✅ (non-secret only) |
| Mobile PWA prod | `mobile/.env.production` | **live secrets** | ❌ **git-ignored — never commit** |

Rules:
- `EXPO_PUBLIC_*` is the only env prefix exposed to the mobile client bundle. Never put secrets there.
- Backend secrets live only in `.env` (local) and the host dashboard (prod) — never in the repo.
- `.env.example` (committed) documents required keys with placeholder values.

---

## Known cleanup debt

Documented here so it isn't rediscovered as a surprise:

1. **`api/` is stale.** It uses MongoDB/mongoose but imports `../src/routes/*`, which are now Prisma-based. It does not run correctly. The live backend is `src/`. Either rewrite `api/` against Prisma or remove it.
2. **Legacy DB references:** older docs/notes mention MongoDB; the backend migrated to Prisma/PostgreSQL (commit `af48c81`).

---

## Local development

```bash
./dev.sh        # backend on :3000 + Expo web on :8081, mobile auto-pointed at localhost
```
Or run each app independently — see [`../README.md`](../README.md) → "Which command builds what".

Tests: `npm test` (backend Jest, `src/tests/`) · `e2e/` (Playwright).
CI: [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) — builds backend + mobile web, runs tests.
