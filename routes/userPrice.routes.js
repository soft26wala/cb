const express = require('express');
const { body } = require('express-validator');
const UserPriceController = require('../controllers/userPrice.controller');
const { verifyToken } = require('../middleware/auth.middleware');
const { isAdmin } = require('../middleware/admin.middleware');
const { validate } = require('../middleware/validation.middleware');

const router = express.Router();

// verifyToken runs FIRST so req.user is always populated before the controller reads it.
// The controller reads userId from req.user.id — never from the URL.
router.use(verifyToken);

// GET /api/user-prices or /api/user-prices/:userId
router.get('/:userId?', UserPriceController.getUserPrices);

// PUT /api/user-prices/:priceId  — admin only, update a user's custom price by price_id
router.put(
  '/:priceId?',
  isAdmin,
  [body('customPrice').isNumeric().withMessage('Valid custom price is required')],
  validate,
  UserPriceController.updateUserPrice
);

module.exports = router;
