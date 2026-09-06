const cloudinaryService = require('../services/cloudinary');
const { optimizeOrPassthrough } = require('../services/imageProcessing');

// POST /api/uploads/product-image  (admin, multipart/form-data, field: "image")
// The raw file (often a multi-MB phone photo) is resized to <=1600px and
// re-encoded to WebP before it's stored — a straight-from-camera JPEG lands
// as a ~150–250KB WebP with no visible quality loss.
exports.uploadProductImage = async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No image file received.' });

  const optimized = await optimizeOrPassthrough(req.file.buffer, { maxWidth: 1600, maxHeight: 1600, quality: 80 });
  const result = await cloudinaryService.uploadBuffer(optimized, 'lytronix/products');
  res.status(201).json(result);
};

// POST /api/uploads/image  (admin — generic catalogue image, e.g. category art)
exports.uploadImage = async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No image file received.' });

  const optimized = await optimizeOrPassthrough(req.file.buffer, { maxWidth: 1600, maxHeight: 1600, quality: 82 });
  const result = await cloudinaryService.uploadBuffer(optimized, 'lytronix/catalogue');
  res.status(201).json(result);
};

// POST /api/uploads/product-video  (admin, multipart/form-data, field: "video")
exports.uploadProductVideo = async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No video file received.' });

  const result = await cloudinaryService.uploadVideoBuffer(req.file.buffer, 'lytronix/products/videos');
  res.status(201).json(result);
};

// DELETE /api/uploads   { url }  (admin — deletes whatever Cloudinary asset a
// stored URL points to; used when an admin removes a photo/video from a
// product or category so it doesn't linger in Cloudinary as an orphan)
exports.deleteAsset = async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ message: 'url is required.' });

  await cloudinaryService.destroyByUrl(url);
  res.json({ message: 'Deleted' });
};

// POST /api/uploads/payment-proof  (public — used during storefront bKash-manual checkout)
exports.uploadPaymentProof = async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No image file received.' });

  // A proof screenshot only needs to stay legible — smaller box, lower quality.
  const optimized = await optimizeOrPassthrough(req.file.buffer, { maxWidth: 1400, maxHeight: 1400, quality: 74 });
  const result = await cloudinaryService.uploadBuffer(optimized, 'lytronix/payment-proofs');
  res.status(201).json(result);
};
