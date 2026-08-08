const multer = require('multer');
const path = require('path');

// Production Ready RAM Memory Storage - No local disk writes
const storage = multer.memoryStorage();

// File Validation: Only JPG, JPEG, PNG, WEBP allowed (Max 5MB)
const fileFilter = (req, file, cb) => {
  const allowedExtensions = /jpeg|jpg|png|webp/;
  const extName = allowedExtensions.test(path.extname(file.originalname).toLowerCase());
  const mimeType = allowedExtensions.test(file.mimetype);

  if (extName && mimeType) {
    return cb(null, true);
  } else {
    cb(new Error('Invalid image format! Only JPG, JPEG, PNG, and WEBP files are allowed.'));
  }
};

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB Max File Size
  fileFilter,
});

// Single image upload (profile or single image)
const uploadSingle = upload.single('profile_image');

// Single logo upload (for company credentials or branding)
const uploadSingleLogo = upload.single('image');

// Up to 10 product images memory upload
const uploadMultipleProductImages = upload.array('images', 10);

module.exports = {
  uploadSingle,
  uploadSingleLogo,
  uploadMultipleProductImages,
};

