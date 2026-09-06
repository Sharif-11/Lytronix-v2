const { v2: cloudinary } = require('cloudinary');

let configured = false;

function ensureConfigured() {
  if (configured) return;
  if (isConfigured()) {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
      secure: true,
    });
    configured = true;
  }
}

function isConfigured() {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET
  );
}

// Uploads an in-memory file buffer (from multer) to Cloudinary under the
// given folder, e.g. 'lytronix/products' or 'lytronix/payment-proofs'.
// Returns { url, publicId }.
function uploadBuffer(buffer, folder) {
  if (!isConfigured()) {
    const err = new Error(
      'Image uploads are not configured. Add CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET to server/.env.'
    );
    err.statusCode = 400;
    return Promise.reject(err);
  }
  ensureConfigured();

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: 'image' },
      (error, result) => {
        if (error) return reject(error);
        resolve({ url: result.secure_url, publicId: result.public_id });
      }
    );
    stream.end(buffer);
  });
}

// Same as uploadBuffer but for product videos — a separate resource_type in
// Cloudinary, so it needs its own upload + destroy path.
function uploadVideoBuffer(buffer, folder) {
  if (!isConfigured()) {
    const err = new Error(
      'Video uploads are not configured. Add CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET to server/.env.'
    );
    err.statusCode = 400;
    return Promise.reject(err);
  }
  ensureConfigured();

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: 'video' },
      (error, result) => {
        if (error) return reject(error);
        resolve({ url: result.secure_url, publicId: result.public_id });
      }
    );
    stream.end(buffer);
  });
}

// Chat attachment (image or voice note). Audio goes in as a Cloudinary
// "video" resource, same as product clips.
function uploadChatMedia(buffer, mime, folder = 'lytronix/chat') {
  const isAudio = String(mime || '').startsWith('audio/');
  return isAudio ? uploadVideoBuffer(buffer, folder) : uploadBuffer(buffer, folder);
}

function destroy(publicId, resourceType = 'image') {
  if (!isConfigured() || !publicId) return Promise.resolve();
  ensureConfigured();
  return cloudinary.uploader.destroy(publicId, { resource_type: resourceType }).catch((err) => {
    console.error('Cloudinary destroy failed:', err.message);
  });
}

// Pulls the public_id (including folder path) back out of a Cloudinary
// delivery URL, e.g.
//   https://res.cloudinary.com/<cloud>/image/upload/v123/lytronix/products/file_abc.jpg
//   -> "lytronix/products/file_abc"
// Used so we only need to store the URL on the document (images/videos
// arrays, category.image) and can still tell Cloudinary what to delete.
function extractPublicId(url) {
  if (!url) return null;
  const match = String(url).match(/\/upload\/(?:[a-z]+_[^/]+\/)*(?:v\d+\/)?(.+)\.[a-zA-Z0-9]+(?:\?.*)?$/);
  return match ? match[1] : null;
}

function resourceTypeFromUrl(url) {
  return /\/video\/upload\//.test(String(url)) ? 'video' : 'image';
}

// Deletes whatever Cloudinary asset a stored URL points to. Best-effort —
// swallows errors so a Cloudinary hiccup never blocks a product/category
// save or delete.
async function destroyByUrl(url) {
  const publicId = extractPublicId(url);
  if (!publicId) return null;
  return destroy(publicId, resourceTypeFromUrl(url));
}

module.exports = {
  isConfigured,
  uploadBuffer,
  uploadVideoBuffer,
  uploadChatMedia,
  destroy,
  destroyByUrl,
  extractPublicId,
  resourceTypeFromUrl,
};
