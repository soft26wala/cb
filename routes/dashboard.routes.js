const express = require('express');
const DashboardController = require('../controllers/dashboard.controller');

const router = express.Router();

router.get('/', DashboardController.getDashboard);
router.get('/dashboard', DashboardController.getDashboard);
router.get('/summary', DashboardController.getDashboard);

module.exports = router;
