const express = require('express');
const FinancialYearController = require('../controllers/financialYear.controller');
const { verifyToken } = require('../middleware/auth.middleware');
const { isAdmin } = require('../middleware/admin.middleware');

const router = express.Router();

router.use(verifyToken);

router.get('/', FinancialYearController.getFinancialYears);
router.get('/financial-years', FinancialYearController.getFinancialYears);
router.post('/close', isAdmin, FinancialYearController.closeFinancialYear);
router.post('/financial-year/close', isAdmin, FinancialYearController.closeFinancialYear);

module.exports = router;
