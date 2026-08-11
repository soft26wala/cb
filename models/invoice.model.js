const db = require('../config/db');
const CompanyCredentialsModel = require('./companyCredentials.model');

class InvoiceModel {
  static async findByOrderId(orderId) {
    const query = `
      SELECT i.*, COALESCE(NULLIF(o.custom_client_name, ''), u.name, 'Valued Client') as customer_name, COALESCE(u.email, 'client@gbcabinetdoors.ca') as customer_email, u.mobile_number as customer_mobile,
             o.address, o.pincode, o.total_amount, o.subtotal, o.gst_amount, o.pst_amount, o.paid_amount as order_paid_amount, o.credit_amount, o.pst_number as customer_pst_number, o.payment_type
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
             o.address, o.pincode, o.total_amount, o.subtotal, o.gst_amount, o.pst_amount, o.paid_amount as order_paid_amount, o.credit_amount, o.pst_number as customer_pst_number, o.payment_type
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
             o.subtotal, o.gst_amount, o.pst_amount, o.address, o.pincode, o.pst_number as customer_pst_number, o.payment_type
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
    const invoices = result.rows || [];

    const credentials = await CompanyCredentialsModel.getCredentials();

    for (const inv of invoices) {
      inv.company_credentials = credentials;
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
}


module.exports = InvoiceModel;
