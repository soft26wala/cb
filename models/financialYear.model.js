const db = require('../config/db');

class FinancialYearModel {
  static async getFinancialYears() {
    try {
      await db.query(`
        CREATE TABLE IF NOT EXISTS financial_years (
          fy_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          fy_name VARCHAR(50) NOT NULL UNIQUE,
          start_date DATE NOT NULL,
          end_date DATE NOT NULL,
          net_opening_balance NUMERIC(12,2) DEFAULT 0.00,
          net_closing_balance NUMERIC(12,2) DEFAULT 0.00,
          total_debit NUMERIC(12,2) DEFAULT 0.00,
          total_credit NUMERIC(12,2) DEFAULT 0.00,
          status VARCHAR(20) DEFAULT 'Active',
          closed_at TIMESTAMP WITH TIME ZONE,
          closed_by UUID REFERENCES users(id) ON DELETE SET NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `);
    } catch (e) {}

    // Ensure default active FY exists
    const check = await db.query(`SELECT COUNT(*) as count FROM financial_years`);
    if (parseInt(check.rows[0]?.count || 0, 10) === 0) {
      await db.query(`
        INSERT INTO financial_years (fy_name, start_date, end_date, net_opening_balance, net_closing_balance, status)
        VALUES ('FY 2025-2026', '2025-04-01', '2026-03-31', 0.00, 0.00, 'Closed'),
               ('FY 2026-2027', '2026-04-01', '2027-03-31', 0.00, 0.00, 'Active')
        ON CONFLICT DO NOTHING
      `);
    }

    // Calculate aggregated sales (Debits) and payments (Credits) across orders and payments
    const salesRes = await db.query(`
      SELECT COALESCE(SUM(total_amount), 0.00) as total_debit FROM orders WHERE status != 'Cancelled'
    `);
    const pmtsRes = await db.query(`
      SELECT COALESCE(SUM(paid_val), 0.00) as total_credit FROM (
        SELECT amount as paid_val FROM payments
        UNION ALL
        SELECT paid_amount as paid_val FROM orders WHERE paid_amount > 0 AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.order_id = orders.order_id)
      ) t
    `);

    const totalDebit = parseFloat(salesRes.rows[0]?.total_debit || 0);
    const totalCredit = parseFloat(pmtsRes.rows[0]?.total_credit || 0);
    const netClosing = totalCredit - totalDebit;

    const result = await db.query(`
      SELECT fy.*, u.name as closed_by_name
      FROM financial_years fy
      LEFT JOIN users u ON fy.closed_by = u.id
      ORDER BY fy.start_date DESC
    `);

    const rows = result.rows.map((row) => {
      if (row.status === 'Active') {
        return {
          ...row,
          total_debit: totalDebit,
          total_credit: totalCredit,
          net_closing_balance: netClosing,
        };
      }
      return row;
    });

    return rows;
  }

  static async getTrialBalance() {
    const query = `
      SELECT 
        u.id as user_id, 
        COALESCE(u.name, 'Valued Client') as customer_name, 
        COALESCE(u.email, 'N/A') as email, 
        u.role,
        COALESCE(latest_account.opening_balance, 0.00) as opening_balance,
        COALESCE(sales.total_debit, 0.00) as total_debit,
        (COALESCE(pmts.total_credit, 0.00) + COALESCE(direct_ord_payments.total_direct_paid, 0.00)) as total_credit,
        (COALESCE(sales.total_debit, 0.00) - (COALESCE(pmts.total_credit, 0.00) + COALESCE(direct_ord_payments.total_direct_paid, 0.00))) as closing_balance
      FROM users u
      LEFT JOIN LATERAL (
        SELECT opening_balance
        FROM accounts
        WHERE user_id = u.id
        ORDER BY transaction_date DESC, transaction_id DESC
        LIMIT 1
      ) latest_account ON true

      LEFT JOIN (
        SELECT user_id, SUM(total_amount) as total_debit
        FROM orders
        WHERE status != 'Cancelled'
        GROUP BY user_id
      ) sales ON sales.user_id = u.id

      LEFT JOIN (
        SELECT customer_id as user_id, SUM(amount) as total_credit
        FROM payments
        GROUP BY customer_id
      ) pmts ON pmts.user_id = u.id

      LEFT JOIN (
        SELECT user_id, SUM(paid_amount) as total_direct_paid
        FROM orders
        WHERE paid_amount > 0 AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.order_id = orders.order_id)
        GROUP BY user_id
      ) direct_ord_payments ON direct_ord_payments.user_id = u.id

      WHERE sales.total_debit > 0 OR pmts.total_credit > 0 OR direct_ord_payments.total_direct_paid > 0 OR LOWER(u.role) = 'user'
      ORDER BY closing_balance DESC
    `;
    const result = await db.query(query);
    return result.rows || [];
  }

