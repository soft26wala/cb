const CategoryModel = require('../models/category.model');
const { successResponse, errorResponse } = require('../utils/response');
const { recordHistory } = require('../services/audit.service');

class CategoryController {
  static async getCategories(req, res, next) {
    try {
      const { search, status, availableOnly } = req.query;
      let categories;
      if (availableOnly === 'true' || availableOnly === '1') {
        categories = await CategoryModel.findAvailableCategories({ search, status });
      } else {
        categories = await CategoryModel.findAll({ search, status });
      }
      return successResponse(res, 'Categories fetched successfully', categories);
    } catch (error) {
      next(error);
    }
  }

  static async getCategoryById(req, res, next) {
    try {
      const { id } = req.params;
      const category = await CategoryModel.findById(id);
      if (!category) {
        return errorResponse(res, 'Category not found', null, 404);
      }
      return successResponse(res, 'Category details fetched successfully', category);
    } catch (error) {
      next(error);
    }
  }

  static async createCategory(req, res, next) {
    try {
      const { category_name, description, status } = req.body;
      const newCategory = await CategoryModel.create({ category_name, description, status });

      await recordHistory({
        userId: req.user.id,
        action: 'INSERT',
        tableName: 'category',
        recordId: newCategory.category_id,
        newData: newCategory,
        ipAddress: req.ip,
      });

      return successResponse(res, 'Category created successfully', newCategory, 201);
    } catch (error) {
      next(error);
    }
  }

  static async updateCategory(req, res, next) {
    try {
      const { id } = req.params;
      const existingCategory = await CategoryModel.findById(id);
      if (!existingCategory) {
        return errorResponse(res, 'Category not found', null, 404);
      }

      const updatedCategory = await CategoryModel.update(id, req.body);

      await recordHistory({
        userId: req.user.id,
        action: 'UPDATE',
        tableName: 'category',
        recordId: id,
        oldData: existingCategory,
        newData: updatedCategory,
        ipAddress: req.ip,
      });

      return successResponse(res, 'Category updated successfully', updatedCategory);
    } catch (error) {
      next(error);
    }
  }

  static async deleteCategory(req, res, next) {
    try {
      const { id } = req.params;
      const existingCategory = await CategoryModel.findById(id);
      if (!existingCategory) {
        return errorResponse(res, 'Category not found', null, 404);
      }

      await CategoryModel.delete(id);

      await recordHistory({
        userId: req.user.id,
        action: 'DELETE',
        tableName: 'category',
        recordId: id,
        oldData: existingCategory,
        ipAddress: req.ip,
      });

      return successResponse(res, 'Category deleted successfully', { category_id: id });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = CategoryController;
