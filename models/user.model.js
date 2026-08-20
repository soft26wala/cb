const db = require('../config/db');

class UserModel {
  static async initTable() {
    try {
      await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS salary NUMERIC(10,2) DEFAULT 0.00;`);
      await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS company_name VARCHAR(255);`);
      await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS pst_number VARCHAR(100);`);
      await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS pst_exempt BOOLEAN DEFAULT FALSE;`);
      await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS age INT;`);
      await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS address TEXT;`);
      await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS location TEXT;`);
      await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS sin_number VARCHAR(100);`);
    } catch (e) {}
  }

  static async create(userData, client = null) {
    await this.initTable();
    const queryRunner = client || db;
    const { name, company_name, mobile_number, pst_number, pst_exempt = false, username, email, password, google_id, profile_image, role = 'user', status = 'active', salary = 0.00, age = null, address = null, location = null, sin_number = null } = userData;

    const finalUsername = username || (name ? name.toLowerCase().replace(/[^a-z0-9]/g, '') + Math.floor(100 + Math.random() * 900) : 'user_' + Date.now());
    const finalEmail = email || `${finalUsername}@client.local`;
    const finalPassword = password || 'ClientSecret@2026';
    const finalAddress = address || location || null;
    const finalAge = age !== null && age !== undefined && age !== '' ? parseInt(age, 10) : null;

    const query = `
      INSERT INTO users (name, company_name, mobile_number, pst_number, pst_exempt, username, email, password, google_id, profile_image, role, status, salary, age, address, location, sin_number)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING id, name, company_name, mobile_number, pst_number, pst_exempt, username, email, google_id, profile_image, role, status, salary, age, address, location, sin_number, created_at, updated_at
    `;
    const values = [name, company_name || null, mobile_number || null, pst_number || null, Boolean(pst_exempt), finalUsername, finalEmail, finalPassword, google_id || null, profile_image || null, role, status, parseFloat(salary || 0), finalAge, finalAddress, finalAddress, sin_number || null];

    const result = await queryRunner.query(query, values);
    const newUser = result.rows[0];

    await queryRunner.query(
      `INSERT INTO user_prices (user_id, product_id, custom_price)
       SELECT $1, p.p_id, COALESCE((SELECT custom_price FROM user_prices WHERE product_id = p.p_id LIMIT 1), 0.00)
       FROM products p
       ON CONFLICT (user_id, product_id) DO NOTHING`,
      [newUser.id]
    );

    return newUser;
  }

  static async findById(id) {
    await this.initTable();
    const query = `SELECT id, name, company_name, mobile_number, pst_number, pst_exempt, username, email, google_id, profile_image, role, status, salary, age, address, location, sin_number, created_at, updated_at FROM users WHERE id = $1`;
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

  static async findClients({ search, role, limit = 100, offset = 0 } = {}) {
    await this.initTable();
    // Use IS DISTINCT FROM so users with NULL status are also included
    let query = `SELECT id, name, company_name, mobile_number, pst_number, pst_exempt, username, email, role, status, age, address, location, sin_number FROM users WHERE status IS DISTINCT FROM 'disabled'`;
    const params = [];

    if (role) {
      params.push(role);
      query += ` AND LOWER(role) = LOWER($${params.length})`;
    } else {
      // Exclude admin accounts by default so real clients/customers show up
      query += ` AND LOWER(role) != 'admin'`;
    }

    if (search && String(search).trim() !== '') {
      const searchVal = `%${search.trim()}%`;
      params.push(searchVal, searchVal, searchVal, searchVal, searchVal);
      const base = params.length - 4;
      query += ` AND (name ILIKE $${base} OR company_name ILIKE $${base + 1} OR username ILIKE $${base + 2} OR email ILIKE $${base + 3} OR CAST(mobile_number AS TEXT) ILIKE $${base + 4})`;
    }

    query += ` ORDER BY name ASC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await db.query(query, params);
    if ((!result.rows || result.rows.length === 0) && !search) {
      // Fallback: return all non-admin, non-disabled users
      const fallbackQuery = `SELECT id, name, company_name, mobile_number, pst_number, pst_exempt, username, email, role, status, age, address, location, sin_number FROM users WHERE status IS DISTINCT FROM 'disabled' AND LOWER(role) != 'admin' ORDER BY name ASC LIMIT $1`;
      const fallbackRes = await db.query(fallbackQuery, [limit]);
      return fallbackRes.rows || [];
    }

    return result.rows || [];
  }

  static async findAll({ search, role, status, limit = 50, offset = 0 } = {}) {
    await this.initTable();
    let query = `SELECT id, name, company_name, mobile_number, pst_number, pst_exempt, username, email, google_id, profile_image, role, status, salary, age, address, location, sin_number, created_at, updated_at FROM users WHERE 1=1`;
    const params = [];

    if (search) {
      params.push(`%${search}%`);
      query += ` AND (name ILIKE $${params.length} OR company_name ILIKE $${params.length} OR username ILIKE $${params.length} OR email ILIKE $${params.length} OR mobile_number ILIKE $${params.length} OR sin_number ILIKE $${params.length})`;
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

    const allowedFields = ['name', 'company_name', 'mobile_number', 'pst_number', 'pst_exempt', 'username', 'email', 'password', 'google_id', 'profile_image', 'role', 'status', 'salary', 'age', 'address', 'location', 'sin_number'];

    allowedFields.forEach((field) => {
      if (updateData[field] !== undefined) {
        fields.push(`${field} = $${idx}`);
        let val = updateData[field];
        if (field === 'salary') val = parseFloat(val || 0);
        if (field === 'age') val = val !== null && val !== '' ? parseInt(val, 10) : null;
        if (field === 'pst_exempt') val = Boolean(val);
        values.push(val);
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
      RETURNING id, name, company_name, mobile_number, pst_number, pst_exempt, username, email, google_id, profile_image, role, status, salary, age, address, location, sin_number, created_at, updated_at
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
