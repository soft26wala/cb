const ReportModel = require('../models/report.model');
const HistoryModel = require('../models/history.model');
const AccountModel = require('../models/account.model');
const { successResponse, errorResponse } = require('../utils/response');

class ReportController {
  static async getGstReport(req, res, next) {
    try {
      const { type = 'today', startDate, endDate } = req.query;
      const report = await ReportModel.getGstReport(type, startDate, endDate);
      return successResponse(res, `GST Report (${type}) fetched successfully`, report);
    } catch (error) {
      next(error);
    }
  }

  static async getPstReport(req, res, next) {
    try {
      const { type = 'today', startDate, endDate } = req.query;
      const report = await ReportModel.getPstReport(type, startDate, endDate);
      return successResponse(res, `PST Report (${type}) fetched successfully`, report);
    } catch (error) {
      next(error);
    }
  }

  static async getSalesReport(req, res, next) {
    try {
      const { type = 'monthly', startDate, endDate } = req.query;
      const report = await ReportModel.getSalesReport(type, startDate, endDate);
      return successResponse(res, `Sales Report (${type}) fetched successfully`, report);
    } catch (error) {
      next(error);
    }
  }

  static async getPaymentsReport(req, res, next) {
    try {
      const { type = 'all', startDate, endDate, method } = req.query;
      const payments = await ReportModel.getPaymentsReport(type, startDate, endDate, method);
      return successResponse(res, `Payments report fetched successfully`, payments);
    } catch (error) {
      next(error);
    }
  }

  static async getPurchaseReport(req, res, next) {
    try {
      const { type = 'monthly', startDate, endDate } = req.query;
      const report = await ReportModel.getPurchaseReport(type, startDate, endDate);
      return successResponse(res, `Purchase Report (${type}) fetched successfully`, report);
    } catch (error) {
      next(error);
    }
  }

  static async getExpenseReport(req, res, next) {
    try {
      const { type = 'monthly', startDate, endDate } = req.query;
      const report = await ReportModel.getExpenseReport(type, startDate, endDate);
      return successResponse(res, `Expense Report (${type}) fetched successfully`, report);
    } catch (error) {
      next(error);
    }
  }

  static async getProfitReport(req, res, next) {
    try {
      const { type = 'monthly', startDate, endDate } = req.query;
      const report = await ReportModel.getProfitReport(type, startDate, endDate);
      return successResponse(res, `Profit Report (${type}) fetched successfully`, report);
    } catch (error) {
      next(error);
    }
  }

  static async getCustomerStatement(req, res, next) {
    try {
      const { userId } = req.params;
      const statement = await ReportModel.getCustomerStatement(userId);
      if (!statement) {
        return errorResponse(res, 'Customer not found', null, 404);
      }
      return successResponse(res, 'Customer statement fetched successfully', statement);
    } catch (error) {
      next(error);
    }
  }

  static async getHistory(req, res, next) {
    try {
      const { tableName, userId, action, limit, offset } = req.query;
      const history = await HistoryModel.findAll({
        tableName,
        userId,
        action,
        limit: parseInt(limit, 10) || 100,
        offset: parseInt(offset, 10) || 0,
      });
      return successResponse(res, 'Audit history log fetched successfully', history);
    } catch (error) {
      next(error);
    }
  }

  static async getCreditList(req, res, next) {
    try {
      const { fyId } = req.query;
      const creditList = await AccountModel.getCreditList(fyId);
      return successResponse(res, 'Credit list report fetched successfully', creditList);
    } catch (error) {
      next(error);
    }
  }

  static async getTaxReport(req, res, next) {
    try {
      const { type = 'monthly', startDate, endDate } = req.query;
      const gst = await ReportModel.getGstReport(type, startDate, endDate);
      const pst = await ReportModel.getPstReport(type, startDate, endDate);
      return successResponse(res, `Comprehensive Tax Report (${type}) fetched successfully`, {
        gst,
        pst,
        combined_tax_collected: (parseFloat(gst.total_gst_collected) + parseFloat(pst.total_pst_collected)).toFixed(2),
      });
    } catch (error) {
      next(error);
    }
  }

  static async getPstExemptReport(req, res, next) {
    try {
      const { type = 'monthly', startDate, endDate } = req.query;
      const report = await ReportModel.getPstExemptReport(type, startDate, endDate);
      return successResponse(res, `PST Exemption Report (${type}) fetched successfully`, report);
    } catch (error) {
      next(error);
    }
  }

  static async getPstClientsReport(req, res, next) {
    try {
      const clients = await ReportModel.getPstClientsReport();
      return successResponse(res, 'PST client status report fetched successfully', clients);
    } catch (error) {
      next(error);
    }
  }

  static async getClientBalances(req, res, next) {
    try {
      const { search } = req.query;
      const balances = await AccountModel.getClientBalances({ search });
      return successResponse(res, 'Client ledger balances fetched successfully', balances);
    } catch (error) {
      next(error);
    }
  }

  static async getClientBalanceByUserId(req, res, next) {
    try {
      const { userId } = req.params;
      const balance = await AccountModel.getClientBalanceByUserId(userId);
      if (!balance) {
        return errorResponse(res, 'Client balance not found', null, 404);
      }
      return successResponse(res, 'Client live balance fetched successfully', balance);
    } catch (error) {
      next(error);
    }
  }

  static async recordAdvancePayment(req, res, next) {
    try {
      const { userId, amount, paymentMethod, description } = req.body;
      if (!userId || !amount) {
        return errorResponse(res, 'Client ID and amount are required', null, 400);
      }
      const payment = await AccountModel.recordAdvancePayment({
        userId,
        amount,
        paymentMethod: paymentMethod || 'Cash',
        description: description || 'Advance Payment Received',
      });
      return successResponse(res, 'Advance payment recorded successfully', payment, 201);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = ReportController;
