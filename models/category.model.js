const db = require('../config/db');

class CategoryModel {
  static async create({ category_name, description, status = 'active' }) {
    const query = `
      INSERT INTO category (category_name, description, status)
      VALUES ($1, $2, $3)
      RETURNING *
    `;
    const result = await db.query(query, [category_name, description, status]);
    return result.rows[0];
  }

  static async findById(id) {
    const query = `SELECT * FROM category WHERE category_id = $1`;
    const result = await db.query(query, [id]);
    return result.rows[0];
  }

  static async findAll({ search, status }) {
    let query = `SELECT * FROM category WHERE 1=1`;
    const params = [];

    if (search) {
      params.push(`%${search}%`);
      query += ` AND category_name ILIKE $${params.length}`;
    }
    if (status) {
      params.push(status);
      query += ` AND status = $${params.length}`;
    }

    query += ` ORDER BY created_at DESC`;
    const result = await db.query(query, params);
    return result.rows;
  }

  static async findAvailableCategories({ search, status = 'active' }) {
    let query = `
      SELECT DISTINCT c.* 
      FROM category c
      JOIN products p ON c.category_id = p.category_id
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      params.push(status);
      query += ` AND c.status = $${params.length} AND p.status = $${params.length}`;
    }
    if (search) {
      params.push(`%${search}%`);
      query += ` AND c.category_name ILIKE $${params.length}`;
    }

    query += ` ORDER BY c.category_name ASC`;
    const result = await db.query(query, params);
    return result.rows;
  }

  static async update(id, { category_name, description, status }) {
    const query = `
      UPDATE category
      SET category_name = COALESCE($1, category_name),
          description = COALESCE($2, description),
          status = COALESCE($3, status),
          updated_at = CURRENT_TIMESTAMP
      WHERE category_id = $4
      RETURNING *
    `;
    const result = await db.query(query, [category_name, description, status, id]);
    return result.rows[0];
  }

  static async delete(id) {
    const query = `DELETE FROM category WHERE category_id = $1 RETURNING *`;
    const result = await db.query(query, [id]);
    return result.rows[0];
  }
}

module.exports = CategoryModel;
