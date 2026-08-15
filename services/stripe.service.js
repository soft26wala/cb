const Stripe = require('stripe');
require('dotenv').config();

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const stripe = (stripeSecretKey && !stripeSecretKey.includes('your_stripe_secret_key')) ? new Stripe(stripeSecretKey) : null;

/**
 * Create Stripe Checkout Session or Payment Link for an order credit/balance amount
 * @param {Object} order - Order object containing order_id, order_number, total_amount, credit_amount, customer_name, customer_email
 * @returns {Promise<{ sessionId: string, url: string, isDemo: boolean } >}
 */
async function createCheckoutSession(order) {
  if (!order) {
    throw new Error('Order is required for Stripe Checkout');
  }

  const orderId = order.order_id || order.id || 'ORDER';
  const orderNum = order.order_number || order.invoice_number || String(orderId).slice(0, 8);
  const rawAmount = parseFloat(order.credit_amount !== undefined ? order.credit_amount : (order.remaining_amount !== undefined ? order.remaining_amount : (order.total_amount || 0))) || 0;
  const amountInCents = Math.round(rawAmount * 100);
  const customerEmail = order.customer_email || order.email || order.user_email || undefined;

  const publicBaseUrl = process.env.PUBLIC_PAYMENT_URL || process.env.BACKEND_PUBLIC_URL || process.env.FRONTEND_URL || 'http://localhost:3000';
  const frontendUrl = process.env.FRONTEND_URL || publicBaseUrl;
  const isLocal = publicBaseUrl.includes('localhost') || publicBaseUrl.includes('127.0.0.1');

  if (stripe) {
    try {
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: (process.env.STRIPE_CURRENCY || 'cad').toLowerCase(),
              product_data: {
                name: 'Invoice / Order #' + orderNum,
                description: 'Payment for Cabinet Doors Order #' + orderNum,
              },
              unit_amount: Math.max(100, amountInCents),
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        customer_email: customerEmail,
        metadata: {
          order_id: String(orderId),
          order_number: String(orderNum),
          credit_amount: String(rawAmount.toFixed(2)),
        },
        success_url: isLocal
          ? frontendUrl + '/invoices?payment=success&order_id=' + orderId + '&session_id={CHECKOUT_SESSION_ID}'
          : publicBaseUrl + '/invoices?payment=success&order_id=' + orderId + '&session_id={CHECKOUT_SESSION_ID}',
        cancel_url: isLocal
          ? frontendUrl + '/invoices?payment=cancelled&order_id=' + orderId
          : publicBaseUrl + '/invoices?payment=cancelled&order_id=' + orderId,
      });

      return {
        sessionId: session.id,
        url: session.url,
        isDemo: false,
      };
    } catch (err) {
      console.warn('Stripe Checkout Session creation error:', err.message);
      const demoUrl = isLocal
        ? 'https://buy.stripe.com/pay?order=' + orderId + '&amount=' + rawAmount.toFixed(2)
        : publicBaseUrl + '/invoices?pay_order=' + orderId + '&amount=' + rawAmount.toFixed(2);
      return {
        sessionId: 'demo_session_' + Date.now(),
        url: demoUrl,
        isDemo: true,
        error: err.message,
      };
    }
  }

  const demoUrl = isLocal
    ? 'https://buy.stripe.com/pay?order=' + orderId + '&amount=' + rawAmount.toFixed(2)
    : publicBaseUrl + '/invoices?pay_order=' + orderId + '&amount=' + rawAmount.toFixed(2);
  return {
    sessionId: 'demo_session_' + Date.now(),
    url: demoUrl,
    isDemo: true,
  };
}

/**
 * Verify Stripe webhook signature
 */
function constructWebhookEvent(rawBody, signature) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !webhookSecret) {
    throw new Error('Stripe is not configured or STRIPE_WEBHOOK_SECRET is missing');
  }
  return stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
}

module.exports = {
  stripe,
  createCheckoutSession,
  constructWebhookEvent,
};