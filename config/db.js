const { Pool } = require('pg');
require('dotenv').config();

let pool = null;
let useFallbackStore = false;

// In-Memory Database Store as fallback when PostgreSQL server is offline
const memoryStore = {
  users: [],
  permissions: [],
  category: [],
  products: [],
  product_images: [],
  user_prices: [],
  orders: [],
  order_items: [],
  invoice: [],
  accounts: [],
  expenses: [],
  employees: [],
  salary: [],
  loans: [],
  payments: [],
  history: [],
  delivery_memos: [],
  shortcuts: [],
  company_credentials: [{
    id: '11111111-2222-3333-4444-555555555555',
    company_name: 'GB Cabinet Doors Ltd.',
    business_number: '987654321 BC0001',
    gst_number: '12345 6789 RT0001',
    pst_number: 'PST-1001-8849',
    company_email: 'info@gbcabinetdoors.ca',
    company_phone: '(604) 503-3711',
    website: 'https://gbcabinetdoors.ca',
    address_line1: '12885 85 Ave',
    address_line2: 'Unit 104',
    city: 'Surrey',
    province: 'BC',
    postal_code: 'V3W 0K8',
    country: 'Canada',
    invoice_prefix: 'INV',
    invoice_footer: 'Thank you for your business. Payment terms: Net 30 days.',
    payment_terms: 'Net 30 Days. Payments accepted via Interac e-Transfer, Credit Card, or Direct Deposit.',
    thank_you_message: 'Thank you for choosing GB Cabinet Doors Ltd. We appreciate your business!',
    logo_url: '',
    updated_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  }],
};

try {

  pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'production_db',
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 3000,
  });

  pool.on('error', (err) => {
    console.warn('PostgreSQL Pool Warning:', err.message);
  });
} catch (err) {
  console.warn('PostgreSQL Pool Initialization fallback to mock database:', err.message);
  useFallbackStore = true;
}

