const express = require('express');
const { body } = require('express-validator');
const OrderController = require('../controllers/order.controller');
const { verifyToken } = require('../middleware/auth.middleware');
const { isAdmin } = require('../middleware/admin.middleware');
const { validate } = require('../middleware/validation.middleware');

const router = express.Router();

router.post('/verify-pst', OrderController.verifyPstNumber);

router.post(
  '/',
  verifyToken,
  [
    body('address').notEmpty().withMessage('Delivery address is required'),
    body('pincode').notEmpty().withMessage('Pincode is required'),
    body('payment_type').isIn(['Cash', 'Online', 'Credit', 'Partial', 'COD', 'cod']).withMessage('Valid payment_type required'),
    body('measurement_type').isIn(['Sqft', 'Sqin', 'Sqm']).withMessage('Valid measurement_type required'),
    body('items').isArray({ min: 1 }).withMessage('Order items array is required'),
  ],
  validate,
  OrderController.createOrder
);

router.get('/', verifyToken, OrderController.getOrders);
router.get('/invoices', verifyToken, OrderController.getInvoices);
router.get('/:id', verifyToken, OrderController.getOrderById);
router.get('/:id/invoice', verifyToken, OrderController.getInvoiceByOrderId);

router.put('/:id/status', verifyToken, OrderController.updateOrderStatus);
router.post(
  '/:id/payment',
  verifyToken,
  [
    body('amount').isNumeric().withMessage('Valid payment amount required'),
    body('payment_method').notEmpty().withMessage('Payment method required'),
  ],
  validate,
  OrderController.addPayment
);

router.delete('/:id', verifyToken, OrderController.deleteOrder);

module.exports = router;
