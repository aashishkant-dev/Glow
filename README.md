# Glow

> **Connect families in Greater Sudbury with verified Personal Support Workers (Providers).**
> Private-pay Provider platform · $25/hr · 3hr minimum · bilingual EN/FR · 15 km radius.

This repository is a **monorepo** containing four apps that ship to three places. The most common confusion — *"I can't build the mobile app"* — is solved by knowing **which folder to run commands from**. See the table below.

---

## Monorepo layout

| App | Folder | What it is | Deploys to |
|-----|--------|------------|------------|
| **Backend API** | [`src/`](src/) | Node.js + Express + **Prisma/PostgreSQL** REST API | Railway (`npm start`) |
| **Mobile app** | [`mobile/`](mobile/) | **Expo SDK 52** React Native (iOS + Android + PWA) | EAS (native) + Vercel (PWA) |
| **Landing site** | [`landing/`](landing/) | Next.js marketing site | Vercel |
| **Admin panel** | [`admin/`](admin/) | Static HTML/CSS/JS dashboard | Vercel |

> ⚠️ **The mobile app lives in `mobile/`.** Always run `expo` and `eas` commands from inside `mobile/` — **never** from the repo root. The root has no Expo config (deliberately removed). See [`docs/MOBILE_APP.md`](docs/MOBILE_APP.md).

> ⚠️ **`api/` is legacy.** It is an old Vercel serverless wrapper that still uses MongoDB/mongoose and imports the now-Prisma routes — it does not match the current backend. The live backend is `src/` on Railway. Do not use `api/` without rewriting it.

For the full picture of how the four apps map to deploy targets and env vars, read **[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)**.

---

## Which command builds what

| You want to… | Run |
|--------------|-----|
| Install deps for all apps | `npm run install:all` *(repo root)* |
| Start backend + mobile web together (local dev) | `./dev.sh` (or `npm run dev:all`) |
| Start backend only | `npm run dev` *(repo root)* |
| Start mobile (Metro / Expo Go) | `cd mobile && npx expo start` |
| **Build the native Android/iOS app** | `cd mobile && eas build --platform android --profile preview` |
| Build the mobile PWA (web bundle) | `cd mobile && npm run build:web` |
| Run backend tests | `npm test` *(repo root)* |
| Deploy landing site | `cd landing && vercel --prod` |

Full mobile build/submit guide: **[`docs/MOBILE_APP.md`](docs/MOBILE_APP.md)**.

---

## Quick start — local development

### Prerequisites

| Tool | Version |
|------|---------|
| Node.js | 22+ (backend `engines` requires `>=22`) |
| PostgreSQL | 14+ (or a hosted Postgres URL) |
| Expo Go app | SDK 52 (iOS App Store / Google Play) |

### 1 — Backend (`src/`)

```bash
# From repo root
npm install
cp .env.example .env          # then edit: set DATABASE_URL + JWT_SECRET
npx prisma migrate dev        # create tables
npm run dev                   # → http://localhost:3000  (GET /health → {"status":"ok"})
```

### 2 — Mobile (`mobile/`)

```bash
cd mobile
npm install
npx expo start                # scan QR with Expo Go
```

Point the app at your local API — edit `mobile/.env`:
```
EXPO_PUBLIC_API_URL=http://<your-LAN-ip>:3000
```
The OTP code is printed in the **backend terminal** in dev mode (no Twilio needed locally).

### Or: one command for both

```bash
./dev.sh        # starts backend on :3000 and Expo web on :8081, points mobile at localhost
```

---

## Backend API reference

Base URL: `http://localhost:3000` (dev) · `https://api.glow.app` (prod)

### Auth (OTP — no passwords)
| Method | Endpoint | Body | Returns |
|--------|----------|------|---------|
| POST | `/auth/login` | `{ phone, name?, role? }` | `{ message, phone }` |
| POST | `/auth/verify` | `{ phone, otp }` | `{ token, user }` |

### Customer (Bearer JWT)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/bookings` | Create booking |
| GET | `/bookings/my` | List my bookings |
| POST | `/ratings` | Rate Provider on completed booking |

### Provider (Bearer JWT + approved)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/jobs/nearby?lat=X&lng=Y` | Nearby REQUESTED jobs (updates Provider location) |
| POST | `/jobs/:id/accept` · `/start` · `/complete` | Job lifecycle |

### Admin (Bearer JWT + ADMIN role)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/admin/providers?approved=true\|false` | List Providers |
| POST | `/admin/providers/:id/approve` | Approve a Provider |
| GET | `/admin/bookings` | All bookings (paginated) |

> Admin auth has **two** systems: an `Admin` model (`/admin/login`) and a `User` with `role=ADMIN` (mobile JWT). Middleware: `authenticateAdminOrUser` in `src/middleware/adminAuth.js`.

---

## Environment variables (backend)

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | API port |
| `DATABASE_URL` | **required** | PostgreSQL connection string (Prisma) |
| `JWT_SECRET` | **required** | 64-char random — `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` |
| `OTP_TTL_MINUTES` | `5` | OTP expiry |
| `HOURLY_RATE` | `25` | CAD/hr Provider rate |
| `NEARBY_RADIUS_KM` | `15` | Job matching radius |
| `CORS_ORIGIN` | `*` | Allowed origins |
| `STRIPE_SECRET_KEY` | — | Stripe secret (payments tracked, not charged in MVP) |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_PHONE_NUMBER` | — | Production SMS OTP |

> **Never commit `.env` files.** `mobile/.env.production` holds live secrets and is git-ignored. Mobile build-time vars go in `mobile/eas.json` (`EXPO_PUBLIC_*`), not in committed `.env` files.

---

## Deployment

| Target | App | How |
|--------|-----|-----|
| **Railway** | Backend (`src/`) | Auto-deploy from `main`. Start: `npm start`. Health: `/health`. Config: [`railway.toml`](railway.toml). Backend URL: `api.glow.app`. |
| **Vercel** | Mobile PWA | `https://glow.vercel.app` — build `mobile/dist/` via `npm run build:web`. |
| **Vercel** | Landing | `https://glow-landing.vercel.app` |
| **EAS** | Native iOS/Android | `cd mobile && eas build` — see [`docs/MOBILE_APP.md`](docs/MOBILE_APP.md) |

More detail: [`docs/DEPLOY_DEV.md`](docs/DEPLOY_DEV.md) (push to dev/staging) · [`docs/CACHING.md`](docs/CACHING.md) (cache layers + busting) · [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) · [`docs/INFRASTRUCTURE.md`](docs/INFRASTRUCTURE.md) · [`docs/CICD_PIPELINE.md`](docs/CICD_PIPELINE.md) · [`docs/DEBUGGING.md`](docs/DEBUGGING.md).

---

## Sudbury notes

- Area code **705** · default coords `-80.9924, 46.4917` (downtown Sudbury)
- Job radius 15 km (set `NEARBY_RADIUS_KM=25` for outlying areas)
- Minimum booking 3 hours · server runs UTC, dates rendered via `toLocaleDateString('en-CA')`

---

*Glow · Greater Sudbury, Ontario, Canada* 🇨🇦
