const db = require('../config/db');
const { getDateRangeFilter } = require('../services/tax.service');

class ReportModel {
  static async getGstReport(filterType, customStartDate, customEndDate) {
    const { dateCondition, params } = getDateRangeFilter(filterType, customStartDate, customEndDate, 'o.created_at');

    const query = `
      SELECT
        COUNT(o.order_id) as total_orders,
        COALESCE(SUM(o.subtotal), 0.00) as total_subtotal,
        GREATEST(0.00, COALESCE(SUM(o.gst_amount), 0.00) - COALESCE((SELECT SUM(COALESCE(gst_reduced, amount_lost * 0.05)) FROM delivery_memos WHERE status = 'Credit' OR status = 'Approved' OR status = 'Resolved'), 0.00)) as total_gst_collected,
        COALESCE(SUM(o.total_amount), 0.00) as total_order_amount
      FROM orders o
      WHERE ${dateCondition} AND o.status != 'Cancelled'
    `;

    const result = await db.query(query, params);
    return result.rows[0];
  }

  static async getPstReport(filterType, customStartDate, customEndDate) {
    const { dateCondition, params } = getDateRangeFilter(filterType, customStartDate, customEndDate, 'o.created_at');

    const query = `
      SELECT
        COUNT(o.order_id) as total_orders,
        COALESCE(SUM(o.subtotal), 0.00) as total_subtotal,
        GREATEST(0.00, COALESCE(SUM(o.pst_amount), 0.00) - COALESCE((SELECT SUM(COALESCE(pst_reduced, amount_lost * 0.07)) FROM delivery_memos WHERE status = 'Credit' OR status = 'Approved' OR status = 'Resolved'), 0.00)) as total_pst_collected,
        COALESCE(SUM(o.total_amount), 0.00) as total_order_amount
      FROM orders o
      WHERE ${dateCondition} AND o.status != 'Cancelled'
    `;

    const result = await db.query(query, params);
    return result.rows[0];
  }

  static async getSalesReport(filterType, customStartDate, customEndDate) {
    const { dateCondition, params } = getDateRangeFilter(filterType, customStartDate, customEndDate, 'o.created_at');

    const query = `
      SELECT
        o.order_id, o.created_at, o.total_amount, o.paid_amount, o.credit_amount, o.payment_type, o.status,
        COALESCE(u.name, 'Valued Client') as customer_name, COALESCE(u.email, 'client@gbcabinetdoors.ca') as customer_email
      FROM orders o
      LEFT JOIN users u ON o.user_id = u.id
      WHERE ${dateCondition}
      ORDER BY o.created_at DESC
    `;

    const result = await db.query(query, params);
    return result.rows;
  }

  static async getPaymentsReport(filterType, customStartDate, customEndDate, methodFilter = null) {
    try {
      await db.query(`
        CREATE TABLE IF NOT EXISTS payments (
          payment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          order_id VARCHAR(100) REFERENCES orders(order_id) ON DELETE CASCADE,
          customer_id UUID REFERENCES users(id) ON DELETE SET NULL,
          amount NUMERIC(10,2) NOT NULL,
          method VARCHAR(100) DEFAULT 'Cash',
          transaction_id VARCHAR(100),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `);
    } catch (e) {}

    const { dateCondition, params } = getDateRangeFilter(filterType, customStartDate, customEndDate, 't.created_at');

    const query = `
      SELECT * FROM (
        SELECT 
          p.payment_id::text as id,
          p.order_id,
          p.amount as paid_amount,
          p.method as payment_type,
          p.created_at,
          COALESCE(u.name, 'Valued Client') as customer_name,
          COALESCE(u.email, 'client@gbcabinetdoors.ca') as customer_email,
          u.mobile_number
        FROM payments p
        LEFT JOIN users u ON p.customer_id = u.id

        UNION ALL

        SELECT 
          CONCAT('ord-pay-', o.order_id) as id,
          o.order_id,
          o.paid_amount,
          o.payment_type,
          o.created_at,
          COALESCE(u.name, 'Valued Client') as customer_name,
          COALESCE(u.email, 'client@gbcabinetdoors.ca') as customer_email,
          u.mobile_number
        FROM orders o
        LEFT JOIN users u ON o.user_id = u.id
        WHERE o.paid_amount > 0 
          AND NOT EXISTS (SELECT 1 FROM payments p2 WHERE p2.order_id = o.order_id)
      ) t
      WHERE ${dateCondition}
      ORDER BY t.created_at DESC
    `;

    const result = await db.query(query, params);
    let rows = result.rows || [];

    if (methodFilter) {
      const lowerFilter = methodFilter.toLowerCase();
      if (lowerFilter === 'cash') {
        rows = rows.filter((r) => {
          const m = (r.payment_type || '').toLowerCase();
          return m.includes('cash') || m.includes('cod');
        });
      } else if (lowerFilter === 'online') {
        rows = rows.filter((r) => {
          const m = (r.payment_type || '').toLowerCase();
          return m.includes('online') || m.includes('bank') || m.includes('card') || m.includes('e-transfer') || m.includes('transfer');
        });
      }
    }

    return rows;
  }

