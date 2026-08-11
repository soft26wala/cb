const db = require('../config/db');

class UserPriceModel {

  /**
   * Fetch all custom prices for one authenticated user.
   *
   * IMPORTANT:
   * - userId must be the authenticated user's ID.
   * - Filter is ONLY on user_prices.user_id.
   * - custom_price ALWAYS comes from user_prices.custom_price.
   * - product_id is ONLY used to join products.
   * - products.sell_price is NEVER used.
   * - No fallback/default price is used.
   */
  static async getPricesByUser(userId) {
    if (!userId) {
      return [];
    }

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(userId));
    if (!isUuid) {
      console.warn('[UserPriceModel] Invalid UUID passed for userId:', userId);
      return [];
    }

    const query = `
      SELECT
        up.price_id,
        $1::uuid AS user_id,
        p.p_id AS product_id,
        COALESCE(up.custom_price, (SELECT custom_price FROM user_prices WHERE product_id = p.p_id LIMIT 1), 0.00) AS custom_price,
        COALESCE(up.custom_price, (SELECT custom_price FROM user_prices WHERE product_id = p.p_id LIMIT 1), 0.00) AS default_sell_price,
        COALESCE(up.custom_price, (SELECT custom_price FROM user_prices WHERE product_id = p.p_id LIMIT 1), 0.00) AS sell_price,
        up.created_at,
        up.updated_at,

        p.product_name,
        p.product_description,
        p.buy_price,
        c.category_name

      FROM public.products AS p

      LEFT JOIN public.user_prices AS up
        ON (p.p_id = up.product_id AND up.user_id = $1::uuid)

      LEFT JOIN public.category AS c
        ON p.category_id = c.category_id

      ORDER BY p.product_name ASC
    `;

    console.log(
      '[UserPriceModel] Fetching catalog & custom prices for user:',
      userId
    );

    const result = await db.query(query, [userId]);

    console.log(
      '[UserPriceModel] Rows:',
      result.rows.length
    );

    return result.rows;
  }


  /**
   * Fetch ONE custom price for one authenticated user + product.
   *
   * custom_price comes ONLY from user_prices.
   */
  static async getSinglePrice(userId, productId) {
    if (!userId || !productId) {
      return null;
    }

    const query = `
      SELECT
        up.price_id,
        up.user_id,
        up.product_id,
        up.custom_price,
        up.created_at,
        up.updated_at,

        p.product_name,
        p.product_description,
        p.buy_price

      FROM public.user_prices AS up

      LEFT JOIN public.products AS p
        ON p.p_id = up.product_id

      WHERE up.user_id = $1
        AND up.product_id = $2

      LIMIT 1
    `;

    const result = await db.query(query, [
      userId,
      productId
    ]);

    return result.rows[0] || null;
  }


  /**
   * Update existing custom price.
   *
   * This ONLY updates user_prices.custom_price.
   */
  static async updateCustomPrice(priceId, customPrice) {
    if (!priceId) {
      return null;
    }

    if (
      customPrice === undefined ||
      customPrice === null ||
      Number.isNaN(Number(customPrice))
    ) {
      throw new Error('Invalid custom price');
    }

    const query = `
      UPDATE public.user_prices

      SET
        custom_price = $1,
        updated_at = CURRENT_TIMESTAMP

      WHERE price_id = $2

      RETURNING
        price_id,
        user_id,
        product_id,
        custom_price,
        created_at,
        updated_at
    `;

    const result = await db.query(query, [
      Number(customPrice),
      priceId
    ]);

    return result.rows[0] || null;
  }


  /**
   * Create or update a user's custom price for a product.
   *
   * user_id + product_id identifies the customer's price record.
   * custom_price is saved exactly into user_prices.custom_price.
   */
  static async upsertCustomPrice(
    userId,
    productId,
    customPrice
  ) {
    if (!userId || !productId) {
      throw new Error(
        'userId and productId are required'
      );
    }

    if (
      customPrice === undefined ||
      customPrice === null ||
      Number.isNaN(Number(customPrice))
    ) {
      throw new Error('Invalid custom price');
    }

    const query = `
      INSERT INTO public.user_prices (
        user_id,
        product_id,
        custom_price
      )

      VALUES (
        $1,
        $2,
        $3
      )

      ON CONFLICT (user_id, product_id)

      DO UPDATE SET
        custom_price = EXCLUDED.custom_price,
        updated_at = CURRENT_TIMESTAMP

      RETURNING
        price_id,
        user_id,
        product_id,
        custom_price,
        created_at,
        updated_at
    `;

    const result = await db.query(query, [
      userId,
      productId,
      Number(customPrice)
    ]);

    return result.rows[0] || null;
  }
}


module.exports = UserPriceModel;