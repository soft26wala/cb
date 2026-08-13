const express = require('express');
const ReportController = require('../controllers/report.controller');
const DashboardController = require('../controllers/dashboard.controller');
const AccountController = require('../controllers/account.controller');
const { verifyToken } = require('../middleware/auth.middleware');
const { isAdmin } = require('../middleware/admin.middleware');

const router = express.Router();

router.use(verifyToken);

// Reports available to Admin (support both mounted at /reports and /)
router.get('/gst', isAdmin, ReportController.getGstReport);
router.get('/reports/gst', isAdmin, ReportController.getGstReport);

router.get('/pst', isAdmin, ReportController.getPstReport);
router.get('/reports/pst', isAdmin, ReportController.getPstReport);

router.get('/sales', isAdmin, ReportController.getSalesReport);
router.get('/reports/sales', isAdmin, ReportController.getSalesReport);

router.get('/payments', isAdmin, ReportController.getPaymentsReport);
router.get('/reports/payments', isAdmin, ReportController.getPaymentsReport);

router.get('/purchase', isAdmin, ReportController.getPurchaseReport);
router.get('/reports/purchase', isAdmin, ReportController.getPurchaseReport);

router.get('/expense', isAdmin, ReportController.getExpenseReport);
router.get('/reports/expense', isAdmin, ReportController.getExpenseReport);

router.get('/profit', isAdmin, ReportController.getProfitReport);
router.get('/reports/profit', isAdmin, ReportController.getProfitReport);

router.get('/customer-statement/:userId', ReportController.getCustomerStatement);
router.get('/reports/customer-statement/:userId', ReportController.getCustomerStatement);

router.get('/ledger', isAdmin, AccountController.getCustomerLedger);
router.get('/reports/ledger', isAdmin, AccountController.getCustomerLedger);

router.get('/history', isAdmin, ReportController.getHistory);
router.get('/reports/history', isAdmin, ReportController.getHistory);

router.get('/credit-list', isAdmin, ReportController.getCreditList);
router.get('/reports/credit-list', isAdmin, ReportController.getCreditList);

router.get('/tax', isAdmin, ReportController.getTaxReport);
router.get('/reports/tax', isAdmin, ReportController.getTaxReport);

router.get('/pst-exempt', isAdmin, ReportController.getPstExemptReport);
router.get('/reports/pst-exempt', isAdmin, ReportController.getPstExemptReport);

router.get('/dashboard', isAdmin, DashboardController.getDashboard);
router.get('/reports/dashboard', isAdmin, DashboardController.getDashboard);

module.exports = router;
