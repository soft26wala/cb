const { TAXES, MEASUREMENT_TYPES } = require('../config/constants');

/**
 * Calculates area square multiplier based on measurement type and dimensions
 */
const calculateAreaMultiplier = (measurementType, height = 0, width = 0) => {
  const h = parseFloat(height) || 0;
  const w = parseFloat(width) || 0;
  if (h <= 0 || w <= 0) return 1;

  switch (measurementType) {
    case MEASUREMENT_TYPES.SQFT:
      return h * w; // Dimensions in sq ft directly
    case MEASUREMENT_TYPES.SQIN:
      return (h * w) / 144; // Convert sq inches to sq ft
    case MEASUREMENT_TYPES.SQM:
      return (h * w) * 10.7639; // Convert sq meters to sq ft
    default:
      return 1;
  }
};

/**
 * Calculates item totals including GST and PST
 */
const calculateItemTotals = ({
  unitPrice,
  quantity = 1,
  measurementType = 'Sqft',
  height = 0,
  width = 0,
  gstPercent = TAXES.DEFAULT_GST,
  pstPercent = TAXES.DEFAULT_PST,
}) => {
  const qty = parseInt(quantity, 10) || 1;
  const price = parseFloat(unitPrice) || 0;
  const multiplier = calculateAreaMultiplier(measurementType, height, width);

  const rawSubtotal = price * multiplier * qty;
  const gstAmount = (rawSubtotal * parseFloat(gstPercent)) / 100;
  const pstAmount = (rawSubtotal * parseFloat(pstPercent)) / 100;
  const totalAmount = rawSubtotal + gstAmount + pstAmount;

  return {
    subtotal: parseFloat(rawSubtotal.toFixed(2)),
    gstAmount: parseFloat(gstAmount.toFixed(2)),
    pstAmount: parseFloat(pstAmount.toFixed(2)),
    totalAmount: parseFloat(totalAmount.toFixed(2)),
  };
};

module.exports = {
  calculateAreaMultiplier,
  calculateItemTotals,
};
