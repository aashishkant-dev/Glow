// src/routes/posts.js
'use strict';

const express = require('express');
const sharp   = require('sharp');
const { uploadFile } = require('../utils/storage');
const prisma  = require('../lib/prisma');
const { authenticate, requireRole } = require('../middleware/auth');
const { PHOTO_FILTERS } = require('../utils/photoFilters');

const router = express.Router();

// The mobile app records video two ways: native (expo-camera's recordAsync)
// always produces real MP4/MOV, but on web (recordAsync is native-only)
// capture goes through the browser's own MediaRecorder, which only speaks
// WebM/VP9 — labeling that as video/mp4 (the old hardcoded default) uploads
// a WebM file with a .mp4 name, which then fails to play. Pick the real
// extension/content-type from whatever the client actually sent.
function videoExtAndType(mimeType) {
  if (typeof mimeType === 'string' && mimeType.startsWith('video/webm')) {
    return { ext: 'webm', contentType: 'video/webm' };
  }
  return { ext: 'mp4', contentType: 'video/mp4' };
}

// Same 9 categories used across the mobile app's Home grid and Glow Match —
// kept as a fixed list (not tied to ProviderService) so any artist can tag a
// post regardless of pricing model or whether they've set up a service menu.
// Must match mobile/src/data/categories.ts's CATEGORIES[].name exactly — the
// waxing entry used to read just 'Waxing' here while the client sent
// 'Waxing & Hair Removal', so every post tagged with that category was
// silently rejected with a 400 at upload time.
const POST_CATEGORIES = [
  'Hair', 'Nails', 'Brows & Lashes', 'Waxing & Hair Removal', 'Makeup',
  'Facials & Skin', 'Bridal', 'Henna', 'Spa & Massage',
];

