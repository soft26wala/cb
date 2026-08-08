const SalaryModel = require('../models/salary.model');
const { successResponse, errorResponse } = require('../utils/response');
const { recordHistory } = require('../services/audit.service');

class SalaryController {
  static async getSalaries(req, res, next) {
    try {
      const { employee_id, month, year, limit, offset } = req.query;
      const salaries = await SalaryModel.findAll({
        employee_id,
        month: month ? parseInt(month, 10) : undefined,
        year: year ? parseInt(year, 10) : undefined,
        limit: parseInt(limit, 10) || 50,
        offset: parseInt(offset, 10) || 0,
      });
      return successResponse(res, 'Salary records fetched successfully', salaries);
    } catch (error) {
      next(error);
    }
  }

  static async getPendingAdvance(req, res, next) {
    try {
      const { employeeId } = req.params;
      const totalPending = await SalaryModel.getPendingAdvance(employeeId);
      return successResponse(res, 'Pending advance fetched successfully', { total_pending: totalPending });
    } catch (error) {
      next(error);
    }
  }

  static async getAdvances(req, res, next) {
    try {
      const list = await SalaryModel.getAdvances();
      return successResponse(res, 'Salary advances list fetched successfully', list);
    } catch (error) {
      next(error);
    }
  }

  static async createAdvance(req, res, next) {
    try {
      const { employee_id, amount, reason } = req.body;
      if (!employee_id || !amount || parseFloat(amount) <= 0) {
        return errorResponse(res, 'Valid employee_id and amount required', null, 400);
      }
      const advance = await SalaryModel.createAdvance({ employee_id, amount, reason });
      return successResponse(res, 'Salary advance recorded successfully', advance, 201);
    } catch (error) {
      next(error);
    }
  }

  static async deleteAdvance(req, res, next) {
    try {
      const { advanceId } = req.params;
      const deleted = await SalaryModel.deleteAdvance(advanceId);
      if (!deleted) {
        return errorResponse(res, 'Salary advance record not found', null, 404);
      }
      return successResponse(res, 'Salary advance deleted successfully', deleted);
    } catch (error) {
      next(error);
    }
  }

  static async getSalaryById(req, res, next) {
    try {
      const { id } = req.params;
      const salary = await SalaryModel.findById(id);
      if (!salary) {
        return errorResponse(res, 'Salary record not found', null, 404);
      }
      return successResponse(res, 'Salary record fetched successfully', salary);
    } catch (error) {
      next(error);
    }
  }

  static async createSalary(req, res, next) {
    try {
      const newSalary = await SalaryModel.create(req.body);

      await recordHistory({
        userId: req.user.id,
        action: 'INSERT',
        tableName: 'salary',
        recordId: newSalary.salary_id,
        newData: newSalary,
        ipAddress: req.ip,
      });

      return successResponse(res, 'Salary record created successfully', newSalary, 201);
    } catch (error) {
      next(error);
    }
  }

  static async updateSalary(req, res, next) {
    try {
      const { id } = req.params;
      const existingSalary = await SalaryModel.findById(id);
      if (!existingSalary) {
        return errorResponse(res, 'Salary record not found', null, 404);
      }

      const updatedSalary = await SalaryModel.update(id, req.body);

      await recordHistory({
        userId: req.user.id,
        action: 'UPDATE',
        tableName: 'salary',
        recordId: id,
        oldData: existingSalary,
        newData: updatedSalary,
        ipAddress: req.ip,
      });

      return successResponse(res, 'Salary record updated successfully', updatedSalary);
    } catch (error) {
      next(error);
    }
  }

  static async deleteSalary(req, res, next) {
    try {
      const { id } = req.params;
      const existingSalary = await SalaryModel.findById(id);
      if (!existingSalary) {
        return errorResponse(res, 'Salary record not found', null, 404);
      }

      await SalaryModel.delete(id);

      await recordHistory({
        userId: req.user.id,
        action: 'DELETE',
        tableName: 'salary',
        recordId: id,
        oldData: existingSalary,
        ipAddress: req.ip,
      });

      return successResponse(res, 'Salary record deleted successfully', { salary_id: id });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = SalaryController;
