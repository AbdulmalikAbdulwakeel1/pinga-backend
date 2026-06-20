const { uploadImage, deleteImage } = require('../config/cloudinary');

// ─── Upload single image ──────────────────────────────────────
exports.uploadSingle = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file provided' });
    }

    const result = await uploadImage(req.file.buffer, 'pinga/products');

    res.status(200).json({
      success: true,
      data: {
        url: result.secure_url,
        publicId: result.public_id,
        width: result.width,
        height: result.height,
      }
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ success: false, error: 'Failed to upload image' });
  }
};

// ─── Delete image ─────────────────────────────────────────────
exports.deleteOne = async (req, res) => {
  try {
    const { publicId } = req.body;
    if (!publicId) {
      return res.status(400).json({ success: false, error: 'publicId is required' });
    }
    await deleteImage(publicId);
    res.status(200).json({ success: true, message: 'Image deleted' });
  } catch (error) {
    console.error('Delete image error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete image' });
  }
};
