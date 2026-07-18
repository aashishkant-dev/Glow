# Caching — how it works & how to bust it

Glow has **three independent cache layers**. When users "don't see my changes," it's almost always one of these. This doc explains each and how to clear it.

| Layer | Where | Caches | Bust by |
|-------|-------|--------|---------|
| 1. PWA service worker | `mobile/web/sw.js` (runs in browser) | App shell + hashed JS/CSS + icons | Bump `CACHE` version |
| 2. Vercel CDN headers | `mobile/vercel.json` | Static files at the edge | Already correct — index/sw are `no-cache` |
| 3. Backend cache | `src/utils/cache.js` (Redis + in-memory) | Admin/API query results | `cacheDel()` on writes (automatic) |

---

## Layer 1 — PWA service worker (the usual culprit)

`mobile/web/sw.js` runs in the user's browser and caches the app so it works offline + installs as an app. Strategy:
- **Navigation requests** (page load/refresh) → **network-first**, falls back to cached `index.html` only when offline. So new deploys ARE picked up on reload.
- **Hashed static assets** (`_expo/static/js/**`) → **cache-first** (safe — the filename hash changes when content changes).
- **Shell** (`manifest.json`, icons) → pre-cached on install.

### When users are stuck on an old version

The service worker keeps the old cache until its **version string changes**. Bump it:

```js
// mobile/web/sw.js  (top of file)
const CACHE = 'glow-v2';   // ← change to 'glow-v3'
```

On next visit the `activate` handler deletes every cache that isn't the new name:
```js
caches.keys().then(keys =>
  Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
)
```

**Rule of thumb:** bump `CACHE` whenever you change `sw.js` itself or want to force-evict every client. Routine code/asset deploys don't need a bump (hashes + network-first handle them), but bumping is the safe sledgehammer.

### Force-clear on a single device (debugging)
- **Chrome/Android:** DevTools → Application → Service Workers → *Unregister*, then Application → Storage → *Clear site data*.
- **iOS Safari:** Settings → Safari → Advanced → Website Data → remove `glow.app`. Or delete + reinstall the home-screen app.
- **Quick user instruction:** "fully close the app/tab and reopen" (triggers the network-first revalidate).

---

## Layer 2 — Vercel CDN headers

`mobile/vercel.json` sets cache headers at the edge. Already configured correctly — listed here so you know not to touch it:

```jsonc
// index.html  → never cached (always fresh HTML entry point)
{ "Cache-Control": "no-cache, no-store, must-revalidate" }
// sw.js       → never cached (so SW updates land immediately)
{ "Cache-Control": "no-cache, no-store, must-revalidate" }
// _expo/static/** and /assets/** → cached 1 year, immutable (safe: content-hashed)
{ "Cache-Control": "public, max-age=31536000, immutable" }
```

Why this is correct: the HTML and service worker are always revalidated, so a new deploy is visible on reload. Hashed assets are cached hard because a content change produces a new filename. **Do not** add long cache to `index.html` or `sw.js` — that's how you strand users on old builds.

---

## Layer 3 — Backend cache (Redis + in-memory LRU)

`src/utils/cache.js` caches expensive/repeated query results. It's **best-effort**: an in-process LRU (max 500 entries) always works, and Upstash Redis (`REDIS_URL=rediss://…`, set on Railway) is layered on top for sharing across instances. If Redis is down, the app silently uses the LRU — never blocked.

API: `cacheGet(key)`, `cacheSet(key, value, ttlSeconds)`, `cacheDel(key)`.

### Current usage (admin Provider lists)
`src/routes/admin.js` caches Provider lists for **30 seconds** and invalidates on write:
```js
const cacheKey = `admin:providers:${approved}:p${page}:l${limit}`;
const cached = await cacheGet(cacheKey);
if (cached) return res.json(cached);
// …query…
await cacheSet(cacheKey, response, 30);

// On approve / new registration — bust all variants:
await cacheDel('admin:providers:all');
await cacheDel('admin:providers:true');
await cacheDel('admin:providers:false');
```

### When to bust manually
You rarely need to — writes already call `cacheDel`. But if you add a new cached endpoint, **always `cacheDel` the matching keys in every write path that affects it** (create/update/delete). TTL is the safety net (max staleness = the `ttlSeconds` you set), `cacheDel` is the immediate path.

To wipe everything (e.g. after a bad cache poisoning in dev): restart the Railway backend service (clears the in-process LRU) and/or flush the Upstash Redis DB from its dashboard.

---

## Quick decision guide

> "I deployed but don't see my change."

1. **Frontend change?** → Hard-reload (Cmd/Ctrl-Shift-R). Still stale? Bump `CACHE` in `sw.js` and redeploy. Still stale on one device? Clear site data (Layer 1).
2. **API returns old data?** → It's Layer 3. Check the write path calls `cacheDel` for that key; wait out the 30s TTL; or restart the backend.
3. **Old HTML/asset served?** → Should never happen with current `vercel.json`. If it does, confirm nobody added `max-age` to `index.html`.
