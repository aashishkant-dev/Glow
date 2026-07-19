# Glow — URLs, Local Dev & Testing

Quick reference for every deployed surface, how to run the stack locally, and how to test.

---

## 1. Live URLs

| Surface | URL | Vercel / Railway project | Source folder |
|---|---|---|---|
| **App (customer + artist PWA)** | https://glow-app-omega.vercel.app | Vercel `glow-app` | `mobile/` |
| **Admin panel** | https://glow-admin-navy.vercel.app | Vercel `glow-admin` | `admin/` |
| **Landing page** | https://glow-landing-five.vercel.app | Vercel `glow-landing` | `landing/` |
| **Backend API** | https://glow-backend-production-ae1e.up.railway.app | Railway `glow` → service `glow-backend` | `src/` |
| **GitHub** | https://github.com/aashishkant-dev/Glow | — | — |

**Admin login:** `admin` / `GlowAdmin2026!`

> Landing currently serves a placeholder page. Deploy your real landing with
> `cd landing && npx vercel --prod` (folder is already linked to `glow-landing`).

---

## 2. Run everything locally

### One command

```bash
npm run dev:all
```

Runs `dev.sh`, which starts:

| What | Port | Log file |
|---|---|---|
| Backend (Express + Prisma) | http://localhost:3000 | `.logs/backend.log` |
| App — Expo web | http://localhost:8081 | `.logs/expo.log` |

`Ctrl+C` stops both.

### Prerequisites

- Local Postgres on port **5433**: `postgresql://aassh:glow_local@localhost:5433/glow`
- Backend env loaded from `glow.env` at repo root (sourced by `dev.sh`)
- `mobile/.env.local` already points the app at `http://localhost:3000` — nothing to change

### Run pieces individually

```bash
npm run dev                      # backend only (nodemon, :3000)
cd mobile && npx expo start --web    # app only (:8081)
cd landing && npm run dev            # landing (Next.js, :3000 — conflicts with backend, use -p 3001)
cd admin && npx serve .              # admin is static HTML — any static server
```

---

## 3. OTP — where the code comes from

Twilio is **not configured**, so the OTP is never texted. It is printed by the backend:

**Locally:**
```bash
tail -f .logs/backend.log | grep OTP
# [OTP] +17055550142 → 482913
```

**Production:**
```bash
railway logs | grep OTP
```

Flow: enter any phone number in the app → read the 6-digit code from the log → enter it.

**Test customer:** `+1 705 555 0142` ("Test Glow").

---

## 4. Testing checklist

### Customer flow
1. Login (OTP from log)
2. Home → occasion card (e.g. Party) → booking flow opens with service preselected
3. **✨ Find My Glow** → 4 steps → 3 recommended artists → Book (artist preselected in step 3)
4. Explore → heart a look → Saved tab shows it grouped into a moodboard
5. Book: address → date → artist → confirm → appears in Bookings (calendar icon, top bar)

### Artist flow
1. Login with a new phone as Artist → onboarding (5 steps)
2. Step 4: set a price per specialty — **prices must appear on the public profile / booking after submit**
3. Step 5: docs. Police check is *optional* — profile shows `Cleared` / `In review` / `Add ›`
4. Admin panel → approve the artist → they appear in the app's artist lists

### Before pushing
```bash
cd mobile && npx tsc --noEmit                      # type check (CI gate)
cd mobile && NO_SW=1 npx expo export --platform web  # PWA build (CI gate)
npm test                                           # backend tests
```

---

## 5. Deploying

| Surface | How |
|---|---|
| App (PWA) | `git push` to `main` — CI builds & deploys to `glow-app` automatically |
| Backend | Railway — push triggers rebuild if GitHub connected, else `railway up` |
| Landing | `cd landing && npx vercel --prod` (manual, not in CI) |
| Admin | `cd admin && npx vercel --prod` (manual, not in CI) |

---

## 6. Gotchas

- **Never run `vercel deploy` from `mobile/dist/`** — creates a junk project named "dist". Run from `mobile/`.
- **Env precedence:** `mobile/.env.local` overrides `mobile/.env` in dev. In production export the app hard-falls-back to the Railway URL, so a leaked localhost URL can't break prod — but if API URL looks wrong, run `expo export --clear` (Metro caches inlined env).
- **Local DB is separate from prod.** Empty artist lists locally = nothing seeded. Seed: `node scripts/seed-catalog.js` (11 services) and `node scripts/seed-demo.js`.
- **DISABLE_CACHE=1** is set on Railway during active iteration — remove when stable.
- Never sed `package-lock.json` (strings occur inside hashes; corrupted once).