router.post(
  '/',
  authenticate,
  requireRole('Provider'),
  async (req, res) => {
    try {
      const { photoBase64, videoBase64, mimeType = 'image/jpeg', caption, serviceId, category, filter } = req.body;
      if (!photoBase64 && !videoBase64) return res.status(400).json({ error: 'photoBase64 or videoBase64 required' });
      if (photoBase64 && videoBase64) return res.status(400).json({ error: 'A post is either a photo or a video, not both' });
      if (photoBase64 && photoBase64.length > 8_000_000) return res.status(413).json({ error: 'Image too large. Maximum 6 MB.' });
      // ~6s of video at a phone-camera bitrate comfortably fits under this.
      // Capped below express.json's global 15mb body limit (app.js) — not up
      // against it — since the surrounding JSON (caption, keys, etc.) also
      // has to fit inside that same 15mb.
      if (videoBase64 && videoBase64.length > 12_000_000) return res.status(413).json({ error: 'Video too large. Maximum ~9 MB (6s clip).' });
      if (caption && caption.length > 500) return res.status(400).json({ error: 'Caption must be 500 characters or fewer' });
      if (category && !POST_CATEGORIES.includes(category)) {
        return res.status(400).json({ error: `category must be one of: ${POST_CATEGORIES.join(', ')}` });
      }
      if (filter && !PHOTO_FILTERS[filter]) {
        return res.status(400).json({ error: `filter must be one of: ${Object.keys(PHOTO_FILTERS).join(', ')}` });
      }

      const profile = await prisma.providerProfile.findUnique({ where: { userId: req.user.id } });
      if (!profile) return res.status(400).json({ error: 'Provider profile not found' });

      if (serviceId) {
        const service = await prisma.providerService.findUnique({ where: { id: serviceId } });
        if (!service || service.profileId !== profile.id) {
          return res.status(400).json({ error: 'serviceId does not belong to your profile' });
        }
      }

      if (!process.env.BLOB_READ_WRITE_TOKEN) {
        return res.status(500).json({ error: 'File storage is not configured. Contact support.' });
      }

      const data = {
        profileId: profile.id,
        caption: caption || null,
        serviceId: serviceId || null,
        category: category || null,
      };

      if (videoBase64) {
        const buf = Buffer.from(videoBase64, 'base64');
        const { ext, contentType } = videoExtAndType(mimeType);
        const result = await uploadFile(`posts/${profile.id}-${Date.now()}.${ext}`, buf, contentType);
        if (!result?.url) return res.status(500).json({ error: 'Video upload failed. Please try again.' });
        data.videoUrl = result.url;
      } else {
        let buf = Buffer.from(photoBase64, 'base64');
        try {
          let img = sharp(buf).resize(1080, 1350, { fit: 'inside', withoutEnlargement: true });
          img = PHOTO_FILTERS[filter || 'original'](img);
          buf = await img.jpeg({ quality: 80 }).toBuffer();
        } catch {}
        const result = await uploadFile(`posts/${profile.id}-${Date.now()}.jpg`, buf, 'image/jpeg');
        if (!result?.url) return res.status(500).json({ error: 'Photo upload failed. Please try again.' });
        data.photoUrl = result.url;
      }

      const post = await prisma.post.create({ data });

      res.status(201).json({ post });
    } catch (err) {
      console.error('POST /posts error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

router.delete(
  '/:id',
  authenticate,
  requireRole('Provider'),
  async (req, res) => {
    try {
      const profile = await prisma.providerProfile.findUnique({ where: { userId: req.user.id } });
      if (!profile) return res.status(400).json({ error: 'Provider profile not found' });

      const post = await prisma.post.findUnique({ where: { id: req.params.id } });
      if (!post || !post.active) return res.status(404).json({ error: 'Post not found' });
      if (post.profileId !== profile.id) return res.status(403).json({ error: 'Not your post' });

      await prisma.post.update({ where: { id: post.id }, data: { active: false } });
      res.json({ success: true });
    } catch (err) {
      console.error('DELETE /posts/:id error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// PATCH /posts/:id — category is the only thing worth editing after the
// fact: photo/video/filter are baked in at upload, and caption editing
// wasn't asked for. This is specifically what lets an artist move an
// "Uncategorized" post (one they skipped tagging, or one that predates a
// given category existing) into a real category without re-uploading.
router.patch(
  '/:id',
  authenticate,
  requireRole('Provider'),
  async (req, res) => {
    try {
      const { category } = req.body;
      if (category && !POST_CATEGORIES.includes(category)) {
        return res.status(400).json({ error: `category must be one of: ${POST_CATEGORIES.join(', ')}` });
      }

      const profile = await prisma.providerProfile.findUnique({ where: { userId: req.user.id } });
      if (!profile) return res.status(400).json({ error: 'Provider profile not found' });

      const post = await prisma.post.findUnique({ where: { id: req.params.id } });
      if (!post || !post.active) return res.status(404).json({ error: 'Post not found' });
      if (post.profileId !== profile.id) return res.status(403).json({ error: 'Not your post' });

      const updated = await prisma.post.update({
        where: { id: post.id },
        data: { category: category || null },
      });
      res.json({ post: updated });
    } catch (err) {
      console.error('PATCH /posts/:id error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

router.get(
  '/mine',
  authenticate,
  requireRole('Provider'),
  async (req, res) => {
    try {
      const profile = await prisma.providerProfile.findUnique({ where: { userId: req.user.id } });
      if (!profile) return res.status(400).json({ error: 'Provider profile not found' });

      const posts = await prisma.post.findMany({
        where: { profileId: profile.id, active: true },
        orderBy: { createdAt: 'desc' },
        include: { service: true },
      });
      res.json({ posts });
    } catch (err) {
      console.error('GET /posts/mine error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

router.post(
  '/:id/like',
  authenticate,
  async (req, res) => {
    try {
      const post = await prisma.post.findUnique({ where: { id: req.params.id } });
      if (!post || !post.active) return res.status(404).json({ error: 'Post not found' });

      try {
        await prisma.$transaction(async (tx) => {
          await tx.postLike.create({ data: { postId: post.id, userId: req.user.id } });
          await tx.post.update({ where: { id: post.id }, data: { likeCount: { increment: 1 } } });
        });
      } catch (err) {
        if (err.code !== 'P2002') throw err; // already liked — no-op
      }

      res.json({ success: true });
    } catch (err) {
      console.error('POST /posts/:id/like error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

router.delete(
  '/:id/like',
  authenticate,
  async (req, res) => {
    try {
      const existing = await prisma.postLike.findUnique({
        where: { postId_userId: { postId: req.params.id, userId: req.user.id } },
      });
      if (!existing) return res.json({ success: true }); // no-op

      try {
        await prisma.$transaction(async (tx) => {
          await tx.postLike.delete({ where: { id: existing.id } });
          await tx.post.update({ where: { id: req.params.id }, data: { likeCount: { decrement: 1 } } });
        });
      } catch (err) {
        if (err.code !== 'P2025') throw err; // already deleted by a concurrent request — no-op
      }

      res.json({ success: true });
    } catch (err) {
      console.error('DELETE /posts/:id/like error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

function toNum(v) { return v == null ? v : parseFloat(v.toString()); }

// GET /posts/liked — posts the current user has liked, newest-liked first.
// Liking a post was already fully wired (POST/DELETE /:id/like below,
// PostDetailScreen's heart) but there was nowhere to read the list back —
// the customer's Saved screen only ever showed saved Looks and favorited
// Artists, never a liked Post. Must come before /:id-style routes for the
// same reason /explore does — none defined here yet, but keeping the
// pattern consistent.
router.get(
  '/liked',
  authenticate,
  async (req, res) => {
    try {
      const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 50);
      const cursor = req.query.cursor;

      const likes = await prisma.postLike.findMany({
        where: { userId: req.user.id, post: { active: true } },
        orderBy: { createdAt: 'desc' },
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        include: {
          post: {
            include: {
              profile: {
                select: { id: true, photoUrl: true, user: { select: { name: true } } },
              },
              service: { select: { id: true, name: true, price: true } },
            },
          },
        },
      });

      const hasMore = likes.length > limit;
      const page = likes.slice(0, limit).map((l) => ({
        id: l.post.id,
        photoUrl: l.post.photoUrl,
        videoUrl: l.post.videoUrl,
        caption: l.post.caption,
        category: l.post.category,
        likeCount: l.post.likeCount,
        createdAt: l.post.createdAt,
        provider: { id: l.post.profile.id, name: l.post.profile.user.name, photoUrl: l.post.profile.photoUrl },
        service: l.post.service ? { id: l.post.service.id, name: l.post.service.name, price: toNum(l.post.service.price) } : null,
        isLikedByMe: true,
      }));

      res.json({
        posts: page,
        nextCursor: hasMore ? likes[limit].id : null,
      });
    } catch (err) {
      console.error('GET /posts/liked error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

router.get(
  '/explore',
  authenticate,
  async (req, res) => {
    try {
      const sort = req.query.sort || 'recent';
      if (sort !== 'recent' && sort !== 'top') {
        return res.status(400).json({ error: 'sort must be "recent" or "top"' });
      }
      const category = req.query.category;
      if (category && !POST_CATEGORIES.includes(category)) {
        return res.status(400).json({ error: `category must be one of: ${POST_CATEGORIES.join(', ')}` });
      }
      const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 50);
      const cursor = req.query.cursor;

      const posts = await prisma.post.findMany({
        where: {
          active: true,
          profile: { approvedByAdmin: true },
          ...(category ? { category } : {}),
        },
        orderBy: sort === 'top' ? { likeCount: 'desc' } : { createdAt: 'desc' },
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        include: {
          profile: {
            select: {
              id: true, photoUrl: true,
              user: { select: { name: true } },
            },
          },
          service: { select: { id: true, name: true, price: true } },
          likes: { where: { userId: req.user.id }, select: { id: true } },
        },
      });

      const hasMore = posts.length > limit;
      const page = posts.slice(0, limit).map((p) => ({
        id: p.id,
        photoUrl: p.photoUrl,
        videoUrl: p.videoUrl,
        caption: p.caption,
        category: p.category,
        likeCount: p.likeCount,
        createdAt: p.createdAt,
        provider: { id: p.profile.id, name: p.profile.user.name, photoUrl: p.profile.photoUrl },
        service: p.service ? { id: p.service.id, name: p.service.name, price: toNum(p.service.price) } : null,
        isLikedByMe: p.likes.length > 0,
      }));

      res.json({
        posts: page,
        nextCursor: hasMore ? posts[limit].id : null,
      });
    } catch (err) {
      console.error('GET /posts/explore error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// GET /posts/explore-looks — self-served Looks (ProviderLook) across all
// approved artists, for the app's main discovery surfaces (Explore, Home).
// Without this, a look's badge/theme/gallery/video only exist behind a
// direct visit to that one artist's profile — findable only if you already
// know them, never surfaced to a browsing customer the way curated
// data/looks.ts entries are.
router.get(
  '/explore-looks',
  authenticate,
  async (req, res) => {
    try {
      const sort = req.query.sort || 'recent';
      if (sort !== 'recent' && sort !== 'top') {
        return res.status(400).json({ error: 'sort must be "recent" or "top"' });
      }
      const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 50);
      const cursor = req.query.cursor;

      const looks = await prisma.providerLook.findMany({
        where: { active: true, profile: { approvedByAdmin: true, publicProfile: true } },
        orderBy: sort === 'top' ? { createdAt: 'desc' } : { createdAt: 'desc' }, // likeCount isn't a column (see LookLike comment) — recency stands in for "top" until that's aggregated below
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        include: {
          profile: {
            select: { id: true, photoUrl: true, user: { select: { id: true, name: true } } },
          },
        },
      });

      const hasMore = looks.length > limit;
      const page = looks.slice(0, limit);

      // Like counts, batched — same lookKey scheme as the public-profile route.
      const likeCounts = page.length
        ? await prisma.lookLike.groupBy({
            by: ['profileId', 'lookKey'],
            where: { OR: page.map(l => ({ profileId: l.profileId, lookKey: `custom:${l.id}` })) },
            _count: { lookKey: true },
          })
        : [];
      const countByLookId = Object.fromEntries(
        likeCounts.map(c => [`${c.profileId}:${c.lookKey.replace('custom:', '')}`, c._count.lookKey])
      );

      let ordered = page.map(l => ({
        id: l.id,
        name: l.name,
        vibe: l.vibe,
        serviceType: l.serviceType,
        price: toNum(l.price),
        durationMin: l.durationMin,
        includes: l.includes,
        media: l.media,
        badge: l.badge,
        themeFrom: l.themeFrom,
        themeTo: l.themeTo,
        likeCount: countByLookId[`${l.profileId}:${l.id}`] || 0,
        provider: { id: l.profile.user.id, name: l.profile.user.name, photoUrl: l.profile.photoUrl },
      }));
      if (sort === 'top') ordered = [...ordered].sort((a, b) => b.likeCount - a.likeCount);

      res.json({ looks: ordered, nextCursor: hasMore ? page[page.length - 1].id : null });
    } catch (err) {
      console.error('GET /posts/explore-looks error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

module.exports = router;
