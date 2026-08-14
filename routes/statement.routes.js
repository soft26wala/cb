const express = require('express');
const router = express.Router();
const StatementController = require('../controllers/statement.controller');
const { verifyToken } = require('../middleware/auth.middleware');

// GET /api/statement - Generate single client statement by date range
router.get('/', verifyToken, StatementController.getClientStatement);

// GET /api/statement/summary-list - Fetch all clients statement summary list
router.get('/summary-list', verifyToken, StatementController.getAllClientsStatementSummary);

module.exports = router;
