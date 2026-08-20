/**
 * Calculates area square multiplier based on measurement type and dimensions
 */
const calculateAreaMultiplier = (measurementType, height = 0, width = 0, measurementUnit = 'INCH') => {
  const h = parseFloat(height) || 0;
  const w = parseFloat(width) || 0;
  if (h <= 0 || w <= 0) return 1;

  const isMM = (measurementUnit || 'INCH').toUpperCase() === 'MM';
  if (isMM) {
    return (h * w) / 92903.04;
  }
  return (h * w) / 144;
};

/**
 * Calculates item totals including GST and PST
 */
const calculateItemTotals = ({
  unitPrice,
  quantity = 1,
  measurementType = 'Sqft',
  measurementUnit = 'INCH',
  height = 0,
  width = 0,
  gstPercent = TAXES.DEFAULT_GST,
  pstPercent = TAXES.DEFAULT_PST,
}) => {
  const qty = parseInt(quantity, 10) || 1;
  const price = parseFloat(unitPrice) || 0;
  const multiplier = calculateAreaMultiplier(measurementType, height, width, measurementUnit);

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

/**
 * Calculates door sizing calculations (Panel Height/Width, Stile Length/Qty, Rail Length/Qty)
 */
const calculateSizingRow = ({
  quantity = 1,
  doorHeight = 0,
  doorWidth = 0,
  railSize = 2.25,
  measurementUnit = 'INCH',
}) => {
  const qty = parseInt(quantity, 10) || 1;
  const dh = Math.max(0.1, parseFloat(doorHeight) || 0);
  const dw = Math.max(0.1, parseFloat(doorWidth) || 0);
  const rs = parseFloat(railSize) || 2.25;

  const doubleRail = rs * 2;
  const isMM = (measurementUnit || 'INCH').toUpperCase() === 'MM';
  const allowance = isMM ? 19.05 : 0.75;
  const decimals = isMM ? 2 : 3;

  const panelHeight = Math.max(0, dh - doubleRail + allowance);
  const panelWidth = Math.max(0, dw - doubleRail + allowance);

  const stileLength = dh;
  const stileQuantity = qty * 2;

  const railLength = Math.max(0, dw - doubleRail);
  const railQuantity = qty * 2;

  return {
    quantity: qty,
    doorHeight: parseFloat(dh.toFixed(decimals)),
    doorWidth: parseFloat(dw.toFixed(decimals)),
    panelHeight: parseFloat(panelHeight.toFixed(decimals)),
    panelWidth: parseFloat(panelWidth.toFixed(decimals)),
    stileLength: parseFloat(stileLength.toFixed(decimals)),
    stileQuantity,
    railLength: parseFloat(railLength.toFixed(decimals)),
    railQuantity,
    measurementUnit: isMM ? 'MM' : 'INCH',
  };
};

/**
 * Consolidates cut lists for Panels, Stiles, and Rails
 */
const calculateCutLists = (sizingRows = []) => {
  const panelMap = new Map();
  const stileMap = new Map();
  const railMap = new Map();

  for (const row of sizingRows) {
    const qty = parseInt(row.quantity, 10) || 1;
    const ph = parseFloat(row.panel_height ?? row.panelHeight) || 0;
    const pw = parseFloat(row.panel_width ?? row.panelWidth) || 0;
    const sl = parseFloat(row.stile_length ?? row.stileLength) || 0;
    const sq = parseInt(row.stile_quantity ?? row.stileQuantity, 10) || (qty * 2);
    const rl = parseFloat(row.rail_length ?? row.railLength) || 0;
    const rq = parseInt(row.rail_quantity ?? row.railQuantity, 10) || (qty * 2);
    const prodName = row.product_name || row.productName || 'Cabinet Door';
    const catName = row.category_name || row.categoryName || '';

    // 1. Panel Grouping
    const panelKey = `${ph}_${pw}_${prodName}`;
    if (panelMap.has(panelKey)) {
      const existing = panelMap.get(panelKey);
      existing.quantity += qty;
    } else {
      panelMap.set(panelKey, {
        panelHeight: ph,
        panelWidth: pw,
        productName: prodName,
        categoryName: catName,
        quantity: qty,
      });
    }

    // 2. Stile Grouping
    const stileKey = `${sl}`;
    if (stileMap.has(stileKey)) {
      const existing = stileMap.get(stileKey);
      existing.totalPieces += sq;
    } else {
      stileMap.set(stileKey, {
        stileLength: sl,
        totalPieces: sq,
      });
    }

    // 3. Rail Grouping
    const railKey = `${rl}`;
    if (railMap.has(railKey)) {
      const existing = railMap.get(railKey);
      existing.totalPieces += rq;
    } else {
      railMap.set(railKey, {
        railLength: rl,
        totalPieces: rq,
      });
    }
  }

  return {
    panels: Array.from(panelMap.values()).sort((a, b) => b.panelHeight - a.panelHeight),
    stiles: Array.from(stileMap.values()).sort((a, b) => b.stileLength - a.stileLength),
    rails: Array.from(railMap.values()).sort((a, b) => b.railLength - a.railLength),
  };
};

module.exports = {
  calculateAreaMultiplier,
  calculateItemTotals,
  calculateSizingRow,
  calculateCutLists,
};
