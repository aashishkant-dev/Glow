const { put, del } = require('@vercel/blob');

const TOKEN = process.env.BLOB_READ_WRITE_TOKEN;

/**
 * Upload buffer to Vercel Blob. Returns { url, pathname }.
 * Falls back to null if BLOB_READ_WRITE_TOKEN not set — caller stores base64 instead.
 *
 * 20s timeout — this had none at all before, the last unbounded leg of
 * /skin/scan's request pipeline (the Gemini call and reference-photo
 * fetches already had their own timeouts). Confirmed directly against
 * production: a real scan request measured 81.6s total and was
 * client-canceled, well past what Gemini's own 25s cap plus the 10s
 * reference-photo fetches can account for — this upload, which is
 * AWAITED late (started early, right after the image is processed, but
 * not actually awaited until after the Gemini call returns) but has no
 * ceiling of its own, is the only remaining piece of that request that
 * could explain the gap. POST /skin/scan's own top-level catch already
 * turns any error here into a real 500 for the client rather than
 * hanging silently, so timing out here fails fast instead of tying up
 * the whole request indefinitely.
 */
async function uploadFile(pathname, buffer, contentType) {
  if (!TOKEN) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const blob = await put(pathname, buffer, {
      access:      'public',
      contentType,
      token:       TOKEN,
      abortSignal: controller.signal,
    });
    return { url: blob.url, pathname: blob.pathname };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Delete a file from Vercel Blob by URL.
 */
async function deleteFile(url) {
  if (!TOKEN || !url) return;
  try {
    await del(url, { token: TOKEN });
  } catch (err) {
    console.error('Blob delete error:', err);
  }
}

module.exports = { uploadFile, deleteFile };
