const db = require('../config/db');

class HistoryModel {
  static async findAll({ tableName, userId, action, limit = 100, offset = 0 }) {
    let query = `
      SELECT h.*, u.name as user_name, u.email as user_email, u.username
      FROM history h
      LEFT JOIN users u ON h.user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (tableName) {
      params.push(tableName);
      query += ` AND h.table_name = $${params.length}`;
    }
    if (userId) {
      params.push(userId);
      query += ` AND h.user_id = $${params.length}`;
    }
    if (action) {
      params.push(action);
      query += ` AND h.action = $${params.length}`;
    }

    query += ` ORDER BY h.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await db.query(query, params);
    return result.rows;
  }
}

module.exports = HistoryModel;
