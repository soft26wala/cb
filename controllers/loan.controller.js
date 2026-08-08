const LoanModel = require('../models/loan.model');
const { successResponse, errorResponse } = require('../utils/response');
const { recordHistory } = require('../services/audit.service');

class LoanController {
  static async getLoans(req, res, next) {
    try {
      const { loan_type, status, search, limit, offset } = req.query;
      const loans = await LoanModel.findAll({
        loan_type,
        status,
        search,
        limit: parseInt(limit, 10) || 50,
        offset: parseInt(offset, 10) || 0,
      });
      return successResponse(res, 'Loan records fetched successfully', loans);
    } catch (error) {
      next(error);
    }
  }

  static async getLoanById(req, res, next) {
    try {
      const { id } = req.params;
      const loan = await LoanModel.findById(id);
      if (!loan) {
        return errorResponse(res, 'Loan record not found', null, 404);
      }
      return successResponse(res, 'Loan details fetched successfully', loan);
    } catch (error) {
      next(error);
    }
  }

  static async createLoan(req, res, next) {
    try {
      const newLoan = await LoanModel.create(req.body);

      await recordHistory({
        userId: req.user.id,
        action: 'INSERT',
        tableName: 'loans',
        recordId: newLoan.loan_id,
        newData: newLoan,
        ipAddress: req.ip,
      });

      return successResponse(res, 'Loan created successfully', newLoan, 201);
    } catch (error) {
      next(error);
    }
  }

  static async updateLoan(req, res, next) {
    try {
      const { id } = req.params;
      const existingLoan = await LoanModel.findById(id);
      if (!existingLoan) {
        return errorResponse(res, 'Loan record not found', null, 404);
      }

      const updatedLoan = await LoanModel.update(id, req.body);

      await recordHistory({
        userId: req.user.id,
        action: 'UPDATE',
        tableName: 'loans',
        recordId: id,
        oldData: existingLoan,
        newData: updatedLoan,
        ipAddress: req.ip,
      });

      return successResponse(res, 'Loan updated successfully', updatedLoan);
    } catch (error) {
      next(error);
    }
  }

  static async deleteLoan(req, res, next) {
    try {
      const { id } = req.params;
      const existingLoan = await LoanModel.findById(id);
      if (!existingLoan) {
        return errorResponse(res, 'Loan record not found', null, 404);
      }

      await LoanModel.delete(id);

      await recordHistory({
        userId: req.user.id,
        action: 'DELETE',
        tableName: 'loans',
        recordId: id,
        oldData: existingLoan,
        ipAddress: req.ip,
      });

      return successResponse(res, 'Loan deleted successfully', { loan_id: id });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = LoanController;
