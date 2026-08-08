const db = require('../config/db');
const { calculateItemTotals } = require('../utils/calculations');
const { addLedgerTransaction } = require('../services/ledger.service');
const { validatePstNumber } = require('../utils/pstValidator');

// Helper function to ensure PST columns exist and migrate Cash/COD to Credit/Udhar
const ensurePstColumnsExist = async () => {
  try {
    await db.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS pst_number VARCHAR(50);`);
    await db.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS pst_verified BOOLEAN DEFAULT FALSE;`);
    await db.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS pst_exempt BOOLEAN DEFAULT FALSE;`);
    await db.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS pst_verification_date TIMESTAMP WITH TIME ZONE;`);

    // Automatic Migration: Convert all existing Cash/COD orders to Credit/Udhar balance so they appear in Accounts Receivable
    await db.query(`
      UPDATE orders 
      SET payment_type = 'Credit', 
          credit_amount = GREATEST(0, total_amount - paid_amount) 
      WHERE (LOWER(payment_type) = 'cash' OR LOWER(payment_type) = 'cod' OR payment_type IS NULL) 
        AND status != 'Cancelled';
    `);
  } catch (err) {
    // Ignore if already existing
  }
};
ensurePstColumnsExist();

class OrderModel {
  static async createOrder(orderPayload, client = null) {
    const queryRunner = client || db;

    const {
      user_id,
      address,
      pincode,
      payment_type, // 'Cash', 'Online', 'Credit', 'Partial'
      measurement_type = 'Sqft',
      height = 0,
      width = 0,
      items = [], // Array of { product_id, quantity, price, height, width }
      paid_amount = 0,
      pst_number,
      pstNumber,
    } = orderPayload;

    if (!items || items.length === 0) {
      throw new Error('Order must contain at least one item.');
    }

    // Ensure valid user_id FK
    let targetUserId = user_id;
    if (!targetUserId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetUserId)) {
      const userCheck = await queryRunner.query(`SELECT id FROM users LIMIT 1`);
      if (userCheck.rows.length > 0) {
        targetUserId = userCheck.rows[0].id;
      }
    } else {
      const userCheck = await queryRunner.query(`SELECT id FROM users WHERE id = $1`, [targetUserId]);
      if (userCheck.rows.length === 0) {
        const firstUser = await queryRunner.query(`SELECT id FROM users LIMIT 1`);
        if (firstUser.rows.length > 0) {
          targetUserId = firstUser.rows[0].id;
        }
      }
    }

    // Backend PST verification (never trust frontend alone)
    const rawPst = pst_number || pstNumber || '';
    let isPstVerified = false;
    let isPstExempt = false;
    let pstVerificationDate = null;
    let verifiedPstNumber = null;

    if (rawPst && String(rawPst).trim() !== '') {
      const pstValResult = validatePstNumber(String(rawPst));
      if (pstValResult.valid) {
        isPstVerified = true;
        isPstExempt = true;
        pstVerificationDate = new Date();
        verifiedPstNumber = pstValResult.pstNumber;
      }
    }

    let calculatedSubtotal = 0;
    let calculatedGst = 0;
    let calculatedPst = 0;
    let calculatedTotal = 0;

    const processedItems = [];

    // Calculate totals for each item
    for (const item of items) {
      let targetProductId = item.product_id || item.productId;
      if (!targetProductId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetProductId)) {
        const prodRes = await queryRunner.query(`SELECT p_id FROM products LIMIT 1`);
        if (prodRes.rows.length > 0) {
          targetProductId = prodRes.rows[0].p_id;
        } else {
          targetProductId = '00000000-0000-0000-0000-000000000000';
        }
      }
      item.product_id = targetProductId;

      // Get price (check if custom user price exists, otherwise fallback to item.price or product sell_price)
      let itemPrice = parseFloat(item.price);
      if (isNaN(itemPrice) || itemPrice <= 0) {
        const userPriceRes = await queryRunner.query(
          `SELECT custom_price FROM user_prices WHERE user_id = $1 AND product_id = $2`,
          [user_id, item.product_id]
        );
        if (userPriceRes.rows.length > 0) {
          itemPrice = parseFloat(userPriceRes.rows[0].custom_price);
        } else {
          const prodRes = await queryRunner.query(`SELECT sell_price, gst_percent, pst_percent FROM products WHERE p_id = $1`, [item.product_id]);
          if (prodRes.rows.length > 0) {
            itemPrice = parseFloat(prodRes.rows[0].sell_price);
          }
        }
      }

      // Fetch product GST/PST rates
      const prodTaxRes = await queryRunner.query(`SELECT gst_percent, pst_percent FROM products WHERE p_id = $1`, [item.product_id]);
      const gstPercent = prodTaxRes.rows.length > 0 ? parseFloat(prodTaxRes.rows[0].gst_percent) : 5;
      
