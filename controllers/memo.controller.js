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
        courier_name VARCHAR(100) DEFAULT 'Standard Courier',
        status VARCHAR(20) DEFAULT 'Pending',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    const countCheck = await db.query(`SELECT COUNT(*) as count FROM delivery_memos`);
    if (parseInt(countCheck.rows[0]?.count || 0, 10) === 0) {
      await db.query(`
        INSERT INTO delivery_memos (memo_number, reason, driver_notes, amount_lost, courier_name, status)
        VALUES 
          ('MEMO-883921', 'Refused delivery due to transit corner scratch', 'Customer inspected box at doorway and requested replacement.', 185.00, 'FedEx Express', 'Pending'),
          ('MEMO-742910', 'Damaged packaging box on arrival', 'Outer wooden crate cracked during transport offloading.', 95.00, 'UPS Ground', 'Resolved')
        ON CONFLICT DO NOTHING;
      `);
    }

    const result = await db.query(
      `SELECT m.*, o.order_id, COALESCE(u.name, 'Valued Client') as customer_name, COALESCE(u.email, 'client@gbcabinetdoors.ca') as customer_email 
       FROM delivery_memos m 
       LEFT JOIN orders o ON m.order_id = o.order_id 
       LEFT JOIN users u ON m.customer_id = u.id 
       ORDER BY m.created_at DESC`
    );

    return successResponse(res, 'Delivery memos fetched successfully', result.rows || []);
  } catch (error) {
    return errorResponse(res, 'Failed to fetch delivery memos', error.message, 500);
  }
};

// POST /api/memos - Create new Delivery Memo
const createMemo = async (req, res) => {
  try {
    const { order_id, customer_id, reason, photos, driver_notes, amount_lost, courier_name } = req.body;

    if (!reason) {
      return errorResponse(res, 'Reason is required for delivery memo', null, 400);
    }

    const memo_number = `MEMO-${Date.now().toString().slice(-6)}`;
    const photosJson = JSON.stringify(photos || []);

    const result = await db.query(
      `INSERT INTO delivery_memos (memo_number, order_id, customer_id, reason, photos, driver_notes, amount_lost, courier_name, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'Pending') RETURNING *`,
      [memo_number, order_id || null, customer_id || null, reason, photosJson, driver_notes || '', parseFloat(amount_lost || 0), courier_name || 'Standard Courier']
    );

    // Audit log
    await db.query(
      `INSERT INTO history (user_id, action, table_name, record_id, new_data) VALUES ($1, 'INSERT', 'delivery_memos', $2, $3)`,
      [req.user?.id, memo_number, JSON.stringify(result.rows[0])]
    );

    return successResponse(res, 'Delivery Memo created successfully', result.rows[0], 201);
  } catch (error) {
    return errorResponse(res, 'Failed to create delivery memo', error.message, 500);
  }
};

// PUT /api/memos/:id/status - Update memo status (Resolved, Pending, Approved, Rejected)
const updateMemoStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const allowed = ['Pending', 'Credit', 'Approved', 'Rejected', 'Resolved'];
    if (!allowed.includes(status)) {
      return errorResponse(res, `Invalid memo status. Allowed: ${allowed.join(', ')}`, null, 400);
    }

    const result = await db.query(
      `UPDATE delivery_memos SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE memo_id = $2 RETURNING *`,
      [status, id]
    );

    if (!result.rows || result.rows.length === 0) {
      return errorResponse(res, 'Delivery memo not found', null, 404);
    }

    return successResponse(res, 'Delivery memo status updated', result.rows[0]);
  } catch (error) {
    return errorResponse(res, 'Failed to update delivery memo status', error.message, 500);
  }
};

module.exports = {
  getMemos,
  createMemo,
  updateMemoStatus,
};
