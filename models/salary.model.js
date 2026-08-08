const db = require('../config/db');

class SalaryModel {
  static async initTables() {
    try {
      await db.query(`
        ALTER TABLE salary DROP CONSTRAINT IF EXISTS salary_employee_id_fkey;
      `);
      await db.query(`
        ALTER TABLE salary ALTER COLUMN employee_id TYPE VARCHAR(100);
      `);
    } catch (e) {}

    try {
      await db.query(`
        CREATE TABLE IF NOT EXISTS salary_advances (
          advance_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          employee_id VARCHAR(100) NOT NULL,
          amount NUMERIC(10,2) NOT NULL,
          reason TEXT,
          status VARCHAR(20) DEFAULT 'Pending',
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `);
      await db.query(`
        ALTER TABLE salary ADD COLUMN IF NOT EXISTS advance_deduction NUMERIC(10,2) DEFAULT 0.00;
      `);
    } catch (err) {}
  }

  static async create({ employee_id, month, year, salary, paid, payment_method, advance_deduction = 0 }) {
    await this.initTables();
    const ded = parseFloat(advance_deduction || 0);

    const query = `
      INSERT INTO salary (employee_id, month, year, salary, paid, payment_method, advance_deduction)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;
    const values = [employee_id, month, year, salary, paid, payment_method, ded];
    const result = await db.query(query, values);

    if (ded > 0) {
      await db.query(
        `UPDATE salary_advances SET status = 'Deducted' WHERE employee_id = $1 AND status = 'Pending'`,
        [String(employee_id)]
      );
    }

    return result.rows[0];
  }

  static async createAdvance({ employee_id, amount, reason }) {
    await this.initTables();
    const query = `
      INSERT INTO salary_advances (employee_id, amount, reason, status)
      VALUES ($1, $2, $3, 'Pending')
      RETURNING *
    `;
    const result = await db.query(query, [String(employee_id), parseFloat(amount), reason || 'Salary Advance']);
    return result.rows[0];
  }

  static async deleteAdvance(advance_id) {
    await this.initTables();
    const query = `DELETE FROM salary_advances WHERE advance_id = $1 RETURNING *`;
    const result = await db.query(query, [advance_id]);
    return result.rows[0];
  }

  static async getPendingAdvance(employee_id) {
    await this.initTables();
    const query = `
      SELECT COALESCE(SUM(amount), 0.00) as total_pending
      FROM salary_advances
      WHERE employee_id = $1 AND status = 'Pending'
    `;
    const result = await db.query(query, [String(employee_id)]);
    return parseFloat(result.rows[0]?.total_pending || 0);
  }

  static async getAdvances() {
    await this.initTables();
    const query = `
      SELECT sa.*, COALESCE(e.name, u.name, 'Staff Member') as employee_name
      FROM salary_advances sa
      LEFT JOIN employees e ON sa.employee_id::text = e.employee_id::text
      LEFT JOIN users u ON sa.employee_id::text = u.id::text
      ORDER BY sa.created_at DESC
    `;
    const result = await db.query(query);
    return result.rows || [];
  }

  static async findById(id) {
    await this.initTables();
    const query = `
      SELECT s.*, COALESCE(e.name, u.name, 'Staff Member') as employee_name, COALESCE(e.mobile, u.mobile_number) as employee_mobile
      FROM salary s
      LEFT JOIN employees e ON s.employee_id::text = e.employee_id::text
      LEFT JOIN users u ON s.employee_id::text = u.id::text
      WHERE s.salary_id = $1
    `;
    const result = await db.query(query, [id]);
    return result.rows[0];
  }

  static async findAll({ employee_id, month, year, limit = 50, offset = 0 } = {}) {
    await this.initTables();
    let query = `
      SELECT s.*, COALESCE(e.name, u.name, 'Staff Member') as employee_name, COALESCE(e.mobile, u.mobile_number) as employee_mobile
      FROM salary s
      LEFT JOIN employees e ON s.employee_id::text = e.employee_id::text
      LEFT JOIN users u ON s.employee_id::text = u.id::text
      WHERE 1=1
    `;
    const params = [];

    if (employee_id) {
      params.push(String(employee_id));
      query += ` AND s.employee_id = $${params.length}`;
    }
    if (month) {
      params.push(month);
      query += ` AND s.month = $${params.length}`;
    }
    if (year) {
      params.push(year);
      query += ` AND s.year = $${params.length}`;
    }

    query += ` ORDER BY s.year DESC, s.month DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await db.query(query, params);
    return result.rows || [];
  }

  static async update(id, { salary, paid, payment_method, advance_deduction }) {
    const query = `
      UPDATE salary
      SET salary = COALESCE($1, salary),
          paid = COALESCE($2, paid),
          payment_method = COALESCE($3, payment_method),
          advance_deduction = COALESCE($4, advance_deduction)
      WHERE salary_id = $5
      RETURNING *
    `;
    const result = await db.query(query, [salary, paid, payment_method, advance_deduction, id]);
    return result.rows[0];
  }

  static async delete(id) {
    const query = `DELETE FROM salary WHERE salary_id = $1 RETURNING *`;
    const result = await db.query(query, [id]);
    return result.rows[0];
  }
}

SalaryModel.initTables();

module.exports = SalaryModel;
