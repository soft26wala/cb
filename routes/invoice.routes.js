const express = require('express');
const InvoiceController = require('../controllers/invoice.controller');
const OrderController = require('../controllers/order.controller');
const { verifyToken } = require('../middleware/auth.middleware');

const router = express.Router();

// One-Click Invoice Email sending via Gmail API
router.post('/:invoiceId/send', verifyToken, InvoiceController.sendInvoice);

// Invoice management routes
router.get('/', verifyToken, OrderController.getInvoices);
router.get('/:id', verifyToken, OrderController.getInvoiceByOrderId);

module.exports = router;
