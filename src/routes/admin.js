// src/routes/admin.js
'use strict';

const express  = require('express');
const prisma   = require('../lib/prisma');
const { authenticate, requireRole } = require('../middleware/auth');
const { authenticateAdmin, authenticateAdminOrUser, requireAdminRole, logAudit } = require('../middleware/adminAuth');
const { notify } = require('../utils/notify');
const { cacheGet, cacheSet, cacheDel } = require('../utils/cache');

const router = express.Router();

// Prisma Decimal → JS number coercion
function toNum(v) { return v == null ? v : parseFloat(v.toString()); }

// ── GET /admin/providers ────────────────────────────────────────────────────────────
router.get(
  '/providers',
  authenticateAdminOrUser,
  async (req, res) => {
    try {
      const { page = 1, limit = 50 } = req.query;
      const pageNum  = Math.max(1, parseInt(page, 10) || 1);
      const limitNum = Math.min(100, parseInt(limit, 10) || 50);

      const approvedFilter = req.query.approved === 'true' ? 'true' : req.query.approved === 'false' ? 'false' : 'all';
      const cacheKey = `admin:providers:${approvedFilter}:p${pageNum}:l${limitNum}`;
      const cached = await cacheGet(cacheKey);
      if (cached) return res.json(cached);

      // Build where on ProviderProfile first (approved filter lives there), then join User
      const profileWhere = {};
      if (req.query.approved !== undefined) {
        profileWhere.approvedByAdmin = req.query.approved === 'true';
      }

      const [profiles, total] = await Promise.all([
        prisma.providerProfile.findMany({
          where:   profileWhere,
          orderBy: { createdAt: 'desc' },
          skip:    (pageNum - 1) * limitNum,
          take:    limitNum,
          // Explicit select — EXCLUDE submittedDocuments (base64 blob JSON, 100KB+/row).
          // The list view never renders docs; admin fetches them per-Provider via /admin/providers/:id.
          select: {
            id: true, userId: true, qualificationType: true, licenseNumber: true, collegeName: true,
            certifications: true, experienceYears: true, availability: true, approvedByAdmin: true,
            rejectionReason: true, bio: true, languages: true, photoUrl: true, specialties: true,
            policeCheckCleared: true, firstAidCertified: true, driversLicense: true,
            ownTransportation: true, insuranceVerified: true, createdAt: true, updatedAt: true,
            user: {
              select: {
                id: true, name: true, phone: true, email: true,
                isVerified: true, createdAt: true, rating: true, ratingCount: true, photoUrl: true,
              },
            },
          },
        }),
        prisma.providerProfile.count({ where: profileWhere }),
      ]);

      const result = profiles.map(p => ({
        ...p.user,
        // Prisma Decimal → JSON string; app calls rating.toFixed() and crashes.
        rating: p.user.rating != null ? parseFloat(p.user.rating.toString()) : 0,
        profile: { ...p, user: undefined },
      }));

      const response = { total, page: pageNum, pages: Math.ceil(total / limitNum), providers: result };
      await cacheSet(cacheKey, response, 30);
      res.json(response);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// ── POST /admin/providers/:id/approve ───────────────────────────────────────────────
router.post(
  '/providers/:id/approve',
  authenticateAdminOrUser,
  async (req, res) => {
    try {
      const { id } = req.params;

      const user = await prisma.user.findFirst({ where: { id, role: 'Provider' }, include: { providerProfile: true } });
      if (!user) return res.status(404).json({ error: 'Provider user not found' });

      // Business rule: a Provider must have uploaded all required documents before
      // approval. Required = government ID, beauty certificate/diploma — mirrors
      // mobile's REQUIRED_DOCS (ProviderDashboardScreen.tsx) exactly. Police check
      // is optional (trust boost, not a gate) and first aid cert was dropped
      // entirely — both CareNearby-era home-care requirements that never applied
      // to a beauty marketplace. This previously listed police_check/first_aid_cert
      // instead of id_proof, so NO provider could ever be approved: the backend
      // demanded a document type (first_aid_cert) the app no longer has any UI
      // path to upload.
      // Admin can override with ?force=true (e.g. docs verified out-of-band).
      const REQUIRED_DOCS = ['id_proof', 'provider_certificate'];
      const force = req.query.force === 'true' || req.body?.force === true;
      if (!force && user.providerProfile) {
        const uploaded = await prisma.document.findMany({
          where:  { entityType: 'Provider', entityId: user.providerProfile.id, isActive: true, docType: { in: REQUIRED_DOCS } },
          select: { docType: true, status: true },
        });
        const haveTypes = new Set(uploaded.filter(d => d.status !== 'REJECTED').map(d => d.docType));
        const missing = REQUIRED_DOCS.filter(t => !haveTypes.has(t));
        if (missing.length > 0) {
          return res.status(400).json({
            error: 'Cannot approve: required documents missing or rejected.',
            missing,
            hint: 'Ask the Provider to upload all required documents, or pass force=true to override.',
          });
        }
      }

      const profile = await prisma.providerProfile.upsert({
        where:  { userId: id },
        update: { approvedByAdmin: true },
        create: { userId: id, approvedByAdmin: true },
      });

      // Approving the Provider also clears their pending documents (admin vetted them).
      // Otherwise the Provider profile shows "Admin Approved" while docs stay "Pending".
      await prisma.document.updateMany({
        where: { entityType: 'Provider', entityId: profile.id, isActive: true, status: 'PENDING' },
        data:  { status: 'APPROVED', reviewedAt: new Date(), reviewedBy: req.user?.id ?? null },
      });

      await prisma.user.update({ where: { id }, data: { isVerified: true } });

      await cacheDel('admin:providers:all');
      await cacheDel('admin:providers:true');
      await cacheDel('admin:providers:false');

      const io = req.app.get('io');
      if (io) io.to(`user-${id}`).emit('provider-approved', { userId: id });

      // notify() persists a Notification row (so this survives into the
      // Provider's bell/Notifications history if they aren't in the app at
      // the moment they're approved — a real event, not something that
      // should only exist as a live push they might miss) as well as
      // sending the push.
      notify({
        userId:    id,
        type:      'approved',
        title:     "You've been approved!",
        body:      'Your Glow application has been approved. You can now go online and accept jobs.',
        pushToken: user.expoPushToken, // reuse — already fetched above, no extra DB call
      }).catch(() => {});

      res.json({ message: 'Provider approved successfully', profile });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// ── POST /admin/providers/:id/reject ────────────────────────────────────────────────
router.post(
  '/providers/:id/reject',
  authenticateAdminOrUser,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      const user = await prisma.user.findFirst({ where: { id, role: 'Provider' } });
      if (!user) return res.status(404).json({ error: 'Provider user not found' });

      await prisma.providerProfile.upsert({
        where:  { userId: id },
        update: { approvedByAdmin: false, rejectionReason: reason || 'Application not approved.' },
        create: { userId: id, approvedByAdmin: false, rejectionReason: reason || 'Application not approved.' },
      });

      await prisma.user.update({ where: { id }, data: { isVerified: false } });

      await cacheDel('admin:providers:all');
      await cacheDel('admin:providers:true');
      await cacheDel('admin:providers:false');

      res.json({ message: 'Provider rejected', reason: reason || 'Application not approved.' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// ── GET /admin/providers/:id/bookings ───────────────────────────────────────────────
router.get(
  '/providers/:id/bookings',
  authenticateAdminOrUser,
  async (req, res) => {
    try {
      const { page = 1, limit = 30 } = req.query;
      const pageNum  = Math.max(1, parseInt(page, 10) || 1);
      const limitNum = Math.min(100, parseInt(limit, 10) || 30);

      const [bookings, total] = await Promise.all([
        prisma.booking.findMany({
          where:   { providerId: req.params.id },
          orderBy: { scheduledAt: 'desc' },
          skip:    (pageNum - 1) * limitNum,
          take:    limitNum,
          include: { customer: { select: { name: true, phone: true } } },
        }),
        prisma.booking.count({ where: { providerId: req.params.id } }),
      ]);
      const num = v => (v != null ? parseFloat(v.toString()) : v);
      res.json({
        // Prisma Decimal → JSON string; app calls .toFixed() and crashes.
        bookings: bookings.map(b => ({
          ...b,
          price:       num(b.price),
          totalPrice:  num(b.price),
          platformFee: num(b.platformFee),
          providerPayout:   num(b.providerPayout),
          tipAmount:   num(b.tipAmount),
        })),
        total, page: pageNum, pages: Math.ceil(total / limitNum),
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// ── GET /admin/providers/:id ────────────────────────────────────────────────────────
router.get(
  '/providers/:id',
  authenticateAdminOrUser,
  async (req, res) => {
    try {
      const user = await prisma.user.findFirst({
        where:   { id: req.params.id, role: 'Provider' },
        include: { providerProfile: true },
      });
      if (!user) return res.status(404).json({ error: 'Provider not found' });

      const { providerProfile: profile, ...rest } = user;

      // Fetch documents from Document table (new uploads go here via Vercel Blob)
      let dbDocuments = [];
      if (profile) {
        dbDocuments = await prisma.document.findMany({
          where:   { entityType: 'Provider', entityId: profile.id, isActive: true },
          orderBy: { submittedAt: 'desc' },
          select: {
            id: true, docType: true, label: true, url: true, mimeType: true,
            status: true, submittedAt: true, fileName: true, size: true,
          },
        });
      }

      // Merge: legacy submittedDocuments JSON + new Document table records.
      // DB docs take precedence; legacy-only docTypes are appended as fallback.
      const legacyDocs = Array.isArray(profile?.submittedDocuments) ? profile.submittedDocuments : [];
      const normalizedDbDocs = dbDocuments.map(d => ({
        docType:         d.docType,
        label:           d.label || d.fileName || d.docType,
        url:             d.url,
        dataUrl:         '',
        submittedAt:     d.submittedAt?.toISOString?.() ?? d.submittedAt,
        verifiedByAdmin: d.status === 'APPROVED',
        verifiedAt:      d.status === 'APPROVED' ? (d.submittedAt?.toISOString?.() ?? d.submittedAt) : null,
        rejectionNote:   '',
        documentId:      d.id,
      }));

      const dbDocTypes = new Set(normalizedDbDocs.map(d => d.docType));
      const legacyOnly = legacyDocs.filter(d => !dbDocTypes.has(d.docType));
      const mergedDocs = [...normalizedDbDocs, ...legacyOnly];

      const profileWithDocs = profile ? { ...profile, submittedDocuments: mergedDocs } : profile;
      res.json({
        provider: {
          ...rest,
          // Prisma Decimal → JSON string; app calls rating.toFixed() and crashes.
          rating: rest.rating != null ? parseFloat(rest.rating.toString()) : 0,
          profile: profileWithDocs,
        },
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// ── POST /admin/providers/:id/verify-document ──────────────────────────────────────
router.post(
  '/providers/:id/verify-document',
  authenticateAdminOrUser,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { docType, verified, rejectionNote, documentId } = req.body;
      if (!docType) return res.status(400).json({ error: 'docType is required' });

      const profile = await prisma.providerProfile.findUnique({ where: { userId: id } });
      if (!profile) return res.status(404).json({ error: 'Provider profile not found' });

      // ── 1. Update Document table row (new-style uploads via Vercel Blob) ──
      // Try by explicit documentId first, then fall back to docType+profile lookup
      let dbDocUpdated = false;
      if (documentId) {
        const existing = await prisma.document.findFirst({
          where: { id: documentId, entityId: profile.id },
        });
        if (existing) {
          await prisma.document.update({
            where: { id: documentId },
            data:  {
              status:      verified ? 'APPROVED' : 'REJECTED',
              reviewedAt:  new Date(),
              reviewedBy:  (req.user?.id || req.admin?.id) ?? null,
              rejectionReason: rejectionNote || '',
            },
          });
          dbDocUpdated = true;
        }
      }

      if (!dbDocUpdated) {
        // No explicit documentId — find by docType in Document table
        const dbDoc = await prisma.document.findFirst({
          where:   { entityType: 'Provider', entityId: profile.id, docType, isActive: true },
          orderBy: { submittedAt: 'desc' },
        });
        if (dbDoc) {
          await prisma.document.update({
            where: { id: dbDoc.id },
            data:  {
              status:      verified ? 'APPROVED' : 'REJECTED',
              reviewedAt:  new Date(),
              reviewedBy:  (req.user?.id || req.admin?.id) ?? null,
              rejectionReason: rejectionNote || '',
            },
          });
          dbDocUpdated = true;
        }
      }

      // ── 2. Also update legacy submittedDocuments JSON (backward compat) ──
      const docs = Array.isArray(profile.submittedDocuments) ? profile.submittedDocuments : [];
      const doc  = docs.find(d => d.docType === docType);
      if (doc) {
        doc.verifiedByAdmin = !!verified;
        doc.verifiedAt      = verified ? new Date().toISOString() : null;
        doc.rejectionNote   = rejectionNote || '';
        await prisma.providerProfile.update({
          where: { userId: id },
          data:  { submittedDocuments: docs },
        });
      }

      if (!doc && !dbDocUpdated) {
        return res.status(404).json({ error: 'Document not found in Document table or legacy profile' });
      }

      res.json({ message: verified ? 'Document verified' : 'Document rejected', docType });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// ── PATCH /admin/providers/:id/police-check ────────────────────────────────────────
router.patch(
  '/providers/:id/police-check',
  authenticateAdminOrUser,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { cleared } = req.body;

      const profile = await prisma.providerProfile.findUnique({ where: { userId: id } });
      if (!profile) return res.status(404).json({ error: 'Provider profile not found' });

      const updated = await prisma.providerProfile.update({
        where: { userId: id },
        data:  { policeCheckCleared: !!cleared },
      });

      res.json({ message: `Police check ${cleared ? 'cleared' : 'uncleared'}`, policeCheckCleared: updated.policeCheckCleared });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// ── GET /admin/bookings ────────────────────────────────────────────────────────
router.get(
  '/bookings',
  authenticateAdminOrUser,
  async (req, res) => {
    try {
      const { status, page = 1, limit = 20 } = req.query;

      const where = {};
      if (status) {
        const VALID_STATUSES = ['REQUESTED', 'ACCEPTED', 'ON_MY_WAY', 'STARTED', 'COMPLETED', 'CANCELLED'];
        if (!VALID_STATUSES.includes(status)) {
          return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
        }
        where.status = status;
      }
      if (req.query.providerId) where.providerId = req.query.providerId;

      const pageNum  = Math.max(1, parseInt(page,  10) || 1);
      const limitNum = Math.min(100, parseInt(limit, 10) || 20);

      const [bookings, total] = await Promise.all([
        prisma.booking.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip:    (pageNum - 1) * limitNum,
          take:    limitNum,
          include: {
            customer: { select: { name: true, phone: true } },
            provider:      { select: { name: true, phone: true, rating: true } },
          },
        }),
        prisma.booking.count({ where }),
      ]);

      const safeBookings = bookings.map(b => ({
        ...b,
        price:       b.price       != null ? parseFloat(b.price.toString())       : b.price,
        platformFee: b.platformFee != null ? parseFloat(b.platformFee.toString()) : b.platformFee,
        providerPayout:   b.providerPayout   != null ? parseFloat(b.providerPayout.toString())   : b.providerPayout,
        provider: b.provider ? { ...b.provider, rating: b.provider.rating != null ? parseFloat(b.provider.rating.toString()) : 0 } : b.provider,
      }));
      res.json({ total, page: pageNum, pages: Math.ceil(total / limitNum), bookings: safeBookings });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// ── GET /admin/documents ───────────────────────────────────────────────────────
router.get(
  '/documents',
  authenticateAdminOrUser,
  async (req, res) => {
    try {
      const { status, docType, entityType, page = 1, limit = 20 } = req.query;
      const where = { isActive: true };
      if (status)     where.status     = status;
      if (docType)    where.docType    = docType;
      if (entityType) where.entityType = entityType;

      const pageNum  = Math.max(1, parseInt(page, 10) || 1);
      const limitNum = Math.min(100, parseInt(limit, 10) || 20);

      // Explicitly exclude dataUrl (base64 blob) from list — only include in single-doc fetch
      const docSelect = {
        id: true, entityType: true, entityId: true, docType: true, label: true,
        fileName: true, originalName: true, mimeType: true, size: true,
        storagePath: true, url: true, status: true, submittedAt: true,
        reviewedAt: true, reviewedBy: true, rejectionReason: true,
        notes: true, expiresAt: true, isActive: true, createdAt: true, updatedAt: true,
      };

      const [documents, total] = await Promise.all([
        prisma.document.findMany({
          where,
          orderBy: { submittedAt: 'desc' },
          skip:    (pageNum - 1) * limitNum,
          take:    limitNum,
          select:  docSelect,
        }),
        prisma.document.count({ where }),
      ]);

      res.json({ total, page: pageNum, pages: Math.ceil(total / limitNum), documents });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// ── GET /admin/documents/pending ──────────────────────────────────────────────
router.get(
  '/documents/pending',
  authenticateAdminOrUser,
  async (req, res) => {
    try {
      const count = await prisma.document.count({ where: { status: 'PENDING', isActive: true } });
      res.json({ pendingCount: count });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// ── GET /admin/documents/provider/:providerId ───────────────────────────────────────────
// NOTE: defined BEFORE /documents/:id to avoid wildcard match
router.get(
  '/documents/provider/:providerId',
  authenticateAdminOrUser,
  async (req, res) => {
    try {
      const { providerId } = req.params;

      const profile = await prisma.providerProfile.findUnique({ where: { userId: providerId } });
      if (!profile) return res.status(200).json({ documents: [] });

      // Exclude dataUrl from list — caller must fetch /documents/:id for the full blob
      const documents = await prisma.document.findMany({
        where:   { entityType: 'Provider', entityId: profile.id, isActive: true },
        orderBy: { submittedAt: 'desc' },
        select: {
          id: true, entityType: true, entityId: true, docType: true, label: true,
          fileName: true, originalName: true, mimeType: true, size: true,
          storagePath: true, url: true, status: true, submittedAt: true,
          reviewedAt: true, reviewedBy: true, rejectionReason: true,
          notes: true, expiresAt: true, isActive: true, createdAt: true, updatedAt: true,
        },
      });

      res.json({ documents });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// ── GET /admin/documents/:id ───────────────────────────────────────────────────
router.get(
  '/documents/:id',
  authenticateAdminOrUser,
  async (req, res) => {
    try {
      const document = await prisma.document.findUnique({ where: { id: req.params.id } });
      if (!document) return res.status(404).json({ error: 'Document not found' });
      res.json({ document });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// ── POST /admin/documents/:id/approve ─────────────────────────────────────────
router.post(
  '/documents/:id/approve',
  authenticateAdminOrUser,
  async (req, res) => {
    try {
      const { notes } = req.body;
      const document = await prisma.document.findUnique({ where: { id: req.params.id } });
      if (!document) return res.status(404).json({ error: 'Document not found' });

      const updated = await prisma.document.update({
        where: { id: req.params.id },
        data: {
          status:          'APPROVED',
          reviewedAt:      new Date(),
          reviewedBy:      req.user.id,
          rejectionReason: '',
          notes:           notes || '',
        },
      });

      await logAudit(req.user.id, 'DOCUMENT_APPROVED', 'Document', document.id, { docType: document.docType }, req);
      await _syncProviderProfileFromDoc(document, true);

      res.json({ message: 'Document approved', document: updated });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// ── POST /admin/documents/:id/reject ──────────────────────────────────────────
router.post(
  '/documents/:id/reject',
  authenticateAdminOrUser,
  async (req, res) => {
    try {
      const { reason } = req.body;
      if (!reason) return res.status(400).json({ error: 'Rejection reason is required' });

      const document = await prisma.document.findUnique({ where: { id: req.params.id } });
      if (!document) return res.status(404).json({ error: 'Document not found' });

      const updated = await prisma.document.update({
        where: { id: req.params.id },
        data: {
          status:          'REJECTED',
          reviewedAt:      new Date(),
          reviewedBy:      req.user.id,
          rejectionReason: reason,
        },
      });

      await logAudit(req.user.id, 'DOCUMENT_REJECTED', 'Document', document.id, { docType: document.docType, reason }, req);
      await _syncProviderProfileFromDoc(document, false);

      res.json({ message: 'Document rejected', document: updated });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// ── POST /admin/documents/:id/verify ──────────────────────────────────────────
router.post(
  '/documents/:id/verify',
  authenticateAdminOrUser,
  async (req, res) => {
    try {
      const { verified, rejectionNote } = req.body;
      const document = await prisma.document.findUnique({ where: { id: req.params.id } });
      if (!document) return res.status(404).json({ error: 'Document not found' });

      let updated;
      if (verified) {
        updated = await prisma.document.update({
          where: { id: req.params.id },
          data: { status: 'APPROVED', reviewedAt: new Date(), reviewedBy: req.user.id, rejectionReason: '' },
        });
        await logAudit(req.user.id, 'DOCUMENT_APPROVED', 'Document', document.id, { docType: document.docType }, req);
        await _syncProviderProfileFromDoc(document, true);
      } else {
        const reason = rejectionNote || 'Document not accepted';
        updated = await prisma.document.update({
          where: { id: req.params.id },
          data: { status: 'REJECTED', reviewedAt: new Date(), reviewedBy: req.user.id, rejectionReason: reason },
        });
        await logAudit(req.user.id, 'DOCUMENT_REJECTED', 'Document', document.id, { docType: document.docType, reason }, req);
        await _syncProviderProfileFromDoc(document, false);
      }

      res.json({ message: verified ? 'Document approved' : 'Document rejected', document: updated });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// ── GET /admin/customers ───────────────────────────────────────────────────────
router.get(
  '/customers',
  authenticateAdminOrUser,
  async (req, res) => {
    try {
      const { search, page = 1, limit = 30 } = req.query;
      const where = { role: 'CUSTOMER' };
      if (search) {
        where.OR = [
          { name:  { contains: search, mode: 'insensitive' } },
          { phone: { contains: search, mode: 'insensitive' } },
        ];
      }
      const pageNum  = Math.max(1, parseInt(page, 10) || 1);
      const limitNum = Math.min(100, parseInt(limit, 10) || 30);

      const [customers, total] = await Promise.all([
        prisma.user.findMany({
          where,
          select:  { id: true, name: true, phone: true, createdAt: true, rating: true, ratingCount: true },
          orderBy: { createdAt: 'desc' },
          skip:    (pageNum - 1) * limitNum,
          take:    limitNum,
        }),
        prisma.user.count({ where }),
      ]);

      const safeCustomers = customers.map(c => ({
        ...c,
        rating: c.rating != null ? parseFloat(c.rating.toString()) : 0,
      }));
      res.json({ customers: safeCustomers, total, page: pageNum, pages: Math.ceil(total / limitNum) });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// ── GET /admin/customers/:id ───────────────────────────────────────────────────
router.get(
  '/customers/:id',
  authenticateAdminOrUser,
  async (req, res) => {
    try {
      const [customer, bookings, totalBookings] = await Promise.all([
        prisma.user.findUnique({ where: { id: req.params.id } }),
        prisma.booking.findMany({
          where:   { customerId: req.params.id },
          orderBy: { scheduledAt: 'desc' },
          take:    50, // last 50 bookings is sufficient for admin view
          include: { provider: { select: { name: true, phone: true } } },
        }),
        prisma.booking.count({ where: { customerId: req.params.id } }),
      ]);
      if (!customer || customer.role !== 'CUSTOMER') {
        return res.status(404).json({ error: 'Customer not found' });
      }
      const num = v => (v != null ? parseFloat(v.toString()) : v);
      res.json({
        // Prisma Decimal → JSON string; app calls .toFixed() and crashes.
        customer: { ...customer, rating: num(customer.rating) ?? 0 },
        bookings: bookings.map(b => ({
          ...b,
          price:       num(b.price),
          totalPrice:  num(b.price),
          platformFee: num(b.platformFee),
          providerPayout:   num(b.providerPayout),
          tipAmount:   num(b.tipAmount),
        })),
        totalBookings,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// ── GET /admin/activity-feed ───────────────────────────────────────────────────
router.get(
  '/activity-feed',
  authenticateAdminOrUser,
  async (req, res) => {
    try {
      const recent = await prisma.booking.findMany({
        orderBy: { updatedAt: 'desc' },
        take:    30,
        select: {
          id: true, status: true, serviceType: true, price: true,
          hours: true, scheduledAt: true, updatedAt: true, createdAt: true, urgency: true,
          customer: { select: { name: true } },
          provider:      { select: { name: true } },
        },
      });

      const events = recent.map(b => ({
        id:          b.id,
        type:        'booking',
        status:      b.status,
        serviceType: b.serviceType,
        totalPrice:  toNum(b.price),
        hours:       b.hours,
        scheduledAt: b.scheduledAt,
        updatedAt:   b.updatedAt,
        createdAt:   b.createdAt,
        urgency:     b.urgency,
        customerName: b.customer?.name ?? 'Unknown',
        providerName:     b.provider?.name ?? null,
      }));

      const activeCount  = recent.filter(b => ['ACCEPTED', 'STARTED'].includes(b.status)).length;
      const pendingCount = recent.filter(b => b.status === 'REQUESTED').length;

      res.json({ events, activeCount, pendingCount });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// ── GET /admin/audit-logs ──────────────────────────────────────────────────────
router.get(
  '/audit-logs',
  authenticateAdminOrUser,
  async (req, res) => {
    try {
      const { action, page = 1, limit = 50 } = req.query;
      const where = {};
      if (action) where.action = action;

      const pageNum  = Math.max(1, parseInt(page, 10) || 1);
      const limitNum = Math.min(100, parseInt(limit, 10) || 50);

      const [logs, total] = await Promise.all([
        prisma.auditLog.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip:    (pageNum - 1) * limitNum,
          take:    limitNum,
          include: { admin: { select: { username: true } } },
        }),
        prisma.auditLog.count({ where }),
      ]);

      res.json({ total, page: pageNum, pages: Math.ceil(total / limitNum), logs });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// ── GET /admin/revenue ─────────────────────────────────────────────────────────
router.get(
  '/revenue',
  authenticateAdminOrUser,
  async (req, res) => {
    try {
      // Revenue aggregation — limit to last 12 months to keep response fast.
      // For all-time totals use a DB-level aggregate (future: prisma.booking.aggregate).
      const sinceDate = new Date();
      sinceDate.setFullYear(sinceDate.getFullYear() - 1);

      // Escrow accounting model (pre-Stripe, designed to map 1:1 onto Stripe later):
      //   PENDING                → not yet charged (ignore in money totals)
      //   AUTHORIZED / PAID      → funds HELD IN ESCROW (client charged, Provider not paid)
      //   RELEASED               → funds RELEASED to Provider; platform fee = realized revenue
      //   REFUNDED / FAILED      → reversed (excluded)
      // This keeps client money, Provider liability, and platform revenue cleanly separated —
      // exactly the ledger Stripe's charge → transfer (Connect) flow will need.
      const bookings = await prisma.booking.findMany({
        where: {
          paymentStatus: { in: ['AUTHORIZED', 'PAID', 'RELEASED'] },
          createdAt:     { gte: sinceDate },
        },
        select: { price: true, platformFee: true, providerPayout: true, paymentStatus: true, createdAt: true, serviceType: true, status: true },
        take: 5000,
        orderBy: { createdAt: 'desc' },
      });

      const isHeld     = b => b.paymentStatus === 'AUTHORIZED' || b.paymentStatus === 'PAID';
      const isReleased = b => b.paymentStatus === 'RELEASED';

      // Ledger buckets
      let escrowHeld = 0;          // client money currently held (liability)
      let releasedToProvider = 0;       // total paid out to Providers
      let realizedRevenue = 0;     // platform fee on RELEASED bookings (actually earned)
      let pendingRevenue = 0;      // platform fee still in escrow (not yet earned)
      let totalGross = 0;

      bookings.forEach(b => {
        totalGross += toNum(b.price) || 0;
        if (isHeld(b)) {
          escrowHeld     += toNum(b.price) || 0;
          pendingRevenue += b.platformFee || 0;
        } else if (isReleased(b)) {
          releasedToProvider   += toNum(b.providerPayout) || 0;
          realizedRevenue += b.platformFee || 0;
        }
      });

      const monthMap = {};
      bookings.forEach(b => {
        const key = b.createdAt.toISOString().slice(0, 7);
        if (!monthMap[key]) monthMap[key] = { month: key, gross: 0, platformFee: 0, providerPayout: 0, count: 0 };
        monthMap[key].gross       += toNum(b.price) || 0;
        monthMap[key].platformFee += b.platformFee || 0;
        monthMap[key].providerPayout   += toNum(b.providerPayout) || 0;
        monthMap[key].count++;
      });
      const byMonth = Object.values(monthMap).sort((a, b) => a.month.localeCompare(b.month));

      const typeMap = {};
      bookings.forEach(b => {
        if (!typeMap[b.serviceType]) typeMap[b.serviceType] = { serviceType: b.serviceType, gross: 0, count: 0 };
        typeMap[b.serviceType].gross += toNum(b.price) || 0;
        typeMap[b.serviceType].count++;
      });
      const byServiceType = Object.values(typeMap).sort((a, b) => b.gross - a.gross);

      const r2 = n => Math.round(n * 100) / 100;
      res.json({
        // Escrow ledger
        escrowHeld:       r2(escrowHeld),       // money we're holding for clients (liability)
        releasedToProvider:    r2(releasedToProvider),    // paid out to Providers
        realizedRevenue:  r2(realizedRevenue),  // platform fee earned (RELEASED only)
        pendingRevenue:   r2(pendingRevenue),   // platform fee still in escrow
        // Backward-compat totals
        totalGross:       r2(totalGross),
        totalPlatformFee: r2(realizedRevenue + pendingRevenue),
        totalProviderPayout:   r2(releasedToProvider),
        totalBookings:    bookings.length,
        byMonth,
        byServiceType,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// ── GET /admin/payouts ─────────────────────────────────────────────────────────
router.get(
  '/payouts',
  authenticateAdminOrUser,
  async (req, res) => {
    try {
      const { status, page = 1, limit = 50 } = req.query;
      const where    = {};
      if (status) where.status = status;

      const pageNum  = Math.max(1, parseInt(page, 10) || 1);
      const limitNum = Math.min(100, parseInt(limit, 10) || 50);

      const [payouts, total] = await Promise.all([
        prisma.payout.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip:    (pageNum - 1) * limitNum,
          take:    limitNum,
          include: { provider: { select: { name: true, phone: true, email: true } } },
        }),
        prisma.payout.count({ where }),
      ]);

      res.json({ payouts, total, page: pageNum, pages: Math.ceil(total / limitNum) });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// ── POST /admin/payouts ────────────────────────────────────────────────────────
router.post(
  '/payouts',
  authenticateAdminOrUser,
  async (req, res) => {
    try {
      const { providerId, bookingIds } = req.body;
      if (!providerId || !Array.isArray(bookingIds) || bookingIds.length === 0) {
        return res.status(400).json({ error: 'providerId and bookingIds[] required' });
      }

      const bookings = await prisma.booking.findMany({
        where: { id: { in: bookingIds }, providerId, paymentStatus: 'RELEASED' },
      });

      if (bookings.length === 0) {
        return res.status(400).json({ error: 'No released bookings found for this Provider' });
      }

      const amount = bookings.reduce((sum, b) => sum + (toNum(b.providerPayout) || 0), 0);

      const payout = await prisma.payout.create({
        data: {
          providerId,
          amount:     Math.round(amount * 100) / 100,
          bookingIds: bookings.map(b => b.id),
          status:     'PENDING',
        },
      });

      res.status(201).json({ payout });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// ── GET /admin/payouts/queue ───────────────────────────────────────────────────
// Must be defined BEFORE /payouts/:id
router.get(
  '/payouts/queue',
  authenticateAdminOrUser,
  async (req, res) => {
    try {
      const cached = await cacheGet('admin:payout:queue');
      if (cached) return res.json(cached);

      // Collect bookingIds already covered by a payout.
      // Limit to PENDING/PROCESSING payouts only — PAID payouts' bookings are already settled.
      const existingPayouts = await prisma.payout.findMany({
        where:  { status: { in: ['PENDING', 'PROCESSING'] } },
        select: { bookingIds: true },
      });
      const alreadyPaidIds  = existingPayouts.flatMap(p => p.bookingIds);

      // Only fetch bookings not yet in any pending payout; cap at 500 for safety
      const releasedBookings = await prisma.booking.findMany({
        where: {
          paymentStatus: 'RELEASED',
          ...(alreadyPaidIds.length > 0 ? { id: { notIn: alreadyPaidIds } } : {}),
        },
        include: { provider: { select: { id: true, name: true, phone: true, email: true } } },
        take: 500,
        orderBy: { updatedAt: 'asc' }, // oldest-released first
      });

      const byProvider = {};
      for (const b of releasedBookings) {
        if (!b.provider?.id) continue;
        if (!byProvider[b.provider.id]) byProvider[b.provider.id] = { provider: b.provider, bookings: [], totalOwed: 0 };
        byProvider[b.provider.id].bookings.push(b.id);
        byProvider[b.provider.id].totalOwed += toNum(b.providerPayout) || 0;
      }

      const queue = Object.values(byProvider).map(entry => ({
        ...entry,
        totalOwed: Math.round(entry.totalOwed * 100) / 100,
      }));

      const response = { queue };
      await cacheSet('admin:payout:queue', response, 30);
      res.json(response);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// ── POST /admin/payouts/:id/mark-paid ─────────────────────────────────────────
router.post(
  '/payouts/:id/mark-paid',
  authenticateAdminOrUser,
  async (req, res) => {
    try {
      const { method, adminNote } = req.body;
      const VALID_METHODS = ['ETRANSFER', 'STRIPE', 'OTHER'];
      if (method && !VALID_METHODS.includes(method)) {
        return res.status(400).json({ error: 'Invalid method' });
      }

      const payout = await prisma.payout.update({
        where: { id: req.params.id },
        data: {
          status:    'PAID',
          paidAt:    new Date(),
          method:    method || 'ETRANSFER',
          adminNote: adminNote || '',
        },
        include: { provider: { select: { name: true, phone: true } } },
      });

      cacheDel('admin:payout:queue').catch(() => {});
      res.json({ payout });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// ── Internal helper: sync ProviderProfile flags when a Document is approved/rejected ─
async function _syncProviderProfileFromDoc(document, approved) {
  const flagMap = {
    police_check:   { policeCheckCleared: approved },
    first_aid_cert: { firstAidCertified: approved },
    driver_license: { driversLicense: approved },
    insurance:      { insuranceVerified: approved },
  };
  const update = flagMap[document.docType];
  if (update && document.entityType === 'Provider') {
    try {
      await prisma.providerProfile.update({
        where: { id: document.entityId },
        data:  update,
      });
    } catch {}
  }
}

// ── GET /admin/api-usage ────────────────────────────────────────────────────────
// Cost visibility for paid, metered third-party AI vendors (currently
// Perfect Corp's Skin Analysis API — see src/utils/perfectCorpClient.js and
// ApiUsageLog in schema.prisma) — so usage is checkable from inside the
// app, not discovered on a bill. Every attempted vendor call is logged here,
// success or failure, since a failed call can still consume vendor-side
// compute.
router.get(
  '/api-usage',
  authenticateAdminOrUser,
  async (req, res) => {
    try {
      const days = Math.min(90, Math.max(1, parseInt(req.query.days, 10) || 30));
      const since = new Date(Date.now() - days * 86_400_000);
      const provider = req.query.provider || 'perfectcorp';

      const [logs, totalCalls, failedCalls] = await Promise.all([
        prisma.apiUsageLog.findMany({
          where: { provider, createdAt: { gte: since } },
          orderBy: { createdAt: 'desc' },
          take: 200,
        }),
        prisma.apiUsageLog.count({ where: { provider, createdAt: { gte: since } } }),
        prisma.apiUsageLog.count({ where: { provider, createdAt: { gte: since }, success: false } }),
      ]);

      // One row per calendar day, oldest first — the shape a simple usage
      // chart needs without any client-side date bucketing.
      const byDay = {};
      for (const log of logs) {
        const day = log.createdAt.toISOString().slice(0, 10);
        if (!byDay[day]) byDay[day] = { day, total: 0, success: 0, failed: 0 };
        byDay[day].total++;
        byDay[day][log.success ? 'success' : 'failed']++;
      }

      // Real scans (skin-analysis-total is one row per completed attempt,
      // success or fail) vs. every individual sub-call (file-upload, task
      // create, poll) — the number a person actually cares about ("how many
      // scans hit the paid API today") is scan attempts, not raw row count.
      const scanAttempts = logs.filter(l => l.endpoint === 'skin-analysis-total').length;

      res.json({
        provider,
        sinceDays: days,
        totalCalls,
        failedCalls,
        scanAttempts,
        byDay: Object.values(byDay).sort((a, b) => a.day.localeCompare(b.day)),
        recent: logs.slice(0, 50).map(l => ({
          id: l.id, endpoint: l.endpoint, success: l.success, statusCode: l.statusCode,
          errorCode: l.errorCode, durationMs: l.durationMs, createdAt: l.createdAt,
        })),
      });
    } catch (err) {
      console.error('GET /admin/api-usage error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

module.exports = router;
