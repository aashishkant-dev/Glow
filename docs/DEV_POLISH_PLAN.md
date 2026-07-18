# Glow — Dev Polish + Business-Logic Plan

Branch: **dev only** (NO production deploys this pass). Decisions locked:
- Decline/no-response → **auto-fallback to nearby pool**
- No-response **timeout = 30 min**
- Plan-first, build in batches.

---

## BATCH 1 — Decline / No-Response business logic (highest value)

**Goal:** a dedicated request that's declined OR ignored never leaves the client stuck.

1. **Provider declines** (already releases booking → REQUESTED + notifies client).
   - NEW: instead of forcing the client to manually re-pick, **auto-open the booking to the nearby pool** (set a flag `openToPool=true`) so any nearby Provider can accept, while still surfacing a friendly client card.
   - Client in-app card (TrackingScreen REQUESTED state): "Kalu is unavailable — we're finding you another caregiver nearby" + buttons: **[Choose myself]** (Provider list) · **[Keep auto-matching]**.

2. **Provider doesn't respond in 30 min** (no accept/decline on a REQUESTED dedicated booking):
   - A scheduled check (lightweight: a `setInterval` sweep in the backend, or check-on-read) flips the booking to `openToPool=true` after 30 min and notifies the client ("Still finding your caregiver — opened to more Providers nearby").
   - Needs: a `requestedAt`/`providerRequestedAt` timestamp + `openToPool` boolean on Booking (Prisma migration).

3. **Backend changes:**
   - `prisma/schema.prisma`: add `openToPool Boolean @default(false)` + `providerRequestedAt DateTime?` to Booking.
   - `/jobs/nearby` (open pool): include bookings where `openToPool=true` (currently only `providerId=null`).
   - Decline handler: set `openToPool=true`.
   - A timeout sweep (cron-ish `setInterval` in server bootstrap, every 5 min): find REQUESTED + dedicated + `providerRequestedAt < now-30min` + not `openToPool` → set `openToPool=true`, emit to client + nearby Providers.

4. **Client UX (TrackingScreen + BookingDetail):** a polished "finding/declined" state with the auto-match explainer + the two action buttons. Friendly, not alarming.

---

## BATCH 2 — Bug fixes (found in scan)

1. **24× 8-digit hex colors** (`accent + '12'` etc.) — Android RN renders `#RRGGBBAA` as opaque grey boxes (already hit on the service card). Sweep all → `rgba()` or solid tints. Files: most screens.
2. **12 files still have emoji** in UI — replace with brand CareIcons (notif titles, empty states, badges).
3. **22 hardcoded "Greater Sudbury" / 46.4917** labels — replace fake-data defaults; keep only honest company-region branding (footer). Make region env-driven where it's a fallback.
4. **Profile photo on home** — verify customer photo upload (apiUploadPhoto JSON path) actually persists + shows; if a set photo doesn't appear, fix the sync.
5. **Provider "0 km"** — confirm the always-on location write + customer-coord fallback resolve real distance once both sides have coords.

---

## BATCH 3 — Polish / modern feel

1. **Empty states** — consistent, friendly, branded (icon + headline + sub + CTA) across all lists.
2. **Loading skeletons** — use the existing SkeletonLoader everywhere a spinner sits on a list.
3. **Haptics** — confirm key actions (accept, book, complete) fire haptics.
4. **Typography** — apply Plus Jakarta Sans to headings app-wide (currently partial).
5. **Status timeline** — make the booking lifecycle (Requested→Accepted→On the way→Started→Completed) visually clear + consistent on both sides.
6. **Microcopy** — warm, professional, healthcare-grade tone; remove dev-y strings.

---

## BATCH 4 — Optimization (if time)

1. **API caching** — verify the Redis cache invalidation on status changes (some flush patterns may miss).
2. **Re-render churn** — the 5–6s pollers create new object refs → map/card remounts (partly fixed); audit the rest.
3. **Bundle** — check for unused deps (react-native-maps now that maps are OSM — can it be dropped? JobDetail still uses it).
4. **Image sizes** — picker quality + server compression already good; verify.

---

## What I need from you (you offered a subscription)
- **Claude Max / higher rate limits** → I can run more parallel agents + bigger refactors per turn without hitting limits mid-task. Genuinely helps throughput on a pass this size.
- (When ready) **Apple Developer account** → real iOS builds. Not needed for this dev pass.

## Order of execution
Batch 1 (business logic) → Batch 2 (bugs) → Batch 3 (polish) → Batch 4 (optimize). Each batch: build on dev, tsc, deploy dev, you review. **No production deploys.**
