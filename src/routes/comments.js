// src/routes/comments.js
'use strict';

const express = require('express');
const prisma  = require('../lib/prisma');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Comments work on either a Post or a ProviderLook — any signed-in user
// (customer or artist) can post one, matching how liking a post already has
// no role restriction (see posts.js's POST /:id/like).

router.post(
  '/',
  authenticate,
  async (req, res) => {
    try {
      const { postId, providerLookId, text } = req.body;
      if (!postId && !providerLookId) return res.status(400).json({ error: 'postId or providerLookId required' });
      if (postId && providerLookId) return res.status(400).json({ error: 'A comment is on either a post or a look, not both' });

      const trimmed = typeof text === 'string' ? text.trim() : '';
      if (!trimmed) return res.status(400).json({ error: 'Comment text is required' });
      if (trimmed.length > 500) return res.status(400).json({ error: 'Comment must be 500 characters or fewer' });

      if (postId) {
        const post = await prisma.post.findUnique({ where: { id: postId }, select: { id: true, active: true } });
        if (!post || !post.active) return res.status(404).json({ error: 'Post not found' });
      } else {
        const look = await prisma.providerLook.findUnique({ where: { id: providerLookId }, select: { id: true, active: true } });
        if (!look || !look.active) return res.status(404).json({ error: 'Look not found' });
      }

      const [comment] = await prisma.$transaction([
        prisma.comment.create({
          data: { postId: postId || null, providerLookId: providerLookId || null, userId: req.user.id, text: trimmed },
          include: { user: { select: { id: true, name: true, photoUrl: true, role: true } } },
        }),
        // ProviderLook has no denormalized counter (its likes are counted
        // live via groupBy — see routes/provider.js's GET /looks), so only
        // Post's commentCount needs updating here.
        ...(postId ? [prisma.post.update({ where: { id: postId }, data: { commentCount: { increment: 1 } } })] : []),
      ]);

      res.status(201).json({ comment: serializeComment(comment) });
    } catch (err) {
      console.error('POST /comments error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

router.get(
  '/',
  authenticate,
  async (req, res) => {
    try {
      const { postId, providerLookId } = req.query;
      if (!postId && !providerLookId) return res.status(400).json({ error: 'postId or providerLookId required' });
      if (postId && providerLookId) return res.status(400).json({ error: 'Pass only one of postId or providerLookId' });

      const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 30, 1), 50);
      const cursor = req.query.cursor;

      const comments = await prisma.comment.findMany({
        where: postId ? { postId: String(postId) } : { providerLookId: String(providerLookId) },
        orderBy: { createdAt: 'desc' },
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        include: { user: { select: { id: true, name: true, photoUrl: true, role: true } } },
      });

      const hasMore = comments.length > limit;
      const page = comments.slice(0, limit);

      res.json({
        comments: page.map(serializeComment),
        nextCursor: hasMore ? page[page.length - 1].id : null,
      });
    } catch (err) {
      console.error('GET /comments error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// A comment can be deleted by whoever wrote it, OR by whoever owns the
// Post/Look it's on (an artist moderating comments on their own content) —
// two different authorization paths converging on one route, mirroring how
// posts.js's DELETE /posts/:id checks `post.profileId !== profile.id`.
router.delete(
  '/:id',
  authenticate,
  async (req, res) => {
    try {
      const comment = await prisma.comment.findUnique({
        where: { id: req.params.id },
        include: {
          post: { select: { id: true, profile: { select: { userId: true } } } },
          providerLook: { select: { id: true, profile: { select: { userId: true } } } },
        },
      });
      if (!comment) return res.status(404).json({ error: 'Comment not found' });

      const isAuthor = comment.userId === req.user.id;
      const targetOwnerUserId = comment.post?.profile.userId ?? comment.providerLook?.profile.userId ?? null;
      const isTargetOwner = !!targetOwnerUserId && targetOwnerUserId === req.user.id;

      if (!isAuthor && !isTargetOwner) {
        return res.status(403).json({ error: 'You can only delete your own comments, or comments on your own content' });
      }

      await prisma.$transaction([
        prisma.comment.delete({ where: { id: comment.id } }),
        ...(comment.postId ? [prisma.post.update({ where: { id: comment.postId }, data: { commentCount: { decrement: 1 } } })] : []),
      ]);

      res.json({ success: true });
    } catch (err) {
      console.error('DELETE /comments/:id error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

function serializeComment(c) {
  return {
    id: c.id,
    text: c.text,
    postId: c.postId,
    providerLookId: c.providerLookId,
    createdAt: c.createdAt,
    user: { id: c.user.id, name: c.user.name, photoUrl: c.user.photoUrl, role: c.user.role },
  };
}

module.exports = router;
