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

      // Calculate running balance row by row
      let runningBalance = openingBalance;
      const formattedTxns = periodTxns.map((txn) => {
        runningBalance += txn.debit - txn.credit;
        return {
          ...txn,
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
          closing_balance: runningBalance,
        },
        transactions: formattedTxns,
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = StatementController;
