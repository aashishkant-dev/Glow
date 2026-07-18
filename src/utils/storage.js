const { put, del } = require('@vercel/blob');

const TOKEN = process.env.BLOB_READ_WRITE_TOKEN;

/**
 * Upload buffer to Vercel Blob. Returns { url, pathname }.
 * Falls back to null if BLOB_READ_WRITE_TOKEN not set — caller stores base64 instead.
 */
async function uploadFile(pathname, buffer, contentType) {
  if (!TOKEN) return null;

  const blob = await put(pathname, buffer, {
    access:      'public',
    contentType,
    token:       TOKEN,
  });

  return { url: blob.url, pathname: blob.pathname };
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
