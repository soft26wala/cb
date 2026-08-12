const nodemailer = require('nodemailer');
require('dotenv').config();

function getTransporter() {
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!user || !pass || user.includes('your_gmail')) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    tls: { rejectUnauthorized: false },
  });
}

/**
 * Send Invoice Email to Customer with Payment Link and QR Code
 * @param {Object} options
 * @param {string} options.to - Customer email address
 * @param {Object} options.invoice - Invoice / Order object
 * @param {string} options.paymentUrl - Stripe Payment Link URL
 * @param {string} options.qrCodeDataUrl - Base64 Data URL for QR Code
 * @returns {Promise<{ success: boolean, messageId?: string, isDemo?: boolean, error?: string }>}
 */
async function sendInvoiceEmail({ to, invoice, paymentUrl, qrCodeDataUrl }) {
  const transporter = getTransporter();
  const fromEmail = process.env.SMTP_FROM || process.env.SMTP_USER || '"GB Cabinet Doors Ltd." <no-reply@gbcabinetdoors.ca>';

  const customerName = invoice.customer_name || invoice.client_name || 'Valued Client';
  const invoiceNum = invoice.invoice_number || invoice.order_number || invoice.order_id?.slice(0, 8) || 'N/A';
  const totalAmount = parseFloat(invoice.total_amount || 0).toFixed(2);
  const paidAmount = parseFloat(invoice.paid_amount || invoice.order_paid_amount || 0).toFixed(2);
  const creditAmount = parseFloat(invoice.credit_amount || invoice.remaining_amount || (totalAmount - paidAmount)).toFixed(2);

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b; margin: 0; padding: 20px; }
        .card { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.08); border: 1px solid #e2e8f0; }
        .header { background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); color: #ffffff; padding: 30px 24px; text-align: center; }
        .header h1 { margin: 0; font-size: 24px; font-weight: 700; letter-spacing: -0.5px; }
        .header p { margin: 6px 0 0 0; color: #94a3b8; font-size: 14px; }
        .body { padding: 28px 24px; }
        .greeting { font-size: 16px; margin-bottom: 16px; }
        .summary-box { background-color: #f1f5f9; border-radius: 8px; padding: 18px; margin: 20px 0; }
        .row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e2e8f0; }
        .row:last-child { border-bottom: none; font-weight: bold; }
        .pay-section { text-align: center; background: #faf5ff; border: 1px solid #e9d5ff; border-radius: 12px; padding: 24px; margin: 24px 0; }
        .btn-pay { display: inline-block; background-color: #2563eb; color: #ffffff !important; font-size: 16px; font-weight: 700; text-decoration: none; padding: 14px 28px; border-radius: 8px; box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3); margin-bottom: 16px; }
        .qr-img { width: 180px; height: 180px; margin: 12px auto; display: block; border: 4px solid #ffffff; border-radius: 8px; box-shadow: 0 4px 10px rgba(0,0,0,0.1); }
        .footer { background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 20px; text-align: center; color: #64748b; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="header">
          <h1>GB CABINET DOORS LTD.</h1>
          <p>Invoice #${invoiceNum}</p>
        </div>
        <div class="body">
          <div class="greeting">
            Hello <strong>${customerName}</strong>,
          </div>
          <p>Thank you for your order with GB Cabinet Doors Ltd. Please review your invoice details below:</p>

          <div class="summary-box">
            <div class="row"><span>Invoice Number:</span> <strong>#${invoiceNum}</strong></div>
            <div class="row"><span>Total Amount:</span> <span>$${totalAmount} CAD</span></div>
            <div class="row"><span>Paid Amount:</span> <span>$${paidAmount} CAD</span></div>
            <div class="row" style="color: #dc2626; font-size: 16px;"><span>Balance Due (Credit):</span> <strong>$${creditAmount} CAD</strong></div>
          </div>

          ${
            parseFloat(creditAmount) > 0
              ? `
            <div class="pay-section">
              <h3 style="margin-top:0; color:#4c1d95;">Pay Balance Online</h3>
              <p style="font-size:14px; color:#5b21b6; margin-bottom:16px;">Scan the QR code with your phone camera or click the button below to pay securely via Stripe:</p>
              
              <a href="${paymentUrl}" class="btn-pay" target="_blank">Pay $${creditAmount} Now &rarr;</a>

              ${qrCodeDataUrl ? `<br><img src="${qrCodeDataUrl}" class="qr-img" alt="Payment QR Code" /><p style="font-size:12px; color:#6b21a8;">Scan to Pay via Card / Apple Pay / Google Pay</p>` : ''}
            </div>
            `
              : `
            <div style="background:#f0fdf4; border:1px solid #bbf7d0; color:#166534; padding:16px; border-radius:8px; text-align:center; font-weight:bold;">
              ✓ This invoice is fully PAID. Thank you!
            </div>
            `
          }

          <p style="font-size: 13px; color: #64748b; margin-top: 24px;">
            If you have any questions or require custom specifications, please contact us at (604) 503-3711 or info@gbcabinetdoors.ca.
          </p>
        </div>
        <div class="footer">
          GB Cabinet Doors Ltd. &bull; 12885 85 Ave, Unit 104, Surrey, BC V3W 0K8<br>
          Phone: (604) 503-3711 &bull; Email: info@gbcabinetdoors.ca
        </div>
      </div>
    </body>
    </html>
  `;

  if (!transporter) {
    console.warn(`[Email Service Demo] Email to ${to} for Invoice #${invoiceNum} (SMTP not configured). Link: ${paymentUrl}`);
    return {
      success: true,
      isDemo: true,
      message: `Demo mode: Email content generated successfully. Set SMTP_USER and SMTP_PASS in .env to send real emails to ${to}.`,
    };
  }

  try {
    const info = await transporter.sendMail({
      from: fromEmail,
      to,
      subject: `Invoice #${invoiceNum} - GB Cabinet Doors Ltd.`,
      html: htmlContent,
    });
    return { success: true, messageId: info.messageId, isDemo: false };
  } catch (err) {
    console.error('Failed to send invoice email via SMTP:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Send Payment Confirmation Receipt Email
 * @param {Object} options
 * @param {string} options.to
 * @param {Object} options.invoice
 * @param {number} options.paymentAmount
 * @param {string} options.transactionId
 */
async function sendPaymentSuccessEmail({ to, invoice, paymentAmount, transactionId }) {
  const transporter = getTransporter();
  const fromEmail = process.env.SMTP_FROM || process.env.SMTP_USER || '"GB Cabinet Doors Ltd." <no-reply@gbcabinetdoors.ca>';

  const customerName = invoice.customer_name || invoice.client_name || 'Valued Client';
  const invoiceNum = invoice.invoice_number || invoice.order_number || invoice.order_id?.slice(0, 8) || 'N/A';
  const formattedAmount = parseFloat(paymentAmount || 0).toFixed(2);

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b; padding: 20px; }
        .card { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; }
        .header { background: #16a34a; color: #ffffff; padding: 24px; text-align: center; }
        .header h1 { margin: 0; font-size: 22px; }
        .body { padding: 24px; }
        .badge { background: #dcfce7; color: #15803d; padding: 12px; border-radius: 8px; text-align: center; font-weight: bold; margin: 16px 0; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="header">
          <h1>Payment Received</h1>
          <p>GB Cabinet Doors Ltd.</p>
        </div>
        <div class="body">
          <p>Hi <strong>${customerName}</strong>,</p>
          <div class="badge">
            ✓ Successfully received payment of $${formattedAmount} CAD for Invoice #${invoiceNum}
          </div>
          <p><strong>Transaction Ref:</strong> ${transactionId || 'Stripe Online'}</p>
          <p><strong>Status:</strong> Invoice marked as PAID in our system.</p>
          <p style="margin-top: 20px; color: #64748b; font-size: 13px;">Thank you for your prompt payment!</p>
        </div>
      </div>
    </body>
    </html>
  `;

  if (!transporter) {
    console.log(`[Payment Receipt Demo] Customer ${to} notified of payment $${formattedAmount} for Invoice #${invoiceNum}`);
    return { success: true, isDemo: true };
  }

  try {
    await transporter.sendMail({
      from: fromEmail,
      to,
      subject: `Payment Confirmation: Invoice #${invoiceNum} - GB Cabinet Doors Ltd.`,
      html: htmlContent,
    });
    return { success: true };
  } catch (err) {
    console.error('Failed to send payment confirmation email:', err.message);
    return { success: false, error: err.message };
  }
}

module.exports = {
  sendInvoiceEmail,
  sendPaymentSuccessEmail,
};
