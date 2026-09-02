const db = require('../config/db');

class AccountModel {
  static async getAllTransactions({ limit = 100, offset = 0 } = {}) {
    const query = `
      SELECT * FROM (
        SELECT 
          a.transaction_id::text as id,
          a.user_id,
          COALESCE(u.name, 'Valued Client') as customer_name,
          COALESCE(u.email, 'client@gbcabinetdoors.ca') as customer_email,
          a.type,
          a.amount,
          a.opening_balance,
          a.closing_balance,
          a.payment_method,
          a.description,
          a.transaction_date
        FROM accounts a
        LEFT JOIN users u ON a.user_id = u.id

        UNION ALL

        SELECT 
          CONCAT('ord-deb-', o.order_id) as id,
          o.user_id,
          COALESCE(u.name, 'Valued Client') as customer_name,
          COALESCE(u.email, 'client@gbcabinetdoors.ca') as customer_email,
          'Debit' as type,
          o.total_amount as amount,
          0.00 as opening_balance,
          o.credit_amount as closing_balance,
          o.payment_type as payment_method,
          CONCAT('Order Invoice #', SUBSTRING(o.order_id, 1, 8)) as description,
          o.created_at as transaction_date
        FROM orders o
        LEFT JOIN users u ON o.user_id = u.id
        WHERE o.status != 'Cancelled'
          AND NOT EXISTS (SELECT 1 FROM accounts a2 WHERE a2.order_id = o.order_id AND a2.type = 'Debit')

        UNION ALL

        SELECT 
          p.payment_id::text as id,
          p.customer_id as user_id,
          COALESCE(u.name, 'Valued Client') as customer_name,
          COALESCE(u.email, 'client@gbcabinetdoors.ca') as customer_email,
          'Credit' as type,
          p.amount,
          0.00 as opening_balance,
          0.00 as closing_balance,
          p.method as payment_method,
          CONCAT('Payment Received for Order #', SUBSTRING(p.order_id, 1, 8)) as description,
          p.created_at as transaction_date
        FROM payments p
        LEFT JOIN users u ON p.customer_id = u.id
        WHERE NOT EXISTS (SELECT 1 FROM accounts a3 WHERE a3.order_id = p.order_id AND a3.type IN ('Credit', 'Payment'))

        UNION ALL

        SELECT 
          CONCAT('ord-pay-', o.order_id) as id,
          o.user_id,
          COALESCE(u.name, 'Valued Client') as customer_name,
          COALESCE(u.email, 'client@gbcabinetdoors.ca') as customer_email,
          'Credit' as type,
          o.paid_amount as amount,
          0.00 as opening_balance,
          0.00 as closing_balance,
          o.payment_type as payment_method,
          CONCAT('Initial Payment Received for Order #', SUBSTRING(o.order_id, 1, 8)) as description,
          o.created_at as transaction_date
        FROM orders o
        LEFT JOIN users u ON o.user_id = u.id
        WHERE o.paid_amount > 0 
          AND NOT EXISTS (SELECT 1 FROM payments p2 WHERE p2.order_id = o.order_id)
          AND NOT EXISTS (SELECT 1 FROM accounts a4 WHERE a4.order_id = o.order_id AND a4.type IN ('Credit', 'Payment'))
      ) t
      ORDER BY t.transaction_date DESC
      LIMIT $1 OFFSET $2
    `;
    const result = await db.query(query, [limit, offset]);
    return result.rows || [];
  }

  static async getLedgerByUserId(userId, { limit = 100, offset = 0 } = {}) {
    const query = `
      SELECT a.*, o.order_id, u.name as customer_name
      FROM accounts a
      JOIN users u ON a.user_id = u.id
      LEFT JOIN orders o ON a.order_id = o.order_id
      WHERE a.user_id = $1
      ORDER BY a.transaction_date DESC, a.transaction_id DESC
      LIMIT $2 OFFSET $3
    `;
    const result = await db.query(query, [userId, limit, offset]);
    return result.rows;
  }

  static async getCreditList() {
    try {
      const query = `
        SELECT o.order_id, o.user_id, COALESCE(u.name, 'Valued Client') as customer_name, COALESCE(u.email, 'client@gbcabinetdoors.ca') as customer_email, u.mobile_number,
               o.total_amount as original_amount, o.paid_amount,
               GREATEST(0, (o.credit_amount - COALESCE(m.credit_amount, 0))) as credit_amount,
               o.payment_type, o.status, o.created_at,
               m.credit_percentage, m.credit_amount as memo_credit_amount, m.gst_reduced, m.pst_reduced, m.memo_number
        FROM orders o
        LEFT JOIN users u ON o.user_id = u.id
        LEFT JOIN (
          SELECT DISTINCT ON (order_id) order_id, credit_percentage, credit_amount, gst_reduced, pst_reduced, memo_number
          FROM delivery_memos
          WHERE order_id IS NOT NULL
          ORDER BY order_id, created_at DESC
        ) m ON o.order_id = m.order_id
        WHERE o.credit_amount > 0 AND o.status != 'Cancelled'
          AND (m.credit_percentage IS NULL OR m.credit_percentage < 100)
          AND (o.credit_amount - COALESCE(m.credit_amount, 0)) > 0.01
        ORDER BY o.created_at DESC
      `;
      const result = await db.query(query);
      return result.rows;
    } catch (err) {
      console.error('[AccountModel.getCreditList] Error:', err);
      return [];
    }
  }

