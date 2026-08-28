const db = require('../config/db');

class UserColorPriceModel {
  static async ensureTableExists() {
    try {
      await db.query(`
        CREATE TABLE IF NOT EXISTS colors (
          color_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          color_name VARCHAR(150) UNIQUE NOT NULL,
          price_add_on NUMERIC(12, 2) DEFAULT 0.00,
          hex_code VARCHAR(50),
          description TEXT,
          status VARCHAR(50) DEFAULT 'active',
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `);
      await db.query(`ALTER TABLE colors ADD COLUMN IF NOT EXISTS price_add_on NUMERIC(12, 2) DEFAULT 0.00;`);

      await db.query(`
        CREATE TABLE IF NOT EXISTS user_color_prices (
          price_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          color_id UUID NOT NULL REFERENCES colors(color_id) ON DELETE CASCADE,
          custom_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(user_id, color_id)
        );
      `);
      await db.query(`CREATE INDEX IF NOT EXISTS idx_user_color_prices_user ON user_color_prices(user_id);`);
    } catch (e) {
      console.warn('[UserColorPriceModel] Table init check warning:', e.message);
    }
  }

  /**
   * Helper to resolve a color_id UUID from any string identifier (UUID, col-1, or Color Name like 'White').
   */
  static async resolveColorId(colorIdentifier) {
    if (!colorIdentifier) return null;

    const cleanStr = String(colorIdentifier).trim();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanStr);

    if (isUuid) {
      const checkRes = await db.query(`SELECT color_id FROM colors WHERE color_id = $1::uuid`, [cleanStr]);
      if (checkRes.rows.length > 0) {
        return checkRes.rows[0].color_id;
      }
    }

    // Search by color_name
    const nameRes = await db.query(`SELECT color_id FROM colors WHERE LOWER(color_name) = LOWER($1)`, [cleanStr]);
    if (nameRes.rows.length > 0) {
      return nameRes.rows[0].color_id;
    }

    // If color name doesn't exist in colors table, create it and return its new color_id UUID
    try {
      const insertRes = await db.query(
        `INSERT INTO colors (color_name) VALUES ($1) ON CONFLICT (color_name) DO UPDATE SET color_name = EXCLUDED.color_name RETURNING color_id`,
        [cleanStr]
      );
      return insertRes.rows[0]?.color_id || null;
    } catch (err) {
      console.error('[UserColorPriceModel] Failed to insert missing color:', err);
      return null;
    }
  }

  /**
   * Fetch all custom color prices for a given user.
   */
  static async getPricesByUser(userId) {
    await this.ensureTableExists();

    if (!userId) {
      return [];
    }

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(userId));
    if (!isUuid) {
      console.warn('[UserColorPriceModel] Invalid UUID passed for userId:', userId);
      return [];
    }

    const query = `
      SELECT
        ucp.price_id,
        $1::uuid AS user_id,
        c.color_id,
        c.color_name,
        COALESCE(c.price_add_on, 0.00) AS default_price_add_on,
        COALESCE(c.price_add_on, 0.00) AS default_sell_price,
        COALESCE(ucp.custom_price, c.price_add_on, 0.00) AS custom_price,
        ucp.created_at,
        ucp.updated_at
      FROM public.colors AS c
      LEFT JOIN public.user_color_prices AS ucp
        ON (c.color_id = ucp.color_id AND ucp.user_id = $1::uuid)
      ORDER BY c.color_name ASC
    `;

    try {
      const result = await db.query(query, [userId]);
      return result.rows;
    } catch (err) {
      console.error('[UserColorPriceModel] Failed to fetch prices by user:', err);
      return [];
    }
  }

  /**
   * Update existing custom price by priceId.
   */
  static async updateCustomPrice(priceId, customPrice) {
    await this.ensureTableExists();

    if (!priceId) {
      return null;
    }

    if (customPrice === undefined || customPrice === null || Number.isNaN(Number(customPrice))) {
      throw new Error('Invalid custom price');
    }

    const query = `
      UPDATE public.user_color_prices
      SET
        custom_price = $1,
        updated_at = CURRENT_TIMESTAMP
      WHERE price_id = $2
      RETURNING price_id, user_id, color_id, custom_price, created_at, updated_at
    `;

    const result = await db.query(query, [Number(customPrice), priceId]);
    return result.rows[0] || null;
  }

  /**
   * Upsert a user's custom price for a color.
   */
  static async upsertCustomPrice(userId, colorIdentifier, customPrice) {
    await this.ensureTableExists();

    if (!userId || !colorIdentifier) {
      throw new Error('userId and colorId/colorName are required');
    }

    if (customPrice === undefined || customPrice === null || Number.isNaN(Number(customPrice))) {
      throw new Error('Invalid custom price');
    }

    const resolvedColorId = await this.resolveColorId(colorIdentifier);
    if (!resolvedColorId) {
      throw new Error(`Could not resolve color_id for "${colorIdentifier}"`);
    }

    const query = `
      INSERT INTO public.user_color_prices (
        user_id,
        color_id,
        custom_price
      )
      VALUES (
        $1::uuid,
        $2::uuid,
        $3
      )
      ON CONFLICT (user_id, color_id)
      DO UPDATE SET
        custom_price = EXCLUDED.custom_price,
        updated_at = CURRENT_TIMESTAMP
      RETURNING price_id, user_id, color_id, custom_price, created_at, updated_at
    `;

    const result = await db.query(query, [userId, resolvedColorId, Number(customPrice)]);
    return result.rows[0] || null;
  }
}

UserColorPriceModel.ensureTableExists();

module.exports = UserColorPriceModel;
