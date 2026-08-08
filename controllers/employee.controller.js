const EmployeeModel = require('../models/employee.model');
const { successResponse, errorResponse } = require('../utils/response');
const { recordHistory } = require('../services/audit.service');

class EmployeeController {
  static async getEmployees(req, res, next) {
    try {
      const { search, status, limit, offset } = req.query;
      const employees = await EmployeeModel.findAll({
        search,
        status,
        limit: parseInt(limit, 10) || 50,
        offset: parseInt(offset, 10) || 0,
      });
      return successResponse(res, 'Employees fetched successfully', employees);
    } catch (error) {
      next(error);
    }
  }

  static async getEmployeeById(req, res, next) {
    try {
      const { id } = req.params;
      const employee = await EmployeeModel.findById(id);
      if (!employee) {
        return errorResponse(res, 'Employee not found', null, 404);
      }
      return successResponse(res, 'Employee details fetched successfully', employee);
    } catch (error) {
      next(error);
    }
  }

  static async createEmployee(req, res, next) {
    try {
      const newEmployee = await EmployeeModel.create(req.body);

      await recordHistory({
        userId: req.user.id,
        action: 'INSERT',
        tableName: 'employees',
        recordId: newEmployee.employee_id,
        newData: newEmployee,
        ipAddress: req.ip,
      });

      return successResponse(res, 'Employee created successfully', newEmployee, 201);
    } catch (error) {
      next(error);
    }
  }

  static async updateEmployee(req, res, next) {
    try {
      const { id } = req.params;
      const existingEmployee = await EmployeeModel.findById(id);
      if (!existingEmployee) {
        return errorResponse(res, 'Employee not found', null, 404);
      }

      const updatedEmployee = await EmployeeModel.update(id, req.body);

      await recordHistory({
        userId: req.user.id,
        action: 'UPDATE',
        tableName: 'employees',
        recordId: id,
        oldData: existingEmployee,
        newData: updatedEmployee,
        ipAddress: req.ip,
      });

      return successResponse(res, 'Employee updated successfully', updatedEmployee);
    } catch (error) {
      next(error);
    }
  }

  static async deleteEmployee(req, res, next) {
    try {
      const { id } = req.params;
      const existingEmployee = await EmployeeModel.findById(id);
      if (!existingEmployee) {
        return errorResponse(res, 'Employee not found', null, 404);
      }

      await EmployeeModel.delete(id);

      await recordHistory({
        userId: req.user.id,
        action: 'DELETE',
        tableName: 'employees',
        recordId: id,
        oldData: existingEmployee,
        ipAddress: req.ip,
      });

      return successResponse(res, 'Employee deleted successfully', { employee_id: id });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = EmployeeController;
