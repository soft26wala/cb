const db = require('../config/db');

class ShortcutModel {
  static async ensureTableExists() {
    await db.query(`
      CREATE TABLE IF NOT EXISTS shortcuts (
          shortcut_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          page_name VARCHAR(100) NOT NULL,
          page_route VARCHAR(100) NOT NULL,
          description VARCHAR(255) NOT NULL,
          shortcut_key VARCHAR(50) NOT NULL,
          category VARCHAR(50) DEFAULT 'Navigation',
          is_active BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_shortcuts_page ON shortcuts(page_name);
    `);
  }

  static async findAll() {
    try {
      const query = `
        SELECT shortcut_id, page_name, page_route, description, shortcut_key, category, is_active, created_at, updated_at
        FROM shortcuts
        ORDER BY page_name ASC, created_at ASC
      `;
      const result = await db.query(query);
      return result.rows || [];
    } catch (err) {
      if (err.message && err.message.includes('relation "shortcuts" does not exist')) {
        await this.ensureTableExists();
        const query = `
          SELECT shortcut_id, page_name, page_route, description, shortcut_key, category, is_active, created_at, updated_at
          FROM shortcuts
          ORDER BY page_name ASC, created_at ASC
        `;
        const result = await db.query(query);
        return result.rows || [];
      }
      throw err;
    }
  }

  static async findById(id) {
    await this.ensureTableExists();
    const query = `SELECT * FROM shortcuts WHERE shortcut_id = $1`;
    const result = await db.query(query, [id]);
    return result.rows[0];
  }

  static async create(shortcutData) {
    await this.ensureTableExists();
    const { page_name, page_route, description, shortcut_key, category = 'Navigation', is_active = true } = shortcutData;
    const query = `
      INSERT INTO shortcuts (page_name, page_route, description, shortcut_key, category, is_active)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;
    const values = [page_name, page_route, description, shortcut_key, category, is_active];
    const result = await db.query(query, values);
    return result.rows[0];
  }

  static async update(id, updateData) {
    await this.ensureTableExists();
    const fields = [];
    const values = [];
    let idx = 1;

    const allowedFields = ['page_name', 'page_route', 'description', 'shortcut_key', 'category', 'is_active'];

    allowedFields.forEach((field) => {
      if (updateData[field] !== undefined) {
        fields.push(`${field} = $${idx}`);
        values.push(updateData[field]);
        idx++;
      }
    });

    if (fields.length === 0) return null;

    fields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    const query = `
      UPDATE shortcuts
      SET ${fields.join(', ')}
      WHERE shortcut_id = $${idx}
      RETURNING *
    `;

    const result = await db.query(query, values);
    return result.rows[0];
  }

  static async batchUpdate(shortcutsArray) {
    await this.ensureTableExists();
    const updated = [];
    for (const item of shortcutsArray) {
      if (item.shortcut_id) {
        const res = await this.update(item.shortcut_id, item);
        if (res) updated.push(res);
      }
    }
    return updated;
  }

  static async delete(id) {
    await this.ensureTableExists();
    const query = `DELETE FROM shortcuts WHERE shortcut_id = $1 RETURNING shortcut_id`;
    const result = await db.query(query, [id]);
    return result.rows[0];
  }

  static async deleteAll() {
    await this.ensureTableExists();
    const query = `DELETE FROM shortcuts`;
    await db.query(query);
  }
}

module.exports = ShortcutModel;
