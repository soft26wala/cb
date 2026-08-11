const express = require('express');
const router = express.Router();
const ColorController = require('../controllers/color.controller');

router.get('/', ColorController.getAllColors);
router.post('/', ColorController.createColor);

module.exports = router;
