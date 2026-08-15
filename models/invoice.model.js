const db = require('../config/db');
const CompanyCredentialsModel = require('./companyCredentials.model');

class InvoiceModel {
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
      WHERE (i.invoice_number IS NULL OR NOT (i.invoice_number LIKE 'CSH-%'))
        AND NOT (LOWER(COALESCE(o.payment_type, '')) LIKE '%cash%' AND COALESCE(o.gst_amount, 0) = 0)
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

