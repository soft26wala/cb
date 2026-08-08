/**
 * Helper utility to validate Provincial Sales Tax (PST) registration numbers.
 * In British Columbia, PST numbers are 8-digit numbers, often prefixed with 'PST-' (e.g. PST-1234-5678 or PST12345678).
 */

function validatePstNumber(rawPstNumber) {
  if (!rawPstNumber || typeof rawPstNumber !== 'string') {
    return {
      valid: false,
      pstNumber: '',
      message: 'PST Number is required.',
    };
  }

  const cleaned = rawPstNumber.trim().toUpperCase();

  if (!cleaned) {
    return {
      valid: false,
      pstNumber: '',
      message: 'PST Number cannot be empty.',
    };
  }

  // Regex pattern matching standard PST formats:
  // e.g., "PST-1234-5678", "PST12345678", "PST-12345678", or 8 digits "12345678"
  const pstRegex = /^(PST-?)?\d{4}-?\d{4}$/i;

  if (!pstRegex.test(cleaned)) {
    return {
      valid: false,
      pstNumber: cleaned,
      message: 'Invalid PST Number format. Standard format is PST-XXXX-XXXX (8 digits).',
    };
  }

  // Extract pure digits
  const digitsOnly = cleaned.replace(/\D/g, '');

  if (digitsOnly.length !== 8) {
    return {
      valid: false,
      pstNumber: cleaned,
      message: 'PST Number must contain exactly 8 digits.',
    };
  }

  // Check for dummy invalid numbers (e.g., all 0s, all same digits like 00000000, 11111111)
  const isAllSameDigit = /^(\d)\1{7}$/.test(digitsOnly);
  if (isAllSameDigit) {
    return {
      valid: false,
      pstNumber: cleaned,
      message: 'Invalid PST registration number.',
    };
  }

  // Format to standard normalized format: "PST-XXXX-XXXX"
  const formattedPst = `PST-${digitsOnly.slice(0, 4)}-${digitsOnly.slice(4)}`;

  return {
    valid: true,
    pstNumber: formattedPst,
    message: 'PST Number verified successfully.',
  };
}

module.exports = {
  validatePstNumber,
};
