const db = require('../config/db');

class LoanModel {
  static async create({ person_name, loan_type, amount, interest = 0, remaining, monthly_installment = 0, status = 'Active' }) {
    const rem = remaining !== undefined ? remaining : amount;
    const query = `
      INSERT INTO loans (person_name, loan_type, amount, interest, remaining, monthly_installment, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;
    const values = [person_name, loan_type, amount, interest, rem, monthly_installment, status];
    const result = await db.query(query, values);
    return result.rows[0];
  }

  static async findById(id) {
    const query = `SELECT * FROM loans WHERE loan_id = $1`;
    const result = await db.query(query, [id]);
    return result.rows[0];
  }

  static async findAll({ loan_type, status, search, limit = 50, offset = 0 }) {
    let query = `SELECT * FROM loans WHERE 1=1`;
    const params = [];

    if (loan_type) {
      params.push(loan_type);
      query += ` AND loan_type = $${params.length}`;
    }
    if (status) {
      params.push(status);
      query += ` AND status = $${params.length}`;
    }
    if (search) {
      params.push(`%${search}%`);
      query += ` AND person_name ILIKE $${params.length}`;
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await db.query(query, params);
    return result.rows;
  }

  static async update(id, { person_name, loan_type, amount, interest, remaining, monthly_installment, status }) {
    const query = `
      UPDATE loans
      SET person_name = COALESCE($1, person_name),
          loan_type = COALESCE($2, loan_type),
          amount = COALESCE($3, amount),
          interest = COALESCE($4, interest),
          remaining = COALESCE($5, remaining),
          monthly_installment = COALESCE($6, monthly_installment),
          status = COALESCE($7, status)
      WHERE loan_id = $8
      RETURNING *
    `;
    const result = await db.query(query, [person_name, loan_type, amount, interest, remaining, monthly_installment, status, id]);
    return result.rows[0];
  }

  static async delete(id) {
    const query = `DELETE FROM loans WHERE loan_id = $1 RETURNING *`;
    const result = await db.query(query, [id]);
    return result.rows[0];
  }
}

module.exports = LoanModel;
