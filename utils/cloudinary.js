const cloudinary = require('../config/cloudinary');
const fs = require('fs');

/**
 * Uploads a local file to Cloudinary.
 * Throws error if Cloudinary fails or is not configured.
 */
async function uploadFileToCloudinary(filePath, folder = 'gb_cabinet_doors_products') {
  try {
    const uploadOptions = { folder, resource_type: 'auto' };
    const result = await cloudinary.uploader.upload(filePath, uploadOptions);

    console.log('[Cloudinary Success] Uploaded image to:', result.secure_url);

    // Clean up local temp file after successful upload to Cloudinary
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (e) {
        // ignore
      }
    }

    return {
      secure_url: result.secure_url,
      public_id: result.public_id,
    };
  } catch (error) {
    console.error('[Cloudinary Error] File upload failed:', error.message);
    throw new Error(`Cloudinary file upload failed: ${error.message}`);
  }
}

module.exports = {
  cloudinary,
  uploadFileToCloudinary,
};