  static async getClientBalances({ search = '' } = {}) {
    try {
      let query = `
        SELECT 
          u.id as user_id,
          u.name as customer_name,
          u.company_name,
          u.email as customer_email,
          u.mobile_number,
          u.pst_number,
          u.pst_exempt,
          0.00 as opening_balance,
          COALESCE((
            SELECT SUM(o.total_amount) 
            FROM orders o 
            WHERE o.user_id = u.id AND o.status != 'Cancelled'
          ), 0.00) as total_debits,
          COALESCE((
            SELECT SUM(p.amount) 
            FROM payments p 
            WHERE p.customer_id = u.id
          ), 0.00) + COALESCE((
            SELECT SUM(o2.paid_amount) 
            FROM orders o2 
            WHERE o2.user_id = u.id AND o2.paid_amount > 0 AND NOT EXISTS (SELECT 1 FROM payments p2 WHERE p2.order_id = o2.order_id)
          ), 0.00) as total_credits
        FROM users u
        WHERE u.status IS DISTINCT FROM 'disabled'
          AND LOWER(u.role) != 'admin'
      `;

      const params = [];
      if (search && search.trim() !== '') {
        params.push(`%${search.trim()}%`);
        query += ` AND (u.name ILIKE $1 OR u.company_name ILIKE $1 OR u.email ILIKE $1 OR CAST(u.mobile_number AS TEXT) ILIKE $1)`;
      }

      query += ` ORDER BY u.company_name ASC NULLS LAST, u.name ASC`;

      const result = await db.query(query, params);
      const rows = result.rows || [];

      return rows.map((row) => {
        const debits = parseFloat(row.total_debits || 0);
        const credits = parseFloat(row.total_credits || 0);
        const netBalance = credits - debits;

        let status = 'SETTLED';
        if (netBalance > 0.001) status = 'ADVANCE';
        else if (netBalance < -0.001) status = 'UDHAR';

        return {
          ...row,
          total_debits: debits,
          total_credits: credits,
          net_balance: netBalance,
          status,
        };
      });
    } catch (err) {
      console.error('[AccountModel.getClientBalances] Error:', err);
      return [];
    }
  }

  static async getClientBalanceByUserId(userId) {
    try {
      const query = `
        SELECT 
          u.id as user_id,
          u.name as customer_name,
          u.company_name,
          COALESCE((
            SELECT SUM(o.total_amount) 
            FROM orders o 
            WHERE o.user_id = u.id AND o.status != 'Cancelled'
          ), 0.00) as total_debits,
          COALESCE((
            SELECT SUM(p.amount) 
            FROM payments p 
            WHERE p.customer_id = u.id
          ), 0.00) + COALESCE((
            SELECT SUM(o2.paid_amount) 
            FROM orders o2 
            WHERE o2.user_id = u.id AND o2.paid_amount > 0 AND NOT EXISTS (SELECT 1 FROM payments p2 WHERE p2.order_id = o2.order_id)
          ), 0.00) as total_credits
        FROM users u
        WHERE u.id = $1
      `;
      const result = await db.query(query, [userId]);
      if (!result.rows || result.rows.length === 0) return null;
      const row = result.rows[0];
      const debits = parseFloat(row.total_debits || 0);
      const credits = parseFloat(row.total_credits || 0);
      const netBalance = credits - debits;

      let status = 'SETTLED';
      if (netBalance > 0.001) status = 'ADVANCE';
      else if (netBalance < -0.001) status = 'UDHAR';

      return {
        ...row,
        total_debits: debits,
        total_credits: credits,
        net_balance: netBalance,
        status,
      };
    } catch (err) {
      console.error('[AccountModel.getClientBalanceByUserId] Error:', err);
      return null;
    }
  }

  static async recordAdvancePayment({ userId, amount, paymentMethod, description = '' }) {
    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      const numAmount = parseFloat(amount);
      if (isNaN(numAmount) || numAmount <= 0) throw new Error('Invalid payment amount');

      const paymentRes = await client.query(
        `INSERT INTO payments (customer_id, amount, method, transaction_id, created_at)
         VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
         RETURNING *`,
        [userId, numAmount, paymentMethod || 'Cash', 'ADV-' + Date.now()]
      );

      const { addLedgerTransaction } = require('../services/ledger.service');
      await addLedgerTransaction({
        userId,
        type: 'Advance',
        amount: numAmount,
        paymentMethod: paymentMethod || 'Cash',
        description: description || 'Advance Payment Received',
        client,
      });

      await client.query('COMMIT');
      return paymentRes.rows[0];
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}

module.exports = AccountModel;
