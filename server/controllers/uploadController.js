const cloudinaryService = require('../services/cloudinary');

// POST /api/uploads/product-image  (admin, multipart/form-data, field: "image")
exports.uploadProductImage = async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No image file received.' });

  const result = await cloudinaryService.uploadBuffer(req.file.buffer, 'lytronix/products');
  res.status(201).json(result);
};

// POST /api/uploads/image  (admin — generic catalogue image, e.g. category art)
exports.uploadImage = async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No image file received.' });

  const result = await cloudinaryService.uploadBuffer(req.file.buffer, 'lytronix/catalogue');
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

  const result = await cloudinaryService.uploadBuffer(req.file.buffer, 'lytronix/payment-proofs');
  res.status(201).json(result);
};
