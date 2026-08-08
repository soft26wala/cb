const db = require('../config/db');

/**
 * Gets the latest balance for a customer
 */
const getCustomerCurrentBalance = async (userId, client = null) => {
  const queryRunner = client || db;
  const result = await queryRunner.query(
    `SELECT closing_balance FROM accounts WHERE user_id = $1 ORDER BY transaction_date DESC, transaction_id DESC LIMIT 1`,
    [userId]
  );
  if (result.rows.length > 0) {
    return parseFloat(result.rows[0].closing_balance) || 0.0;
  }
  return 0.0;
};

/**
 * Adds an account ledger transaction for a customer with atomic balance update
 */
const addLedgerTransaction = async ({
  userId,
  orderId = null,
  type, // 'Credit', 'Payment', 'Adjustment', 'Advance'
  amount,
  paymentMethod = null,
  description = '',
  client = null,
}) => {
  const queryRunner = client || db;
  const numAmount = parseFloat(amount) || 0;

  // Fetch opening balance from latest account record
  const openingBalance = await getCustomerCurrentBalance(userId, queryRunner);
  let closingBalance = openingBalance;

  // Business logic for type:
  // 'Credit' -> Customer owes more money -> increases balance owed (+)
  // 'Payment' -> Customer paid money -> reduces balance owed (-)
  // 'Advance' -> Customer paid excess money -> reduces balance owed (-)
  // 'Adjustment' -> Explicit adjustment (positive or negative depending on description)
  if (type === 'Credit') {
    closingBalance = openingBalance + numAmount;
  } else if (type === 'Payment' || type === 'Advance') {
    closingBalance = openingBalance - numAmount;
  } else if (type === 'Adjustment') {
    closingBalance = openingBalance + numAmount;
  }

  const query = `
    INSERT INTO accounts (user_id, order_id, type, amount, opening_balance, closing_balance, payment_method, description)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *
  `;

  const values = [
    userId,
    orderId,
    type,
    numAmount,
    openingBalance,
    closingBalance,
    paymentMethod,
    description,
  ];

  const result = await queryRunner.query(query, values);
  return result.rows[0];
};

module.exports = {
  getCustomerCurrentBalance,
  addLedgerTransaction,
};
