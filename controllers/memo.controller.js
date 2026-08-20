const db = require('../config/db');
const { successResponse, errorResponse } = require('../utils/response');

// GET /api/memos - List all delivery memos
const getMemos = async (req, res) => {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS delivery_memos (
        memo_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        memo_number VARCHAR(100) UNIQUE NOT NULL,
        order_id VARCHAR(100) REFERENCES orders(order_id) ON DELETE SET NULL,
        customer_id UUID REFERENCES users(id) ON DELETE SET NULL,
        reason TEXT NOT NULL,
        photos JSONB DEFAULT '[]',
        driver_notes TEXT,
        amount_lost NUMERIC(10,2) DEFAULT 0.00,
        credit_percentage NUMERIC(5,2) DEFAULT 100.00,
        credit_amount NUMERIC(10,2) DEFAULT 0.00,
        gst_reduced NUMERIC(10,2) DEFAULT 0.00,
        pst_reduced NUMERIC(10,2) DEFAULT 0.00,
        courier_name VARCHAR(100) DEFAULT 'Standard Courier',
        status VARCHAR(20) DEFAULT 'Pending',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await db.query(`ALTER TABLE delivery_memos ADD COLUMN IF NOT EXISTS credit_percentage NUMERIC(5,2) DEFAULT 100.00;`);
    await db.query(`ALTER TABLE delivery_memos ADD COLUMN IF NOT EXISTS credit_amount NUMERIC(10,2) DEFAULT 0.00;`);
    await db.query(`ALTER TABLE delivery_memos ADD COLUMN IF NOT EXISTS gst_reduced NUMERIC(10,2) DEFAULT 0.00;`);
    await db.query(`ALTER TABLE delivery_memos ADD COLUMN IF NOT EXISTS pst_reduced NUMERIC(10,2) DEFAULT 0.00;`);

    const result = await db.query(
      `SELECT m.*, o.order_id, COALESCE(u.name, 'Valued Client') as customer_name, COALESCE(u.email, 'client@gbcabinetdoors.ca') as customer_email 
       FROM delivery_memos m 
       LEFT JOIN orders o ON m.order_id = o.order_id 
       LEFT JOIN users u ON m.customer_id = u.id 
       ORDER BY m.created_at DESC`
    );

    return successResponse(res, 'Memos fetched successfully', result.rows || []);
  } catch (error) {
    return errorResponse(res, 'Failed to fetch memos', error.message, 500);
  }
};

// POST /api/memos - Create new Delivery Memo
const createMemo = async (req, res) => {
  try {
    const { order_id, customer_id, reason, photos, driver_notes, amount_lost, credit_percentage, credit_amount, courier_name, status } = req.body;

    if (!reason) {
      return errorResponse(res, 'Reason is required for memo', null, 400);
    }

    const targetOrderId = order_id && String(order_id).trim() !== '' ? String(order_id).trim() : null;
    const targetCustomerId = customer_id && String(customer_id).trim() !== '' && String(customer_id).length > 10 ? String(customer_id).trim() : null;

    const memo_number = `MEMO-${Date.now().toString().slice(-6)}`;
    const photosJson = JSON.stringify(photos || []);

    const amtVal = parseFloat(amount_lost || 0);
    const pctVal = parseFloat(credit_percentage !== undefined ? credit_percentage : 100);
    const credAmtVal = credit_amount !== undefined && credit_amount !== '' ? parseFloat(credit_amount) : parseFloat((amtVal * (pctVal / 100)).toFixed(2));
    const gstRedVal = parseFloat((credAmtVal * 0.05).toFixed(2));
    const pstRedVal = parseFloat((credAmtVal * 0.07).toFixed(2));
    const finalStatus = status || 'Credit';

    const result = await db.query(
      `INSERT INTO delivery_memos (memo_number, order_id, customer_id, reason, photos, driver_notes, amount_lost, credit_percentage, credit_amount, gst_reduced, pst_reduced, courier_name, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
      [
        memo_number,
        targetOrderId,
        targetCustomerId,
        reason,
        photosJson,
        driver_notes || '',
        amtVal,
        pctVal,
        credAmtVal,
        gstRedVal,
        pstRedVal,
        courier_name || 'Standard Courier',
        finalStatus,
      ]
    );

    const savedRow = (result && result.rows && result.rows[0])
      ? result.rows[0]
      : (Array.isArray(result) && result[0] ? result[0] : { memo_number, reason, amount_lost: amtVal, credit_amount: credAmtVal, status: finalStatus });

    // Non-blocking Audit Log
    try {
      await db.query(
        `INSERT INTO history (user_id, action, table_name, record_id, new_data) VALUES ($1, 'INSERT', 'delivery_memos', $2, $3)`,
        [req.user?.id || null, memo_number, JSON.stringify(savedRow)]
      );
    } catch (e) {}

    return successResponse(res, 'Memo created successfully', savedRow, 201);
  } catch (error) {
    console.error('Failed to create memo error:', error);
    return errorResponse(res, 'Failed to create memo: ' + error.message, error.message, 500);
  }
};

// PUT /api/memos/:id/status - Update memo status and credit allocation
const updateMemoStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, credit_percentage, credit_amount, amount_lost } = req.body;

    const allowed = ['Pending', 'Credit', 'Approved', 'Rejected', 'Resolved'];
    if (status && !allowed.includes(status)) {
      return errorResponse(res, `Invalid memo status. Allowed: ${allowed.join(', ')}`, null, 400);
    }

    // Fetch existing memo to compute credit values
    const currentRes = await db.query(`SELECT * FROM delivery_memos WHERE memo_id = $1`, [id]);
    if (!currentRes.rows || currentRes.rows.length === 0) {
      return errorResponse(res, 'Memo not found', null, 404);
    }
    const currentMemo = currentRes.rows[0];

    const targetStatus = status || currentMemo.status;
    const targetAmt = amount_lost !== undefined && amount_lost !== '' ? parseFloat(amount_lost) : parseFloat(currentMemo.amount_lost || 0);
    const targetPct = credit_percentage !== undefined && credit_percentage !== '' ? parseFloat(credit_percentage) : parseFloat(currentMemo.credit_percentage || 100);
    
    let targetCredAmt = currentMemo.credit_amount;
    if (credit_amount !== undefined && credit_amount !== '') {
      targetCredAmt = parseFloat(credit_amount);
    } else {
      targetCredAmt = parseFloat((targetAmt * (targetPct / 100)).toFixed(2));
    }

    const targetGstRed = parseFloat((targetCredAmt * 0.05).toFixed(2));
    const targetPstRed = parseFloat((targetCredAmt * 0.07).toFixed(2));

    const result = await db.query(
      `UPDATE delivery_memos 
       SET status = $1, amount_lost = $2, credit_percentage = $3, credit_amount = $4, gst_reduced = $5, pst_reduced = $6, updated_at = CURRENT_TIMESTAMP 
       WHERE memo_id = $7 RETURNING *`,
      [targetStatus, targetAmt, targetPct, targetCredAmt, targetGstRed, targetPstRed, id]
    );

    return successResponse(res, 'Memo status & credit percentage updated', result.rows[0]);
  } catch (error) {
    return errorResponse(res, 'Failed to update memo status', error.message, 500);
  }
};

module.exports = {
  getMemos,
  createMemo,
  updateMemoStatus,
};

