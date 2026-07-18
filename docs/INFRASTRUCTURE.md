# Glow Infrastructure Guide

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│  PRODUCTION (glow.app)                                │
│                                                             │
│  PWA        → glow.app          (Vercel)             │
│  Landing    → landing.glow.app  (Vercel)             │
│  Admin      → admin.glow.app    (Vercel)             │
│  Backend    → api.glow.app      (Railway)            │
│  Database   → PostgreSQL              (Railway plugin)     │
│  Cache      → Redis                   (Upstash)            │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  DEV (dev.glow.app)                                   │
│                                                             │
│  PWA        → dev.glow.app      (Vercel)             │
│  Backend    → api-dev.glow.app  (Railway dev env)    │
│  Database   → PostgreSQL              (Railway dev plugin) │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Vercel Projects

| Project | Domain | Root Dir | Build Command | Project ID |
|---------|--------|----------|---------------|------------|
| glow-pwa | glow.app, dev.glow.app | mobile/ | npm run build:web | prj_7FykpvoccjMs9QKZcD8jxl7vQ62w |
| landing | landing.glow.app | landing/ | npm run build | prj_4KonVbegRB8BCfB7rGG9bAhCVeuP |
| admin | admin.glow.app | admin/ | (static) | prj_TgGySFmZ2f6pfuP2MLUwAv7CfgkA |

**Org ID:** `team_3ucuU6nY6h28u3fr1Q6LTU9y`

---

## Railway

- **Service:** glow-api
- **Start command:** `npm start` → `node src/server.js`
- **Health check:** `GET /health`
- **Production env** → `api.glow.app`
- **Dev env** → `api-dev.glow.app` (set up separately)
- **Config file:** `railway.toml`

---

## CI/CD (GitHub Actions)

**File:** `.github/workflows/ci.yml`

**Triggers:**
- `push` to `main` → full test + deploy pipeline
- `push` to `dev` → test + deploy to dev environment only
- `pull_request` to `main` → tests only (no deploy)

**Pipeline on `main` push:**
1. Backend tests (Jest)
2. Landing build (Next.js)
3. PWA build (Expo web export)
4. Deploy landing → `landing.glow.app`
5. Deploy PWA → `glow.app`
6. Deploy admin → `admin.glow.app`
7. Run Prisma migrations on prod DB
8. Health checks on all 4 endpoints

**Pipeline on `dev` push:**
1. Backend tests
2. PWA build with `EXPO_PUBLIC_API_URL=https://glow-dev-api-development.up.railway.app`
3. Deploy PWA → `dev.glow.app`
4. Run Prisma migrations on dev DB
5. Health check dev API

**Required GitHub Secrets:**
```
VERCEL_TOKEN              # Vercel personal access token
VERCEL_TEAM_ID            # team_3ucuU6nY6h28u3fr1Q6LTU9y
RAILWAY_DATABASE_URL_PROD # postgres://... (Railway prod DB)
RAILWAY_DATABASE_URL_DEV  # postgres://... (Railway dev DB)
```

---

## Backend Environment Variables

### Production (Railway prod environment)
```env
NODE_ENV=production
DATABASE_URL=<Railway Postgres URL>
REDIS_URL=<Upstash Redis URL>
JWT_SECRET=<long random string>
TWILIO_ACCOUNT_SID=<from Railway variables>
TWILIO_AUTH_TOKEN=<from Railway variables>
TWILIO_PHONE_NUMBER=<from Railway variables>
BLOB_READ_WRITE_TOKEN=<Vercel Blob token>
CORS_ORIGIN=https://glow.app,https://admin.glow.app,https://landing.glow.app
HOURLY_RATE=25
NEARBY_RADIUS_KM=15
ADMIN_USERNAME=admin
ADMIN_BOOTSTRAP_PASSWORD=<secure password>
```

### Dev (Railway dev environment)
Same as above except:
```env
NODE_ENV=development
DATABASE_URL=<Railway dev Postgres URL>   # separate DB — no prod data
CORS_ORIGIN=https://dev.glow.app,https://admin.glow.app,*
```

---

