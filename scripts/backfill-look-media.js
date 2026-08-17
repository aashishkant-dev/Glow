#!/usr/bin/env node
/**
 * One-time backfill: replaces the curated Look catalog's gradient-only cards
 * with real Pexels stock photography (and a short video for a few hero/tall
 * looks), so the catalog reads as a real, sellable product instead of flat
 * placeholder gradients. Run once; re-run any time to refresh picks.
 *
 * Usage: PEXELS_API_KEY=... node scripts/backfill-look-media.js
 * (or rely on the repo's own .env, loaded below)
 */
'use strict';

const fs = require('fs');
const path = require('path');

// Load PEXELS_API_KEY from the backend .env without adding a dotenv
// dependency just for this one-off script.
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const API_KEY = process.env.PEXELS_API_KEY;
if (!API_KEY) {
  console.error('PEXELS_API_KEY not set (checked process.env and repo .env). Aborting.');
  process.exit(1);
}

const LOOKS_PATH = path.join(__dirname, '..', 'mobile', 'src', 'data', 'looks.ts');

// Hand-tuned per look for relevance — an auto-derived query from the name
// alone ("Soft Glam" -> "soft glam") returns much weaker stock matches than
// a query written the way a photographer would tag the shot.
const PHOTO_QUERIES = {
  'soft-glam': 'glam makeup portrait woman',
  'natural-glow': 'natural makeup glowing skin woman',
  'luxury-bridal': 'bridal makeup bride luxury portrait',
  'glass-skin': 'glass skin facial glow woman',
  'korean-beauty': 'korean makeup gradient lips woman',
  'arabic-glam': 'arabic makeup bold eyeliner glam woman',
  'festival-glow': 'mehendi henna hands festival',
  'traditional-bridal': 'indian bridal makeup red gold',
  'date-night-soft': 'romantic soft glam makeup woman',
  'effortless-waves': 'wavy hairstyle woman',
  'monsoon-makeup': 'makeup portrait woman face closeup',
  'reception-glam': 'glam updo hairstyle bride',
  'polished-nails': 'manicure nail polish gel',
  'me-time-ritual': 'spa massage relaxation woman',
  'brow-threading': 'eyebrow shaping beauty salon',
  'full-face-threading': 'face beauty salon treatment',
  'newari-bridal': 'traditional bridal makeup red gold jewelry',
  'teej-radiance': 'woman red saree festival',
  'tihar-tika-glow': 'festival makeup woman marigold',
  'parisian-minimalism': 'natural minimal makeup woman',
  'chic-chignon': 'chignon updo hairstyle woman',
  'rajasthani-bridal': 'indian bridal makeup jewelry mirror work',
};

// Short in-app-camera-style video for hero/tall cards only — keeps API usage
// modest and matches how these already render bigger in the masonry grid.
const VIDEO_QUERIES = {
  'soft-glam': 'makeup application closeup',
  'luxury-bridal': 'bridal makeup brush closeup',
  'arabic-glam': 'eyeliner makeup application',
  'traditional-bridal': 'indian bridal makeup ceremony',
  'me-time-ritual': 'spa massage relaxation',
  'newari-bridal': 'bridal hair jewelry styling',
  'rajasthani-bridal': 'bridal jewelry mirror',
};

async function pexelsGet(url) {
  const res = await fetch(url, { headers: { Authorization: API_KEY } });
  if (!res.ok) throw new Error(`Pexels ${res.status} for ${url}`);
  return res.json();
}

async function fetchPhoto(query) {
  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=3&orientation=portrait`;
  const data = await pexelsGet(url);
  const photo = data.photos?.[0];
  return photo ? { url: photo.src.large, credit: photo.photographer } : null;
}

async function fetchVideo(query) {
  const url = `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=3&orientation=portrait`;
  const data = await pexelsGet(url);
  const video = data.videos?.[0];
  if (!video) return null;
  // Prefer a moderate-resolution file (HD, not the multi-hundred-MB 4K
  // original) — this plays as a muted looping card cover, not a hero export.
  const file = video.video_files
    .filter(f => f.file_type === 'video/mp4' && f.width && f.width <= 1080)
    .sort((a, b) => (b.width || 0) - (a.width || 0))[0] || video.video_files[0];
  return file ? { url: file.link, credit: video.user?.name } : null;
}

async function main() {
  let src = fs.readFileSync(LOOKS_PATH, 'utf8');
  const results = { photos: 0, videos: 0, missed: [] };

  for (const [id, query] of Object.entries(PHOTO_QUERIES)) {
    const idRe = new RegExp(`id: '${id}',[\\s\\S]*?\\n  \\},`, 'm');
    const block = src.match(idRe);
    if (!block) { console.warn(`[skip] no block found for id "${id}"`); continue; }

    try {
      const photo = await fetchPhoto(query);
      if (!photo) { results.missed.push(id); continue; }

      let newBlock = block[0];
      if (/photo: '/.test(newBlock)) {
        newBlock = newBlock.replace(/photo: '[^']*',/, `photo: '${photo.url}',`);
      } else {
        newBlock = newBlock.replace(/(to: '[^']*',)/, `$1\n    photo: '${photo.url}',`);
      }

      if (VIDEO_QUERIES[id]) {
        const video = await fetchVideo(VIDEO_QUERIES[id]);
        if (video) {
          if (/coverVideo: '/.test(newBlock)) {
            newBlock = newBlock.replace(/coverVideo: '[^']*',/, `coverVideo: '${video.url}',`);
          } else {
            newBlock = newBlock.replace(/(photo: '[^']*',)/, `$1\n    coverVideo: '${video.url}',`);
          }
          results.videos++;
        }
      }

      src = src.replace(block[0], newBlock);
      results.photos++;
      console.log(`[ok] ${id} — photo by ${photo.credit}`);
    } catch (err) {
      console.error(`[error] ${id}:`, err.message);
      results.missed.push(id);
    }
    // Pexels free tier: 200 req/hour — a small pause keeps this well clear.
    await new Promise(r => setTimeout(r, 250));
  }

  fs.writeFileSync(LOOKS_PATH, src);
  console.log(`\nDone. ${results.photos} photos, ${results.videos} videos written.`);
  if (results.missed.length) console.log('No match found for:', results.missed.join(', '));
}

main().catch(err => { console.error(err); process.exit(1); });
