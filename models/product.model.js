const db = require('../config/db');
const { deleteFromCloudinary } = require('../services/cloudinary.service');

const isUUID = (str) =>
  typeof str === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

class ProductModel {
  static async createBulkProducts({ category_id, category_name, products = [] }) {
    await this.initTable();
    const createdList = [];

    const usersResult = await db.query('SELECT id FROM users');
    const userIds = usersResult.rows.map(u => u.id);

    for (const item of products) {
      const prodName = (item.product_name || item.name || '').trim();
      if (!prodName) continue;

      const rateVal = parseFloat(item.sell_price ?? item.price ?? item.custom_price ?? item.buy_price ?? 0);
      const catId = item.category_id || category_id || null;
      const desc = item.product_description || item.description || '';
      const stock = parseInt(item.stock || 100, 10);
      const status = item.status || 'active';

      const insertQuery = `
        INSERT INTO products (category_id, product_name, product_description, buy_price, gst_percent, pst_percent, stock, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `;
      const values = [catId, prodName, desc, rateVal, 5, 7, stock, status];
      const res = await db.query(insertQuery, values);
      const newProd = res.rows[0];

      if (userIds.length > 0 && newProd?.p_id) {
        for (const uId of userIds) {
          await db.query(
            `INSERT INTO user_prices (user_id, product_id, custom_price)
             VALUES ($1, $2, $3)
             ON CONFLICT (user_id, product_id) DO UPDATE SET custom_price = EXCLUDED.custom_price`,
            [uId, newProd.p_id, rateVal]
          );
        }
      }

      const fullProd = await this.findById(newProd.p_id);
      if (fullProd) createdList.push(fullProd);
    }

    return createdList;
  }

  static async initTable() {
    try {
      await db.query(`ALTER TABLE products DROP COLUMN IF EXISTS sell_price CASCADE;`);
      await db.query(`ALTER TABLE products DROP COLUMN IF EXISTS custom_price CASCADE;`);
    } catch (e) {
      console.warn('Auto column drop note:', e.message);
    }
  }

