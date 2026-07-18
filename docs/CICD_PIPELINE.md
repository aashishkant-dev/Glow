# Glow CI/CD Pipeline Guide

> ⚠️ **Partially stale — infra in transition.** This guide describes the **retired Render** backend deploy flow (Render deploy webhook, "wait 90s for Render", `REDIS_URL` on Render). The backend is now on **Railway** (`api.glow.app`) and the old Render backend `glow.onrender.com` is gone. The current CI (`.github/workflows/ci.yml`) runs tests on `dev`+`main` and deploys the **landing** + frontends to Vercel on `main`; the backend deploys via Railway's own GitHub integration. Treat the Render-specific sections below as historical until this doc is rewritten. For the current flow see [`DEPLOY_DEV.md`](DEPLOY_DEV.md) and [`ARCHITECTURE.md`](ARCHITECTURE.md).

## What is CI/CD?

**CI = Continuous Integration** — every time you push code, automated tests run to catch bugs before they reach users.

**CD = Continuous Delivery** — if all tests pass, code deploys automatically to production. No manual deploys needed.

Think of it like a security checkpoint at an airport:
- You push code → enters the checkpoint
- Tests run → security scans the bag
- All pass → code flies to production
- Any fail → code gets stopped, you fix it

---

## Our Pipeline — Step by Step

```
git push origin main
        │
        ▼
┌─────────────────────────────────────────────────────┐
│           GitHub Actions starts                     │
│   (.github/workflows/ci.yml)                        │
└─────────────────────────────────────────────────────┘
        │
        ├──────────────────────────────────────────────
        │  Job 1: backend-test       (runs in parallel)
        │  Job 2: landing-build      (runs in parallel)
        │  Job 3: playwright-e2e     (runs in parallel)
        │──────────────────────────────────────────────
        │
        ▼ (only if ALL 3 pass)
┌─────────────────────────────────────────────────────┐
│           Job 4: deploy                             │
│   1. Trigger Render deploy (backend)                │
│   2. Wait 90s + health check                        │
│   3. Deploy landing to Vercel (production)          │
│   4. Alias → glow.vercel.app                  │
│   5. Smoke check HTTP 200                           │
└─────────────────────────────────────────────────────┘
```

---

## The 3 Test Jobs (Run in Parallel)

### Job 1: Backend Tests (`backend-test`)

**What it does:**
1. Checks out code on a fresh Ubuntu machine
2. Installs Node.js 20
3. Runs `npm ci` — installs exact package versions from `package-lock.json`
4. Syntax-checks every `.js` file in `src/` using `node --check`
5. Runs Jest test suite (`npm test`)
6. Scans for hardcoded secrets (Stripe keys, MongoDB URLs, Google API keys)

**What it catches:**
- JavaScript syntax errors
- Broken API endpoints (auth, bookings, Provider routes)
- Accidental secret commits
- Logic bugs in business logic

**Test file:** `src/tests/api.test.js` (12 tests)

---

### Job 2: Landing Build (`landing-build`)

**What it does:**
1. Installs Node.js 20
2. `npm ci` in the `landing/` folder
3. Runs `npm run build` — full Next.js production build
4. If build fails, CI fails → no deploy

**What it catches:**
- TypeScript type errors
- Broken imports
- Missing environment variables referenced at build time
- Broken Next.js pages

---

### Job 3: Playwright E2E Tests (`playwright-e2e`)

**What it does:**
1. Installs Node.js + Playwright + Chromium browser
2. Runs tests in `e2e/tests/pwa.spec.ts` against the LIVE production URL
3. Tests real user flows in a real browser

**What it tests:**
- Page loads with correct title ("Glow")
- No uncaught JavaScript errors on load
- Unknown routes don't show blank white screen

**Skipped (until PWA is deployed separately):**
- Login flow (phone input)
- Provider onboarding entry

**Key point:** These tests run against `https://glow.vercel.app` — the already-live site. They catch regressions in the current production version.

---

### Job 4: Deploy (only runs if Jobs 1+2+3 all pass)

