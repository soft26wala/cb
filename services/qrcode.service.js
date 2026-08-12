const QRCode = require('qrcode');

/**
 * Generate base64 Data URL for a given URL or text
 * @param {string} url - The URL (e.g., Stripe Payment Link)
 * @returns {Promise<string>} Data URL string (data:image/png;base64,...)
 */
async function generatePaymentQrCode(url) {
  try {
    if (!url) return '';
    const qrDataUrl = await QRCode.toDataURL(url, {
      errorCorrectionLevel: 'M',
      type: 'image/png',
      margin: 2,
      width: 250,
      color: {
        dark: '#0f172a', // Slate 900
        light: '#ffffff',
      },
    });
    return qrDataUrl;
  } catch (err) {
    console.error('Failed to generate QR Code:', err.message);
    return '';
  }
}

/**
 * Generate QR Code as Buffer for email attachments
 * @param {string} url 
 * @returns {Promise<Buffer|null>}
 */
async function generatePaymentQrBuffer(url) {
  try {
    if (!url) return null;
    return await QRCode.toBuffer(url, {
      errorCorrectionLevel: 'M',
      type: 'image/png',
      margin: 2,
      width: 250,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
    });
  } catch (err) {
    console.error('Failed to generate QR Buffer:', err.message);
    return null;
  }
}

module.exports = {
  generatePaymentQrCode,
  generatePaymentQrBuffer,
};
