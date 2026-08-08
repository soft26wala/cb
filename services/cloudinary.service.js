const cloudinary = require('../config/cloudinary');
const { Readable } = require('stream');

/**
 * Uploads a RAM file buffer directly to Cloudinary using stream upload.
 * Throws errors if upload fails without silent fallbacks.
 * @param {Buffer} fileBuffer - File buffer from Multer memoryStorage
 * @param {string} folderName - Cloudinary folder name
 * @param {string} mimeType - Optional MIME type
 * @returns {Promise<{ secure_url: string, public_id: string }>}
 */
const uploadToCloudinaryBuffer = (fileBuffer, folderName = 'gb_cabinet_doors_products', mimeType = 'image/jpeg') => {
  console.log(`[Cloudinary Upload] Starting buffer upload to folder '${folderName}', buffer size: ${fileBuffer?.length || 0} bytes`);
  return new Promise((resolve, reject) => {
    if (!fileBuffer || !Buffer.isBuffer(fileBuffer)) {
      const err = new Error('Invalid or missing file buffer for Cloudinary upload');
      console.error('[Cloudinary Upload Error]', err.message);
      return reject(err);
    }

    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: folderName,
        resource_type: 'auto',
      },
      (error, result) => {
        if (error) {
          console.error(`[Cloudinary Upload Failed] Error uploading buffer to folder '${folderName}':`, error.message);
          let detail = error.message;
          if (error.http_code === 403 || error.message.includes('403')) {
            detail = `403 Forbidden - The Cloudinary API key '${process.env.CLOUDINARY_API_KEY}' for cloud '${process.env.CLOUDINARY_CLOUD_NAME}' lacks upload/create permissions. Please grant 'create' permissions to this Access Key in the Cloudinary Console or update CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET in Backend/.env.`;
          }
          return reject(new Error(`Cloudinary upload failed: ${detail}`));
        }

        console.log(`[Cloudinary Upload Success] secure_url: ${result.secure_url}, public_id: ${result.public_id}`);
        resolve({
          secure_url: result.secure_url,
          public_id: result.public_id,
        });
      }
    );

    const stream = new Readable();
    stream.push(fileBuffer);
    stream.push(null);
    stream.pipe(uploadStream);
  });
};

/**
 * Deletes an image from Cloudinary using its public_id.
 * @param {string} publicId - Cloudinary public_id
 * @returns {Promise<any>}
 */
const deleteFromCloudinary = async (publicId) => {
  if (!publicId || publicId.startsWith('cloudinary_fallback_')) return null;
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    console.log(`[Cloudinary Delete] Destroyed public_id [${publicId}]:`, result);
    return result;
  } catch (error) {
    console.warn(`[Cloudinary Deletion Notice] Error deleting public_id [${publicId}]:`, error.message);
    return null;
  }
};

module.exports = {
  uploadToCloudinaryBuffer,
  deleteFromCloudinary,
};
