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
               o.total_amount as original_amount, o.paid_amount, o.credit_amount, o.payment_type, o.status, o.created_at
        FROM orders o
        LEFT JOIN users u ON o.user_id = u.id
        WHERE o.credit_amount > 0 AND o.status != 'Cancelled'
        ORDER BY o.created_at DESC
      `;
      const result = await db.query(query);
      return result.rows;
    } catch (err) {
      console.error('[AccountModel.getCreditList] Error:', err);
      return [];
    }
  }
}

module.exports = AccountModel;