      // If customer PST is verified & exempt, remove only the 7% PST tax. Otherwise keep 7%.
      let pstPercent = prodTaxRes.rows.length > 0 ? parseFloat(prodTaxRes.rows[0].pst_percent) : 7;
      if (isPstExempt) {
        pstPercent = 0.00;
      }

      const itemHeight = item.height !== undefined ? item.height : height;
      const itemWidth = item.width !== undefined ? item.width : width;

      const totals = calculateItemTotals({
        unitPrice: itemPrice,
        quantity: item.quantity || 1,
        measurementType: measurement_type,
        height: itemHeight,
        width: itemWidth,
        gstPercent,
        pstPercent,
      });

      calculatedSubtotal += totals.subtotal;
      calculatedGst += totals.gstAmount;
      calculatedPst += totals.pstAmount;
      calculatedTotal += totals.totalAmount;

      processedItems.push({
        product_id: item.product_id,
        price: itemPrice,
        quantity: item.quantity || 1,
        gst: totals.gstAmount,
        pst: totals.pstAmount,
        total: totals.totalAmount,
      });
    }

    let targetPaymentType = payment_type || 'Credit';
    if (targetPaymentType === 'Cash' || targetPaymentType === 'cash' || targetPaymentType === 'COD' || targetPaymentType === 'cod') {
      targetPaymentType = 'Credit';
    }

    let finalPaidAmount = parseFloat(paid_amount) || 0;
    if (targetPaymentType === 'Credit') {
      // COD / Credit orders are placed as Udhar (Credit balance).
      finalPaidAmount = parseFloat(paid_amount) || 0;
    } else if (targetPaymentType === 'Online') {
      finalPaidAmount = calculatedTotal;
    }

    const creditAmount = Math.max(0, calculatedTotal - finalPaidAmount);
    const totalQuantity = items.reduce((acc, curr) => acc + (parseInt(curr.quantity) || 1), 0);

    // Insert Order Header with PST metadata
    const orderQuery = `
      INSERT INTO orders (
        user_id, address, pincode, payment_type, measurement_type, height, width, quantity,
        subtotal, gst_amount, pst_amount, total_amount, paid_amount, credit_amount, status,
        pst_number, pst_verified, pst_exempt, pst_verification_date
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
      RETURNING *
    `;

    const orderValues = [
      targetUserId,
      address,
      pincode,
      targetPaymentType,
      measurement_type,
      height,
      width,
      totalQuantity,
      calculatedSubtotal.toFixed(2),
      calculatedGst.toFixed(2),
      calculatedPst.toFixed(2),
      calculatedTotal.toFixed(2),
      finalPaidAmount.toFixed(2),
      creditAmount.toFixed(2),
      'Pending',
      verifiedPstNumber,
      isPstVerified,
      isPstExempt,
      pstVerificationDate,
    ];

    const orderResult = await queryRunner.query(orderQuery, orderValues);
    const newOrder = orderResult.rows[0];

    // Insert Order Items & Update Product Stock
    for (const pItem of processedItems) {
      await queryRunner.query(
        `INSERT INTO order_items (order_id, product_id, price, quantity, gst, pst, total)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [newOrder.order_id, pItem.product_id, pItem.price, pItem.quantity, pItem.gst, pItem.pst, pItem.total]
      );

      // Deduct Stock
      await queryRunner.query(
        `UPDATE products SET stock = GREATEST(0, stock - $1) WHERE p_id = $2`,
        [pItem.quantity, pItem.product_id]
      );
    }

    // Generate Invoice with Company Credentials Prefix
    const CompanyCredentialsModel = require('./companyCredentials.model');
    const companyCreds = await CompanyCredentialsModel.getCredentials();
    const prefix = companyCreds.invoice_prefix || 'INV';
    const invoiceNumber = `${prefix}-${Date.now().toString().slice(-6)}-${Math.floor(1000 + Math.random() * 9000)}`;
    const paymentStatus = creditAmount === 0 ? 'Paid' : finalPaidAmount > 0 ? 'Partial' : 'Unpaid';


    await queryRunner.query(
      `INSERT INTO invoice (order_id, user_id, invoice_number, payment_status, paid_amount, remaining_amount)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [newOrder.order_id, targetUserId, invoiceNumber, paymentStatus, finalPaidAmount, creditAmount]
    );

    // If Credit Amount exists, record transaction in Accounts Ledger
    if (creditAmount > 0) {
      await addLedgerTransaction({
        userId: targetUserId,
        orderId: newOrder.order_id,
        type: 'Credit',
        amount: creditAmount,
        paymentMethod: payment_type,
        description: `Credit created for Order #${newOrder.order_id.slice(0, 8)}`,
        client: queryRunner,
      });
    }

    // Record Payment if paid amount > 0
    if (finalPaidAmount > 0) {
      await queryRunner.query(
        `INSERT INTO payments (order_id, customer_id, amount, method, transaction_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [newOrder.order_id, targetUserId, finalPaidAmount, payment_type, 'TXN-' + Date.now()]
      );
    }

    return await this.findById(newOrder.order_id, queryRunner);
  }

  static async findById(id, client = null) {
    const queryRunner = client || db;
    const orderQuery = `
      SELECT o.*, COALESCE(u.name, 'Valued Client') as customer_name, COALESCE(u.email, 'client@gbcabinetdoors.ca') as customer_email, u.mobile_number as customer_mobile
      FROM orders o
      LEFT JOIN users u ON o.user_id = u.id
      WHERE o.order_id = $1
    `;
    const orderRes = await queryRunner.query(orderQuery, [id]);
    if (orderRes.rows.length === 0) return null;

    const order = orderRes.rows[0];

    const itemsQuery = `
      SELECT oi.*, p.product_name, p.product_description,
             (SELECT image_url FROM product_images WHERE p_id = p.p_id ORDER BY created_at ASC LIMIT 1) as product_image
      FROM order_items oi
      JOIN products p ON oi.product_id = p.p_id
      WHERE oi.order_id = $1
    `;
    const itemsRes = await queryRunner.query(itemsQuery, [id]);
    order.items = itemsRes.rows;

    const invQuery = `SELECT * FROM invoice WHERE order_id = $1`;
    const invRes = await queryRunner.query(invQuery, [id]);
    order.invoice = invRes.rows[0] || null;

    return order;
  }

  static async findAll({ userId, status, limit = 50, offset = 0 }) {
    let query = `
      SELECT o.*, COALESCE(u.name, 'Valued Client') as customer_name, COALESCE(u.email, 'client@gbcabinetdoors.ca') as customer_email, u.mobile_number as customer_mobile
      FROM orders o
      LEFT JOIN users u ON o.user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (userId) {
      params.push(userId);
      query += ` AND o.user_id = $${params.length}`;
    }
    if (status) {
      params.push(status);
      query += ` AND o.status = $${params.length}`;
    }

    query += ` ORDER BY o.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await db.query(query, params);
    const orders = result.rows;

    for (const order of orders) {
      const itemsQuery = `
        SELECT oi.*, p.product_name, p.product_description,
               (SELECT image_url FROM product_images WHERE p_id = p.p_id ORDER BY created_at ASC LIMIT 1) as product_image
        FROM order_items oi
        JOIN products p ON oi.product_id = p.p_id
        WHERE oi.order_id = $1
      `;
      const itemsRes = await db.query(itemsQuery, [order.order_id]);
      order.items = itemsRes.rows;
    }

    return orders;
  }

  static async updateStatus(id, status) {
    const query = `
      UPDATE orders
      SET status = $1, updated_at = CURRENT_TIMESTAMP
      WHERE order_id = $2
      RETURNING *
    `;
    const result = await db.query(query, [status, id]);
    return result.rows[0];
  }

  static async addPayment(orderId, paymentAmount, paymentMethod, client = null) {
    const queryRunner = client || db;

    const order = await this.findById(orderId, queryRunner);
    if (!order) throw new Error('Order not found');

    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) throw new Error('Invalid payment amount');

    const newPaidAmount = parseFloat(order.paid_amount) + amount;
    const newCreditAmount = Math.max(0, parseFloat(order.total_amount) - newPaidAmount);

    // Update order
    await queryRunner.query(
      `UPDATE orders SET paid_amount = $1, credit_amount = $2, updated_at = CURRENT_TIMESTAMP WHERE order_id = $3`,
      [newPaidAmount, newCreditAmount, orderId]
    );

    // Update invoice
    const newPaymentStatus = newCreditAmount === 0 ? 'Paid' : 'Partial';
    await queryRunner.query(
      `UPDATE invoice SET paid_amount = $1, remaining_amount = $2, payment_status = $3 WHERE order_id = $4`,
      [newPaidAmount, newCreditAmount, newPaymentStatus, orderId]
    );

    // Add payment entry
    await queryRunner.query(
      `INSERT INTO payments (order_id, customer_id, amount, method, transaction_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [orderId, order.user_id, amount, paymentMethod, 'PAY-' + Date.now()]
    );

    // Ledger transaction
    await addLedgerTransaction({
      userId: order.user_id,
      orderId: orderId,
      type: 'Payment',
      amount: amount,
      paymentMethod: paymentMethod,
      description: `Payment received for Order #${orderId.slice(0, 8)}`,
      client: queryRunner,
    });

    return await this.findById(orderId, queryRunner);
  }

  static async delete(id) {
    const query = `DELETE FROM orders WHERE order_id = $1 RETURNING order_id`;
    const result = await db.query(query, [id]);
    return result.rows[0];
  }
}

module.exports = OrderModel;
