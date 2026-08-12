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

module.exports = router;