  static async create(productData, imagesData = [], client = null) {
    await this.initTable();
    const queryRunner = client || db;
    const { category_id, product_name, product_description, buy_price, sell_price, custom_price, price, gst_percent, pst_percent, stock, status = 'active' } = productData;
    const effectivePrice = parseFloat(custom_price ?? sell_price ?? price ?? 0);

    const query = `
      INSERT INTO products (category_id, product_name, product_description, buy_price, gst_percent, pst_percent, stock, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;
    const values = [category_id, product_name, product_description, buy_price || 0, gst_percent || 5, pst_percent || 7, stock || 0, status];

    const result = await queryRunner.query(query, values);
    const newProduct = result.rows[0];

    // Insert Product Images with Cloudinary URL & Public ID (Max 10)
    if (imagesData && imagesData.length > 0) {
      const limitedImages = imagesData.slice(0, 10);
      for (const img of limitedImages) {
        const url = typeof img === 'object' ? (img.secure_url || img.image_url || img.url) : img;
        const publicId = typeof img === 'object' ? (img.public_id || img.image_public_id) : null;
        if (url && typeof url === 'string' && !url.startsWith('/uploads')) {
          await queryRunner.query(
            `INSERT INTO product_images (p_id, image_url, image_public_id) VALUES ($1, $2, $3)`,
            [newProduct.p_id, url, publicId]
          );
        }
      }
    }

    // Populate user_prices for all existing users using effectivePrice
    const usersResult = await queryRunner.query('SELECT id FROM users');
    if (usersResult.rows.length > 0) {
      for (const user of usersResult.rows) {
        await queryRunner.query(
          `INSERT INTO user_prices (user_id, product_id, custom_price)
           VALUES ($1, $2, $3)
           ON CONFLICT (user_id, product_id) DO UPDATE SET custom_price = EXCLUDED.custom_price`,
          [user.id, newProduct.p_id, effectivePrice]
        );
      }
    }

    return await this.findById(newProduct.p_id, null, queryRunner);
  }

  static async findById(id, userId = null, client = null) {
    await this.initTable();
    const queryRunner = client || db;
    let productQuery = "";
    let params = [id];

    let validUserUuid = isUUID(userId) ? userId : null;
    if (!validUserUuid && userId && userId !== 'me' && userId !== 'undefined' && userId !== 'null') {
      const uRes = await queryRunner.query(`SELECT id FROM users WHERE email ILIKE $1 OR username ILIKE $1 LIMIT 1`, [userId]).catch(() => ({ rows: [] }));
      if (uRes.rows.length > 0) validUserUuid = uRes.rows[0].id;
    }

    if (validUserUuid) {
      productQuery = `
        SELECT p.p_id, p.category_id, p.product_name, p.product_description, p.buy_price,
               p.gst_percent, p.pst_percent, p.stock, p.status, p.created_at, p.updated_at,
               c.category_name,
               COALESCE(up.custom_price, (SELECT custom_price FROM user_prices WHERE product_id = p.p_id LIMIT 1), 0.00) as custom_price,
               COALESCE(up.custom_price, (SELECT custom_price FROM user_prices WHERE product_id = p.p_id LIMIT 1), 0.00) as sell_price
        FROM products p
        LEFT JOIN category c ON p.category_id = c.category_id
        LEFT JOIN user_prices up ON (p.p_id = up.product_id AND up.user_id = $2)
        WHERE p.p_id::text = $1 OR p.product_name ILIKE $1
      `;
      params.push(validUserUuid);
    } else {
      productQuery = `
        SELECT p.p_id, p.category_id, p.product_name, p.product_description, p.buy_price,
               p.gst_percent, p.pst_percent, p.stock, p.status, p.created_at, p.updated_at,
               c.category_name,
               COALESCE((SELECT custom_price FROM user_prices WHERE product_id = p.p_id LIMIT 1), 0.00) as custom_price,
               COALESCE((SELECT custom_price FROM user_prices WHERE product_id = p.p_id LIMIT 1), 0.00) as sell_price
        FROM products p
        LEFT JOIN category c ON p.category_id = c.category_id
        WHERE p.p_id::text = $1 OR p.product_name ILIKE $1
      `;
    }

    try {
      const productRes = await queryRunner.query(productQuery, params);
      if (!productRes || productRes.rows.length === 0) return null;

      const product = productRes.rows[0];

      const imagesQuery = `SELECT image_id, image_url, image_public_id, created_at FROM product_images WHERE p_id = $1 ORDER BY created_at ASC`;
      const imagesRes = await queryRunner.query(imagesQuery, [product.p_id]).catch(() => ({ rows: [] }));
      product.images = imagesRes.rows;

      return product;
    } catch (e) {
      console.error("Error in ProductModel.findById:", e.message);
      return null;
    }
  }

  static async findAll({ search, category_id, status, user_id, limit = 100, offset = 0 }) {
    await this.initTable();
    const params = [];
    let userJoin = "";
    let priceField = "";

    let validUserUuid = isUUID(user_id) ? user_id : null;
    if (!validUserUuid && user_id && user_id !== 'me' && user_id !== 'undefined' && user_id !== 'null') {
      const uRes = await db.query(`SELECT id FROM users WHERE email ILIKE $1 OR username ILIKE $1 LIMIT 1`, [user_id]).catch(() => ({ rows: [] }));
      if (uRes.rows.length > 0) validUserUuid = uRes.rows[0].id;
    }

    if (validUserUuid) {
      params.push(validUserUuid);
      userJoin = `LEFT JOIN user_prices up ON (p.p_id = up.product_id AND up.user_id = $${params.length})`;
      priceField = `, COALESCE(up.custom_price, 0.00) as custom_price, COALESCE(up.custom_price, 0.00) as sell_price`;
    }

    let query = `
      SELECT p.p_id, p.category_id, p.product_name, p.product_description, p.buy_price,
             p.gst_percent, p.pst_percent, p.stock, p.status, p.created_at, p.updated_at,
             c.category_name ${priceField},
        COALESCE(json_agg(json_build_object('image_id', pi.image_id, 'image_url', pi.image_url, 'image_public_id', pi.image_public_id)) FILTER (WHERE pi.image_id IS NOT NULL), '[]') as images
      FROM products p
      LEFT JOIN category c ON p.category_id = c.category_id
      LEFT JOIN product_images pi ON p.p_id = pi.p_id
      ${userJoin}
      WHERE 1=1
    `;

    if (search) {
      params.push(`%${search}%`);
      query += ` AND (p.product_name ILIKE $${params.length} OR p.product_description ILIKE $${params.length})`;
    }
    if (category_id) {
      const validCatUuid = isUUID(category_id) ? category_id : null;
      if (validCatUuid) {
        params.push(validCatUuid);
        query += ` AND p.category_id = $${params.length}`;
      }
    }
    if (status) {
      params.push(status);
      query += ` AND p.status = $${params.length}`;
    }

    const groupCols = validUserUuid
      ? "p.p_id, p.category_id, p.product_name, p.product_description, p.buy_price, p.gst_percent, p.pst_percent, p.stock, p.status, p.created_at, p.updated_at, c.category_name, up.custom_price"
      : "p.p_id, p.category_id, p.product_name, p.product_description, p.buy_price, p.gst_percent, p.pst_percent, p.stock, p.status, p.created_at, p.updated_at, c.category_name";

    query += ` GROUP BY ${groupCols} ORDER BY p.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    try {
      const result = await db.query(query, params);
      return result.rows || [];
    } catch (err) {
      console.error("Error in ProductModel.findAll:", err.message);
      return [];
    }
  }

