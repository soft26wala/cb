const db = require('../config/db');
const { calculateItemTotals, calculateSizingRow, calculateCutLists } = require('../utils/calculations');
const { addLedgerTransaction } = require('../services/ledger.service');
const { validatePstNumber } = require('../utils/pstValidator');

// Helper function to ensure PST & Sizing columns exist
const ensureSizingColumnsExist = async () => {
  try {
    await db.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS custom_client_name VARCHAR(255);`);
    await db.query(`ALTER TABLE orders ALTER COLUMN user_id DROP NOT NULL;`);
    await db.query(`ALTER TABLE invoice ALTER COLUMN user_id DROP NOT NULL;`);
    await db.query(`ALTER TABLE invoice ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'Issued';`);
    await db.query(`ALTER TABLE orders DROP COLUMN IF EXISTS hinge_prep;`);
    await db.query(`ALTER TABLE orders DROP COLUMN IF EXISTS lock_bore_prep;`);
    await db.query(`ALTER TABLE orders DROP COLUMN IF EXISTS handing;`);
    await db.query(`ALTER TABLE orders DROP COLUMN IF EXISTS jamb_size;`);
    await db.query(`ALTER TABLE orders DROP COLUMN IF EXISTS custom_notes;`);
    await db.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS pst_number VARCHAR(50);`);
    await db.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS pst_verified BOOLEAN DEFAULT FALSE;`);
    await db.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS pst_exempt BOOLEAN DEFAULT FALSE;`);
    await db.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS pst_verification_date TIMESTAMP WITH TIME ZONE;`);
    await db.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_charge NUMERIC(12, 2) DEFAULT 0;`);
    await db.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12, 2) DEFAULT 0;`);
    await db.query(`ALTER TABLE invoice ADD COLUMN IF NOT EXISTS delivery_charge NUMERIC(12, 2) DEFAULT 0;`);
    await db.query(`ALTER TABLE invoice ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12, 2) DEFAULT 0;`);

    await db.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_number VARCHAR(100);`);
    await db.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS po_number VARCHAR(100);`);
    await db.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_date DATE DEFAULT CURRENT_DATE;`);
    await db.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_date DATE;`);
    await db.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS finishing VARCHAR(150);`);
    await db.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS color VARCHAR(150);`);
    await db.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS panel_profile VARCHAR(150);`);
    await db.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS edge_profile VARCHAR(150);`);
    await db.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS measurement_unit VARCHAR(10) DEFAULT 'INCH';`);
    await db.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS rail_size NUMERIC(12, 3) DEFAULT 2.250;`);
    await db.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS stile_size NUMERIC(12, 3) DEFAULT 2.250;`);
    await db.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS door_thickness NUMERIC(10, 3) DEFAULT 0.750;`);
    await db.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS panel_thickness NUMERIC(10, 3) DEFAULT 0.250;`);
    await db.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS wood_species VARCHAR(150);`);
    await db.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS material VARCHAR(150);`);
    await db.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS door_style VARCHAR(150);`);
    await db.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS grain_direction VARCHAR(100);`);
    await db.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS stain_color VARCHAR(150);`);
    await db.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS glass_type VARCHAR(150);`);
    await db.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS glass_thickness NUMERIC(10, 3);`);
    await db.query(`ALTER TABLE order_sizing_items ADD COLUMN IF NOT EXISTS door_height_text VARCHAR(50);`);
    await db.query(`ALTER TABLE order_sizing_items ADD COLUMN IF NOT EXISTS door_width_text VARCHAR(50);`);
    await db.query(`ALTER TABLE order_sizing_items ADD COLUMN IF NOT EXISTS area NUMERIC(12, 4) DEFAULT 0;`);
    await db.query(`ALTER TABLE order_sizing_items ADD COLUMN IF NOT EXISTS price NUMERIC(12, 2) DEFAULT 0;`);
    await db.query(`ALTER TABLE order_sizing_items ADD COLUMN IF NOT EXISTS total NUMERIC(12, 2) DEFAULT 0;`);

    await db.query(`
      CREATE TABLE IF NOT EXISTS order_sizing_items (
        sizing_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        order_id UUID NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
        category_id UUID REFERENCES category(category_id) ON DELETE SET NULL,
        product_id UUID REFERENCES products(p_id) ON DELETE SET NULL,
        description TEXT,
        quantity INT NOT NULL DEFAULT 1,
        door_height NUMERIC(12, 3) NOT NULL DEFAULT 0.000,
        door_width NUMERIC(12, 3) NOT NULL DEFAULT 0.000,
        door_height_text VARCHAR(50),
        door_width_text VARCHAR(50),
        area NUMERIC(12, 4) DEFAULT 0,
        price NUMERIC(12, 2) DEFAULT 0,
        total NUMERIC(12, 2) DEFAULT 0,
        panel_height NUMERIC(12, 3) NOT NULL DEFAULT 0.000,
        panel_width NUMERIC(12, 3) NOT NULL DEFAULT 0.000,
        stile_length NUMERIC(12, 3) NOT NULL DEFAULT 0.000,
        stile_quantity INT NOT NULL DEFAULT 0,
        rail_length NUMERIC(12, 3) NOT NULL DEFAULT 0.000,
        rail_quantity INT NOT NULL DEFAULT 0,
        measurement_unit VARCHAR(10) DEFAULT 'INCH',
        sort_order INT DEFAULT 0,
        notes TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_order_sizing_items_order ON order_sizing_items(order_id);`);

    // Automatic Migration: Convert all existing Cash/COD orders to Credit/Udhar balance
    await db.query(`
      UPDATE orders 
      SET payment_type = 'Credit', 
          credit_amount = GREATEST(0, total_amount - paid_amount) 
      WHERE (LOWER(payment_type) = 'cash' OR LOWER(payment_type) = 'cod' OR payment_type IS NULL) 
        AND status != 'Cancelled';
    `);
  } catch (err) {
    // Non-blocking catch
  }
};
ensureSizingColumnsExist();

class OrderModel {
  static async createOrder(orderPayload, client = null) {
    const queryRunner = client || db;

    const {
      user_id,
      client_id,
      custom_client_name,
      customClientName,
      address = 'Default Address',
      pincode = 'V3W 0K8',
      payment_type = 'Credit',
      measurement_type = 'Sqft',
      measurement_unit = 'INCH',
      door_height = 80,
      door_width = 36,
      rail_size = 2.25,
      stile_size = 2.25,
      additional_rail_enabled = false,
      additional_rail_size = 2.25,
      additional_rail_position = '',
      door_thickness = 0.75,
      panel_thickness = 0.25,
      wood_species,
      material = 'Solid Wood',
      door_style,
      grain_direction,
      stain_color,
      glass_type,
      glass_thickness,
      glass_width,
      glass_height,
      order_number,
      po_number,
      order_date = new Date(),
      delivery_date,
      color = orderPayload.color || orderPayload.finishing || orderPayload.stain_color || 'Raw / Unfinished',
      finishing = orderPayload.color || orderPayload.finishing || 'Raw / Unfinished',
      panel_profile = 'Flat Panel',
      edge_profile = 'Standard / Square Edge',
      notes,
      items = [], // Standard pricing items or built from sizing_items
      sizing_items = [], // Dynamic sizing rows
      paid_amount = 0,
      pst_number,
      pstNumber,
    } = orderPayload;

    const finalCustomClientName = custom_client_name || customClientName || null;
    const targetUserId = user_id || client_id || null;
    if (!targetUserId && (!finalCustomClientName || String(finalCustomClientName).trim() === '')) {
      throw new Error('Client selection or Client Name is required.');
    }

    if (targetUserId) {
      // Validate User ID exists
      const userCheck = await queryRunner.query(`SELECT id FROM users WHERE id = $1`, [targetUserId]);
      if (userCheck.rows.length === 0) {
        throw new Error('Selected client does not exist.');
      }
    }

    // Process Sizing Items & Validate Calculations
    const processedSizingItems = [];
    let calculatedSubtotal = 0;
    let calculatedGst = 0;
    let calculatedPst = 0;
    let calculatedTotal = 0;
    let totalDoorQuantity = 0;

    const currentRailSize = parseFloat(rail_size) || 2.25;
    const currentStileSize = parseFloat(stile_size) || 2.25;
    const currentDoorHeight = parseFloat(door_height) || 80;
    const currentDoorWidth = parseFloat(door_width) || 36;
    const currentUnit = (measurement_unit || 'INCH').toUpperCase();

    // Calculate Panel Opening (Before Manufacturing Allowance)
    const isMMUnit = currentUnit === 'MM';
    const allowanceVal = isMMUnit ? 19.05 : 0.75;
    const addRailSizeVal = additional_rail_enabled ? (parseFloat(additional_rail_size) || 2.25) : 0;
    const totalRailDeduction = (currentRailSize * 2) + addRailSizeVal;
    const totalStileDeduction = currentStileSize * 2;
    const calcPanelHeightVal = Math.max(0, currentDoorHeight - totalRailDeduction + allowanceVal);
    const calcPanelWidthVal = Math.max(0, currentDoorWidth - totalStileDeduction + allowanceVal);

    const rowsToProcess = (sizing_items && sizing_items.length > 0) ? sizing_items : items;
    if (!rowsToProcess || rowsToProcess.length === 0) {
      throw new Error('Order must contain at least one sizing row.');
    }

    for (let i = 0; i < rowsToProcess.length; i++) {
      const row = rowsToProcess[i];
      const qty = parseInt(row.quantity, 10) || 1;
      
      const dhText = String(row.door_height_text || row.door_height || row.height || '0');
      const dwText = String(row.door_width_text || row.door_width || row.width || '0');
      
      const parseFraction = (val) => {
        if (typeof val === 'number') return val;
        if (!val || String(val).trim() === '') return 0;
        const str = String(val).trim();
        if (/^-?\d+(\.\d+)?$/.test(str)) return parseFloat(str);
        const match = str.match(/^(\d+)?\s*(\d+)\/(\d+)$/);
        if (match) {
          const whole = match[1] ? parseInt(match[1], 10) : 0;
          const num = parseInt(match[2], 10);
          const den = parseInt(match[3], 10);
          if (den !== 0) return whole + (num / den);
        }
        const parsed = parseFloat(str);
        return isNaN(parsed) ? 0 : parsed;
      };

      const dh = parseFraction(dhText);
      const dw = parseFraction(dwText);

      if (dh <= 0 || dw <= 0) {
        throw new Error(`Row ${i + 1}: Valid door height and door width are required.`);
      }

      // Calculation formula
      const sizingCalc = calculateSizingRow({
        quantity: qty,
        doorHeight: dh,
        doorWidth: dw,
        railSize: currentRailSize,
        measurementUnit: currentUnit,
      });

      totalDoorQuantity += qty;

      // Price calculation
      let itemPrice = parseFloat(row.price || row.unit_price || 0);
      if (isNaN(itemPrice) || itemPrice <= 0) {
        if (row.product_id) {
          const priceRes = await queryRunner.query(
            `SELECT custom_price FROM user_prices WHERE user_id = $1 AND product_id = $2
             UNION ALL
             SELECT custom_price FROM user_prices WHERE product_id = $2
             LIMIT 1`,
            [targetUserId, row.product_id]
          );
          if (priceRes.rows.length > 0) {
            itemPrice = parseFloat(priceRes.rows[0].custom_price);
          }
        }
      }

      const itemTotals = calculateItemTotals({
        unitPrice: itemPrice,
        quantity: qty,
        measurementType: measurement_type,
        measurementUnit: currentUnit,
        height: dh,
        width: dw,
        gstPercent: 5,
        pstPercent: 7,
      });

      calculatedSubtotal += itemTotals.subtotal;
      calculatedGst += itemTotals.gstAmount;
      calculatedPst += itemTotals.pstAmount;
      calculatedTotal += itemTotals.totalAmount;

      const singleSqft = currentUnit === 'MM' ? (dh * dw) / 92903.04 : (dh * dw) / 144;
      const totalRowArea = singleSqft * qty;

      processedSizingItems.push({
        category_id: row.category_id || null,
        product_id: row.product_id || null,
        description: row.description || '',
        quantity: qty,
        door_height: dh,
        door_width: dw,
        door_height_text: dhText,
        door_width_text: dwText,
        area: parseFloat(totalRowArea.toFixed(4)),
        price: itemPrice,
        total: itemTotals.subtotal,
        panel_height: sizingCalc.panelHeight,
        panel_width: sizingCalc.panelWidth,
        stile_length: sizingCalc.stileLength,
        stile_quantity: sizingCalc.stileQuantity,
        rail_length: sizingCalc.railLength,
        rail_quantity: sizingCalc.railQuantity,
        measurement_unit: currentUnit,
        sort_order: i + 1,
        notes: row.notes || '',
      });
    }

    // Auto-generate Order Number if empty
    let finalOrderNumber = order_number;
    if (!finalOrderNumber || String(finalOrderNumber).trim() === '') {
      const year = new Date().getFullYear();
      const countRes = await queryRunner.query(`SELECT COUNT(*) as count FROM orders`);
      const nextSeq = (parseInt(countRes.rows[0].count, 10) + 1).toString().padStart(4, '0');
      finalOrderNumber = `ORD-${year}-${nextSeq}`;
    }

    const deliveryCharge = parseFloat(orderPayload.delivery_charge || orderPayload.deliveryCharge || 0) || 0;
    const discountAmount = parseFloat(orderPayload.discount_amount || orderPayload.discount || orderPayload.discountAmount || 0) || 0;
    const taxableSubtotal = Math.max(0, calculatedSubtotal - discountAmount);

    // PST Verification
    const rawPst = pst_number || pstNumber || '';
    let isPstVerified = false;
    let isPstExempt = false;
    let pstVerificationDate = null;
    let verifiedPstNumber = null;
    if (rawPst && String(rawPst).trim() !== '') {
      const pstValResult = validatePstNumber(String(rawPst));
      if (pstValResult.valid) {
        isPstVerified = true;
        isPstExempt = true;
        pstVerificationDate = new Date();
        verifiedPstNumber = pstValResult.pstNumber;
      }
    }

    const isCashOrder = Boolean(payment_type && String(payment_type).toLowerCase().includes('cash'));
    const isTaxOff = (orderPayload.gst_amount !== undefined && Number(orderPayload.gst_amount) === 0) ||
      (isCashOrder && (orderPayload.include_cash_tax === false || orderPayload.include_cash_tax === 0 || orderPayload.include_cash_tax === 'false'));

    if (isTaxOff) {
      calculatedGst = 0;
      calculatedPst = 0;
    } else {
      calculatedGst = taxableSubtotal * 0.05;
      calculatedPst = isPstExempt ? 0 : taxableSubtotal * 0.07;
    }

    calculatedTotal = calculatedSubtotal - discountAmount + deliveryCharge + calculatedGst + calculatedPst;

    let targetPaymentType = payment_type || 'Credit';
    if (targetPaymentType === 'Cash' || targetPaymentType === 'cash' || targetPaymentType === 'COD' || targetPaymentType === 'cod') {
      targetPaymentType = 'Credit';
    }

    let finalPaidAmount = parseFloat(paid_amount) || 0;
    if (targetPaymentType === 'Online') {
      finalPaidAmount = calculatedTotal;
    }

    const creditAmount = Math.max(0, calculatedTotal - finalPaidAmount);

    // Insert Order Header
    const orderQuery = `
      INSERT INTO orders (
        order_number, po_number, order_date, delivery_date, finishing, color, panel_profile, edge_profile,
        measurement_unit, door_height, door_width, rail_size, stile_size, additional_rail_enabled,
        additional_rail_size, additional_rail_position, door_thickness, panel_thickness, wood_species,
        material, door_style, grain_direction, stain_color, glass_type, glass_thickness, glass_width,
        glass_height, calculated_panel_height, calculated_panel_width, notes, user_id, custom_client_name,
        address, pincode, payment_type, measurement_type, height, width, quantity, subtotal, gst_amount,
        pst_amount, total_amount, paid_amount, credit_amount, status, pst_number, pst_verified, pst_exempt, pst_verification_date,
        delivery_charge, discount_amount
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39, $40, $41, $42, $43, $44, $45, $46, $47, $48, $49, $50, $51, $52)
      RETURNING *
    `;

    const orderValues = [
      finalOrderNumber,
      po_number || null,
      order_date || new Date(),
      delivery_date || null,
      finishing,
      color,
      panel_profile,
      edge_profile,
      currentUnit,
      currentDoorHeight,
      currentDoorWidth,
      currentRailSize,
      currentStileSize,
      Boolean(additional_rail_enabled),
      parseFloat(additional_rail_size) || 2.25,
      additional_rail_position || null,
      parseFloat(door_thickness) || 0.75,
      parseFloat(panel_thickness) || 0.25,
      wood_species || null,
      material || 'Solid Wood',
      door_style || null,
      grain_direction || null,
      stain_color || null,
      panel_profile === 'Glass Panel' ? glass_type || null : null,
      panel_profile === 'Glass Panel' && glass_thickness ? parseFloat(glass_thickness) : null,
      panel_profile === 'Glass Panel' && glass_width ? parseFloat(glass_width) : null,
      panel_profile === 'Glass Panel' && glass_height ? parseFloat(glass_height) : null,
      parseFloat(calcPanelHeightVal.toFixed(3)),
      parseFloat(calcPanelWidthVal.toFixed(3)),
      notes || null,
      targetUserId,
      finalCustomClientName,
      address,
      pincode,
      targetPaymentType,
      measurement_type,
      currentDoorHeight,
      currentDoorWidth,
      totalDoorQuantity,
      calculatedSubtotal.toFixed(2),
      calculatedGst.toFixed(2),
      calculatedPst.toFixed(2),
      calculatedTotal.toFixed(2),
      finalPaidAmount.toFixed(2),
      creditAmount.toFixed(2),
      'Pending',
      verifiedPstNumber,
      isPstVerified,
      isPstExempt,
      pstVerificationDate,
      deliveryCharge.toFixed(2),
      discountAmount.toFixed(2),
    ];

    const orderResult = await queryRunner.query(orderQuery, orderValues);
    const newOrder = orderResult.rows[0];

    // Insert Order Sizing Items
    for (const item of processedSizingItems) {
      await queryRunner.query(
        `INSERT INTO order_sizing_items (
          order_id, category_id, product_id, description, quantity, door_height, door_width,
          door_height_text, door_width_text, area, price, total,
          panel_height, panel_width, stile_length, stile_quantity, rail_length, rail_quantity,
          measurement_unit, sort_order, notes
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)`,
        [
          newOrder.order_id,
          item.category_id,
          item.product_id,
          item.description,
          item.quantity,
          item.door_height,
          item.door_width,
          item.door_height_text,
          item.door_width_text,
          item.area,
          item.price,
          item.total,
          item.panel_height,
          item.panel_width,
          item.stile_length,
          item.stile_quantity,
          item.rail_length,
          item.rail_quantity,
          item.measurement_unit,
          item.sort_order,
          item.notes,
        ]
      );

      // Insert into order_items if product_id exists
      if (item.product_id) {
        await queryRunner.query(
          `INSERT INTO order_items (order_id, product_id, price, quantity, gst, pst, total)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [newOrder.order_id, item.product_id, item.price, item.quantity, 0, 0, item.total]
        );

        // Deduct Stock
        await queryRunner.query(
          `UPDATE products SET stock = GREATEST(0, stock - $1) WHERE p_id = $2`,
          [item.quantity, item.product_id]
        );
      }
    }

    // Auto-create invoice
    try {
      const generatedInvoiceNumber = finalOrderNumber
        ? (finalOrderNumber.startsWith('ORD-') ? finalOrderNumber.replace('ORD-', 'INV-') : `INV-${finalOrderNumber}`)
        : `INV-${Date.now()}`;

      const invoicePaymentStatus = creditAmount === 0 ? 'Paid' : finalPaidAmount > 0 ? 'Partial' : 'Unpaid';

      await queryRunner.query(
        `INSERT INTO invoice (order_id, user_id, invoice_number, paid_amount, remaining_amount, payment_status, status, delivery_charge, discount_amount)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (invoice_number) DO UPDATE SET paid_amount = EXCLUDED.paid_amount, remaining_amount = EXCLUDED.remaining_amount, payment_status = EXCLUDED.payment_status, delivery_charge = EXCLUDED.delivery_charge, discount_amount = EXCLUDED.discount_amount`,
        [
          newOrder.order_id,
          targetUserId,
          generatedInvoiceNumber,
          finalPaidAmount.toFixed(2),
          creditAmount.toFixed(2),
          invoicePaymentStatus,
          'Issued',
          deliveryCharge.toFixed(2),
          discountAmount.toFixed(2),
        ]
      );
    } catch (e) {
      console.warn('Auto invoice creation warning:', e.message);
    }

    return await this.findById(newOrder.order_id, queryRunner);
  }

  static async updateOrder(orderId, orderPayload, client = null) {
    const queryRunner = client || db;

    const existingOrder = await this.findById(orderId, queryRunner);
    if (!existingOrder) {
      throw new Error('Order not found for update');
    }

    const {
      user_id,
      client_id,
      custom_client_name,
      customClientName,
      address = existingOrder.address,
      pincode = existingOrder.pincode,
      payment_type = existingOrder.payment_type,
      measurement_type = existingOrder.measurement_type,
      measurement_unit = existingOrder.measurement_unit || 'INCH',
      door_height = existingOrder.door_height || 80,
      door_width = existingOrder.door_width || 36,
      rail_size = existingOrder.rail_size || 2.25,
      stile_size = existingOrder.stile_size || 2.25,
      additional_rail_enabled = existingOrder.additional_rail_enabled || false,
      additional_rail_size = existingOrder.additional_rail_size || 2.25,
      additional_rail_position = existingOrder.additional_rail_position || '',
      door_thickness = existingOrder.door_thickness || 0.75,
      panel_thickness = existingOrder.panel_thickness || 0.25,
      wood_species = existingOrder.wood_species,
      material = existingOrder.material || 'Solid Wood',
      door_style = existingOrder.door_style,
      grain_direction = existingOrder.grain_direction,
      stain_color = existingOrder.stain_color,
      glass_type = existingOrder.glass_type,
      glass_thickness = existingOrder.glass_thickness,
      glass_width = existingOrder.glass_width,
      glass_height = existingOrder.glass_height,
      order_number = existingOrder.order_number,
      po_number = existingOrder.po_number,
      order_date = existingOrder.order_date,
      delivery_date = existingOrder.delivery_date,
      color = orderPayload.color !== undefined ? orderPayload.color : (orderPayload.finishing !== undefined ? orderPayload.finishing : existingOrder.color || existingOrder.finishing || 'Raw / Unfinished'),
      finishing = orderPayload.color !== undefined ? orderPayload.color : (orderPayload.finishing !== undefined ? orderPayload.finishing : existingOrder.finishing || 'Raw / Unfinished'),
      panel_profile = existingOrder.panel_profile,
      edge_profile = existingOrder.edge_profile,
      notes = existingOrder.notes,
      sizing_items = [],
      paid_amount = existingOrder.paid_amount,
      status = existingOrder.status,
    } = orderPayload;

    const finalCustomClientName = custom_client_name !== undefined ? custom_client_name : (customClientName !== undefined ? customClientName : existingOrder.custom_client_name);
    const targetUserId = user_id || client_id || (finalCustomClientName ? null : existingOrder.user_id);
    const currentRailSize = parseFloat(rail_size) || 2.25;
    const currentStileSize = parseFloat(stile_size) || 2.25;
    const currentDoorHeight = parseFloat(door_height) || 80;
    const currentDoorWidth = parseFloat(door_width) || 36;
    const currentUnit = (measurement_unit || 'INCH').toUpperCase();

    // Calculate Panel Opening (Before Manufacturing Allowance)
    const isMMUnit = currentUnit === 'MM';
    const allowanceVal = isMMUnit ? 19.05 : 0.75;
    const addRailSizeVal = additional_rail_enabled ? (parseFloat(additional_rail_size) || 2.25) : 0;
    const totalRailDeduction = (currentRailSize * 2) + addRailSizeVal;
    const totalStileDeduction = currentStileSize * 2;
    const calcPanelHeightVal = Math.max(0, currentDoorHeight - totalRailDeduction + allowanceVal);
    const calcPanelWidthVal = Math.max(0, currentDoorWidth - totalStileDeduction + allowanceVal);

    if (!sizing_items || sizing_items.length === 0) {
      throw new Error('Updated order must contain at least one sizing row.');
    }

    const processedSizingItems = [];
    let calculatedSubtotal = 0;
    let calculatedGst = 0;
    let calculatedPst = 0;
    let calculatedTotal = 0;
    let totalDoorQuantity = 0;

    for (let i = 0; i < sizing_items.length; i++) {
      const row = sizing_items[i];
      const qty = parseInt(row.quantity, 10) || 1;
      
      const dhText = String(row.door_height_text || row.door_height || row.height || '0');
      const dwText = String(row.door_width_text || row.door_width || row.width || '0');

      const parseFraction = (val) => {
        if (typeof val === 'number') return val;
        if (!val || String(val).trim() === '') return 0;
        const str = String(val).trim();
        if (/^-?\d+(\.\d+)?$/.test(str)) return parseFloat(str);
        const match = str.match(/^(\d+)?\s*(\d+)\/(\d+)$/);
        if (match) {
          const whole = match[1] ? parseInt(match[1], 10) : 0;
          const num = parseInt(match[2], 10);
          const den = parseInt(match[3], 10);
          if (den !== 0) return whole + (num / den);
        }
        const parsed = parseFloat(str);
        return isNaN(parsed) ? 0 : parsed;
      };

      const dh = parseFraction(dhText);
      const dw = parseFraction(dwText);

      if (dh <= 0 || dw <= 0) {
        throw new Error(`Row ${i + 1}: Valid door height and width are required.`);
      }

      const sizingCalc = calculateSizingRow({
        quantity: qty,
        doorHeight: dh,
        doorWidth: dw,
        railSize: currentRailSize,
        measurementUnit: currentUnit,
      });

      totalDoorQuantity += qty;

      let itemPrice = parseFloat(row.price || row.unit_price || 0);
      if (isNaN(itemPrice) || itemPrice <= 0) {
        if (row.product_id && targetUserId) {
          const priceRes = await queryRunner.query(
            `SELECT custom_price FROM user_prices WHERE user_id = $1 AND product_id = $2
             UNION ALL
             SELECT custom_price FROM user_prices WHERE product_id = $2
             LIMIT 1`,
            [targetUserId, row.product_id]
          );
          if (priceRes.rows.length > 0) {
            itemPrice = parseFloat(priceRes.rows[0].custom_price);
          }
        }
      }

      const itemTotals = calculateItemTotals({
        unitPrice: itemPrice,
        quantity: qty,
        measurementType: measurement_type,
        measurementUnit: currentUnit,
        height: dh,
        width: dw,
        gstPercent: 5,
        pstPercent: existingOrder.pst_exempt ? 0 : 7,
      });

      calculatedSubtotal += itemTotals.subtotal;
      calculatedGst += itemTotals.gstAmount;
      calculatedPst += itemTotals.pstAmount;
      calculatedTotal += itemTotals.totalAmount;

      const singleSqft = currentUnit === 'MM' ? (dh * dw) / 92903.04 : (dh * dw) / 144;
      const totalRowArea = singleSqft * qty;

      processedSizingItems.push({
        category_id: row.category_id || null,
        product_id: row.product_id || null,
        description: row.description || '',
        quantity: qty,
        door_height: dh,
        door_width: dw,
        door_height_text: dhText,
        door_width_text: dwText,
        area: parseFloat(totalRowArea.toFixed(4)),
        price: itemPrice,
        total: itemTotals.subtotal,
        panel_height: sizingCalc.panelHeight,
        panel_width: sizingCalc.panelWidth,
        stile_length: sizingCalc.stileLength,
        stile_quantity: sizingCalc.stileQuantity,
        rail_length: sizingCalc.railLength,
        rail_quantity: sizingCalc.railQuantity,
        measurement_unit: currentUnit,
        sort_order: i + 1,
        notes: row.notes || '',
      });
    }

    const deliveryCharge = parseFloat(orderPayload.delivery_charge !== undefined ? orderPayload.delivery_charge : (orderPayload.deliveryCharge !== undefined ? orderPayload.deliveryCharge : existingOrder.delivery_charge || 0)) || 0;
    const discountAmount = parseFloat(orderPayload.discount_amount !== undefined ? orderPayload.discount_amount : (orderPayload.discount !== undefined ? orderPayload.discount : (orderPayload.discountAmount !== undefined ? orderPayload.discountAmount : existingOrder.discount_amount || 0))) || 0;

    const taxableSubtotal = Math.max(0, calculatedSubtotal - discountAmount);
    const isCashOrder = Boolean(payment_type && String(payment_type).toLowerCase().includes('cash'));
    const isTaxOff = (orderPayload.gst_amount !== undefined && Number(orderPayload.gst_amount) === 0) ||
      (isCashOrder && (orderPayload.include_cash_tax === false || orderPayload.include_cash_tax === 0 || orderPayload.include_cash_tax === 'false'));

    if (isTaxOff) {
      calculatedGst = 0;
      calculatedPst = 0;
    } else {
      calculatedGst = taxableSubtotal * 0.05;
      calculatedPst = existingOrder.pst_exempt ? 0 : taxableSubtotal * 0.07;
    }

    calculatedTotal = calculatedSubtotal - discountAmount + deliveryCharge + calculatedGst + calculatedPst;

    const finalPaidAmount = parseFloat(paid_amount) || 0;
    const creditAmount = Math.max(0, calculatedTotal - finalPaidAmount);

    // Update order header
    const updateQuery = `
      UPDATE orders SET
        user_id = $1, custom_client_name = $2, address = $3, pincode = $4, payment_type = $5, measurement_type = $6,
        measurement_unit = $7, door_height = $8, door_width = $9, rail_size = $10, stile_size = $11,
        additional_rail_enabled = $12, additional_rail_size = $13, additional_rail_position = $14,
        door_thickness = $15, panel_thickness = $16, wood_species = $17, material = $18, door_style = $19,
        grain_direction = $20, stain_color = $21, glass_type = $22, glass_thickness = $23, glass_width = $24,
        glass_height = $25, calculated_panel_height = $26, calculated_panel_width = $27, order_number = $28, po_number = $29,
        order_date = $30, delivery_date = $31, finishing = $32, color = $32, panel_profile = $33, edge_profile = $34,
        notes = $35, height = $36, width = $37, quantity = $38, subtotal = $39, gst_amount = $40,
        pst_amount = $41, total_amount = $42, paid_amount = $43, credit_amount = $44, status = $45,
        delivery_charge = $46, discount_amount = $47,
        updated_at = CURRENT_TIMESTAMP
      WHERE order_id = $48
      RETURNING *
    `;

    await queryRunner.query(updateQuery, [
      targetUserId,
      finalCustomClientName,
      address,
      pincode,
      payment_type,
      measurement_type,
      currentUnit,
      currentDoorHeight,
      currentDoorWidth,
      currentRailSize,
      currentStileSize,
      Boolean(additional_rail_enabled),
      parseFloat(additional_rail_size) || 2.25,
      additional_rail_position || null,
      parseFloat(door_thickness) || 0.75,
      parseFloat(panel_thickness) || 0.25,
      wood_species || null,
      material || 'Solid Wood',
      door_style || null,
      grain_direction || null,
      stain_color || null,
      panel_profile === 'Glass Panel' ? glass_type || null : null,
      panel_profile === 'Glass Panel' && glass_thickness ? parseFloat(glass_thickness) : null,
      panel_profile === 'Glass Panel' && glass_width ? parseFloat(glass_width) : null,
      panel_profile === 'Glass Panel' && glass_height ? parseFloat(glass_height) : null,
      parseFloat(calcPanelHeightVal.toFixed(3)),
      parseFloat(calcPanelWidthVal.toFixed(3)),
      order_number,
      po_number || null,
      order_date,
      delivery_date || null,
      color,
      panel_profile,
      edge_profile,
      notes || null,
      currentDoorHeight,
      currentDoorWidth,
      totalDoorQuantity,
      calculatedSubtotal.toFixed(2),
      calculatedGst.toFixed(2),
      calculatedPst.toFixed(2),
      calculatedTotal.toFixed(2),
      finalPaidAmount.toFixed(2),
      creditAmount.toFixed(2),
      status,
      deliveryCharge.toFixed(2),
      discountAmount.toFixed(2),
      orderId,
    ]);

    // Clear old sizing items & order_items
    await queryRunner.query(`DELETE FROM order_sizing_items WHERE order_id = $1`, [orderId]);
    await queryRunner.query(`DELETE FROM order_items WHERE order_id = $1`, [orderId]);

    // Re-insert sizing items
    for (const item of processedSizingItems) {
      await queryRunner.query(
        `INSERT INTO order_sizing_items (
          order_id, category_id, product_id, description, quantity, door_height, door_width,
          door_height_text, door_width_text, area, price, total,
          panel_height, panel_width, stile_length, stile_quantity, rail_length, rail_quantity,
          measurement_unit, sort_order, notes
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)`,
        [
          orderId,
          item.category_id,
          item.product_id,
          item.description,
          item.quantity,
          item.door_height,
          item.door_width,
          item.door_height_text,
          item.door_width_text,
          item.area,
          item.price,
          item.total,
          item.panel_height,
          item.panel_width,
          item.stile_length,
          item.stile_quantity,
          item.rail_length,
          item.rail_quantity,
          item.measurement_unit,
          item.sort_order,
          item.notes,
        ]
      );

      if (item.product_id) {
        await queryRunner.query(
          `INSERT INTO order_items (order_id, product_id, price, quantity, gst, pst, total)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [orderId, item.product_id, item.price, item.quantity, 0, 0, item.total]
        );
      }
    }

    // Update invoice
    const paymentStatus = creditAmount === 0 ? 'Paid' : finalPaidAmount > 0 ? 'Partial' : 'Unpaid';
    await queryRunner.query(
      `UPDATE invoice SET user_id = $1, paid_amount = $2, remaining_amount = $3, payment_status = $4, delivery_charge = $5, discount_amount = $6 WHERE order_id = $7`,
      [targetUserId, finalPaidAmount.toFixed(2), creditAmount.toFixed(2), paymentStatus, deliveryCharge.toFixed(2), discountAmount.toFixed(2), orderId]
    );

    return await this.findById(orderId, queryRunner);
  }

  static async updateDeliveryAndDiscount(orderId, { delivery_charge, discount_amount }, client = null) {
    const queryRunner = client || db;
    const existingOrder = await this.findById(orderId, queryRunner);
    if (!existingOrder) throw new Error('Order not found');

    const deliveryCharge = delivery_charge !== undefined ? (parseFloat(delivery_charge) || 0) : (parseFloat(existingOrder.delivery_charge) || 0);
    const discountAmount = discount_amount !== undefined ? (parseFloat(discount_amount) || 0) : (parseFloat(existingOrder.discount_amount) || 0);

    const subtotal = parseFloat(existingOrder.subtotal) || 0;
    const taxableSubtotal = Math.max(0, subtotal - discountAmount);
    const isPstExempt = Boolean(existingOrder.pst_exempt || existingOrder.customer_pst_number || existingOrder.pst_number);
    const gstAmount = taxableSubtotal * 0.05;
    const pstAmount = isPstExempt ? 0 : taxableSubtotal * 0.07;
    const totalAmount = subtotal - discountAmount + deliveryCharge + gstAmount + pstAmount;
    const paidAmount = parseFloat(existingOrder.paid_amount) || 0;
    const creditAmount = Math.max(0, totalAmount - paidAmount);
    const paymentStatus = creditAmount === 0 ? 'Paid' : paidAmount > 0 ? 'Partial' : 'Unpaid';

    await queryRunner.query(
      `UPDATE orders SET 
        delivery_charge = $1, 
        discount_amount = $2, 
        gst_amount = $3, 
        pst_amount = $4, 
        total_amount = $5, 
        credit_amount = $6, 
        updated_at = CURRENT_TIMESTAMP 
       WHERE order_id = $7`,
      [deliveryCharge.toFixed(2), discountAmount.toFixed(2), gstAmount.toFixed(2), pstAmount.toFixed(2), totalAmount.toFixed(2), creditAmount.toFixed(2), orderId]
    );

    await queryRunner.query(
      `UPDATE invoice SET 
        delivery_charge = $1, 
        discount_amount = $2, 
        remaining_amount = $3, 
        payment_status = $4 
       WHERE order_id = $5`,
      [deliveryCharge.toFixed(2), discountAmount.toFixed(2), creditAmount.toFixed(2), paymentStatus, orderId]
    );

    return await this.findById(orderId, queryRunner);
  }

  static async findById(id, client = null) {
    const queryRunner = client || db;
    const orderQuery = `
      SELECT o.*, 
             COALESCE(NULLIF(o.custom_client_name, ''), u.name, 'Valued Client') as customer_name, 
             u.company_name as company_name,
             COALESCE(u.email, 'client@gbcabinetdoors.ca') as customer_email, 
             u.mobile_number as customer_mobile,
             u.username as customer_code
      FROM orders o
      LEFT JOIN users u ON o.user_id = u.id
      WHERE o.order_id = $1
    `;
    const orderRes = await queryRunner.query(orderQuery, [id]);
    if (orderRes.rows.length === 0) return null;

    const order = orderRes.rows[0];

    // Fetch order items (pricing)
    const itemsQuery = `
      SELECT oi.*, p.product_name, p.product_description,
             (SELECT image_url FROM product_images WHERE p_id = p.p_id ORDER BY created_at ASC LIMIT 1) as product_image
      FROM order_items oi
      LEFT JOIN products p ON oi.product_id = p.p_id
      WHERE oi.order_id = $1
    `;
    const itemsRes = await queryRunner.query(itemsQuery, [id]);
    order.items = itemsRes.rows;

    // Fetch order sizing items (dynamic cut list)
    const sizingQuery = `
      SELECT osi.*,
             c.category_name,
             p.product_name
      FROM order_sizing_items osi
      LEFT JOIN category c ON osi.category_id = c.category_id
      LEFT JOIN products p ON osi.product_id = p.p_id
      WHERE osi.order_id = $1
      ORDER BY osi.sort_order ASC
    `;
    const sizingRes = await queryRunner.query(sizingQuery, [id]);
    order.sizing_items = sizingRes.rows;

    // Compute consolidated cut lists
    order.cut_list = calculateCutLists(order.sizing_items);

    // Fetch invoice
    const invQuery = `SELECT * FROM invoice WHERE order_id = $1`;
    const invRes = await queryRunner.query(invQuery, [id]);
    order.invoice = invRes.rows[0] || null;

    return order;
  }

  static async findAll({ userId, status, search, categoryId, productId, unit, limit = 100, offset = 0 }) {
    let query = `
      SELECT o.*, 
             COALESCE(NULLIF(o.custom_client_name, ''), u.name, 'Valued Client') as customer_name, 
             u.company_name as company_name,
             COALESCE(u.email, 'client@gbcabinetdoors.ca') as customer_email, 
             u.mobile_number as customer_mobile
      FROM orders o
      LEFT JOIN users u ON o.user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (userId) {
      params.push(userId);
      query += ` AND o.user_id = $${params.length}`;
    }
    if (status && status !== 'ALL') {
      params.push(status);
      query += ` AND o.status = $${params.length}`;
    }
    if (unit) {
      params.push(unit);
      query += ` AND UPPER(o.measurement_unit) = UPPER($${params.length})`;
    }

    if (search && String(search).trim() !== '') {
      params.push(`%${search.trim()}%`);
      query += ` AND (
        o.order_number ILIKE $${params.length} OR
        o.po_number ILIKE $${params.length} OR
        u.name ILIKE $${params.length} OR
        u.mobile_number ILIKE $${params.length} OR
        EXISTS (
          SELECT 1 FROM order_sizing_items osi 
          LEFT JOIN products p ON osi.product_id = p.p_id
          WHERE osi.order_id = o.order_id AND (p.product_name ILIKE $${params.length} OR osi.description ILIKE $${params.length})
        )
      )`;
    }

    query += ` ORDER BY o.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await db.query(query, params);
    const orders = result.rows;

    for (const order of orders) {
      const sizingRes = await db.query(
        `SELECT osi.*, c.category_name, p.product_name
         FROM order_sizing_items osi
         LEFT JOIN category c ON osi.category_id = c.category_id
         LEFT JOIN products p ON osi.product_id = p.p_id
         WHERE osi.order_id = $1
         ORDER BY osi.sort_order ASC`,
        [order.order_id]
      );
      order.sizing_items = sizingRes.rows;

      // Extract unique category names & product names summary
      const uniqueCats = Array.from(new Set(order.sizing_items.map((i) => i.category_name).filter(Boolean)));
      const uniqueProds = Array.from(new Set(order.sizing_items.map((i) => i.product_name).filter(Boolean)));
      order.categories_summary = uniqueCats.join(', ') || 'General';
      order.products_summary = uniqueProds.length > 0
        ? uniqueProds.slice(0, 2).join(', ') + (uniqueProds.length > 2 ? ` +${uniqueProds.length - 2}` : '')
        : 'Cabinet Doors';
    }

    return orders;
  }

  static async updateStatus(id, status) {
    const query = `
      UPDATE orders
      SET status = $1, updated_at = CURRENT_TIMESTAMP
      WHERE order_id = $2
      RETURNING *
    `;
    const result = await db.query(query, [status, id]);
    return result.rows[0];
  }

  static async addPayment(orderId, paymentAmount, paymentMethod, client = null) {
    const queryRunner = client || db;

    const order = await this.findById(orderId, queryRunner);
    if (!order) throw new Error('Order not found');

    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) throw new Error('Invalid payment amount');

    const newPaidAmount = parseFloat(order.paid_amount) + amount;
    const newCreditAmount = Math.max(0, parseFloat(order.total_amount) - newPaidAmount);

    await queryRunner.query(
      `UPDATE orders SET paid_amount = $1, credit_amount = $2, updated_at = CURRENT_TIMESTAMP WHERE order_id = $3`,
      [newPaidAmount, newCreditAmount, orderId]
    );

    const newPaymentStatus = newCreditAmount === 0 ? 'Paid' : 'Partial';
    await queryRunner.query(
      `UPDATE invoice SET paid_amount = $1, remaining_amount = $2, payment_status = $3 WHERE order_id = $4`,
      [newPaidAmount, newCreditAmount, newPaymentStatus, orderId]
    );

    await queryRunner.query(
      `INSERT INTO payments (order_id, customer_id, amount, method, transaction_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [orderId, order.user_id, amount, paymentMethod, 'PAY-' + Date.now()]
    );

    await addLedgerTransaction({
      userId: order.user_id,
      orderId: orderId,
      type: 'Payment',
      amount: amount,
      paymentMethod: paymentMethod,
      description: `Payment received for Order #${order.order_number || orderId.slice(0, 8)}`,
      client: queryRunner,
    });

    return await this.findById(orderId, queryRunner);
  }

  static async delete(id) {
    const query = `DELETE FROM orders WHERE order_id = $1 RETURNING order_id`;
    const result = await db.query(query, [id]);
    return result.rows[0];
  }
}

module.exports = OrderModel;
