const db = require('../config/db');

class UserModel {
  static async initTable() {
    try {
      await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS salary NUMERIC(10,2) DEFAULT 0.00;`);
    } catch (e) {}
  }

  static async create(userData, client = null) {
    await this.initTable();
    const queryRunner = client || db;
    const { name, mobile_number, username, email, password, google_id, profile_image, role = 'user', status = 'active', salary = 0.00 } = userData;

    const query = `
      INSERT INTO users (name, mobile_number, username, email, password, google_id, profile_image, role, status, salary)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id, name, mobile_number, username, email, google_id, profile_image, role, status, salary, created_at, updated_at
    `;
    const values = [name, mobile_number, username, email, password, google_id, profile_image, role, status, parseFloat(salary || 0)];

    const result = await queryRunner.query(query, values);
    const newUser = result.rows[0];

    const productsResult = await queryRunner.query('SELECT p_id, sell_price FROM products');
    if (productsResult.rows.length > 0) {
      for (const product of productsResult.rows) {
        await queryRunner.query(
          `INSERT INTO user_prices (user_id, product_id, custom_price)
           VALUES ($1, $2, $3)
           ON CONFLICT (user_id, product_id) DO NOTHING`,
          [newUser.id, product.p_id, product.sell_price]
        );
      }
    }

    return newUser;
  }

  static async findById(id) {
    await this.initTable();
    const query = `SELECT id, name, mobile_number, username, email, google_id, profile_image, role, status, salary, created_at, updated_at FROM users WHERE id = $1`;
    const result = await db.query(query, [id]);
    return result.rows[0];
  }

  static async findByEmail(email) {
    await this.initTable();
    const query = `SELECT * FROM users WHERE email = $1`;
    const result = await db.query(query, [email]);
    return result.rows[0];
  }

  static async findByUsername(username) {
    await this.initTable();
    const query = `SELECT * FROM users WHERE username = $1`;
    const result = await db.query(query, [username]);
    return result.rows[0];
  }

  static async findByGoogleId(googleId) {
    await this.initTable();
    const query = `SELECT * FROM users WHERE google_id = $1`;
    const result = await db.query(query, [googleId]);
    return result.rows[0];
  }

  static async findAll({ search, role, status, limit = 50, offset = 0 } = {}) {
    await this.initTable();
    let query = `SELECT id, name, mobile_number, username, email, google_id, profile_image, role, status, salary, created_at, updated_at FROM users WHERE 1=1`;
    const params = [];

    if (search) {
      params.push(`%${search}%`);
      query += ` AND (name ILIKE $${params.length} OR username ILIKE $${params.length} OR email ILIKE $${params.length} OR mobile_number ILIKE $${params.length})`;
    }
    if (role) {
      params.push(role);
      query += ` AND role = $${params.length}`;
    }
    if (status) {
      params.push(status);
      query += ` AND status = $${params.length}`;
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await db.query(query, params);
    return result.rows || [];
  }

  static async update(id, updateData) {
    await this.initTable();
    const fields = [];
    const values = [];
    let idx = 1;

    const allowedFields = ['name', 'mobile_number', 'username', 'email', 'password', 'google_id', 'profile_image', 'role', 'status', 'salary'];

    allowedFields.forEach((field) => {
      if (updateData[field] !== undefined) {
        fields.push(`${field} = $${idx}`);
        values.push(field === 'salary' ? parseFloat(updateData[field] || 0) : updateData[field]);
        idx++;
      }
    });

    if (fields.length === 0) return null;

    fields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    const query = `
      UPDATE users
      SET ${fields.join(', ')}
      WHERE id = $${idx}
      RETURNING id, name, mobile_number, username, email, google_id, profile_image, role, status, salary, created_at, updated_at
    `;

    const result = await db.query(query, values);
    return result.rows[0];
  }

  static async delete(id) {
    const query = `DELETE FROM users WHERE id = $1 RETURNING id`;
    const result = await db.query(query, [id]);
    return result.rows[0];
  }
}

UserModel.initTable();

module.exports = UserModel;
