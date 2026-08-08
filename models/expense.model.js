const db = require('../config/db');

class ExpenseModel {
  static async create({ category, title, amount, payment_mode, description, bill_image, bill_url, receipt_image, expense_date }) {
    const finalBillImage = bill_image || bill_url || receipt_image || '';
    const query = `
      INSERT INTO expenses (category, title, amount, payment_mode, description, bill_image, expense_date)
      VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, CURRENT_TIMESTAMP))
      RETURNING *
    `;
    const values = [category, title, amount, payment_mode, description, finalBillImage, expense_date];
    const result = await db.query(query, values);
    return result.rows[0];
  }

  static async findById(id) {
    const query = `SELECT * FROM expenses WHERE expense_id = $1`;
    const result = await db.query(query, [id]);
    return result.rows[0];
  }

  static async findAll({ category, search, limit = 50, offset = 0 }) {
    let query = `SELECT * FROM expenses WHERE 1=1`;
    const params = [];

    if (category) {
      params.push(category);
      query += ` AND category = $${params.length}`;
    }
    if (search) {
      params.push(`%${search}%`);
      query += ` AND (title ILIKE $${params.length} OR description ILIKE $${params.length})`;
    }

    query += ` ORDER BY expense_date DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await db.query(query, params);
    return result.rows;
  }

  static async update(id, { category, title, amount, payment_mode, description, bill_image, bill_url, receipt_image, expense_date }) {
    const finalBillImage = bill_image !== undefined ? bill_image : (bill_url !== undefined ? bill_url : (receipt_image !== undefined ? receipt_image : null));
    const query = `
      UPDATE expenses
      SET category = COALESCE($1, category),
          title = COALESCE($2, title),
          amount = COALESCE($3, amount),
          payment_mode = COALESCE($4, payment_mode),
          description = COALESCE($5, description),
          bill_image = COALESCE($6, bill_image),
          expense_date = COALESCE($7, expense_date)
      WHERE expense_id = $8
      RETURNING *
    `;
    const result = await db.query(query, [category, title, amount, payment_mode, description, finalBillImage, expense_date, id]);
    return result.rows[0];
  }


  static async delete(id) {
    const query = `DELETE FROM expenses WHERE expense_id = $1 RETURNING *`;
    const result = await db.query(query, [id]);
    return result.rows[0];
  }
}

module.exports = ExpenseModel;
