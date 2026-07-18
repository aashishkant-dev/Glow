# Glow — SEO Playbook (step-by-step)

Real domains (use these exactly):
- **Landing / SEO site:** `https://ca.glow.app`  ← the page Google should index
- **App (PWA):** `https://glow.app`
- Landing source: `landing/` (Next.js). `SITE_URL` lives in `landing/lib/metadata.ts` + `landing/app/sitemap.ts` + `landing/next-sitemap.config.js`.

> Goal: rank for "Provider Sudbury", "home care Sudbury", "personal support worker near me Ontario" + get cited by ChatGPT/Perplexity. Below is the exact order to do it in.

---

## STEP 1 — Google Search Console (do first; free; unlocks everything)

**What it does:** tells Google your site exists, lets you submit the sitemap, shows what you rank for.

1. Go to https://search.google.com/search-console and sign in.
2. **Add property → URL prefix →** enter `https://ca.glow.app` → Continue.
3. Pick the **HTML tag** verification method. Google shows a tag like:
   `<meta name="google-site-verification" content="AbC123…" />` — copy the `content` value.
4. Add it to the site. Open `landing/app/layout.tsx`, find the `export const metadata` object, add:
   ```ts
   export const metadata: Metadata = {
     // …existing fields…
     verification: { google: 'AbC123…' },   // paste your token
   }
   ```
   Next.js renders the verification `<meta>` automatically — no manual HTML.
5. Commit + push `main` → wait for the landing deploy (`bash tests/deploy-prod-pwa.sh` is PWA; landing deploys via CI on push to main, or `cd landing && vercel deploy --prod`).
6. Back in Search Console → click **Verify**.
7. **Submit the sitemap:** Search Console → *Sitemaps* → enter `sitemap.xml` → Submit.
   (Sitemap is auto-generated at `https://ca.glow.app/sitemap.xml`.)
8. **Request indexing:** *URL Inspection* → paste `https://ca.glow.app` → "Request indexing". Repeat for each blog post URL.

## STEP 2 — Google Business Profile (THE biggest local-SEO lever)

**What it does:** puts you on Google Maps + the local "pack" (the 3 map results above normal links). For "Provider near me" type searches this beats websites.

1. https://business.google.com → **Manage now** → create a profile for **Glow**.
2. Business name: `Glow`. Category: **Home Health Care Service** (add secondary: "Home Care Service", "Aged Care").
3. **Service-area business** (no storefront): set area = **Greater Sudbury, ON** (+ 15 km radius towns).
4. Add: phone, hours, website `https://glow.app`, a short description with "Personal Support Workers in Greater Sudbury", logo + 3–5 photos.
5. **Verify** (postcard/phone/email — Google chooses).
6. **Get 5+ reviews fast** — ask your first clients/Providers. Reviews are the #1 ranking signal for the local pack. Reply to every review.

## STEP 3 — Citations & backlinks (trust signals)

Each listing = a backlink + a "NAP" citation (Name/Address/Phone — keep them **identical** everywhere).

Free directories to submit to:
- `211ontario.ca` (social-services directory — high authority)
- `yellowpages.ca`, `yelp.ca`, `cylex.ca`, `opendi.ca`
- `seniorcareguide.com`, `comfortlife.ca`
- NOCA (Northern Ontario Caregivers Assoc.) if eligible
- Local: Greater Sudbury Chamber of Commerce, Sudbury community Facebook groups

Use the **same** business name + phone + `https://glow.app` in every one.

## STEP 4 — On-page SEO (already mostly done — verify)

- ✅ `metadata` (title/description/OG) set in `landing/lib/metadata.ts`.
- ✅ `robots.txt` allows all + points to sitemap (`landing/public/robots.txt`).
- ✅ `sitemap.ts` live at `/sitemap.xml`.
- Each page should have ONE `<h1>` with the target keyword (e.g. "Personal Support Workers in Sudbury").
- Add `JSON-LD` LocalBusiness schema to the homepage (helps the local pack + AI):
  ```jsonc
  { "@context":"https://schema.org", "@type":"HomeHealthCareService",
    "name":"Glow", "areaServed":"Greater Sudbury, ON",
    "url":"https://glow.app", "telephone":"…" }
  ```

## STEP 5 — Blog cadence (1–2 posts/month, long-tail)

Target real questions people search:
- "how much does home care cost in Ontario [year]"
- "what does a Provider do"
- "Provider vs nurse — which do I need"
- "signs of caregiver burnout"
- "OHIP home care coverage Ontario"

Rules: put the **answer in the first paragraph**, use the keyword in the H1 + URL slug, internally link to your booking page, 600+ words. First-paragraph answers win Google featured snippets AND AI citations.

## STEP 6 — AI search (ChatGPT / Perplexity / Google AI)

- ✅ `robots.txt` allows AI crawlers.
- ❌ **`llms.txt` does NOT exist yet.** Create `landing/public/llms.txt` — a plain-text summary that AI crawlers read:
  ```
  # Glow
  Private-pay Personal Support Worker (Provider) booking platform for Greater Sudbury, Ontario.
  Book verified Providers for personal care, companionship, meal prep, mobility & post-surgery support.
  Site: https://glow.app  | Rate: $25/hr, 3hr minimum | Bilingual EN/FR.
  ```
- AI engines crawl → cite you when answering "best Provider service in Sudbury" type questions. Clear, factual first paragraphs help.

---

## Timeline (realistic)

| Milestone | When |
|---|---|
| Homepage indexed | 1–2 weeks after Search Console verify + request-indexing |
| Blog posts indexed | 2–4 weeks |
| Show in local pack ("Provider Sudbury") | 2–8 weeks after Business Profile + first reviews |
| First-page organic rank | 3–6 months (driven by backlinks + reviews) |
| ChatGPT/Perplexity citations | 1–3 months after crawl |

**Do these THREE first, in order:** ① Search Console + submit sitemap → ② Business Profile + 5 reviews → ③ 211ontario + yellowpages listings. That's 80% of the result.

---

## Verified status (checked against the repo)
- ✅ `robots.txt` — allows all, sitemap → `ca.glow.app`.
- ✅ `sitemap.ts` / `next-sitemap.config.js` — `ca.glow.app`.
- ✅ `metadata` index/follow + OG/canonical set.
- ❌ Google verification token — **not added** (Step 1.4).
- ❌ Search Console property + sitemap submit — **not done** (Step 1).
- ❌ Google Business Profile — **not created** (Step 2).
- ❌ LocalBusiness JSON-LD — **not added** (Step 4).
- ❌ `llms.txt` — **does not exist** (Step 6).
