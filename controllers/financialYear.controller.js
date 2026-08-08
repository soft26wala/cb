const FinancialYearModel = require('../models/financialYear.model');
const { successResponse, errorResponse } = require('../utils/response');
const { recordHistory } = require('../services/audit.service');

class FinancialYearController {
  static async getFinancialYears(req, res, next) {
    try {
      const periods = await FinancialYearModel.getFinancialYears();
      const trialBalance = await FinancialYearModel.getTrialBalance();
      return successResponse(res, 'Financial Years ledger fetched successfully', {
        periods,
        trial_balance: trialBalance,
      });
    } catch (error) {
      next(error);
    }
  }

  static async closeFinancialYear(req, res, next) {
    try {
      const { fyId, nextFyName, nextStartDate, nextEndDate } = req.body;
      if (!fyId) {
        return errorResponse(res, 'Financial Year ID (fyId) is required', null, 400);
      }

      const result = await FinancialYearModel.closeAndCarryForward({
        fyId,
        closedBy: req.user.id,
        nextFyName,
        nextStartDate,
        nextEndDate,
      });

      await recordHistory({
        userId: req.user.id,
        action: 'UPDATE',
        tableName: 'financial_years',
        recordId: fyId,
        newData: { status: 'Closed', nextFy: result.newFy?.fy_name },
        ipAddress: req.ip,
      });

      return successResponse(
        res,
        `Financial Year (${result.closingFy.fy_name}) closed successfully! Balances carried forward to ${result.newFy.fy_name}.`,
        result
      );
    } catch (error) {
      next(error);
    }
  }
}

module.exports = FinancialYearController;
