const db = require('../config/db');
const { successResponse, errorResponse } = require('../utils/response');

class StatementController {
  static async getClientStatement(req, res, next) {
    try {
      const { userId, customClientName, startDate, endDate } = req.query;

      if (!userId && !customClientName) {
        return errorResponse(res, 'Please select a Client or specify Client Name', null, 400);
      }

      const start = startDate ? new Date(startDate) : new Date(0); // Epoch if start not specified
      const end = endDate ? new Date(new Date(endDate).setHours(23, 59, 59, 999)) : new Date();

      // 1. Fetch Client Info
      let clientInfo = {
        name: customClientName || 'Valued Client',
        company_name: '',
        email: '',
        mobile_number: '',
        pst_number: '',
      };

      if (userId) {
        const uRes = await db.query(
          `SELECT id, name, company_name, email, mobile_number, pst_number FROM users WHERE id = $1`,
          [userId]
        );
        if (uRes.rows.length > 0) {
          clientInfo = {
            ...uRes.rows[0],
            name: uRes.rows[0].name || customClientName || 'Valued Client',
          };
        }
      }

      // 2. Fetch Orders for this Client
      let ordersQuery = `
        SELECT order_id, order_number, po_number, order_date, created_at, 
               total_amount, paid_amount, credit_amount, status, payment_type
        FROM orders
        WHERE status != 'Cancelled'
      `;
      const orderParams = [];

      if (userId) {
        orderParams.push(userId);
        ordersQuery += ` AND user_id = $${orderParams.length}`;
      } else if (customClientName) {
        orderParams.push(`%${customClientName.trim()}%`);
        ordersQuery += ` AND custom_client_name ILIKE $${orderParams.length}`;
      }

      ordersQuery += ` ORDER BY COALESCE(order_date, created_at) ASC`;
      const ordersRes = await db.query(ordersQuery, orderParams);
      const orders = ordersRes.rows || [];

      // 3. Fetch Payments Received for this Client
      let paymentsQuery = `
        SELECT p.payment_id, p.order_id, p.amount, p.method, p.reference_number, p.notes, p.created_at,
               o.order_number
        FROM payments p
        LEFT JOIN orders o ON p.order_id = o.order_id
        WHERE 1=1
      `;
      const paymentParams = [];

      if (userId) {
        paymentParams.push(userId);
        paymentsQuery += ` AND p.customer_id = $${paymentParams.length}`;
      } else if (customClientName) {
        paymentParams.push(`%${customClientName.trim()}%`);
        paymentsQuery += ` AND o.custom_client_name ILIKE $${paymentParams.length}`;
      }

      paymentsQuery += ` ORDER BY p.created_at ASC`;
      const paymentsRes = await db.query(paymentsQuery, paymentParams);
      const payments = paymentsRes.rows || [];

      // Combine into unified transaction list
      const allTxns = [];

      orders.forEach((ord) => {
        const txnDate = new Date(ord.order_date || ord.created_at);
        allTxns.push({
          id: `ord-${ord.order_id}`,
          date: txnDate,
          type: 'ORDER',
          reference: ord.order_number ? `#${ord.order_number}` : `Order #${ord.order_id.slice(0, 8)}`,
          po_number: ord.po_number || '-',
          description: `Order Invoice ${ord.order_number ? '#' + ord.order_number : ''} (${ord.payment_type || 'Credit'})`,
          debit: parseFloat(ord.total_amount || 0), // Billed
          credit: 0,
          raw: ord,
        });

        // If order had immediate initial payment recorded on creation without a separate payments row
        if (parseFloat(ord.paid_amount || 0) > 0) {
          const hasSeparatePaymentRow = payments.some((p) => p.order_id === ord.order_id);
          if (!hasSeparatePaymentRow) {
            allTxns.push({
              id: `ord-pay-${ord.order_id}`,
              date: txnDate,
              type: 'PAYMENT',
              reference: ord.order_number ? `#${ord.order_number}` : `Order #${ord.order_id.slice(0, 8)}`,
              po_number: ord.po_number || '-',
              description: `Initial Payment Received for Order ${ord.order_number ? '#' + ord.order_number : ''}`,
              debit: 0,
              credit: parseFloat(ord.paid_amount || 0), // Received
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
          type: 'PAYMENT',
          reference: pay.order_number ? `#${pay.order_number}` : (pay.reference_number || 'PMT'),
          po_number: '-',
          description: `Payment Received via ${pay.method || 'Cash'}${pay.reference_number ? ' (Ref: ' + pay.reference_number + ')' : ''}`,
          debit: 0,
          credit: parseFloat(pay.amount || 0), // Received
          raw: pay,
        });
      });

      // Sort all transactions chronologically
      allTxns.sort((a, b) => a.date.getTime() - b.date.getTime());

      // Separate into prior (Opening Balance) vs period transactions
      let openingBalance = 0;
      const periodTxns = [];

      let totalPeriodBilled = 0;
      let totalPeriodPaid = 0;
      let periodOrdersCount = 0;

      allTxns.forEach((txn) => {
        if (startDate && txn.date < start) {
          openingBalance += txn.debit - txn.credit;
        } else if (!endDate || txn.date <= end) {
          if (txn.type === 'ORDER') {
            totalPeriodBilled += txn.debit;
            periodOrdersCount += 1;
          } else if (txn.type === 'PAYMENT') {
            totalPeriodPaid += txn.credit;
          }
          periodTxns.push(txn);
        }
      });

      // Categorize payment method breakdown
      let cashPaid = 0;
      let onlinePaid = 0;
      let cardPaid = 0;
      let chequePaid = 0;

      periodTxns.forEach((txn) => {
        if (txn.type === 'PAYMENT') {
          const methodStr = String(txn.raw?.method || txn.raw?.payment_type || '').toLowerCase();
          if (methodStr.includes('cash')) {
            cashPaid += txn.credit;
          } else if (methodStr.includes('card') || methodStr.includes('debit') || methodStr.includes('credit')) {
            cardPaid += txn.credit;
          } else if (methodStr.includes('online') || methodStr.includes('stripe') || methodStr.includes('transfer') || methodStr.includes('bank') || methodStr.includes('etransfer')) {
            onlinePaid += txn.credit;
          } else {
            chequePaid += txn.credit;
          }
        }
      });

      // Calculate running balance row by row
      let runningBalance = openingBalance;
      const formattedTxns = periodTxns.map((txn) => {
        runningBalance += txn.debit - txn.credit;
        const methodStr = String(txn.raw?.method || txn.raw?.payment_type || 'Cash');
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
          running_balance_formatted: `$${runningBalance.toFixed(2)}`,
        };
      });

      return successResponse(res, 'Client statement generated successfully', {
        client: clientInfo,
        date_range: {
          start_date: startDate || (periodTxns.length > 0 ? periodTxns[0].date.toISOString().split('T')[0] : new Date().toISOString().split('T')[0]),
          end_date: endDate || new Date().toISOString().split('T')[0],
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
      next(error);
    }
  }

  static async getAllClientsStatementSummary(req, res, next) {
    try {
      const { startDate, endDate, search } = req.query;

      const start = startDate ? new Date(startDate) : new Date(0);
      const end = endDate ? new Date(new Date(endDate).setHours(23, 59, 59, 999)) : new Date();

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
      if (startDate) {
        orderQueryParams.push(start);
        ordersQuery += ` AND COALESCE(order_date, created_at) >= $${orderQueryParams.length}`;
      }
      if (endDate) {
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
      if (startDate) {
        paymentQueryParams.push(start);
        paymentsQuery += ` AND created_at >= $${paymentQueryParams.length}`;
      }
      if (endDate) {
        paymentQueryParams.push(end);
        paymentsQuery += ` AND created_at <= $${paymentQueryParams.length}`;
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

      // Also compute net running outstanding credit balance per user from all time
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
      next(error);
    }
  }
}

module.exports = StatementController;
