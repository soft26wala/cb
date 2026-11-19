const express = require('express');
const InvoiceController = require('../controllers/invoice.controller');
const OrderController = require('../controllers/order.controller');
const { verifyToken } = require('../middleware/auth.middleware');

const router = express.Router();

// One-Click Invoice Email sending via Gmail API
router.post('/generate', verifyToken, InvoiceController.createInvoiceFromOrder);
router.post('/from-order/:orderId', verifyToken, InvoiceController.createInvoiceFromOrder);
router.post('/:invoiceId/send', verifyToken, InvoiceController.sendInvoice);

// Invoice management routes
router.get('/', verifyToken, OrderController.getInvoices);
router.get('/:id', verifyToken, OrderController.getInvoiceByOrderId);
router.post('/date', verifyToken, OrderController.updateInvoiceDate);
router.put('/date', verifyToken, OrderController.updateInvoiceDate);
router.put('/:id/date', verifyToken, OrderController.updateInvoiceDate);


// Revert / Delete invoice routes
router.delete('/:id', verifyToken, InvoiceController.revertInvoice);
router.delete('/revert/:id', verifyToken, InvoiceController.revertInvoice);
router.post('/revert', verifyToken, InvoiceController.revertInvoice);
router.post('/:id/revert', verifyToken, InvoiceController.revertInvoice);

module.exports = router;