// Fallback SQL Executor
const executeFallbackQuery = (text, params = []) => {
  const queryStr = text.trim();

  // Helper UUID
  const genUuid = () => require('crypto').randomUUID();

  // SELECT queries
  if (queryStr.toUpperCase().startsWith('SELECT')) {
    if (queryStr.includes('FROM users')) {
      if (queryStr.includes('WHERE email =')) {
        const u = memoryStore.users.find(x => x.email === params[0]);
        return { rows: u ? [u] : [], rowCount: u ? 1 : 0 };
      }
      if (queryStr.includes('WHERE username =')) {
        const u = memoryStore.users.find(x => x.username === params[0]);
        return { rows: u ? [u] : [], rowCount: u ? 1 : 0 };
      }
      if (queryStr.includes('WHERE id =')) {
        const u = memoryStore.users.find(x => x.id === params[0]);
        return { rows: u ? [u] : [], rowCount: u ? 1 : 0 };
      }
      return { rows: memoryStore.users, rowCount: memoryStore.users.length };
    }

    if (queryStr.includes('FROM permissions')) {
      let filtered = [...memoryStore.permissions];
      if (params.length > 0 && queryStr.includes('role =')) {
        filtered = filtered.filter(p => p.role === params[0]);
      }
      return { rows: filtered, rowCount: filtered.length };
    }

    if (queryStr.includes('FROM products')) {
      const list = (memoryStore.products || []).map(p => ({
        ...p,
        custom_price: p.custom_price || p.sell_price || '30.00',
        sell_price: p.custom_price || p.sell_price || '30.00',
      }));
      return { rows: list, rowCount: list.length };
    }

    if (queryStr.includes('FROM orders')) {
      return { rows: memoryStore.orders, rowCount: memoryStore.orders.length };
    }

    if (queryStr.includes('FROM category')) {
      return { rows: memoryStore.category, rowCount: memoryStore.category.length };
    }

    if (queryStr.includes('FROM delivery_memos')) {
      return { rows: memoryStore.delivery_memos, rowCount: memoryStore.delivery_memos.length };
    }

    if (queryStr.includes('FROM expenses')) {
      return { rows: memoryStore.expenses, rowCount: memoryStore.expenses.length };
    }

    if (queryStr.includes('FROM employees')) {
      return { rows: memoryStore.employees, rowCount: memoryStore.employees.length };
    }

    if (queryStr.includes('FROM salary')) {
      return { rows: memoryStore.salary, rowCount: memoryStore.salary.length };
    }

    if (queryStr.includes('FROM loans')) {
      return { rows: memoryStore.loans, rowCount: memoryStore.loans.length };
    }

    if (queryStr.includes('FROM history')) {
      return { rows: memoryStore.history, rowCount: memoryStore.history.length };
    }

    if (queryStr.includes('FROM accounts')) {
      return { rows: memoryStore.accounts, rowCount: memoryStore.accounts.length };
    }

    if (queryStr.includes('FROM invoice')) {
      return { rows: memoryStore.invoice, rowCount: memoryStore.invoice.length };
    }

    if (queryStr.includes('FROM shortcuts')) {
      return { rows: memoryStore.shortcuts || [], rowCount: (memoryStore.shortcuts || []).length };
    }

    if (queryStr.includes('FROM company_credentials')) {
      return { rows: memoryStore.company_credentials || [], rowCount: (memoryStore.company_credentials || []).length };
    }

  }

  // INSERT / UPDATE fallback handlers
  const upperStr = queryStr.toUpperCase();
  if (upperStr.startsWith('INSERT INTO ORDERS')) {
    const newOrderObj = {
      order_id: genUuid(),
      user_id: params[0] || '8edcddfe-d388-49f3-a791-414bfe83fda9',
      address: params[1] || '',
      pincode: params[2] || '',
      payment_type: params[3] || 'Cash',
      measurement_type: params[4] || 'Sqft',
      height: params[5] || 0,
      width: params[6] || 0,
      quantity: params[7] || 1,
      subtotal: params[8] || '0.00',
      gst_amount: params[9] || '0.00',
      pst_amount: params[10] || '0.00',
      total_amount: params[11] || '0.00',
      paid_amount: params[12] || '0.00',
      credit_amount: params[13] || '0.00',
      status: params[14] || 'Pending',
      pst_number: params[15] || null,
      pst_verified: params[16] || false,
      pst_exempt: params[17] || false,
      pst_verification_date: params[18] || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    memoryStore.orders.unshift(newOrderObj);
    return { rows: [newOrderObj], rowCount: 1 };
  }

  if (upperStr.startsWith('INSERT INTO ORDER_ITEMS')) {
    const newItemObj = {
      item_id: genUuid(),
      order_id: params[0],
      product_id: params[1],
      price: params[2],
      quantity: params[3],
      gst: params[4],
      pst: params[5],
      total: params[6],
    };
    memoryStore.order_items.push(newItemObj);
    return { rows: [newItemObj], rowCount: 1 };
  }

  return { rows: [], rowCount: 1 };
};

const query = async (text, params) => {
  if (!useFallbackStore && pool) {
    try {
      return await pool.query(text, params);
    } catch (err) {
      if (err.code === 'ECONNREFUSED' || err.code === '28P01' || err.code === '3D000') {
        console.warn('PostgreSQL connection unavailable, switching query to fallback store:', err.message);
        useFallbackStore = true;
        return executeFallbackQuery(text, params);
      }
      throw err;
    }
  }
  return executeFallbackQuery(text, params);
};

module.exports = {
  query,
  getClient: async () => {
    if (!useFallbackStore && pool) {
      try {
        return await pool.connect();
      } catch (e) {
        useFallbackStore = true;
      }
    }
    return {
      query: (t, p) => executeFallbackQuery(t, p),
      release: () => {},
    };
  },
  pool,
  memoryStore,
};
