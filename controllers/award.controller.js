const AwardModel = require('../models/award.model');
const { successResponse, errorResponse } = require('../utils/response');

class AwardController {
  static async getAwards(req, res, next) {
    try {
      const awards = await AwardModel.findAll();
      return successResponse(res, 'Awards fetched successfully', awards);
    } catch (error) {
      next(error);
    }
  }

  static async getAwardById(req, res, next) {
    try {
      const { id } = req.params;
      const award = await AwardModel.findById(id);
      if (!award) {
        return errorResponse(res, 'Award not found', null, 404);
      }
      return successResponse(res, 'Award details fetched successfully', award);
    } catch (error) {
      next(error);
    }
  }

  static async createAward(req, res, next) {
    try {
      const { action } = req.body;
      if (action === 'reset') {
        const resetList = await AwardModel.resetDefaults();
        return successResponse(res, 'Restored default accolades', resetList);
      }

      const { year, title, category, organization, location } = req.body;
      if (!title || !year) {
        return errorResponse(res, 'Title and Year are required fields', null, 400);
      }

      const newAward = await AwardModel.create({ year, title, category, organization, location });
      return successResponse(res, 'Award created successfully', newAward, 201);
    } catch (error) {
      next(error);
    }
  }

  static async updateAward(req, res, next) {
    try {
      const { id } = req.params;
      const { year, title, category, organization, location } = req.body;

      const updated = await AwardModel.update(id, { year, title, category, organization, location });
      if (!updated) {
        return errorResponse(res, 'Award not found', null, 404);
      }
      return successResponse(res, 'Award updated successfully', updated);
    } catch (error) {
      next(error);
    }
  }

  static async deleteAward(req, res, next) {
    try {
      const { id } = req.params;
      const deleted = await AwardModel.delete(id);
      if (!deleted) {
        return errorResponse(res, 'Award not found', null, 404);
      }
      return successResponse(res, 'Award deleted successfully', null);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = AwardController;