  static async closeAndCarryForward({ fyId, closedBy, nextFyName, nextStartDate, nextEndDate }) {
    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      // 1. Fetch closing FY
      const fyRes = await client.query(`SELECT * FROM financial_years WHERE fy_id = $1`, [fyId]);
      if (fyRes.rows.length === 0) {
        throw new Error('Financial Year period not found');
      }

      const closingFy = fyRes.rows[0];
      if (closingFy.status === 'Closed') {
        throw new Error('Financial Year is already closed');
      }

      // 2. Compute final totals for closing FY
      const activeRes = await client.query(`
        SELECT 
          COALESCE(SUM(CASE WHEN type IN ('Debit', 'Adjustment') THEN amount ELSE 0 END), 0.00) as total_debit,
          COALESCE(SUM(CASE WHEN type IN ('Credit', 'Payment', 'Advance') THEN amount ELSE 0 END), 0.00) as total_credit
        FROM accounts
      `);

      const totalDebit = parseFloat(activeRes.rows[0].total_debit);
      const totalCredit = parseFloat(activeRes.rows[0].total_credit);
      const netClosing = totalCredit - totalDebit;

      // Update current FY to Closed
      await client.query(
        `UPDATE financial_years 
         SET status = 'Closed', total_debit = $1, total_credit = $2, net_closing_balance = $3, closed_at = CURRENT_TIMESTAMP, closed_by = $4 
         WHERE fy_id = $5`,
        [totalDebit, totalCredit, netClosing, closedBy, fyId]
      );

      // 3. Create new Financial Year
      const newFyName = nextFyName || `FY ${parseInt(closingFy.fy_name.slice(-4), 10)}-${parseInt(closingFy.fy_name.slice(-4), 10) + 1}`;
      const newStart = nextStartDate || `${parseInt(closingFy.fy_name.slice(-4), 10)}-04-01`;
      const newEnd = nextEndDate || `${parseInt(closingFy.fy_name.slice(-4), 10) + 1}-03-31`;

      const newFyRes = await client.query(
        `INSERT INTO financial_years (fy_name, start_date, end_date, net_opening_balance, status)
         VALUES ($1, $2, $3, $4, 'Active') RETURNING *`,
        [newFyName, newStart, newEnd, netClosing]
      );

      // 4. Carry forward all user closing balances as new Opening Balances
      const userBalances = await client.query(`
        SELECT u.id as user_id, COALESCE(latest_account.closing_balance, 0.00) as closing_balance
        FROM users u
        LEFT JOIN LATERAL (
          SELECT closing_balance
          FROM accounts
          WHERE user_id = u.id
          ORDER BY transaction_date DESC, transaction_id DESC
          LIMIT 1
        ) latest_account ON true
      `);

      for (const u of userBalances.rows) {
        const bal = parseFloat(u.closing_balance || 0);
        if (bal !== 0) {
          await client.query(
            `INSERT INTO accounts (user_id, type, amount, opening_balance, closing_balance, payment_method, description)
             VALUES ($1, 'Advance', $2, $2, $2, 'Year-End Rollforward', $3)`,
            [u.user_id, bal, `FY Closing Carry Forward from ${closingFy.fy_name}`]
          );
        }
      }

      await client.query('COMMIT');
      return { closingFy, newFy: newFyRes.rows[0] };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}

module.exports = FinancialYearModel;
