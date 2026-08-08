const AccountModel = require('../models/account.model');
const { successResponse, errorResponse } = require('../utils/response');

class AccountController {
  static async getAllAccounts(req, res, next) {
    try {
      const { limit, offset } = req.query;
      const transactions = await AccountModel.getAllTransactions({
        limit: parseInt(limit, 10) || 100,
        offset: parseInt(offset, 10) || 0,
      });
      return successResponse(res, 'All account transactions fetched successfully', transactions);
    } catch (error) {
      next(error);
    }
  }

  static async getCustomerLedger(req, res, next) {
    try {
      const { userId } = req.params;
      const { limit, offset } = req.query;

      if (req.user.role !== 'admin' && req.user.role !== 'employee' && req.user.id !== userId) {
        return errorResponse(res, 'Access denied', null, 403);
      }

      const ledger = await AccountModel.getLedgerByUserId(userId, {
        limit: parseInt(limit, 10) || 100,
        offset: parseInt(offset, 10) || 0,
      });

      return successResponse(res, 'Account ledger fetched successfully', ledger);
    } catch (error) {
      next(error);
    }
  }

  static async getCreditList(req, res, next) {
    try {
      const { fyId } = req.query;
      const creditList = await AccountModel.getCreditList(fyId);
      return successResponse(res, 'Customer credit list fetched successfully', creditList);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = AccountController;
