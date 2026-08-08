const db = require('../config/db');

/**
 * Audit Service to record changes in the 'history' table
 */
const recordHistory = async ({
  userId = null,
  action,
  tableName,
  recordId = null,
  oldData = null,
  newData = null,
  ipAddress = null,
  client = null,
}) => {
  const queryRunner = client || db;
  try {
    const query = `
      INSERT INTO history (user_id, action, table_name, record_id, old_data, new_data, ip_address)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `;
    const params = [
      userId,
      action,
      tableName,
      recordId ? String(recordId) : null,
      oldData ? JSON.stringify(oldData) : null,
      newData ? JSON.stringify(newData) : null,
      ipAddress,
    ];
    await queryRunner.query(query, params);
  } catch (error) {
    console.error('Failed to log history record:', error);
  }
};

module.exports = {
  recordHistory,
};
