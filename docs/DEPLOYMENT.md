# Glow Deployment Guide

## Projects at a Glance

| Project | Location | Platform | URL | What it is |
|---------|----------|----------|-----|------------|
| **Backend API** | `/` (root) | Railway | api.glow.app | Express + Prisma + PostgreSQL |
| **PWA (app)** | `mobile/` | Vercel | glow.app | Expo React Native Web |
| **Landing page** | `landing/` | Vercel | landing.glow.app | Next.js 14 marketing site |
| **Admin panel** | `admin/` | Vercel | admin.glow.app | Vanilla JS SPA |
| **Dev backend** | `/` (root) | Railway dev env | api-dev.glow.app | Same code, separate DB |
| **Dev PWA** | `mobile/` | Vercel | dev.glow.app | Same code, hits dev backend |

---

## How Deployment Works

### Automatic (CI/CD via GitHub Actions)

```
Push to main  →  tests pass  →  deploys ALL 4 projects to production
Push to dev   →  tests pass  →  deploys PWA only to dev.glow.app
```

**You never need to deploy manually** as long as CI passes.

### Manual (emergency / hotfix)

See per-project instructions below.

---

## Backend API

**Location:** repo root `/`  
**Platform:** Railway  
**Production URL:** `https://api.glow.app`  
**Dev URL:** `https://glow-dev-api-development.up.railway.app`  

### How it builds
- Railway uses **Nixpacks** — detects Node.js automatically
- No build step — runs directly: `node src/server.js`
- On deploy: `postinstall` runs `prisma generate` automatically
- Migrations run separately (CI does this): `prisma migrate deploy`

### How to update (automatic)
Push to `main` → Railway auto-deploys (connected to GitHub main branch)

### How to update (manual / emergency)
```bash
# From repo root
git push origin main   # Railway auto-detects and redeploys
```
Or: Railway dashboard → your service → **Redeploy**

### Adding a new API route
1. Create/edit file in `src/routes/`
2. Register it in `src/app.js`
3. Push to `dev` first → test at `api-dev.glow.app`
4. Merge to `main` → goes live

### Adding a database field
1. Edit `prisma/schema.prisma`
2. Run locally: `npx prisma migrate dev --name your_change_name`
3. Commit the migration file in `prisma/migrations/`
4. Push to `main` → CI runs `prisma migrate deploy` automatically

### Environment variables
Set in **Railway dashboard → your service → Variables**
- Production: Railway **production** environment
- Dev: Railway **development** environment

Required vars: `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `TWILIO_*`, `BLOB_READ_WRITE_TOKEN`, `CORS_ORIGIN`, `NODE_ENV`

---

## PWA (Mobile App)

**Location:** `mobile/`  
**Platform:** Vercel (project: `glow-pwa`, ID: `prj_7FykpvoccjMs9QKZcD8jxl7vQ62w`)  
**Production URL:** `https://glow.app`  
**Dev URL:** `https://dev.glow.app`  

### How it builds
```bash
cd mobile
npx expo export --platform web --output-dir dist
# Then post-build script copies sw.js, manifest.json, icons into dist/
node scripts/post-web-build.js
```
Output goes to `mobile/dist/` — Vercel serves this as a static SPA.

### How to update (automatic)
- Push to `dev` → builds with `EXPO_PUBLIC_API_URL=https://glow-dev-api-development.up.railway.app` → deploys to `dev.glow.app`
- Merge to `main` → builds with `EXPO_PUBLIC_API_URL=https://api.glow.app` → deploys to `glow.app`

### How to update (manual / emergency)
```bash
# Build locally first
cd mobile
npm run build:web          # outputs to mobile/dist/

# Deploy from repo root
vercel deploy mobile/dist --prebuilt --prod \
  --token $VERCEL_TOKEN \
  --scope aashishkants-projects

# Point domain to new deployment
vercel alias set <new-deploy-url> glow.app --scope aashishkants-projects
vercel alias set <new-deploy-url> dev.glow.app --scope aashishkants-projects
```