  static async update(id, productData, imagesData = null, client = null) {
    await this.initTable();
    const queryRunner = client || db;
    const { category_id, product_name, product_description, buy_price, sell_price, custom_price, price, gst_percent, pst_percent, stock, status } = productData;
    const effectivePrice = custom_price !== undefined ? custom_price : (sell_price !== undefined ? sell_price : price);

    const query = `
      UPDATE products
      SET category_id = COALESCE($1, category_id),
          product_name = COALESCE($2, product_name),
          product_description = COALESCE($3, product_description),
          buy_price = COALESCE($4, buy_price),
          gst_percent = COALESCE($5, gst_percent),
          pst_percent = COALESCE($6, pst_percent),
          stock = COALESCE($7, stock),
          status = COALESCE($8, status),
          updated_at = CURRENT_TIMESTAMP
      WHERE p_id = $9
      RETURNING *
    `;

    const values = [category_id, product_name, product_description, buy_price, gst_percent, pst_percent, stock, status, id];
    const result = await queryRunner.query(query, values);
    if (result.rows.length === 0) return null;

    if (effectivePrice !== undefined && effectivePrice !== null) {
      const usersResult = await queryRunner.query('SELECT id FROM users');
      if (usersResult.rows.length > 0) {
        for (const user of usersResult.rows) {
          await queryRunner.query(
            `INSERT INTO user_prices (user_id, product_id, custom_price)
             VALUES ($1, $2, $3)
             ON CONFLICT (user_id, product_id) DO UPDATE SET custom_price = EXCLUDED.custom_price, updated_at = CURRENT_TIMESTAMP`,
            [user.id, id, parseFloat(effectivePrice)]
          );
        }
      }
    }

    if (imagesData && imagesData.length > 0) {
      // 1. Delete old Cloudinary images
      const oldImagesRes = await queryRunner.query('SELECT image_public_id FROM product_images WHERE p_id = $1', [id]);
      if (oldImagesRes.rows && oldImagesRes.rows.length > 0) {
        for (const oldImg of oldImagesRes.rows) {
          if (oldImg.image_public_id) {
            await deleteFromCloudinary(oldImg.image_public_id);
          }
        }
      }

      // 2. Remove old records & insert new Cloudinary images
      await queryRunner.query('DELETE FROM product_images WHERE p_id = $1', [id]);
      const limitedImages = imagesData.slice(0, 10);
      for (const img of limitedImages) {
        const url = typeof img === 'object' ? (img.secure_url || img.image_url || img.url) : img;
        const publicId = typeof img === 'object' ? (img.public_id || img.image_public_id) : null;
        if (url && typeof url === 'string' && !url.startsWith('/uploads')) {
          await queryRunner.query(
            `INSERT INTO product_images (p_id, image_url, image_public_id) VALUES ($1, $2, $3)`,
            [id, url, publicId]
          );
        }
      }
    }

    return await this.findById(id, null, queryRunner);
  }

  static async delete(id) {
    await this.initTable();
    try {
      const imagesRes = await db.query('SELECT image_public_id FROM product_images WHERE p_id = $1', [id]);
      if (imagesRes.rows && imagesRes.rows.length > 0) {
        for (const img of imagesRes.rows) {
          if (img.image_public_id) {
            await deleteFromCloudinary(img.image_public_id);
          }
        }
      }
    } catch (err) {
      console.warn(`Cloudinary deletion error during product delete [${id}]:`, err.message);
    }

    const query = `DELETE FROM products WHERE p_id = $1 RETURNING p_id`;
    const result = await db.query(query, [id]);
    return result.rows[0];
  }
}

module.exports = ProductModel;
