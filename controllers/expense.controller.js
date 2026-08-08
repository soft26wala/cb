const ExpenseModel = require('../models/expense.model');
const { successResponse, errorResponse } = require('../utils/response');
const { recordHistory } = require('../services/audit.service');
const { uploadToCloudinaryBuffer } = require('../services/cloudinary.service');

class ExpenseController {
  static async getExpenses(req, res, next) {
    try {
      const { category, search, limit, offset } = req.query;
      const expenses = await ExpenseModel.findAll({
        category,
        search,
        limit: parseInt(limit, 10) || 50,
        offset: parseInt(offset, 10) || 0,
      });
      return successResponse(res, 'Expenses fetched successfully', expenses);
    } catch (error) {
      next(error);
    }
  }

  static async uploadReceipt(req, res, next) {
    try {
      if (!req.file) {
        return errorResponse(res, 'No bill image file provided for upload', null, 400);
      }

      let receiptUrl = '';
      try {
        const cloudRes = await uploadToCloudinaryBuffer(req.file.buffer, 'gb_expense_receipts', req.file.mimetype);
        receiptUrl = cloudRes.secure_url;
      } catch (cloudErr) {
        console.warn('[Expense Receipt Upload Warning] Cloudinary fallback:', cloudErr.message);
        const base64Str = req.file.buffer.toString('base64');
        receiptUrl = `data:${req.file.mimetype || 'image/png'};base64,${base64Str}`;
      }

      return successResponse(res, 'Bill receipt uploaded successfully', {
        bill_image: receiptUrl,
        bill_url: receiptUrl,
        receipt_image: receiptUrl,
        secure_url: receiptUrl,
        url: receiptUrl,
      });
    } catch (error) {
      next(error);
    }
  }


  static async getExpenseById(req, res, next) {
    try {
      const { id } = req.params;
      const expense = await ExpenseModel.findById(id);
      if (!expense) {
        return errorResponse(res, 'Expense record not found', null, 404);
      }
      return successResponse(res, 'Expense details fetched successfully', expense);
    } catch (error) {
      next(error);
    }
  }

  static async createExpense(req, res, next) {
    try {
      const newExpense = await ExpenseModel.create(req.body);

      if (req.user && req.user.id) {
        await recordHistory({
          userId: req.user.id,
          action: 'INSERT',
          tableName: 'expenses',
          recordId: newExpense.expense_id,
          newData: newExpense,
          ipAddress: req.ip,
        }).catch(() => {});
      }

      return successResponse(res, 'Expense recorded successfully', newExpense, 201);
    } catch (error) {
      next(error);
    }
  }

  static async updateExpense(req, res, next) {
    try {
      const { id } = req.params;
      const existingExpense = await ExpenseModel.findById(id);
      if (!existingExpense) {
        return errorResponse(res, 'Expense record not found', null, 404);
      }

      const updatedExpense = await ExpenseModel.update(id, req.body);

      if (req.user && req.user.id) {
        await recordHistory({
          userId: req.user.id,
          action: 'UPDATE',
          tableName: 'expenses',
          recordId: id,
          oldData: existingExpense,
          newData: updatedExpense,
          ipAddress: req.ip,
        }).catch(() => {});
      }

      return successResponse(res, 'Expense updated successfully', updatedExpense);
    } catch (error) {
      next(error);
    }
  }

  static async deleteExpense(req, res, next) {
    try {
      const { id } = req.params;
      const existingExpense = await ExpenseModel.findById(id);
      if (!existingExpense) {
        return errorResponse(res, 'Expense record not found', null, 404);
      }

      await ExpenseModel.delete(id);

      if (req.user && req.user.id) {
        await recordHistory({
          userId: req.user.id,
          action: 'DELETE',
          tableName: 'expenses',
          recordId: id,
          oldData: existingExpense,
          ipAddress: req.ip,
        }).catch(() => {});
      }

      return successResponse(res, 'Expense deleted successfully', { expense_id: id });
    } catch (error) {
      next(error);
    }
  }

}

module.exports = ExpenseController;
