const db = require('../config/db');

class PaymentModel {
  static async create({ order_id, customer_id, amount, method, transaction_id }) {
    const query = `
      INSERT INTO payments (order_id, customer_id, amount, method, transaction_id)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;
    const result = await db.query(query, [order_id, customer_id, amount, method, transaction_id]);
    return result.rows[0];
  }

  static async findByCustomerId(customerId) {
    const query = `
      SELECT p.*, o.order_id, u.name as customer_name
      FROM payments p
      JOIN users u ON p.customer_id = u.id
      LEFT JOIN orders o ON p.order_id = o.order_id
      WHERE p.customer_id = $1
      ORDER BY p.payment_date DESC
    `;
    const result = await db.query(query, [customerId]);
    return result.rows;
  }

  static async findAll({ limit = 50, offset = 0 } = {}) {
    const query = `
      SELECT p.*, u.name as customer_name, u.email as customer_email
      FROM payments p
      JOIN users u ON p.customer_id = u.id
      ORDER BY p.payment_date DESC
      LIMIT $1 OFFSET $2
    `;
    const result = await db.query(query, [limit, offset]);
    return result.rows;
  }
}

module.exports = PaymentModel;
