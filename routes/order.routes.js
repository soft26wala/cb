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
  OrderController.createOrder
);

router.put(
  '/:id',
  verifyToken,
  OrderController.updateOrder
);

router.get('/', verifyToken, OrderController.getOrders);
router.get('/invoices', verifyToken, OrderController.getInvoices);
router.get('/:id', verifyToken, OrderController.getOrderById);
router.get('/:id/invoice', verifyToken, OrderController.getInvoiceByOrderId);

router.put('/:id/status', verifyToken, OrderController.updateOrderStatus);
router.put('/:id/delivery-discount', verifyToken, OrderController.updateDeliveryAndDiscount);
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
