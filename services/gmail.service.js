const { google } = require('googleapis');
const { OAuth2Client } = require('google-auth-library');
require('dotenv').config();

/**
 * Creates and configures Google OAuth2 Client using environment variables
 */
function getOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'https://developers.google.com/oauthplayground';
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

  if (!clientId || clientId.includes('your-google-client-id')) {
    throw new Error('GOOGLE_CLIENT_ID is not configured in .env');
  }
  if (!clientSecret || clientSecret.includes('your-google-client-secret')) {
    throw new Error('GOOGLE_CLIENT_SECRET is not configured in .env');
  }
  if (!refreshToken || refreshToken.includes('your-google-refresh-token')) {
    throw new Error('GOOGLE_REFRESH_TOKEN is not configured in .env');
  }

  const oAuth2Client = new OAuth2Client(clientId, clientSecret, redirectUri);
  oAuth2Client.setCredentials({ refresh_token: refreshToken });
  return oAuth2Client;
}

/**
 * Formats a raw RFC 2822 MIME message with HTML body and PDF attachment
 */
function buildRawMimeMessage({ from, to, subject, bodyText, bodyHtml, pdfBuffer, filename }) {
  const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).substring(2)}`;
  
  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
  ];

  let mimeMessage = headers.join('\r\n') + '\r\n\r\n';

  // Alternative part for text and html body
  const altBoundary = `----=_AltPart_${Date.now()}_${Math.random().toString(36).substring(2)}`;
  mimeMessage += `--${boundary}\r\n`;
  mimeMessage += `Content-Type: multipart/alternative; boundary="${altBoundary}"\r\n\r\n`;

  // Text part
  if (bodyText) {
    mimeMessage += `--${altBoundary}\r\n`;
    mimeMessage += `Content-Type: text/plain; charset="UTF-8"\r\n`;
    mimeMessage += `Content-Transfer-Encoding: 7bit\r\n\r\n`;
    mimeMessage += `${bodyText}\r\n\r\n`;
  }

  // HTML part
  if (bodyHtml) {
    mimeMessage += `--${altBoundary}\r\n`;
    mimeMessage += `Content-Type: text/html; charset="UTF-8"\r\n`;
    mimeMessage += `Content-Transfer-Encoding: 7bit\r\n\r\n`;
    mimeMessage += `${bodyHtml}\r\n\r\n`;
  }

  mimeMessage += `--${altBoundary}--\r\n\r\n`;

  // Attachment part if pdfBuffer is present
  if (pdfBuffer) {
    const base64Pdf = Buffer.isBuffer(pdfBuffer)
      ? pdfBuffer.toString('base64')
      : String(pdfBuffer).replace(/^data:application\/pdf;base64,/, '');

    const safeFilename = filename || 'Invoice.pdf';

    mimeMessage += `--${boundary}\r\n`;
    mimeMessage += `Content-Type: application/pdf; name="${safeFilename}"\r\n`;
    mimeMessage += `Content-Disposition: attachment; filename="${safeFilename}"\r\n`;
    mimeMessage += `Content-Transfer-Encoding: base64\r\n\r\n`;
    
    // Split base64 into 76-character lines (RFC standard)
    const formattedBase64 = base64Pdf.match(/.{1,76}/g)?.join('\r\n') || base64Pdf;
    mimeMessage += `${formattedBase64}\r\n\r\n`;
  }

  mimeMessage += `--${boundary}--`;

  // Convert string to URL-safe Base64 for Gmail API
  return Buffer.from(mimeMessage)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Send email with PDF attachment using Google Gmail API (OAuth 2.0)
 * Scope required: https://www.googleapis.com/auth/gmail.send
 */
async function sendInvoiceEmailViaGmail({
  to,
  invoiceNumber,
  customerName,
  totalAmount,
  companyName = 'GB Cabinet Doors Ltd.',
  pdfBuffer,
  filename,
}) {
  if (!to || !to.includes('@')) {
    throw new Error(`Invalid or missing recipient email address: "${to}"`);
  }

  const auth = getOAuth2Client();
  const gmail = google.gmail({ version: 'v1', auth });

  const formattedAmount = parseFloat(totalAmount || 0).toFixed(2);
  const cleanInvoiceNum = invoiceNumber || 'INV-10025';
  const cleanCustomer = customerName || 'Valued Customer';
  const safeFilename = filename || `Invoice_${cleanInvoiceNum}.pdf`;

  const subject = `Invoice #${cleanInvoiceNum} from ${companyName}`;

  const bodyText = `Hello ${cleanCustomer},\n\nPlease find your invoice attached.\n\nInvoice Number: ${cleanInvoiceNum}\nAmount: $${formattedAmount} CAD\n\nThank you,\n${companyName}`;

  const bodyHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b; margin: 0; padding: 24px; }
        .card { max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.06); }
        .header { background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); color: #ffffff; padding: 28px 24px; text-align: center; }
        .header h1 { margin: 0; font-size: 22px; font-weight: 700; }
        .header p { margin: 4px 0 0 0; color: #94a3b8; font-size: 13px; }
        .body { padding: 24px; font-size: 15px; line-height: 1.6; }
        .details-box { background: #f1f5f9; border-radius: 8px; padding: 16px; margin: 20px 0; border: 1px solid #cbd5e1; }
        .detail-row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #e2e8f0; }
        .detail-row:last-child { border-bottom: none; font-weight: bold; font-size: 16px; color: #0f172a; }
        .footer { background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 18px; text-align: center; color: #64748b; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="header">
          <h1>${companyName}</h1>
          <p>Invoice #${cleanInvoiceNum}</p>
        </div>
        <div class="body">
          <p>Hello <strong>${cleanCustomer}</strong>,</p>
          <p>Please find your invoice attached.</p>

          <div class="details-box">
            <div class="detail-row"><span>Invoice Number:</span> <strong>${cleanInvoiceNum}</strong></div>
            <div class="detail-row"><span>Amount:</span> <strong>$${formattedAmount} CAD</strong></div>
          </div>

          <p>Thank you,<br><strong>${companyName}</strong></p>
        </div>
        <div class="footer">
          ${companyName} &bull; Official Tax Invoice<br>
          If you have any questions, please contact our support team.
        </div>
      </div>
    </body>
    </html>
  `;

  const fromEmail = process.env.GOOGLE_EMAIL_FROM || `"${companyName}" <me>`;

  const rawMessage = buildRawMimeMessage({
    from: fromEmail,
    to,
    subject,
    bodyText,
    bodyHtml,
    pdfBuffer,
    filename: safeFilename,
  });

  const res = await gmail.users.messages.send({
    userId: 'me',
    requestBody: {
      raw: rawMessage,
    },
  });

  return {
    success: true,
    messageId: res.data.id,
    threadId: res.data.threadId,
  };
}

module.exports = {
  sendInvoiceEmailViaGmail,
  buildRawMimeMessage,
};
