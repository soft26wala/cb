const OrderModel = require('../models/order.model');
const InvoiceModel = require('../models/invoice.model');
const stripeService = require('../services/stripe.service');
const qrcodeService = require('../services/qrcode.service');
const emailService = require('../services/email.service');
const { successResponse, errorResponse } = require('../utils/response');

class PaymentController {
  /**
   * Generate or retrieve Stripe Payment Link & QR Code Data URL for an order/invoice
   */
  static async getPaymentLinkAndQr(req, res) {
    try {
      const orderId = req.params.orderId || req.params.id;
      if (!orderId) {
        return errorResponse(res, 'Order ID is required', null, 400);
      }

      let order = await OrderModel.findById(orderId);
      if (!order) {
        order = await InvoiceModel.findByOrderId(orderId);
      }

      if (!order) {
        return errorResponse(res, 'Order or Invoice not found', null, 444);
      }

      const session = await stripeService.createCheckoutSession(order);
      const qrCodeDataUrl = await qrcodeService.generatePaymentQrCode(session.url);

      return successResponse(res, 'Payment link and QR Code generated successfully', {
        orderId: order.order_id,
        invoiceNumber: order.invoice_number || order.order_number,
        creditAmount: order.credit_amount || order.remaining_amount || 0,
        paymentUrl: session.url,
        qrCodeDataUrl,
        sessionId: session.sessionId,
        isDemo: session.isDemo,
      });
    } catch (err) {
      console.error('Error generating payment link/QR code:', err);
      return errorResponse(res, err.message || 'Failed to generate payment link', null, 500);
    }
  }

  /**
   * Send Invoice Email with Stripe Payment Link & Embedded QR Code to Customer's Gmail
   */
  static async sendInvoiceEmail(req, res) {
    try {
      const orderId = req.params.orderId || req.params.id;
      const customEmail = req.body.email || req.body.to;

      let order = await OrderModel.findById(orderId);
      if (!order) {
        order = await InvoiceModel.findByOrderId(orderId);
      }

      if (!order) {
        return errorResponse(res, 'Order or Invoice not found', null, 404);
      }

      const recipientEmail = customEmail || order.customer_email || order.email || order.user_email;
      if (!recipientEmail) {
        return errorResponse(res, 'Customer email is missing for this invoice', null, 400);
      }

      const session = await stripeService.createCheckoutSession(order);
      const qrCodeDataUrl = await qrcodeService.generatePaymentQrCode(session.url);

      const result = await emailService.sendInvoiceEmail({
        to: recipientEmail,
        invoice: order,
        paymentUrl: session.url,
        qrCodeDataUrl,
      });

      if (!result.success) {
        return errorResponse(res, result.error || 'Failed to send invoice email', null, 500);
      }

      return successResponse(res, `Invoice email successfully dispatched to ${recipientEmail}`, {
        recipientEmail,
        paymentUrl: session.url,
        isDemo: result.isDemo,
        message: result.message,
      });
    } catch (err) {
      console.error('Error in sendInvoiceEmail controller:', err);
      return errorResponse(res, err.message || 'Failed to send invoice email', null, 500);
    }
  }

  /**
   * Stripe Webhook Handler - Auto updates DB status from Credit to Paid upon successful payment
   */
  static async handleStripeWebhook(req, res) {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
      if (process.env.STRIPE_WEBHOOK_SECRET && sig) {
        event = stripeService.constructWebhookEvent(req.body, sig);
      } else {
        // Dev fallback if raw body is parsed or webhook secret is not set
        event = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      }
    } catch (err) {
      console.error(`Stripe Webhook Signature Verification Error: ${err.message}`);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
      if (event.type === 'checkout.session.completed' || event.type === 'payment_intent.succeeded') {
        const sessionOrIntent = event.data.object;
        const metadata = sessionOrIntent.metadata || {};
        const orderId = metadata.order_id;
        const rawAmount = sessionOrIntent.amount_total ? sessionOrIntent.amount_total / 100 : (sessionOrIntent.amount ? sessionOrIntent.amount / 100 : parseFloat(metadata.credit_amount || 0));

        if (orderId && rawAmount > 0) {
          console.log(`💳 Stripe Webhook: Processing Payment of $${rawAmount} for Order ID ${orderId}`);
          
          // Add payment, update orders.paid_amount, set orders.credit_amount = 0, update invoice.payment_status = 'Paid'
          const updatedOrder = await OrderModel.addPayment(
            orderId,
            rawAmount,
            'Stripe Online'
          );

          // Trigger Payment Receipt Email to Customer
          const recipientEmail = updatedOrder.customer_email || sessionOrIntent.customer_email || metadata.customer_email;
          if (recipientEmail) {
            await emailService.sendPaymentSuccessEmail({
              to: recipientEmail,
              invoice: updatedOrder,
              paymentAmount: rawAmount,
              transactionId: sessionOrIntent.id || 'Stripe-Online',
            });
          }
        }
      }

      return res.status(200).json({ received: true });
    } catch (err) {
      console.error('Error handling Stripe webhook:', err);
      return res.status(500).json({ error: err.message });
    }
  }
}

module.exports = PaymentController;
