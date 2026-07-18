// src/routes/documents.js
'use strict';

const express = require('express');
const sharp   = require('sharp');
const { uploadFile, deleteFile } = require('../utils/storage');
const prisma  = require('../lib/prisma');
const { authenticate, requireRole } = require('../middleware/auth');
const upload  = require('../middleware/upload');

const router = express.Router();

async function compressImage(buffer, mimeType) {
  if (!mimeType || !mimeType.startsWith('image/')) return buffer;
  try {
    return await sharp(buffer)
      .resize(1920, 1920, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 70 })
      .toBuffer();
  } catch (err) {
    console.error('Image compression failed:', err);
    return buffer;
  }
}

router.post(
  '/upload',
  authenticate,
  requireRole('Provider'),
  upload.single('file'),
  async (req, res) => {
    try {
      const { docType, label, entityType = 'Provider' } = req.body;
      // JSON base64 fallback: native clients where multipart streaming fails
      // (RN FormData "Unsupported FormDataPart implementation") POST
      // { docType, label, dataUrl } instead. Decode it into the same req.file
      // shape multer produces so the rest of the handler is identical.
      if (!req.file && typeof req.body.dataUrl === 'string' && req.body.dataUrl.startsWith('data:')) {
        const m = req.body.dataUrl.match(/^data:([^;]+);base64,(.+)$/s);
        if (m) {
          // Keep in sync with middleware/upload.js fileFilter (multipart path).
          const ALLOWED = [
            'image/jpeg', 'image/png', 'image/gif', 'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          ];
          if (!ALLOWED.includes(m[1])) return res.status(400).json({ error: 'Invalid file type. Allowed: JPEG, PNG, GIF, PDF, DOC, DOCX' });
          const buffer = Buffer.from(m[2], 'base64');
          if (buffer.length > 10 * 1024 * 1024) return res.status(400).json({ error: 'File too large (max 10MB)' });
          const ext = m[1] === 'application/pdf' ? 'pdf' : 'jpg';
          req.file = {
            buffer,
            mimetype:     m[1],
            size:         buffer.length,
            originalname: req.body.fileName || `doc_${Date.now()}.${ext}`,
          };
        }
      }
      if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
      if (!docType)  return res.status(400).json({ error: 'docType is required' });

      const VALID_DOC_TYPES = ['police_check', 'provider_certificate', 'first_aid_cert', 'driver_license', 'insurance', 'id_proof', 'photo', 'resume', 'other'];
      if (!VALID_DOC_TYPES.includes(docType)) return res.status(400).json({ error: 'Invalid docType' });

      const profile = await prisma.providerProfile.findUnique({ where: { userId: req.user.id } });
      if (!profile) return res.status(404).json({ error: 'Provider profile not found' });

      // Industry-standard: always upload to object storage (Vercel Blob / S3-compatible).
      // Never fall back to storing base64 blobs in the database — that bloats Postgres
      // and degrades list query performance. If the storage token is missing, fail fast.
      if (!process.env.BLOB_READ_WRITE_TOKEN) {
        console.error('Document upload: BLOB_READ_WRITE_TOKEN not set — refusing base64 fallback');
        return res.status(500).json({ error: 'File storage is not configured. Contact support.' });
      }

      let fileUrl = '', storagePath = '';
      let fileBuffer = req.file?.buffer;

      if (fileBuffer && req.file?.mimetype?.startsWith('image/')) {
        try {
          fileBuffer = await compressImage(fileBuffer, req.file.mimetype);
        } catch (compressErr) {
          console.error('Compression error:', compressErr);
        }
      }

      if (fileBuffer) {
        try {
          const ext    = req.file.mimetype === 'application/pdf' ? 'pdf' : 'jpg';
          const r2Path = `docs/${profile.id}/${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;
          const result = await uploadFile(r2Path, fileBuffer, req.file.mimetype);
          if (result) { fileUrl = result.url; storagePath = result.pathname; }
        } catch (uploadErr) {
          console.error('Upload error:', uploadErr);
          return res.status(500).json({ error: 'File upload failed. Please try again.' });
        }
      }

      if (!fileUrl) {
        return res.status(500).json({ error: 'File upload produced no URL. Please try again.' });
      }

      const document = await prisma.document.create({
        data: {
          entityType,
          entityId:     profile.id,
          docType,
          label:        label || '',
          fileName:     req.file.originalname,
          originalName: req.file.originalname,
          mimeType:     req.file.mimetype,
          size:         fileBuffer?.length || req.file.size,
          storagePath,
          url:          fileUrl,
          // dataUrl intentionally omitted — never store base64 blobs in Postgres
          status:       'PENDING',
        },
      });

      res.status(201).json({
        message: 'Document uploaded successfully',
        document: {
          id:          document.id,
          docType:     document.docType,
          label:       document.label,
          status:      document.status,
          url:         document.url,
          submittedAt: document.submittedAt,
        },
      });
    } catch (err) {
      console.error('Document upload error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

router.get('/my-documents', authenticate, requireRole('Provider'), async (req, res) => {
  try {
    const profile = await prisma.providerProfile.findUnique({ where: { userId: req.user.id } });
    if (!profile) return res.status(404).json({ error: 'Provider profile not found' });

    // NEVER select dataUrl in the list query — it's a 100KB+ base64 blob per row, and the
    // Provider dashboard polls this endpoint every 15s. In prod `url` (Vercel Blob) is always set,
    // so dataUrl is dead weight. We only fetch dataUrl as a fallback for the rows that have
    // no cloud `url` (dev / Blob-unavailable), keeping the common-case payload tiny.
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

    // Backfill dataUrl ONLY for rows missing a cloud url (rare outside dev).
    const needFallback = documents.filter(d => !d.url).map(d => d.id);
    let fallbackMap = {};
    if (needFallback.length > 0) {
      const blobs = await prisma.document.findMany({
        where: { id: { in: needFallback } },
        select: { id: true, dataUrl: true },
      });
      fallbackMap = Object.fromEntries(blobs.map(b => [b.id, b.dataUrl]));
    }

    const withPreview = documents.map(d => ({
      ...d,
      previewUrl: d.url || fallbackMap[d.id] || '',
    }));
    res.json({ documents: withPreview });
  } catch (err) {
    console.error('GET /my-documents error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id', authenticate, requireRole('Provider'), async (req, res) => {
  try {
    const profile = await prisma.providerProfile.findUnique({ where: { userId: req.user.id } });
    if (!profile) return res.status(404).json({ error: 'Provider profile not found' });

    const document = await prisma.document.findFirst({
      where: { id: req.params.id, entityType: 'Provider', entityId: profile.id },
    });
    if (!document) return res.status(404).json({ error: 'Document not found' });
    if (document.status === 'APPROVED') return res.status(400).json({ error: 'Cannot delete approved documents' });

    await prisma.document.update({ where: { id: req.params.id }, data: { isActive: false } });
    if (document.url) deleteFile(document.url).catch(() => {});
    res.json({ message: 'Document deleted' });
  } catch (err) {
    console.error('DELETE /documents/:id error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