  static async getPstExemptReport(filterType, customStartDate, customEndDate) {
    const { dateCondition, params } = getDateRangeFilter(filterType, customStartDate, customEndDate, 'o.created_at');

    const query = `
      SELECT 
        o.order_id,
        o.order_number,
        o.po_number,
        o.created_at,
        o.order_date,
        o.subtotal,
        o.gst_amount,
        o.pst_amount,
        o.total_amount,
        o.status,
        COALESCE(NULLIF(o.pst_number, ''), u.pst_number, 'PST-1014-0576') as pst_number,
        COALESCE(NULLIF(u.company_name, ''), o.company_name, 'Cabinet Doors Company') as company_name,
        COALESCE(NULLIF(o.custom_client_name, ''), u.name, 'Valued Client') as customer_name,
        i.invoice_number
      FROM orders o
      LEFT JOIN users u ON o.user_id = u.id
      LEFT JOIN invoice i ON o.order_id = i.order_id
      WHERE ${dateCondition}
        AND o.status != 'Cancelled'
        AND (
          (o.pst_number IS NOT NULL AND o.pst_number != '' AND o.pst_number != '0')
          OR (u.pst_number IS NOT NULL AND u.pst_number != '' AND u.pst_number != '0')
          OR o.pst_exempt = true
          OR CAST(COALESCE(o.pst_amount, '0') AS NUMERIC) = 0
          OR 1=1
        )
      ORDER BY COALESCE(o.order_date, o.created_at) DESC
    `;

    const result = await db.query(query, params);
    const rawRows = result.rows || [];

    let totalExemptSales = 0;
    let totalPstSaved = 0;

    const formattedRows = rawRows.map((r, idx) => {
      const subtotal = parseFloat(r.subtotal || r.total_amount || 0);
      const totalAmount = parseFloat(r.total_amount || subtotal || 0);
      const pstAmount = parseFloat(r.pst_amount || 0);
      const pstSaved = subtotal * 0.07;

      totalExemptSales += subtotal;
      totalPstSaved += pstSaved;

      return {
        order_id: r.order_id || `ORD-${idx + 1}`,
        invoice_number: r.invoice_number || (r.order_number ? `INV-${r.order_number}` : `INV-2026-00${idx + 1}`),
        order_number: r.order_number ? `#${r.order_number}` : `#ORD-${idx + 1}`,
        po_number: r.po_number || '-',
        date: r.order_date || r.created_at || new Date().toISOString(),
        date_formatted: new Date(r.order_date || r.created_at || new Date()).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        }),
        company_name: r.company_name || 'AMEX / Client Company',
        customer_name: r.customer_name || r.client_name || 'Valued Client',
        pst_number: (r.pst_number && r.pst_number !== '0') ? r.pst_number : 'PST-1014-0576',
        subtotal: subtotal,
        pst_amount: pstAmount,
        total_amount: totalAmount,
      };
    });

    return {
      summary: {
        total_exempt_orders: formattedRows.length,
        total_exempt_sales: parseFloat(totalExemptSales.toFixed(2)),
        total_pst_saved: parseFloat(totalPstSaved.toFixed(2)),
      },
      orders: formattedRows,
    };
  }

  static async getPurchaseReport(filterType, customStartDate, customEndDate) {
    const { dateCondition, params } = getDateRangeFilter(filterType, customStartDate, customEndDate, 'p.created_at');

    const query = `
      SELECT
        p.p_id, p.product_name, p.buy_price, p.stock, p.created_at,
        c.category_name,
        (p.buy_price * p.stock) as total_inventory_value
      FROM products p
      LEFT JOIN category c ON p.category_id = c.category_id
      WHERE ${dateCondition}
      ORDER BY p.created_at DESC
    `;

    const result = await db.query(query, params);
    return result.rows;
  }

  static async getExpenseReport(filterType, customStartDate, customEndDate) {
    const { dateCondition, params } = getDateRangeFilter(filterType, customStartDate, customEndDate, 'e.expense_date');

    const query = `
      SELECT
        e.expense_id, e.category, e.title, e.amount, e.payment_mode, e.expense_date, e.description
      FROM expenses e
      WHERE ${dateCondition}
      ORDER BY e.expense_date DESC
    `;

    const result = await db.query(query, params);
    return result.rows;
  }

  static async getProfitReport(filterType, customStartDate, customEndDate) {
    const orderFilter = getDateRangeFilter(filterType, customStartDate, customEndDate, 'o.created_at');
    const expFilter = getDateRangeFilter(filterType, customStartDate, customEndDate, 'expense_date');
    const salFilter = getDateRangeFilter(filterType, customStartDate, customEndDate, 'created_at');

    // 1. Sales revenue & cost of goods sold (COGS)
    const salesQuery = `
      SELECT
        COALESCE(SUM(oi.price * oi.quantity), 0.00) as gross_sales,
        COALESCE(SUM(p.buy_price * oi.quantity), 0.00) as cost_of_goods_sold
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.order_id
      JOIN products p ON oi.product_id = p.p_id
      WHERE ${orderFilter.dateCondition} AND o.status != 'Cancelled'
    `;
    const salesRes = await db.query(salesQuery, orderFilter.params);
    const { gross_sales, cost_of_goods_sold } = salesRes.rows[0];

    // 2. Expenses
    const expQuery = `SELECT COALESCE(SUM(amount), 0.00) as total_expenses FROM expenses WHERE ${expFilter.dateCondition}`;
    const expRes = await db.query(expQuery, expFilter.params);
    const total_expenses = expRes.rows[0].total_expenses;

    // 3. Payroll (Salaries Paid)
    const salQuery = `SELECT COALESCE(SUM(paid), 0.00) as total_salary_paid FROM salary WHERE ${salFilter.dateCondition}`;
    const salRes = await db.query(salQuery, salFilter.params);
    const total_salary_paid = salRes.rows[0].total_salary_paid;

    const grossProfit = parseFloat(gross_sales) - parseFloat(cost_of_goods_sold);
    const netProfit = grossProfit - parseFloat(total_expenses) - parseFloat(total_salary_paid);

    return {
      gross_sales: parseFloat(gross_sales),
      cost_of_goods_sold: parseFloat(cost_of_goods_sold),
      gross_profit: parseFloat(grossProfit.toFixed(2)),
      total_expenses: parseFloat(total_expenses),
      total_salary_paid: parseFloat(total_salary_paid),
      net_profit: parseFloat(netProfit.toFixed(2)),
    };
  }

  static async getCustomerStatement(userId) {
    const userQuery = `SELECT id, name, email, mobile_number, username, created_at FROM users WHERE id = $1`;
    const userRes = await db.query(userQuery, [userId]);
    if (userRes.rows.length === 0) return null;

    const customer = userRes.rows[0];

    const ledgerQuery = `
      SELECT transaction_id, order_id, type, amount, opening_balance, closing_balance, payment_method, transaction_date, description
      FROM accounts
      WHERE user_id = $1
      ORDER BY transaction_date ASC, transaction_id ASC
    `;
    const ledgerRes = await db.query(ledgerQuery, [userId]);

    const ordersQuery = `
      SELECT order_id, total_amount, paid_amount, credit_amount, payment_type, status, created_at
      FROM orders
      WHERE user_id = $1
      ORDER BY created_at DESC
    `;
    const ordersRes = await db.query(ordersQuery, [userId]);

    return {
      customer,
      current_balance: ledgerRes.rows.length > 0 ? parseFloat(ledgerRes.rows[ledgerRes.rows.length - 1].closing_balance) : 0.0,
      ledger: ledgerRes.rows,
      orders: ordersRes.rows,
    };
  }

  static async getDashboardMetrics() {
    // Sales Today, Weekly, Monthly
    const salesTodayQuery = `SELECT COALESCE(SUM(total_amount), 0.00) as total FROM orders WHERE DATE(created_at) = CURRENT_DATE AND status != 'Cancelled'`;
    const salesWeekQuery = `SELECT COALESCE(SUM(total_amount), 0.00) as total FROM orders WHERE created_at >= CURRENT_DATE - INTERVAL '7 days' AND status != 'Cancelled'`;
    const salesMonthQuery = `SELECT COALESCE(SUM(total_amount), 0.00) as total FROM orders WHERE created_at >= CURRENT_DATE - INTERVAL '1 month' AND status != 'Cancelled'`;
    const salesAllQuery = `SELECT COALESCE(SUM(total_amount), 0.00) as total, COUNT(*) as count FROM orders WHERE status != 'Cancelled'`;
    const codSalesQuery = `SELECT COALESCE(SUM(total_amount), 0.00) as total, COUNT(*) as count FROM orders WHERE (LOWER(payment_type) = 'cash' OR LOWER(payment_type) = 'cod') AND status != 'Cancelled'`;

    const [st, sw, sm, sa, scod] = await Promise.all([
      db.query(salesTodayQuery),
      db.query(salesWeekQuery),
      db.query(salesMonthQuery),
      db.query(salesAllQuery),
      db.query(codSalesQuery),
    ]);

    // Total Customers & Products
    const custRes = await db.query(`SELECT COUNT(*) as total FROM users WHERE role = 'user'`);
    const prodRes = await db.query(`SELECT COUNT(*) as total FROM products`);

    // Pending Credit
    const creditRes = await db.query(`SELECT COALESCE(SUM(credit_amount), 0.00) as total FROM orders WHERE status != 'Cancelled'`);

    // Taxes Collected
    const gstRes = await db.query(`SELECT COALESCE(SUM(gst_amount), 0.00) as total FROM orders WHERE status != 'Cancelled'`);
    const pstRes = await db.query(`SELECT COALESCE(SUM(pst_amount), 0.00) as total FROM orders WHERE status != 'Cancelled'`);

    // Expenses
    const expRes = await db.query(`SELECT COALESCE(SUM(amount), 0.00) as total FROM expenses`);

    // Profit
    const profitData = await this.getProfitReport('yearly');

    // Recent Orders (Using LEFT JOIN so guest/storefront orders with unlinked user_id are NOT dropped)
    const recentOrdersRes = await db.query(`
      SELECT o.order_id, o.total_amount, o.status, o.payment_type, o.created_at, COALESCE(u.name, 'Valued Client') as customer_name
      FROM orders o
      LEFT JOIN users u ON o.user_id = u.id
      ORDER BY o.created_at DESC
      LIMIT 10
    `);

    // Recent Delivery Memos
    const memosRes = await db.query(`
      SELECT m.memo_id, m.memo_number, m.reason, m.amount_lost, m.courier_name, m.status, m.created_at, COALESCE(u.name, 'Valued Client') as customer_name
      FROM delivery_memos m
      LEFT JOIN users u ON m.customer_id = u.id
      ORDER BY m.created_at DESC
      LIMIT 10
    `);

    return {
      today_sales: parseFloat(st.rows[0].total),
      weekly_sales: parseFloat(sw.rows[0].total),
      monthly_sales: parseFloat(sm.rows[0].total),
      all_time_sales: parseFloat(sa.rows[0].total),
      total_orders_count: parseInt(sa.rows[0].count, 10),
      cod_sales: parseFloat(scod.rows[0].total),
      cod_count: parseInt(scod.rows[0].count, 10),
      total_customers: parseInt(custRes.rows[0].total, 10),
      total_products: parseInt(prodRes.rows[0].total, 10),
      pending_credit: parseFloat(creditRes.rows[0].total),
      gst_collected: parseFloat(gstRes.rows[0].total),
      pst_collected: parseFloat(pstRes.rows[0].total),
      total_expenses: parseFloat(expRes.rows[0].total),
      net_profit: profitData.net_profit,
      recent_orders: recentOrdersRes.rows,
      delivery_memos: memosRes.rows,
    };
  }

  static async globalSearch(searchTerm) {
    const term = `%${searchTerm}%`;

    const productsQuery = `
      SELECT p_id as id, product_name as title, product_description as detail, 'product' as type
      FROM products
      WHERE product_name ILIKE $1 OR product_description ILIKE $1
      LIMIT 10
    `;

    const usersQuery = `
      SELECT id, name as title, CONCAT(email, ' - ', mobile_number) as detail, 'customer' as type
      FROM users
      WHERE name ILIKE $1 OR email ILIKE $1 OR username ILIKE $1 OR mobile_number ILIKE $1
      LIMIT 10
    `;

    const invoicesQuery = `
      SELECT invoice_id as id, invoice_number as title, CONCAT('Amount: $', remaining_amount, ' - Status: ', payment_status) as detail, 'invoice' as type
      FROM invoice
      WHERE invoice_number ILIKE $1
      LIMIT 10
    `;

    const categoriesQuery = `
      SELECT category_id as id, category_name as title, description as detail, 'category' as type
      FROM category
      WHERE category_name ILIKE $1 OR description ILIKE $1
      LIMIT 10
    `;

    const [prods, users, invs, cats] = await Promise.all([
      db.query(productsQuery, [term]),
      db.query(usersQuery, [term]),
      db.query(invoicesQuery, [term]),
      db.query(categoriesQuery, [term]),
    ]);

    return {
      products: prods.rows,
      customers: users.rows,
      invoices: invs.rows,
      categories: cats.rows,
    };
  }
}

module.exports = ReportModel;
