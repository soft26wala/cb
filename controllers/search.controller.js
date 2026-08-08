const ReportModel = require('../models/report.model');
const { successResponse, errorResponse } = require('../utils/response');

class SearchController {
  static async search(req, res, next) {
    try {
      const { q } = req.query;
      if (!q || q.trim() === '') {
        return errorResponse(res, 'Search query string "q" is required', null, 400);
      }

      const searchResults = await ReportModel.globalSearch(q.trim());
      return successResponse(res, 'Search results fetched successfully', searchResults);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = SearchController;