### Making frontend/design changes
1. Edit files in `mobile/src/`
2. Push to `dev` branch → auto-deploys to `dev.glow.app` in ~3 min
3. Test on `dev.glow.app`
4. Happy? `git checkout main && git merge dev && git push origin main`
5. Live on `glow.app` in ~3 min

### Key folders
```
mobile/src/screens/     — all screens (customer, provider, admin, shared, auth)
mobile/src/navigation/  — tab/stack navigators per role
mobile/src/api/         — client.ts: all API calls live here
mobile/src/context/     — Auth, Location, ChatUnread
mobile/src/utils/       — colors, storage, notifications, socket
mobile/src/components/  — reusable UI components
mobile/web/             — PWA assets: sw.js, manifest.json, icons
```

### Environment variable
`EXPO_PUBLIC_API_URL` — set at build time, baked into the bundle:
- Dev build: `https://glow-dev-api-development.up.railway.app`
- Prod build: `https://api.glow.app`

---

## Landing Page

**Location:** `landing/`  
**Platform:** Vercel (project: `glow-landing`, ID: `prj_4KonVbegRB8BCfB7rGG9bAhCVeuP`)  
**URL:** `https://landing.glow.app`  

### How it builds
```bash
cd landing
npm run build    # next build
# postbuild: next-sitemap runs automatically
```
Standard Next.js 14 static/SSR build.

### How to update (automatic)
Push to `main` → CI builds and deploys automatically.

### How to update (manual / emergency)
```bash
cd landing
npm run build

cd ..   # back to repo root
vercel deploy landing --prebuilt --prod \
  --token $VERCEL_TOKEN \
  --scope aashishkants-projects

vercel alias set <deploy-url> landing.glow.app --scope aashishkants-projects
```

### Making landing page changes
1. Edit files in `landing/`
2. Push to `main` (landing has no dev environment — it's marketing only, safe to push direct)
3. CI deploys to `landing.glow.app`

---

## Admin Panel

**Location:** `admin/`  
**Platform:** Vercel (project: `admin`, ID: `prj_TgGySFmZ2f6pfuP2MLUwAv7CfgkA`)  
**URL:** `https://admin.glow.app`  

### How it builds
No build step — plain HTML/CSS/JS. Vercel serves `admin/index.html` directly.

### How to update (automatic)
Push to `main` → CI deploys `admin/` folder to Vercel.

### How to update (manual / emergency)
```bash
vercel deploy admin --prod \
  --token $VERCEL_TOKEN \
  --scope aashishkants-projects

vercel alias set <deploy-url> admin.glow.app --scope aashishkants-projects
```

### Making admin changes
Edit `admin/app.js`, `admin/index.html`, or `admin/styles.css` → push to `main`.

---

## Fixing a Broken Domain (emergency)

If any domain returns 404/401/error:

```bash
# Check what the alias points to
vercel alias ls --scope aashishkants-projects | grep glow.app

# Find a working deployment (look for Ready + duration > 2s)
vercel ls --scope aashishkants-projects

# Re-point the alias
vercel alias set <working-deployment-url> glow.app --scope aashishkants-projects
```

---

## CI/CD Required GitHub Secrets

Go to: **GitHub → aashishkant-dev/glow → Settings → Secrets → Actions**

| Secret | Value | Used for |
|--------|-------|----------|
| `VERCEL_TOKEN` | Vercel personal access token | All Vercel deployments |
| `VERCEL_TEAM_ID` | `team_3ucuU6nY6h28u3fr1Q6LTU9y` | Vercel team scope |
| `RAILWAY_DATABASE_URL_PROD` | Railway prod public DB URL | Prisma migrate on prod |
| `RAILWAY_DATABASE_URL_DEV` | Railway dev public DB URL | Prisma migrate on dev |

---

## Health Check All Services

```bash
curl https://api.glow.app/health          # backend prod
curl https://glow-dev-api-development.up.railway.app/health       # backend dev
curl -o /dev/null -w "%{http_code}" https://glow.app        # PWA prod
curl -o /dev/null -w "%{http_code}" https://dev.glow.app    # PWA dev
curl -o /dev/null -w "%{http_code}" https://landing.glow.app
curl -o /dev/null -w "%{http_code}" https://admin.glow.app
```
