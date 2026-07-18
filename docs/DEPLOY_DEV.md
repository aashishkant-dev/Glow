# Pushing to dev (staging) — workflow

This is the everyday loop for shipping a change to the **dev** environment (e.g. `dev.glow.app`) without touching production. Production is only updated from `main`; dev is where you test first.

> **Golden rule:** Work on the `dev` branch (or a `feature/*` branch), deploy to the dev environment, verify, *then* merge to `main` for production. Never push straight to `main`.

---

## How environments map to branches

| Branch | Environment | Deploys how |
|--------|-------------|-------------|
| `dev` | Staging (`dev.glow.app`) | **Manual** Vercel deploy + alias (CI does NOT auto-deploy dev) |
| `main` | Production (`glow.vercel.app` / `*.glow.app`) | **Automatic** via CI (`.github/workflows/ci.yml`, deploy job, main push only) |

Important: CI runs **tests** on every push to `dev` and `main`, but the **deploy job only runs on `main`** (`if: github.ref == 'refs/heads/main'`). So pushing to `dev` validates your code but does not publish it — you publish dev manually (below).

---

## 1. Commit your change to `dev`

```bash
git checkout dev
git pull                      # get latest
# … make changes …
git add -A
git commit -m "feat(provider): <what changed>"
git push origin dev
```

This triggers CI (lint/tests/build) on the `dev` branch. Watch it pass before deploying.

---

## 2. Deploy the changed app to the dev environment

Deploy only the app you changed. Each app is a separate Vercel project (see [`ARCHITECTURE.md`](ARCHITECTURE.md)).

### Mobile PWA (the React Native web app — `mobile/`)

```bash
cd mobile
npm run build:web                  # expo export + post-web-build.js → dist/
npx vercel deploy --prebuilt       # deploy the built dist/ (preview deployment)
# Vercel prints a URL like https://glow-pwa-abc123.vercel.app
```

Then point the dev alias at that deployment:

```bash
npx vercel alias set <printed-url> dev.glow.app
```

> The mobile Vercel project is `glow-pwa` (rootDirectory `mobile`, build `npm run build:web`). The first `vercel` run links it; after that it remembers.

### Landing site (`landing/`)

```bash
cd landing
npx vercel deploy                  # preview deployment
npx vercel alias set <printed-url> dev-ca.glow.app   # if you use a dev alias for landing
```

### Backend API
The backend (Express/Prisma, `src/`) runs on **Railway** and auto-deploys from `main`. All frontends — dev and prod — point at `https://api.glow.app` (`EXPO_PUBLIC_API_URL` in `mobile/.env` and every `mobile/eas.json` profile).

There is currently **one backend** shared by dev and prod. The dev environment is a separate **frontend** deploy (`dev.glow.app`) that talks to the same API. That's fine for UI changes, but be aware: **data you create from dev lands in the production database.** If you later need an isolated dev backend, stand up a second Railway service from the `dev` branch and set the dev PWA's `EXPO_PUBLIC_API_URL` to it.

> Note: an old **Render** backend (`glow.onrender.com`) was retired. If you see it referenced anywhere, it's stale — the backend is Railway at `api.glow.app`.

---

## 3. Verify on the dev environment

1. Open `https://dev.glow.app` (hard-reload: Cmd/Ctrl-Shift-R).
2. If you don't see the change → it's caching. See [`CACHING.md`](CACHING.md) (usually: bump `CACHE` in `mobile/web/sw.js` or clear site data).
3. For Provider-side changes: create a Provider account, then approve it from the admin panel to test the approved flow.

---

## 4. Promote to production (when dev looks good)

```bash
git checkout main
git pull
git merge dev                 # or open a PR dev → main and merge
git push origin main          # CI auto-builds + deploys production
```

CI's deploy job builds each app and aliases to the production domains (`ca.glow.app`, etc.). No manual `vercel` step needed for prod.

---

## Quick reference

```bash
# dev loop (mobile PWA)
git checkout dev && git add -A && git commit -m "…" && git push origin dev
cd mobile && npm run build:web && npx vercel deploy --prebuilt
npx vercel alias set <url> dev.glow.app
# verify dev.glow.app, then:
git checkout main && git merge dev && git push origin main   # → production
```

## Local backend setup (run `./dev.sh`)

The backend uses **Prisma + PostgreSQL**. Your root `.env` must have a `DATABASE_URL` (Postgres). If you see `MONGODB_URI` in `.env`, it's **stale** from the old Mongo backend — the code no longer reads it.

```bash
# .env (root) — add your Railway Postgres connection string:
DATABASE_URL="postgresql://user:pass@host:port/db"
JWT_SECRET="<64-char random>"
```
Get the URL from Railway → Postgres service → Connect → "Postgres Connection URL".

Then:
```bash
npm install
npx prisma migrate deploy        # ensure tables exist
npm run seed:admin               # create the web-panel admin (see below)
./dev.sh                         # backend :3000 + mobile web :8081
```

### Create a dev admin (to approve Providers)
The web admin panel (`admin/`) logs in against the `Admin` table. Seed one for dev:
```bash
# defaults: username "admin", password "devadmin123"
npm run seed:admin
# or pick your own:
ADMIN_USERNAME=you ADMIN_PASSWORD=yourpass npm run seed:admin
```
Idempotent (re-running resets the password). Refuses to run in production unless `ALLOW_PROD_SEED=1`. After seeding, log in at the admin panel's `/admin/login`, open the Provider list, and approve the account you registered. A newly-registered Provider appears immediately (registration busts the admin-list cache).

Local dev (no deploy): `./dev.sh` runs backend + mobile web together. See [`../README.md`](../README.md).
