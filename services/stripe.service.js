const Stripe = require('stripe');
require('dotenv').config();

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : null;

/**
 * Create Stripe Checkout Session or Payment Link for an order credit/balance amount
 * @param {Object} order - Order object containing order_id, order_number, total_amount, credit_amount, customer_name, customer_email
 * @returns {Promise<{ sessionId: string, url: string, isDemo: boolean }>}
 */
async function createCheckoutSession(order) {
  const frontendUrl = process.env.FRONTEND_URL || process.env.CLIENT_URL || 'http://localhost:3000';
  const rawAmount = parseFloat(order.credit_amount > 0 ? order.credit_amount : order.total_amount || 0);
  const amountInCents = Math.round(rawAmount * 100);

  const orderNum = order.order_number || order.order_id?.slice(0, 8) || 'ORDER';
  const customerEmail = order.customer_email || order.email || undefined;

  if (stripe && stripeSecretKey && !stripeSecretKey.includes('your_stripe_secret_key')) {
    try {
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: (process.env.STRIPE_CURRENCY || 'cad').toLowerCase(),
              product_data: {
                name: `Invoice / Order #${orderNum}`,
                description: `Payment for Cabinet Doors Order #${orderNum}`,
              },
              unit_amount: Math.max(100, amountInCents), // Min 1.00
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        customer_email: customerEmail,
        metadata: {
          order_id: String(order.order_id),
          order_number: String(orderNum),
          credit_amount: String(rawAmount.toFixed(2)),
        },
        success_url: `${frontendUrl}/invoices?payment=success&order_id=${order.order_id}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${frontendUrl}/invoices?payment=cancelled&order_id=${order.order_id}`,
      });

      return {
        sessionId: session.id,
        url: session.url,
        isDemo: false,
      };
    } catch (err) {
      console.warn('Stripe Checkout Session creation error:', err.message);
      // Fallback demo payment URL if Stripe API fails
      const demoUrl = `${frontendUrl}/invoices?pay_order=${order.order_id}&amount=${rawAmount.toFixed(2)}`;
      return {
        sessionId: `demo_session_${Date.now()}`,
        url: demoUrl,
        isDemo: true,
        error: err.message,
      };
    }
  }

  // Demo mode URL if Stripe API Key is not set in .env
  const demoUrl = `${frontendUrl}/invoices?pay_order=${order.order_id}&amount=${rawAmount.toFixed(2)}`;
  return {
    sessionId: `demo_session_${Date.now()}`,
    url: demoUrl,
    isDemo: true,
  };
}

/**
 * Verify Stripe webhook signature
 * @param {Buffer} rawBody 
 * @param {string} signature 
 * @returns {Object} Stripe Event
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