## Domains & DNS

| Domain | Points to | Purpose |
|--------|-----------|---------|
| glow.app | Vercel (glow-pwa) | Production PWA |
| dev.glow.app | Vercel (glow-pwa dev alias) | Dev PWA |
| api.glow.app | Railway prod service | Production backend |
| api-dev.glow.app | glow-dev-api-development.up.railway.app | Dev backend |
| landing.glow.app | Vercel (landing project) | Marketing site |
| admin.glow.app | Vercel (admin project) | Admin panel |

---

## External Services

| Service | Used for | Env var |
|---------|----------|---------|
| Twilio | SMS OTP delivery | TWILIO_* |
| Vercel Blob | Document & photo storage | BLOB_READ_WRITE_TOKEN |
| Upstash Redis | API caching, OTP rate limiting | REDIS_URL |
| Expo Push | Mobile push notifications | (via expoPushToken in DB) |

---

## Monorepo Structure

```
/
├── src/                  # Backend (Express + Prisma)
│   ├── routes/           # API routes
│   ├── middleware/        # Auth, validation, upload
│   ├── utils/            # push, otp, storage, cache
│   └── server.js         # Entry point
├── prisma/
│   └── schema.prisma     # PostgreSQL schema
├── mobile/               # PWA (Expo + React Native Web)
│   ├── src/
│   │   ├── api/          # client.ts — all API calls
│   │   ├── navigation/   # RootNavigator, Provider/Customer/Admin
│   │   ├── screens/      # All screens
│   │   └── context/      # Auth, Location, ChatUnread
│   └── App.tsx
├── landing/              # Marketing site (Next.js 14)
├── admin/                # Admin panel (vanilla JS SPA)
├── .github/workflows/    # CI/CD pipeline
├── railway.toml          # Railway deploy config
└── INFRASTRUCTURE.md     # This file
```

---

## Dev Environment Setup (one-time)

### Step 1 — Railway dev service
1. Railway dashboard → your project → **Environments** → select **development**
2. Add a **PostgreSQL** plugin to the dev environment
3. Note the generated `DATABASE_URL` for the dev Postgres
4. Set all env vars listed above under "Dev" section
5. Generate a domain → should be `api-dev.glow.app` (or whatever Railway assigns — add CNAME in DNS)

### Step 2 — DNS
Add to your DNS provider:
```
CNAME  api-dev  <railway-dev-domain>.up.railway.app
```

### Step 3 — GitHub Secrets
Add to GitHub repo → Settings → Secrets:
```
RAILWAY_DATABASE_URL_DEV=postgres://...
```

### Step 4 — Vercel alias for dev PWA
After first dev deploy, run:
```bash
vercel alias set <deploy-url> dev.glow.app --scope aashishkants-projects
```
CI/CD does this automatically on every dev push after setup.

---

## Deployment Flow

```
Developer pushes to dev branch
  └─► GitHub Actions runs tests
  └─► Builds PWA with EXPO_PUBLIC_API_URL=https://glow-dev-api-development.up.railway.app
  └─► Deploys to dev.glow.app
  └─► Runs migrations on dev DB
  ✓  Changes visible at dev.glow.app — production untouched

Developer merges dev → main (via PR)
  └─► GitHub Actions runs full pipeline
  └─► Builds PWA with EXPO_PUBLIC_API_URL=https://api.glow.app
  └─► Deploys to glow.app
  └─► Runs migrations on prod DB
  ✓  Changes live at glow.app
```

---

## Common Tasks

### Redeploy production manually
```bash
git checkout main && git push origin main  # triggers CI/CD
```

### Fix broken Vercel alias
```bash
vercel alias set <working-deployment-url> glow.app --scope aashishkants-projects
```

### Check all services
```bash
curl https://api.glow.app/health
curl -o /dev/null -w "%{http_code}" https://glow.app
curl -o /dev/null -w "%{http_code}" https://landing.glow.app
curl -o /dev/null -w "%{http_code}" https://admin.glow.app
```

### Run migrations manually
```bash
DATABASE_URL=<prod-url> npx prisma migrate deploy
```
