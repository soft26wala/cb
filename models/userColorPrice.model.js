const db = require('../config/db');

class UserColorPriceModel {
  static async ensureTableExists() {
    try {
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
      // Table or index already exists or offline
    }
  }

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

  static async upsertCustomPrice(userId, colorId, customPrice) {
    await this.ensureTableExists();

    if (!userId || !colorId) {
      throw new Error('userId and colorId are required');
    }

    if (customPrice === undefined || customPrice === null || Number.isNaN(Number(customPrice))) {
      throw new Error('Invalid custom price');
    }

    const query = `
      INSERT INTO public.user_color_prices (
        user_id,
        color_id,
        custom_price
      )
      VALUES (
        $1,
        $2,
        $3
      )
      ON CONFLICT (user_id, color_id)
      DO UPDATE SET
        custom_price = EXCLUDED.custom_price,
        updated_at = CURRENT_TIMESTAMP
      RETURNING price_id, user_id, color_id, custom_price, created_at, updated_at
    `;

    const result = await db.query(query, [userId, colorId, Number(customPrice)]);
    return result.rows[0] || null;
  }
}

UserColorPriceModel.ensureTableExists();

module.exports = UserColorPriceModel;
