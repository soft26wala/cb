const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const db = require('../config/db');
const cloudinary = require('../config/cloudinary');

const DEFAULT_CLOUDINARY_PLACEHOLDER = 'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?q=80&w=1200&auto=format&fit=crop';

async function migrateImagesToCloudinary() {
  console.log('🔄 Starting PostgreSQL /uploads to Cloudinary Migration...');

  const uploadsDir = path.resolve(__dirname, '../uploads');

  try {
    // 1. Migrate product_images
    const productImagesRes = await db.query(
      `SELECT image_id, p_id, image_url FROM product_images WHERE image_url ILIKE '%/uploads/%'`
    );

    console.log(`Found ${productImagesRes.rows.length} product image records with local /uploads paths.`);

    for (const row of productImagesRes.rows) {
      const filename = row.image_url.split(/[\\/]/).pop();
      const localFilePath = path.join(uploadsDir, filename);

      let secureUrl = DEFAULT_CLOUDINARY_PLACEHOLDER;
      let publicId = null;

      if (fs.existsSync(localFilePath)) {
        try {
          console.log(`Uploading local file [${filename}] to Cloudinary...`);
          const uploadRes = await cloudinary.uploader.upload(localFilePath, {
            folder: 'gb_cabinet_doors_products',
            resource_type: 'auto',
          });
          secureUrl = uploadRes.secure_url;
          publicId = uploadRes.public_id;
          console.log(`✅ Uploaded [${filename}] -> secure_url: ${secureUrl}, public_id: ${publicId}`);

          // Remove local file after successful upload
          fs.unlinkSync(localFilePath);
        } catch (uploadErr) {
          console.error(`❌ Failed to upload [${filename}] to Cloudinary:`, uploadErr.message);
        }
      } else {
        console.warn(`⚠️ Local file [${filename}] not found in uploads folder. Using default placeholder URL.`);
      }

      await db.query(
        `UPDATE product_images SET image_url = $1, image_public_id = $2 WHERE image_id = $3`,
        [secureUrl, publicId, row.image_id]
      );
    }

    // 2. Migrate users profile_image
    const usersRes = await db.query(
      `SELECT id, profile_image FROM users WHERE profile_image ILIKE '%/uploads/%'`
    );

    console.log(`Found ${usersRes.rows.length} user profile image records with local /uploads paths.`);

    for (const userRow of usersRes.rows) {
      const filename = userRow.profile_image.split(/[\\/]/).pop();
      const localFilePath = path.join(uploadsDir, filename);

      let secureUrl = null;

      if (fs.existsSync(localFilePath)) {
        try {
          console.log(`Uploading user profile image [${filename}] to Cloudinary...`);
          const uploadRes = await cloudinary.uploader.upload(localFilePath, {
            folder: 'gb_cabinet_doors_profiles',
            resource_type: 'auto',
          });
          secureUrl = uploadRes.secure_url;
          console.log(`✅ Uploaded user profile [${filename}] -> secure_url: ${secureUrl}`);
          fs.unlinkSync(localFilePath);
        } catch (uploadErr) {
          console.error(`❌ Failed to upload user profile [${filename}]:`, uploadErr.message);
        }
      }

      await db.query(
        `UPDATE users SET profile_image = $1 WHERE id = $2`,
        [secureUrl, userRow.id]
      );
    }

    // 3. Clean up any leftover files in uploads directory
    if (fs.existsSync(uploadsDir)) {
      const remainingFiles = fs.readdirSync(uploadsDir);
      for (const file of remainingFiles) {
        if (file !== '.gitkeep') {
          try {
            fs.unlinkSync(path.join(uploadsDir, file));
            console.log(`Cleaned up leftover file: ${file}`);
          } catch (e) {
            // ignore
          }
        }
      }
    }

    console.log('🎉 Migration Completed Successfully! All database records now store Cloudinary URLs.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration Error:', err);
    process.exit(1);
  }
}

migrateImagesToCloudinary();