**What it does:**
1. **Triggers Render deploy** via webhook URL — Render pulls latest code from `main` branch and rebuilds the Node.js backend
2. **Waits 90 seconds** for Render to finish building
3. **Health check** — hits `https://api.glow.app/health` and verifies MongoDB is `"ok"`
4. **Deploys landing to Vercel** — builds Next.js and pushes to production
5. **Sets alias** — points `glow.vercel.app` to the new deployment URL
6. **Smoke check** — hits `https://glow.vercel.app` and checks HTTP 200

---

## Why CI/CD is Failing Right Now

### Problem: Cloudflare checks

Cloudflare Pages/Workers is connected to this GitHub repo. Every PR triggers a Cloudflare build that fails (we don't use Cloudflare — we use Vercel + Render).

**Fix:** Remove Cloudflare GitHub app from repo:
1. Go to: https://github.com/aashishkant-dev/glow/settings/installations
2. Find "Cloudflare Workers and Pages" → Configure
3. Remove `glow` from repository access → Save

### Problem: `gh` CLI auth expired

The deploy job uses `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, and `RENDER_DEPLOY_HOOK_URL` secrets stored in GitHub. These are fine. The local `gh` CLI auth expiring doesn't affect CI.

---

## Secrets Required in GitHub

Go to: https://github.com/aashishkant-dev/glow/settings/secrets/actions

| Secret | What it's for |
|--------|--------------|
| `VERCEL_TOKEN` | Authenticates Vercel CLI deploys |
| `VERCEL_ORG_ID` | Your Vercel team/org ID |
| `VERCEL_PROJECT_ID` | The `glow-landing` project ID |
| `RENDER_DEPLOY_HOOK_URL` | Webhook that triggers Render to rebuild backend |

---

## How to Set `REDIS_URL` on Render

Your Upstash Redis credentials:
- **TLS connection string for ioredis:**
  ```
  rediss://default:gQAAAAAAAXvuAAIncDFkM2NkNzc0YmFiYTY0M2MyYTEzYTQyZDM3YTMyM2M5OHAxOTcyNjI@exact-marten-97262.upstash.io:6379
  ```
  (Note: `rediss://` — double-s means TLS)

**Steps:**
1. Go to https://dashboard.render.com
2. Select your backend service
3. Environment → Add Environment Variable
4. Key: `REDIS_URL`
5. Value: the `rediss://` URL above
6. Save → Render auto-redeploys

---

## Flow Diagram: Push to Main

```
You: git push origin main
         │
         ▼
GitHub Actions triggers in ~5 seconds
         │
    ┌────┴────────────────────┐
    │                         │
    ▼                         ▼
Job 1: Backend tests    Job 2: Landing build    Job 3: Playwright
(~30s)                  (~60s)                  (~45s)
    │                         │                    │
    └────────────┬────────────┘                    │
                 └──────────────────┬──────────────┘
                                    │
                              All 3 passed?
                                    │
                    ┌───────────────┴───────────────┐
                   YES                              NO
                    │                               │
                    ▼                          Pipeline stops
              Job 4: Deploy                  You get email + red X
              (~3 min total)                 on GitHub commit
                    │
              ┌─────┴─────────────┐
              ▼                   ▼
        Render rebuilds    Vercel deploys
        backend            landing site
              │                   │
              ▼                   ▼
        Health check        Alias set →
        passes              glow.vercel.app
```

---

## Common Failures and Fixes

| Failure | Cause | Fix |
|---------|-------|-----|
| `backend-test` fails | Jest test broke or syntax error | Run `npm test` locally first |
| `landing-build` fails | TypeScript error or missing import | Run `cd landing && npm run build` locally |
| `playwright-e2e` fails | Production site changed, test broke | Update test locators in `e2e/tests/pwa.spec.ts` |
| `deploy` fails on Render health check | Render cold start > 90s | Usually safe to re-run; cold starts are expected on free tier |
| `deploy` fails on Vercel | `VERCEL_TOKEN` expired | Regenerate token at vercel.com/account/tokens → update GitHub secret |
| Cloudflare checks fail | Cloudflare app still connected | Remove from GitHub installations (see above) |
