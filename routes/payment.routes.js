const express = require('express');
const PaymentController = require('../controllers/payment.controller');
const { verifyToken } = require('../middleware/auth.middleware');

const router = express.Router();

// Generate or fetch Stripe Payment Link & QR Code
router.get('/pay-link/:orderId', PaymentController.getPaymentLinkAndQr);
router.post('/pay-link/:orderId', PaymentController.getPaymentLinkAndQr);

// Send Invoice Email with Pay Link & QR Code to Customer Gmail
router.post('/send-invoice-email/:orderId', PaymentController.sendInvoiceEmail);

// Stripe Webhook Endpoint (Must receive raw body)
router.post('/webhook', PaymentController.handleStripeWebhook);




// Delete wrong payment entry completely and restore credit balance
router.delete('/:paymentId', verifyToken, async (req, res, next) => {
  try {
    const { paymentId } = req.params;
    const OrderModel = require('../models/order.model');
    const deleted = await OrderModel.deletePayment(paymentId);
    return res.status(200).json({ success: true, message: 'Payment entry removed successfully', data: deleted });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
