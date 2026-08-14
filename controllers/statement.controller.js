const db = require('../config/db');
const { successResponse, errorResponse } = require('../utils/response');

// Ensure payments table has necessary columns if missing
const ensurePaymentsColumnsExist = async () => {
  try {
    await db.query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS reference_number VARCHAR(100);`);
    await db.query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS notes TEXT;`);
    await db.query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS payment_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;`);
  } catch (err) {
    console.warn('Payments columns migration warning:', err.message);
  }
};
ensurePaymentsColumnsExist();

class StatementController {
  static async getClientStatement(req, res, next) {
    try {
      const { userId, customClientName, startDate, endDate } = req.query;

      if (!userId && !customClientName) {
        return errorResponse(res, 'Please select a Client or specify Client Name', null, 400);
      }

      const start = startDate ? new Date(startDate) : null;
      const end = endDate ? new Date(new Date(endDate).setHours(23, 59, 59, 999)) : null;

      // 1. Fetch Client Info
      let clientInfo = {
        id: userId || null,
        name: customClientName || 'Valued Client',
        company_name: '',
        email: '',
        mobile_number: '',
        pst_number: '',
      };

      if (userId && userId !== 'null' && userId !== 'undefined') {
        try {
          const uRes = await db.query(
            `SELECT id, name, company_name, email, mobile_number, pst_number FROM users WHERE id::text = $1`,
            [String(userId)]
          );
          if (uRes.rows.length > 0) {
            clientInfo = {
              ...uRes.rows[0],
              name: uRes.rows[0].name || customClientName || 'Valued Client',
            };
          }
        } catch (e) {
          console.warn('User fetch by ID warning:', e.message);
        }
      }

      // 2. Fetch Orders for this Client (flexible match by user_id OR custom client name / company name)
      const orderParams = [];
      let orderWhereClauses = [];

      if (userId && userId !== 'null' && userId !== 'undefined') {
        orderParams.push(String(userId));
        orderWhereClauses.push(`o.user_id::text = $${orderParams.length}`);
      }

      const nameToMatch = clientInfo.name || customClientName;
      if (nameToMatch && nameToMatch.trim() && nameToMatch !== 'Valued Client') {
        orderParams.push(`%${nameToMatch.trim()}%`);
        orderWhereClauses.push(`o.custom_client_name ILIKE $${orderParams.length}`);
        orderWhereClauses.push(`u.name ILIKE $${orderParams.length}`);
      }

      if (clientInfo.company_name && clientInfo.company_name.trim()) {
        orderParams.push(`%${clientInfo.company_name.trim()}%`);
        orderWhereClauses.push(`o.custom_client_name ILIKE $${orderParams.length}`);
        orderWhereClauses.push(`u.company_name ILIKE $${orderParams.length}`);
      }

      let ordersQuery = `
        SELECT o.order_id, o.order_number, o.po_number, o.order_date, o.delivery_date, o.created_at, 
               o.total_amount, o.paid_amount, o.credit_amount, o.status, o.payment_type, o.subtotal, o.gst_amount, o.pst_amount,
               o.custom_client_name
        FROM orders o
        LEFT JOIN users u ON o.user_id = u.id
        WHERE o.status != 'Cancelled'
      `;

      if (orderWhereClauses.length > 0) {
        ordersQuery += ` AND (${orderWhereClauses.join(' OR ')})`;
      }

      ordersQuery += ` ORDER BY COALESCE(o.order_date, o.created_at) ASC`;
      const ordersRes = await db.query(ordersQuery, orderParams);
      const orders = ordersRes.rows || [];

      // 3. Fetch Payments Received for this Client (flexible match by customer_id OR order user_id OR custom_client_name)
      const paymentParams = [];
      let paymentWhereClauses = [];

      if (userId && userId !== 'null' && userId !== 'undefined') {
        paymentParams.push(String(userId));
        paymentWhereClauses.push(`p.customer_id::text = $${paymentParams.length}`);
        paymentWhereClauses.push(`o.user_id::text = $${paymentParams.length}`);
      }

      if (nameToMatch && nameToMatch.trim() && nameToMatch !== 'Valued Client') {
        paymentParams.push(`%${nameToMatch.trim()}%`);
        paymentWhereClauses.push(`o.custom_client_name ILIKE $${paymentParams.length}`);
        paymentWhereClauses.push(`u.name ILIKE $${paymentParams.length}`);
      }

      if (clientInfo.company_name && clientInfo.company_name.trim()) {
        paymentParams.push(`%${clientInfo.company_name.trim()}%`);
        paymentWhereClauses.push(`o.custom_client_name ILIKE $${paymentParams.length}`);
        paymentWhereClauses.push(`u.company_name ILIKE $${paymentParams.length}`);
      }

      let paymentsQuery = `
        SELECT p.payment_id, p.order_id, p.customer_id, p.amount, p.method, 
               COALESCE(p.transaction_id, p.reference_number, '') as reference_number, 
               p.notes, COALESCE(p.payment_date, p.created_at) as created_at,
               o.order_number
        FROM payments p
        LEFT JOIN orders o ON p.order_id = o.order_id
        LEFT JOIN users u ON p.customer_id = u.id
        WHERE 1=1
      `;

      if (paymentWhereClauses.length > 0) {
        paymentsQuery += ` AND (${paymentWhereClauses.join(' OR ')})`;
      }

      paymentsQuery += ` ORDER BY COALESCE(p.payment_date, p.created_at) ASC`;
      const paymentsRes = await db.query(paymentsQuery, paymentParams);
      const payments = paymentsRes.rows || [];

      // Combine into unified transaction ledger list
      const allTxns = [];

      orders.forEach((ord) => {
        const txnDate = new Date(ord.order_date || ord.created_at);
        const delivDate = ord.delivery_date ? new Date(ord.delivery_date) : null;
        const delivStr = delivDate
          ? delivDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
          : (ord.status === 'Delivered' || ord.status === 'Completed' ? 'Delivered' : 'Pending');

        allTxns.push({
          id: `ord-${ord.order_id}`,
          date: txnDate,
          delivery_date: delivDate,
          delivery_date_formatted: delivStr,
          type: 'ORDER',
          status: ord.status || 'Active',
          reference: ord.order_number ? `#${ord.order_number}` : `Order #${ord.order_id.slice(0, 8)}`,
          po_number: ord.po_number || '-',
          description: `Order ${ord.order_number ? '#' + ord.order_number : ''}${ord.po_number ? ' (PO: ' + ord.po_number + ')' : ''} — Status: ${ord.status || 'Active'}`,
          debit: parseFloat(ord.total_amount || 0), // Billed (+)
          credit: 0,
          raw: ord,
        });

        // If order had direct initial payment recorded without a separate row in payments table
        if (parseFloat(ord.paid_amount || 0) > 0) {
          const hasSeparatePaymentRow = payments.some((p) => String(p.order_id) === String(ord.order_id));
          if (!hasSeparatePaymentRow) {
            allTxns.push({
              id: `ord-pay-${ord.order_id}`,
              date: txnDate,
              delivery_date: null,
              delivery_date_formatted: '-',
              type: 'PAYMENT',
              status: 'Paid',
              reference: ord.order_number ? `#${ord.order_number}` : `Order #${ord.order_id.slice(0, 8)}`,
              po_number: ord.po_number || '-',
              description: `Initial Payment Received via ${ord.payment_type || 'Cash'} for Order ${ord.order_number ? '#' + ord.order_number : ''}`,
              debit: 0,
              credit: parseFloat(ord.paid_amount || 0), // Paid (-)
              raw: ord,
            });
          }
        }
      });

      payments.forEach((pay) => {
        const txnDate = new Date(pay.created_at);
        allTxns.push({
          id: `pay-${pay.payment_id}`,
          date: txnDate,
          delivery_date: null,
          delivery_date_formatted: '-',
          type: 'PAYMENT',
          status: 'Payment Received',
          reference: pay.order_number ? `#${pay.order_number}` : (pay.reference_number || 'PMT'),
          po_number: '-',
          description: `Payment Received via ${pay.method || 'Cash'}${pay.reference_number ? ' (Ref: ' + pay.reference_number + ')' : ''}${pay.notes ? ' — ' + pay.notes : ''}`,
          debit: 0,
          credit: parseFloat(pay.amount || 0), // Paid (-)
          raw: pay,
        });
      });

      // Sort chronologically ascending
      allTxns.sort((a, b) => a.date.getTime() - b.date.getTime());

      // Separate into prior opening balance vs period transactions
      let openingBalance = 0;
      const periodTxns = [];

      let totalPeriodBilled = 0;
      let totalPeriodPaid = 0;
      let periodOrdersCount = 0;

      let cashPaid = 0;
      let onlinePaid = 0;
      let cardPaid = 0;
      let chequePaid = 0;

      allTxns.forEach((txn) => {
        if (start && txn.date < start) {
          openingBalance += txn.debit - txn.credit;
        } else if (!end || txn.date <= end) {
          if (txn.type === 'ORDER') {
            totalPeriodBilled += txn.debit;
            periodOrdersCount += 1;
          } else if (txn.type === 'PAYMENT') {
            totalPeriodPaid += txn.credit;
            const methodStr = String(txn.raw?.method || txn.raw?.payment_type || '').toLowerCase();
            if (methodStr.includes('cash')) cashPaid += txn.credit;
            else if (methodStr.includes('card') || methodStr.includes('debit') || methodStr.includes('credit')) cardPaid += txn.credit;
            else if (methodStr.includes('online') || methodStr.includes('stripe') || methodStr.includes('transfer') || methodStr.includes('bank') || methodStr.includes('etransfer')) onlinePaid += txn.credit;
            else chequePaid += txn.credit;
          }
          periodTxns.push(txn);
        }
      });

      // Calculate running balance row by row
      let runningBalance = openingBalance;
      const formattedTxns = periodTxns.map((txn) => {
        runningBalance += txn.debit - txn.credit;
        const methodStr = String(txn.raw?.method || txn.raw?.payment_type || 'Cash');
        const balanceLabel = runningBalance > 0 ? 'Pending Udhar' : runningBalance < 0 ? 'Advance Paid' : 'Settled';
        return {
          ...txn,
          method: txn.type === 'PAYMENT' ? methodStr : '-',
          date_formatted: txn.date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
          }),
          debit_formatted: txn.debit > 0 ? `$${txn.debit.toFixed(2)}` : '-',
          credit_formatted: txn.credit > 0 ? `$${txn.credit.toFixed(2)}` : '-',
          running_balance: runningBalance,
          running_balance_status: balanceLabel,
          running_balance_formatted: `$${runningBalance.toFixed(2)}`,
        };
      });

      return successResponse(res, 'Client statement generated successfully', {
        client: clientInfo,
        date_range: {
          start_date: startDate || '',
          end_date: endDate || '',
        },
        summary: {
          opening_balance: openingBalance,
          total_orders_count: periodOrdersCount,
          total_billed: totalPeriodBilled,
          total_paid: totalPeriodPaid,
          cash_paid: cashPaid,
          online_paid: onlinePaid,
          card_paid: cardPaid,
          cheque_paid: chequePaid,
          closing_balance: runningBalance,
        },
        transactions: formattedTxns,
      });
    } catch (error) {
      console.error('[getClientStatement Error]:', error);
      next(error);
    }
  }

  static async getAllClientsStatementSummary(req, res, next) {
    try {
      const { startDate, endDate, search } = req.query;

      const start = startDate ? new Date(startDate) : null;
      const end = endDate ? new Date(new Date(endDate).setHours(23, 59, 59, 999)) : null;

      // 1. Fetch all clients from users table
      let usersQuery = `
        SELECT id, name, company_name, email, mobile_number, pst_number, created_at, status
        FROM users
        WHERE role != 'admin' OR role IS NULL
      `;
      const userParams = [];

      if (search && search.trim()) {
        userParams.push(`%${search.trim()}%`);
        usersQuery += ` AND (name ILIKE $${userParams.length} OR company_name ILIKE $${userParams.length} OR mobile_number ILIKE $${userParams.length} OR email ILIKE $${userParams.length})`;
      }

      usersQuery += ` ORDER BY name ASC`;
      const usersRes = await db.query(usersQuery, userParams);
      const clients = usersRes.rows || [];

      // 2. Fetch summary orders & payments for date range
      let ordersQuery = `
        SELECT user_id, custom_client_name, 
               COALESCE(SUM(total_amount), 0) as total_billed,
               COALESCE(SUM(paid_amount), 0) as direct_paid,
               COUNT(order_id) as orders_count
        FROM orders
        WHERE status != 'Cancelled'
      `;
      const orderQueryParams = [];
      if (start) {
        orderQueryParams.push(start);
        ordersQuery += ` AND COALESCE(order_date, created_at) >= $${orderQueryParams.length}`;
      }
      if (end) {
        orderQueryParams.push(end);
        ordersQuery += ` AND COALESCE(order_date, created_at) <= $${orderQueryParams.length}`;
      }
      ordersQuery += ` GROUP BY user_id, custom_client_name`;
      const ordersRes = await db.query(ordersQuery, orderQueryParams);

      let paymentsQuery = `
        SELECT customer_id, method, COALESCE(SUM(amount), 0) as amount_sum
        FROM payments
        WHERE 1=1
      `;
      const paymentQueryParams = [];
      if (start) {
        paymentQueryParams.push(start);
        paymentsQuery += ` AND COALESCE(payment_date, created_at) >= $${paymentQueryParams.length}`;
      }
      if (end) {
        paymentQueryParams.push(end);
        paymentsQuery += ` AND COALESCE(payment_date, created_at) <= $${paymentQueryParams.length}`;
      }
      paymentsQuery += ` GROUP BY customer_id, method`;
      const paymentsRes = await db.query(paymentsQuery, paymentQueryParams);

      // Map totals per client
      const ordersMap = new Map();
      (ordersRes.rows || []).forEach((row) => {
        if (row.user_id) {
          ordersMap.set(String(row.user_id), row);
        }
      });

      const paymentsMap = new Map();
      (paymentsRes.rows || []).forEach((row) => {
        if (row.customer_id) {
          const uid = String(row.customer_id);
          if (!paymentsMap.has(uid)) {
            paymentsMap.set(uid, { cash: 0, online: 0, card: 0, cheque: 0, total: 0 });
          }
          const pObj = paymentsMap.get(uid);
          const amt = parseFloat(row.amount_sum || 0);
          const m = String(row.method || '').toLowerCase();
          if (m.includes('cash')) pObj.cash += amt;
          else if (m.includes('card') || m.includes('debit') || m.includes('credit')) pObj.card += amt;
          else if (m.includes('online') || m.includes('stripe') || m.includes('transfer') || m.includes('bank') || m.includes('etransfer')) pObj.online += amt;
          else pObj.cheque += amt;
          pObj.total += amt;
        }
      });

      // Compute net running outstanding credit balance per user from all time
      const totalBalanceRes = await db.query(`
        SELECT u.id as user_id,
          (COALESCE(o.total_ord, 0) - COALESCE(p.total_pay, 0) - COALESCE(o.direct_pay, 0)) as pending_balance
        FROM users u
        LEFT JOIN (
          SELECT user_id, SUM(total_amount) as total_ord, SUM(paid_amount) as direct_pay 
          FROM orders WHERE status != 'Cancelled' GROUP BY user_id
        ) o ON u.id = o.user_id
        LEFT JOIN (
          SELECT customer_id, SUM(amount) as total_pay 
          FROM payments GROUP BY customer_id
        ) p ON u.id = p.customer_id
      `);

      const pendingMap = new Map();
      (totalBalanceRes.rows || []).forEach((r) => {
        if (r.user_id) {
          pendingMap.set(String(r.user_id), parseFloat(r.pending_balance || 0));
        }
      });

      let grandTotalBilled = 0;
      let grandTotalPaid = 0;
      let grandCashPaid = 0;
      let grandOnlinePaid = 0;
      let grandCardPaid = 0;
      let grandOutstandingBalance = 0;

      const clientSummaries = clients.map((c) => {
        const uid = String(c.id);
        const oData = ordersMap.get(uid) || { total_billed: 0, direct_paid: 0, orders_count: 0 };
        const pData = paymentsMap.get(uid) || { cash: 0, online: 0, card: 0, cheque: 0, total: 0 };
        const pendingBal = pendingMap.get(uid) || 0;

        const totalBilled = parseFloat(oData.total_billed || 0);
        const directPaid = parseFloat(oData.direct_paid || 0);
        const cashPaid = pData.cash;
        const onlinePaid = pData.online;
        const cardPaid = pData.card;
        const totalPaid = pData.total + directPaid;

        grandTotalBilled += totalBilled;
        grandTotalPaid += totalPaid;
        grandCashPaid += cashPaid;
        grandOnlinePaid += onlinePaid;
        grandCardPaid += cardPaid;
        if (pendingBal > 0) grandOutstandingBalance += pendingBal;

        return {
          id: c.id,
          name: c.name,
          company_name: c.company_name,
          email: c.email,
          mobile_number: c.mobile_number,
          pst_number: c.pst_number,
          status: c.status || 'active',
          orders_count: parseInt(oData.orders_count || 0, 10),
          total_billed: totalBilled,
          cash_paid: cashPaid,
          online_paid: onlinePaid,
          card_paid: cardPaid,
          cheque_paid: pData.cheque,
          total_paid: totalPaid,
          closing_balance: pendingBal,
        };
      });

      return successResponse(res, 'Clients statement summary fetched successfully', {
        date_range: {
          start_date: startDate || '',
          end_date: endDate || '',
        },
        global_summary: {
          total_clients: clientSummaries.length,
          total_billed: grandTotalBilled,
          total_paid: grandTotalPaid,
          cash_paid: grandCashPaid,
          online_paid: grandOnlinePaid,
          card_paid: grandCardPaid,
          total_outstanding_balance: grandOutstandingBalance,
        },
        clients: clientSummaries,
      });
    } catch (error) {
      console.error('[getAllClientsStatementSummary Error]:', error);
      next(error);
    }
  }
}

module.exports = StatementController;

