const express = require('express');
const UserColorPriceController = require('../controllers/userColorPrice.controller');
const { verifyToken } = require('../middleware/auth.middleware');
const { isAdmin } = require('../middleware/admin.middleware');

const router = express.Router();

router.use(verifyToken);
router.get('/:userId?', UserColorPriceController.getUserColorPrices);
router.put('/:priceId?', isAdmin, UserColorPriceController.updateUserColorPrice);

module.exports = router;
