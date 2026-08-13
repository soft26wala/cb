const db = require('../config/db');
const CompanyCredentialsModel = require('./companyCredentials.model');

class InvoiceModel {
  static async findByOrderId(orderId) {
    const query = `
      SELECT i.*, COALESCE(NULLIF(o.custom_client_name, ''), u.name, 'Valued Client') as customer_name, COALESCE(u.email, 'client@gbcabinetdoors.ca') as customer_email, u.mobile_number as customer_mobile,
             o.address, o.pincode, o.total_amount, o.subtotal, o.gst_amount, o.pst_amount, o.paid_amount as order_paid_amount, o.credit_amount, o.pst_number as customer_pst_number, o.payment_type,
             COALESCE(o.delivery_charge, i.delivery_charge, 0) as delivery_charge,
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

  static async findAll({ userId, paymentStatus, limit = 50, offset = 0 }) {
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

    invoices = invoices.map((inv, idx) => {
      inv.company_credentials = credentials;
      if (!inv.invoice_number || inv.invoice_number === 'INV-2026-000' || inv.invoice_number.trim() === '') {
        const year = new Date(inv.created_at || Date.now()).getFullYear();
        inv.invoice_number = `INV-${year}-${String(invoices.length - idx).padStart(4, '0')}`;
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

