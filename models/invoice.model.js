const db = require('../config/db');
const CompanyCredentialsModel = require('./companyCredentials.model');

class InvoiceModel {
  static async initTable() {
    try {
      await db.query(`ALTER TABLE invoice ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;`);
    } catch (e) {}
  }

  static async generateInvoiceFromOrder(orderId, { invoiceDate, createdBy } = {}) {
    await this.initTable();
    const orderRes = await db.query(`SELECT * FROM orders WHERE order_id = $1`, [orderId]);
    if (!orderRes.rows[0]) throw new Error('Order not found');
    const order = orderRes.rows[0];

    const targetDate = invoiceDate ? new Date(invoiceDate) : new Date();
    const year = targetDate.getFullYear();
    const isCash = Boolean((order.payment_type || '').toLowerCase().includes('cash'));
    const isTaxOff = Number(order.gst_amount || 0) === 0;
    const isCashMemo = (isCash && isTaxOff);
    const targetPrefix = isCashMemo ? 'CSH-' : 'INV-';

    const existingRes = await db.query(`SELECT * FROM invoice WHERE order_id = $1`, [orderId]);
    let inv = existingRes.rows[0];

    let invNumber = inv ? inv.invoice_number : null;
    if (!invNumber) {
      const countRes = await db.query(
        `SELECT COUNT(*) as count FROM invoice WHERE invoice_number LIKE $1`,
        [`${targetPrefix}${year}-%`]
      );
      const nextSeq = (parseInt(countRes.rows[0]?.count || 0, 10) + 1).toString().padStart(4, '0');
      invNumber = `${targetPrefix}${year}-${nextSeq}`;
    }

    const paidAmount = parseFloat(order.paid_amount || 0);
    const creditAmount = parseFloat(order.credit_amount || (order.total_amount - paidAmount));
    const paymentStatus = creditAmount <= 0 ? 'Paid' : paidAmount > 0 ? 'Partial' : 'Unpaid';

    if (inv) {
      const updateRes = await db.query(
        `UPDATE invoice 
         SET invoice_number = $1, paid_amount = $2, remaining_amount = $3, payment_status = $4, status = 'Issued', created_at = $5
         WHERE invoice_id = $6
         RETURNING *`,
        [invNumber, paidAmount, creditAmount, paymentStatus, targetDate, inv.invoice_id]
      );
      return updateRes.rows[0];
    } else {
      const insertRes = await db.query(
        `INSERT INTO invoice (order_id, user_id, invoice_number, paid_amount, remaining_amount, payment_status, status, delivery_charge, discount_amount, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [orderId, order.user_id, invNumber, paidAmount, creditAmount, paymentStatus, 'Issued', parseFloat(order.delivery_charge || 0), parseFloat(order.discount_amount || 0), targetDate]
      );
      return insertRes.rows[0];
    }
  }

  static async findByOrderId(orderId) {
    const query = `
      SELECT i.*, COALESCE(NULLIF(o.custom_client_name, ''), u.name, 'Valued Client') as customer_name, COALESCE(u.email, 'client@gbcabinetdoors.ca') as customer_email, u.mobile_number as customer_mobile,
             o.address, o.pincode, o.total_amount, o.subtotal, o.gst_amount, o.pst_amount, o.paid_amount as order_paid_amount, o.credit_amount, o.pst_number as customer_pst_number, o.payment_type,
             COALESCE(o.ship_to_name, i.ship_to_name) as ship_to_name, COALESCE(o.ship_to_address, i.ship_to_address) as ship_to_address, COALESCE(o.delivery_notes, i.delivery_notes) as delivery_notes, COALESCE(o.delivery_charge, i.delivery_charge, 0) as delivery_charge,
             COALESCE(o.discount_amount, i.discount_amount, 0) as discount_amount
      FROM invoice i
      LEFT JOIN users u ON i.user_id = u.id
      JOIN orders o ON i.order_id = o.order_id
      WHERE i.order_id = $1
    `;
    const result = await db.query(query, [orderId]);
    if (!result.rows[0]) return null;

    const inv = result.rows[0];
    const credentials = await CompanyCredentialsModel.getCredentials();
    inv.company_credentials = credentials;

    // Fetch line items
    const itemsRes = await db.query(
      `SELECT oi.*, p.product_name, p.product_description, p.category_id
       FROM order_items oi
       JOIN products p ON oi.product_id = p.p_id
       WHERE oi.order_id = $1`,
      [orderId]
    );
    inv.items = itemsRes.rows || [];
    if (!inv.items || inv.items.length === 0) {
      const sizingRes = await db.query(`SELECT osi.*, c.category_name FROM order_sizing_items osi LEFT JOIN category c ON osi.category_id = c.category_id WHERE osi.order_id = $1 ORDER BY osi.sort_order ASC`, [inv.order_id || orderId]);
      inv.items = sizingRes.rows || [];
    }

    return inv;
  }

  static async findById(invoiceId) {
    const query = `
      SELECT i.*, COALESCE(NULLIF(o.custom_client_name, ''), u.name, 'Valued Client') as customer_name, COALESCE(u.email, 'client@gbcabinetdoors.ca') as customer_email, u.mobile_number as customer_mobile,
             o.address, o.pincode, o.total_amount, o.subtotal, o.gst_amount, o.pst_amount, o.paid_amount as order_paid_amount, o.credit_amount, o.pst_number as customer_pst_number, o.payment_type,
             COALESCE(o.delivery_charge, i.delivery_charge, 0) as delivery_charge,
             COALESCE(o.discount_amount, i.discount_amount, 0) as discount_amount
      FROM invoice i
      LEFT JOIN users u ON i.user_id = u.id
      LEFT JOIN orders o ON i.order_id = o.order_id
      WHERE i.invoice_id = $1
    `;
    const result = await db.query(query, [invoiceId]);
    if (!result.rows[0]) return null;

    const inv = result.rows[0];
    const credentials = await CompanyCredentialsModel.getCredentials();
    inv.company_credentials = credentials;

    if (inv.order_id) {
      const itemsRes = await db.query(
        `SELECT oi.*, p.product_name, p.product_description, p.category_id
         FROM order_items oi
         JOIN products p ON oi.product_id = p.p_id
         WHERE oi.order_id = $1`,
        [inv.order_id]
      );
      inv.items = itemsRes.rows || [];
    } else {
      inv.items = [];
    }

    return inv;
  }

  static async fixLegacyInvoiceNumbers() {
    try {
      const res = await db.query(`
        SELECT i.invoice_id, i.order_id, i.invoice_number, i.created_at, o.payment_type, o.gst_amount
        FROM invoice i
        LEFT JOIN orders o ON i.order_id = o.order_id
        ORDER BY COALESCE(i.created_at, o.created_at) ASC
      `);
      const rows = res.rows || [];
      let taxSeq = 1;
      let cashSeq = 1;

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const year = new Date(row.created_at || Date.now()).getFullYear();
        const isCash = Boolean((row.payment_type || '').toLowerCase().includes('cash'));
        const isTaxOff = row.gst_amount !== undefined && Number(row.gst_amount) === 0;
        const isCashMemo = (isCash && isTaxOff) || (row.invoice_number && row.invoice_number.startsWith('CSH-'));

        if (isCashMemo && row.order_id) {
          await db.query(
            `UPDATE orders SET payment_type = 'Cash', gst_amount = 0.00, pst_amount = 0.00, total_amount = subtotal - COALESCE(discount_amount, 0) + COALESCE(delivery_charge, 0) WHERE order_id = $1 AND (payment_type != 'Cash' OR gst_amount > 0)`,
            [row.order_id]
          );
        }

        let targetSeqNum = '';
        if (isCashMemo) {
          targetSeqNum = `CSH-${year}-${String(cashSeq).padStart(4, '0')}`;
          cashSeq++;
        } else {
          targetSeqNum = `INV-${year}-${String(taxSeq).padStart(4, '0')}`;
          taxSeq++;
        }

        if (row.invoice_number !== targetSeqNum) {
          await db.query(`UPDATE invoice SET invoice_number = $1 WHERE invoice_id = $2`, [targetSeqNum, row.invoice_id]);
        }
      }
    } catch (e) {
      console.warn('CRA sequential number migration warning:', e.message);
    }
  }

  static async findAll({ userId, paymentStatus, limit = 50, offset = 0 }) {
    // Run legacy number migration once to ensure all database rows comply with CRA sequential rules (INV-2026-0001, INV-2026-0002...)
    await this.fixLegacyInvoiceNumbers();

    let query = `
      SELECT i.*, COALESCE(NULLIF(o.custom_client_name, ''), u.name, 'Valued Client') as customer_name, COALESCE(u.email, 'client@gbcabinetdoors.ca') as customer_email, u.mobile_number as customer_mobile,
             COALESCE(o.total_amount, i.paid_amount + i.remaining_amount) as total_amount,
             o.subtotal, o.gst_amount, o.pst_amount, o.address, o.pincode, o.pst_number as customer_pst_number, o.payment_type,
             COALESCE(o.delivery_charge, i.delivery_charge, 0) as delivery_charge,
             COALESCE(o.discount_amount, i.discount_amount, 0) as discount_amount
      FROM invoice i
      LEFT JOIN users u ON i.user_id = u.id
      LEFT JOIN orders o ON i.order_id = o.order_id
      WHERE 1=1
    `;
    const params = [];

    if (userId) {
      params.push(userId);
      query += ` AND i.user_id = $${params.length}`;
    }
    if (paymentStatus) {
      params.push(paymentStatus);
      query += ` AND i.payment_status = $${params.length}`;
    }

    query += ` ORDER BY i.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await db.query(query, params);
    let invoices = result.rows || [];

    const credentials = await CompanyCredentialsModel.getCredentials();

    // Format all invoices in strict CRA sequential order (INV-YYYY-0001, INV-YYYY-0002, INV-YYYY-0003...)
    // Sort chronologically ascending to assign 0001 to earliest invoice
    const sortedInvoices = [...invoices].sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
    
    const seqMap = {};
    let seqCounter = 1;
    sortedInvoices.forEach((inv) => {
      const year = new Date(inv.created_at || Date.now()).getFullYear();
      const seqStr = `INV-${year}-${String(seqCounter).padStart(4, '0')}`;
      seqMap[inv.invoice_id || inv.order_id || inv.order_number] = seqStr;
      seqCounter++;
    });

    invoices = invoices.map((inv) => {
      inv.company_credentials = credentials;
      const key = inv.invoice_id || inv.order_id || inv.order_number;
      if (seqMap[key]) {
        inv.invoice_number = seqMap[key];
      }
      return inv;
    });

    for (const inv of invoices) {
      if (inv.order_id) {
        const itemsRes = await db.query(
          `SELECT oi.*, p.product_name, p.product_description
           FROM order_items oi
           JOIN products p ON oi.product_id = p.p_id
           WHERE oi.order_id = $1`,
          [inv.order_id]
        );
        inv.items = itemsRes.rows || [];
      } else {
        inv.items = [];
      }
    }

    return invoices;
  }

  static async updateEmailStatus(invoiceId, { email_sent, email_sent_at, email_message_id, email_error }) {
    const query = `
      UPDATE invoice
      SET email_sent = $1,
          email_sent_at = $2,
          email_message_id = $3,
          email_error = $4
      WHERE invoice_id = $15 OR order_id = $15
      RETURNING *
    `;
    // We bind parameters carefully
    const res = await db.query(
      `UPDATE invoice
       SET email_sent = $1,
           email_sent_at = $2,
           email_message_id = $3,
           email_error = $4
       WHERE invoice_id = $5 OR order_id = $5
       RETURNING *`,
      [email_sent, email_sent_at || new Date(), email_message_id || null, email_error || null, invoiceId]
    );
    return res.rows[0] || null;
  }
}

module.exports = InvoiceModel;

