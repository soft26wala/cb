const express = require('express');
const AccountController = require('../controllers/account.controller');
const { verifyToken } = require('../middleware/auth.middleware');
const { isAdmin } = require('../middleware/admin.middleware');

const router = express.Router();

router.use(verifyToken);

router.get('/accounts', AccountController.getAllAccounts);
router.get('/accounts/ledger/:userId', AccountController.getCustomerLedger);
router.get('/accounts/credit-list', isAdmin, AccountController.getCreditList);

module.exports = router;
