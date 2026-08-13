const express = require('express');
const router = express.Router();
const StatementController = require('../controllers/statement.controller');
const { verifyToken } = require('../middleware/auth.middleware');

// GET /api/statement - Generate client statement by date range
router.get('/', verifyToken, StatementController.getClientStatement);

module.exports = router;
