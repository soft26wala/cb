const InvoiceModel = require('../models/invoice.model');
const OrderModel = require('../models/order.model');
const { sendInvoiceEmailViaGmail } = require('../services/gmail.service');
const { generateServerInvoicePdf } = require('../utils/pdfGenerator');
const { successResponse, errorResponse } = require('../utils/response');
const { recordHistory } = require('../services/audit.service');

class InvoiceController {
  static async createInvoiceFromOrder(req, res, next) {
    try {
      const { order_id, orderId, invoice_date, invoiceDate } = req.body || {};
      const targetOrderId = order_id || orderId || req.params.orderId;
      const targetDate = invoice_date || invoiceDate;

      if (!targetOrderId) {
        return errorResponse(res, 'Order ID is required to generate invoice', null, 400);
      }

      const invoice = await InvoiceModel.generateInvoiceFromOrder(targetOrderId, {
        invoiceDate: targetDate,
        createdBy: req.user?.id,
      });

      await recordHistory({
        userId: req.user?.id,
        action: 'INSERT',
        tableName: 'invoice',
        recordId: invoice.invoice_id,
        newData: invoice,
        ipAddress: req.ip,
      });

      return successResponse(res, 'Invoice generated successfully', invoice, 201);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/invoices/:invoiceId/send
   * One-Click Invoice Email sending via Google Gmail API
   */
  static async sendInvoice(req, res, next) {
    try {
      const { invoiceId } = req.params;
      const { email: customEmail, pdfBase64 } = req.body || {};

      if (!invoiceId) {
        return errorResponse(res, 'Invoice ID parameter is required', null, 400);
      }

      // 1. Fetch Invoice from Database (by invoice_id or order_id)
      let invoice = await InvoiceModel.findById(invoiceId);
      if (!invoice) {
        invoice = await InvoiceModel.findByOrderId(invoiceId);
      }

      if (!invoice) {
        return errorResponse(res, `Invoice not found for ID: ${invoiceId}`, null, 404);
      }

      // 2. Verify Customer Email
      const recipientEmail = (customEmail || invoice.customer_email || invoice.email || '').trim();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      if (!recipientEmail || !emailRegex.test(recipientEmail)) {
        return errorResponse(
          res,
          `Customer email address is missing or invalid: "${recipientEmail || 'None'}"`,
          null,
          400
        );
      }

      // 3. Prepare PDF Attachment
      let pdfBuffer = null;
      if (pdfBase64 && typeof pdfBase64 === 'string' && pdfBase64.length > 50) {
        const cleanBase64 = pdfBase64.replace(/^data:application\/pdf;base64,/, '');
        pdfBuffer = Buffer.from(cleanBase64, 'base64');
      } else {
        // Fallback: Generate PDF on Server
        pdfBuffer = generateServerInvoicePdf(invoice);
      }

      if (!pdfBuffer || pdfBuffer.length === 0) {
        return errorResponse(res, 'Failed to generate or process PDF attachment for invoice', null, 500);
      }

      // 4. Send Email via Google Gmail API (OAuth 2.0)
      const companyName = invoice.company_credentials?.company_name || 'GB Cabinet Doors Ltd.';
      const invoiceNumber = invoice.invoice_number || 'INV-10025';
      const customerName = invoice.customer_name || 'Valued Customer';
      const totalAmount = invoice.total_amount || 0;
      const filename = `Invoice_${invoiceNumber}.pdf`;

      let sendResult;
      try {
        sendResult = await sendInvoiceEmailViaGmail({
          to: recipientEmail,
          invoiceNumber,
          customerName,
          totalAmount,
          companyName,
          pdfBuffer,
          filename,
        });
      } catch (gmailErr) {
        console.error('Gmail API Error sending invoice:', gmailErr.message);

        // Update database with failure record
        await InvoiceModel.updateEmailStatus(invoice.invoice_id || invoiceId, {
          email_sent: false,
          email_error: gmailErr.message,
        }).catch(() => {});

        return errorResponse(
          res,
          `Gmail API email delivery failed: ${gmailErr.message}`,
          { error: gmailErr.message },
          500
        );
      }

      // 5. Update Database Record on Success
      await InvoiceModel.updateEmailStatus(invoice.invoice_id || invoiceId, {
        email_sent: true,
        email_sent_at: new Date(),
        email_message_id: sendResult.messageId,
        email_error: null,
      }).catch((e) => console.warn('Failed to update email status in DB:', e.message));

      // Audit Log
      await recordHistory({
        userId: req.user ? req.user.id : null,
        action: 'OTHER',
        tableName: 'invoice_emails',
        recordId: invoice.invoice_id || invoiceId,
        newData: {
          recipientEmail,
          invoiceNumber,
          messageId: sendResult.messageId,
          timestamp: new Date().toISOString(),
        },
        ipAddress: req.ip,
      }).catch(() => {});

      return successResponse(res, `Invoice email sent successfully to ${recipientEmail} via Gmail API`, {
        invoice_id: invoice.invoice_id || invoiceId,
        invoice_number: invoiceNumber,
        recipient: recipientEmail,
        messageId: sendResult.messageId,
        email_sent: true,
        email_sent_at: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = InvoiceController;
