const UserColorPriceModel = require('../models/userColorPrice.model');
const { successResponse, errorResponse } = require('../utils/response');

class UserColorPriceController {
  static async getUserColorPrices(req, res, next) {
    try {
      let userId = req.params.userId || req.user?.id || req.user?.userId || req.cookies?.userId;
      const isStaff = req.user?.role === 'admin' || req.user?.role === 'employee';
      if (!isStaff && req.params.userId && req.params.userId !== req.user?.id) {
        userId = req.user?.id;
      }

      if (!userId) {
        return errorResponse(res, 'Authentication required. Please login first.', null, 401);
      }

      const prices = await UserColorPriceModel.getPricesByUser(userId);
      return successResponse(res, 'User color prices fetched successfully', prices);
    } catch (error) {
      next(error);
    }
  }

  static async updateUserColorPrice(req, res, next) {
    try {
      const { priceId } = req.params;
      const { customPrice, userId, colorId } = req.body;

      let result;
      if (priceId && priceId !== 'undefined' && priceId !== 'null') {
        result = await UserColorPriceModel.updateCustomPrice(priceId, customPrice);
      } else if (userId && colorId) {
        result = await UserColorPriceModel.upsertCustomPrice(userId, colorId, customPrice);
      } else {
        return errorResponse(res, 'Missing priceId or (userId and colorId)', null, 400);
      }

      return successResponse(res, 'User color price updated successfully', result);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = UserColorPriceController;
