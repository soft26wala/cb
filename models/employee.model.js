const db = require('../config/db');

class EmployeeModel {
  static async create({ name, mobile, salary, joining_date, status = 'active' }) {
    const query = `
      INSERT INTO employees (name, mobile, salary, joining_date, status)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;
    const result = await db.query(query, [name, mobile, salary, joining_date, status]);
    return result.rows[0];
  }

  static async findById(id) {
    const query = `SELECT * FROM employees WHERE employee_id = $1`;
    const result = await db.query(query, [id]);
    return result.rows[0];
  }

  static async findAll({ search, status, limit = 50, offset = 0 } = {}) {
    let query = `
      SELECT * FROM (
        SELECT 
          employee_id::text as employee_id,
          name,
          mobile,
          salary,
          joining_date,
          status,
          created_at
        FROM employees

        UNION ALL

        SELECT 
          id::text as employee_id,
          name,
          mobile_number as mobile,
          COALESCE(salary, 3500.00) as salary,
          created_at::date as joining_date,
          'active' as status,
          created_at
        FROM users
        WHERE LOWER(role) = 'employee'
          AND NOT EXISTS (SELECT 1 FROM employees e WHERE LOWER(e.name) = LOWER(users.name))
      ) emp
      WHERE 1=1
    `;
    const params = [];

    if (search) {
      params.push(`%${search}%`);
      query += ` AND (emp.name ILIKE $${params.length} OR emp.mobile ILIKE $${params.length})`;
    }
    if (status) {
      params.push(status);
      query += ` AND emp.status = $${params.length}`;
    }

    query += ` ORDER BY emp.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await db.query(query, params);
    return result.rows || [];
  }

  static async update(id, { name, mobile, salary, joining_date, status }) {
    const query = `
      UPDATE employees
      SET name = COALESCE($1, name),
          mobile = COALESCE($2, mobile),
          salary = COALESCE($3, salary),
          joining_date = COALESCE($4, joining_date),
          status = COALESCE($5, status)
      WHERE employee_id = $6
      RETURNING *
    `;
    const result = await db.query(query, [name, mobile, salary, joining_date, status, id]);
    return result.rows[0];
  }

  static async delete(id) {
    const query = `DELETE FROM employees WHERE employee_id = $1 RETURNING *`;
    const result = await db.query(query, [id]);
    return result.rows[0];
  }
}

module.exports = EmployeeModel;
