const ReportModel = require('../models/report.model');
const { successResponse } = require('../utils/response');

class DashboardController {
  static async getDashboard(req, res, next) {
    try {
      const dashboardMetrics = await ReportModel.getDashboardMetrics();
      return successResponse(res, 'Dashboard data fetched successfully', dashboardMetrics);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = DashboardController;
