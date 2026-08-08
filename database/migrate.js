const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const db = require('../config/db');

async function runMigration() {
  const client = await db.getClient();
  try {
    console.log('⚡ Starting database migration...');
    const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');

    await client.query('BEGIN');
    await client.query(schemaSql);
    await client.query('COMMIT');

    console.log('✅ Database schema migration completed successfully.');

    // Seed default Admin account if not exists
    const adminCheck = await client.query("SELECT * FROM users WHERE role = 'admin' LIMIT 1");
    if (adminCheck.rows.length === 0) {
      const hashedPassword = await bcrypt.hash('Admin@12345', 10);
      await client.query(
        `INSERT INTO users (name, username, email, password, role, status)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        ['Super Admin', 'admin', 'admin@example.com', hashedPassword, 'admin', 'active']
      );
      console.log('👤 Default Admin account created: admin / Admin@12345');
    }
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    client.release();
    db.pool.end();
  }
}

if (require.main === module) {
  runMigration();
}

module.exports = runMigration;
