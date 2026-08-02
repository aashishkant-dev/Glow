// src/routes/posts.js
'use strict';

const express = require('express');
const sharp   = require('sharp');
const { uploadFile } = require('../utils/storage');
const prisma  = require('../lib/prisma');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

// Same 9 categories used across the mobile app's Home grid and Glow Match —
// kept as a fixed list (not tied to ProviderService) so any artist can tag a
// post regardless of pricing model or whether they've set up a service menu.
const POST_CATEGORIES = [
  'Hair', 'Nails', 'Brows & Lashes', 'Waxing', 'Makeup',
  'Facials & Skin', 'Bridal', 'Henna', 'Spa & Massage',
];

router.post(
  '/',
  authenticate,
  requireRole('Provider'),
  async (req, res) => {
    try {
      const { photoBase64, mimeType = 'image/jpeg', caption, serviceId, category } = req.body;
      if (!photoBase64) return res.status(400).json({ error: 'photoBase64 required' });
      if (photoBase64.length > 8_000_000) return res.status(413).json({ error: 'Image too large. Maximum 6 MB.' });
      if (caption && caption.length > 500) return res.status(400).json({ error: 'Caption must be 500 characters or fewer' });
      if (category && !POST_CATEGORIES.includes(category)) {
        return res.status(400).json({ error: `category must be one of: ${POST_CATEGORIES.join(', ')}` });
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

      let buf = Buffer.from(photoBase64, 'base64');
      try {
        buf = await sharp(buf)
          .resize(1080, 1350, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 80 })
          .toBuffer();
      } catch {}

      const result = await uploadFile(`posts/${profile.id}-${Date.now()}.jpg`, buf, 'image/jpeg');
      if (!result?.url) {
        return res.status(500).json({ error: 'Photo upload failed. Please try again.' });
      }

      const post = await prisma.post.create({
        data: {
          profileId: profile.id,
          photoUrl: result.url,
          caption: caption || null,
          serviceId: serviceId || null,
          category: category || null,
        },
      });

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

router.get(
  '/mine',
  authenticate,
  requireRole('Provider'),
  async (req, res) => {
    try {
      const profile = await prisma.providerProfile.findUnique({ where: { userId: req.user.id } });
      if (!profile) return res.status(400).json({ error: 'Provider profile not found' });

      const posts = await prisma.post.findMany({
        where: { profileId: profile.id },
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

module.exports = router;
