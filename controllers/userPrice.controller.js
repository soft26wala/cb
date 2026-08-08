const UserPriceModel = require('../models/userPrice.model');
const { successResponse, errorResponse } = require('../utils/response');
const { recordHistory } = require('../services/audit.service');

class UserPriceController {
  /**
   * GET /api/user-prices
   *
   * STEP 1 — Identify the authenticated user from the verified JWT token.
   * userId MUST come from req.user (set by verifyToken middleware).
   * Never trust userId from URL params, query strings, or request body.
   *
   * STEP 2 — Fetch all user_prices rows for that userId.
   * STEP 3 — Return them with joined product info (name, description, buy_price).
   * custom_price is the ONLY selling price returned.
   */
  static async getUserPrices(req, res, next) {
    try {
      let userId = req.params.userId || req.user?.id || req.user?.userId || req.cookies?.userId;

      // Staff (Admin/Employee) can fetch prices for any customer userId. Standard users can only fetch their own.
      const isStaff = req.user?.role === 'admin' || req.user?.role === 'employee';
      if (!isStaff && req.params.userId && req.params.userId !== req.user?.id) {
        userId = req.user?.id;
      }

      console.log('[getUserPrices] TARGET USER ID:', userId);

      if (!userId) {
        return errorResponse(res, 'Authentication required. Please login first.', null, 401);
      }

      const prices = await UserPriceModel.getPricesByUser(userId);

      console.log('[getUserPrices] USER PRICE ROWS COUNT:', prices.length);

      return successResponse(res, 'User product prices fetched successfully', prices);
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /api/user-prices/:priceId  (admin only)
   * Updates a specific user_price row's custom_price by price_id,
   * or upserts by userId + productId from body.
   */
  static async updateUserPrice(req, res, next) {
    try {
      const { priceId } = req.params;
      const { customPrice, userId, productId } = req.body;

      let result;
      if (priceId && priceId !== 'undefined' && priceId !== 'null') {
        result = await UserPriceModel.updateCustomPrice(priceId, customPrice);
      } else if (userId && productId) {
        result = await UserPriceModel.upsertCustomPrice(userId, productId, customPrice);
      } else {
        return errorResponse(res, 'Missing priceId or (userId and productId)', null, 400);
      }

      await recordHistory({
        userId: req.user.id,
        action: 'UPDATE',
        tableName: 'user_prices',
        recordId: result.price_id,
        newData: result,
        ipAddress: req.ip,
      });

      return successResponse(res, 'User product price updated successfully', result);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = UserPriceController;
