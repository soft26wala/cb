const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const db = require('../config/db');
const { ROLES, ALL_PERMISSIONS } = require('../config/constants');

const seedDatabase = async () => {
  console.log('🌱 Starting Enterprise ERP Database Seeding...');

  try {
    // 0. Automatically create/verify database tables from schema.sql
    try {
      const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
      await db.query(schemaSql);
      console.log('✅ Database schema verified & tables ensured.');
    } catch (schemaErr) {
      console.warn('Auto schema initialization note:', schemaErr.message);
    }

    // Drop legacy check constraints on users, orders, and expenses if present
    await db.query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;`);
    await db.query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_status_check;`);
    await db.query(`ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;`);
    await db.query(`ALTER TABLE expenses DROP CONSTRAINT IF EXISTS expenses_category_check;`);
    await db.query(`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS bill_image TEXT;`);


    // 1. Seed Users (Initial Admin + Locked Demo Account)
    const adminEmail = process.env.INITIAL_ADMIN_EMAIL || 'admin@gbcabinetdoors.ca';
    const adminUsername = process.env.INITIAL_ADMIN_USERNAME || 'admin';
    const adminPassword = process.env.INITIAL_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || 'tu@serts@4a5@eae@esr.kok.ji,ug42@@dd';

    const hashedAdminPassword = await bcrypt.hash(adminPassword, 10);

    const adminId = '11111111-1111-1111-1111-111111111111';
    const demoId = '99999999-9999-9999-9999-999999999999';

    // Seed list: Admin + Locked Demo Account (which cannot be logged into)
    // Extra sample accounts (employees, CAs, clients) removed so admin can add them manually via UI
    const usersToSeed = [
      {
        id: adminId,
        name: 'Enterprise Admin',
        email: adminEmail,
        username: adminUsername,
        password: hashedAdminPassword,
        role: 'admin',
        status: 'active',
      },
      {
        id: demoId,
        name: 'Demo Account (Locked - No Access)',
        email: 'demo@gbcabinetdoors.ca',
        username: 'demo',
        password: 'LOCKED_DEMO_ACCOUNT_LOGIN_DISABLED_NO_ACCESS', // Un-hashed invalid password prevents login
        role: 'user',
        status: 'disabled', // Disabled status prevents login
      },
    ];

    for (const u of usersToSeed) {
      const exists = await db.query('SELECT id FROM users WHERE email = $1 OR username = $2', [u.email, u.username]);
      if (!exists.rows || exists.rows.length === 0) {
        await db.query(
          `INSERT INTO users (id, name, username, email, password, role, status) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [u.id, u.name, u.username, u.email, u.password, u.role, u.status]
        );
      }
    }

    // Seed mock memory store if fallback mode is active
    if (db.memoryStore) {
      usersToSeed.forEach(u => {
        if (!db.memoryStore.users.find(x => x.id === u.id)) {
          db.memoryStore.users.push({ ...u, created_at: new Date().toISOString() });
        }
      });
    }

    // Ensure permissions table exists in PostgreSQL database automatically
    await db.query(`
      CREATE TABLE IF NOT EXISTS permissions (
          permission_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          role VARCHAR(30) NOT NULL,
          user_id UUID REFERENCES users(id) ON DELETE CASCADE,
          permission_key VARCHAR(100) NOT NULL,
          is_allowed BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_permissions_role ON permissions(role);
      CREATE INDEX IF NOT EXISTS idx_permissions_user ON permissions(user_id);
    `);

    // 2. Seed Dynamic Permissions

    const defaultEmployeePerms = [
      'Dashboard', 'Products', 'Categories', 'Orders', 'Customers', 'Invoices',
      'Print Invoice', 'View', 'Create', 'Edit', 'PDF Download', 'Payment',
      'Partial Payment', 'COD Management', 'Memo Management', 'Notification'
    ];

    const defaultCaPerms = [
      'Dashboard', 'GST', 'PST', 'Invoices', 'Accounts', 'Reports', 'Tax Reports',
      'PDF Download', 'View', 'Export'
    ];

    // Seed Role permissions
    for (const perm of ALL_PERMISSIONS) {
      await db.query(`INSERT INTO permissions (role, permission_key, is_allowed) VALUES ('admin', $1, true) ON CONFLICT DO NOTHING`, [perm]);
    }
    // Employees have NO access by default - clear role-level defaults if present
    await db.query(`DELETE FROM permissions WHERE role = 'employee' AND user_id IS NULL`);

    for (const perm of defaultCaPerms) {
      await db.query(`INSERT INTO permissions (role, permission_key, is_allowed) VALUES ('ca', $1, true) ON CONFLICT DO NOTHING`, [perm]);
    }

    // 3. Seed Product Categories (GB Cabinet Doors Official Categories)
    const gbCategories = [
      { id: 'a1111111-1111-1111-1111-111111111111', name: 'Solid Wood - 2 1/4" Flat Panel', desc: 'Solid Wood 2 1/4 inch Flat Panel Cabinet Doors' },
      { id: 'a2222222-2222-2222-2222-222222222222', name: 'Solid Wood - 3" Flat Panel', desc: 'Solid Wood 3 inch Flat Panel Cabinet Doors' },
      { id: 'a3333333-3333-3333-3333-333333333333', name: 'Solid Wood - 2 1/4" Raised Panel', desc: 'Solid Wood 2 1/4 inch Raised Panel Cabinet Doors' },
      { id: 'a4444444-4444-4444-4444-444444444444', name: 'Solid Wood - 3" Raised Panel', desc: 'Solid Wood 3 inch Raised Panel Cabinet Doors' },
      { id: 'a5555555-5555-5555-5555-555555555555', name: 'Solid Wood - Custom Doors', desc: 'Custom Handcrafted Solid Wood Cabinet Doors' },
      { id: 'a6666666-6666-6666-6666-666666666666', name: 'MDF - 3" Doors', desc: 'MDF 3 inch One-Piece & Multi-Piece Doors' },
      { id: 'a7777777-7777-7777-7777-777777777777', name: 'MDF - 2 1/4" Doors', desc: 'MDF 2 1/4 inch Precision Cut Cabinet Doors' },
      { id: 'a8888888-8888-8888-8888-888888888888', name: 'MDF One Piece Doors', desc: 'MDF One Piece Seamless Routered Doors' },
      { id: 'a9999999-9999-9999-9999-999999999999', name: 'PVC - 3" Doors', desc: 'PVC Thermofoil 3 inch Cabinet Doors' },
      { id: 'ba111111-1111-1111-1111-111111111111', name: 'PVC - 2 1/4" Doors', desc: 'PVC Thermofoil 2 1/4 inch Cabinet Doors' },
      { id: 'ba222222-2222-2222-2222-222222222222', name: 'Panel Profiles', desc: 'Custom Door Panel Profiles & Edging Styles' },
      { id: 'ba333333-3333-3333-3333-333333333333', name: 'Outside Profiles', desc: 'Outside Edge Profiles & Trim Shapes' },
      { id: 'ba444444-4444-4444-4444-444444444444', name: 'Square 90° Joint Series', desc: 'Square 90 Degree Joint Cabinet Door Collection' },
      { id: 'ba555555-5555-5555-5555-555555555555', name: 'Miter 45° Joint Series', desc: 'Miter 45 Degree Joint Cabinet Door Collection' },
      { id: 'ba666666-6666-6666-6666-666666666666', name: 'Hardware & Accessories', desc: 'Soft-Close Hinges, Handles, Slides & Trim Panels' },
    ];

    for (const c of gbCategories) {
      await db.query(
        `INSERT INTO category (category_id, category_name, description) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        [c.id, c.name, c.desc]
      );
    }

    const catId1 = gbCategories[0].id;
    const catId2 = gbCategories[14].id;








    // 4. Seed Shortcuts Table & Defaults
    await db.query(`
      CREATE TABLE IF NOT EXISTS shortcuts (
          shortcut_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          page_name VARCHAR(100) NOT NULL,
          page_route VARCHAR(100) NOT NULL,
          description VARCHAR(255) NOT NULL,
          shortcut_key VARCHAR(50) NOT NULL,
          category VARCHAR(50) DEFAULT 'Navigation',
          is_active BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_shortcuts_page ON shortcuts(page_name);
    `);

    const defaultShortcutsList = [
      { page_name: 'Dashboard', page_route: '/dashboard', description: 'Navigate to Main Dashboard', shortcut_key: 'Alt+D', category: 'Navigation' },
      { page_name: 'Customers', page_route: '/customers', description: 'Navigate to Customer Directory', shortcut_key: 'Alt+C', category: 'Navigation' },
      { page_name: 'Products', page_route: '/products', description: 'Navigate to Product Catalog', shortcut_key: 'Alt+P', category: 'Navigation' },
      { page_name: 'Add Product', page_route: '/products?openAdd=true', description: 'Open Add New Product Form Modal', shortcut_key: 'Alt+A', category: 'Action' },
      { page_name: 'Categories', page_route: '/categories', description: 'Navigate to Product Categories Manager', shortcut_key: 'Alt+T', category: 'Navigation' },
      { page_name: 'Orders', page_route: '/orders', description: 'Navigate to Sales & Order Processing', shortcut_key: 'Alt+O', category: 'Navigation' },
      { page_name: 'Invoices', page_route: '/invoices', description: 'Navigate to Invoices List & Billing', shortcut_key: 'Alt+I', category: 'Navigation' },
      { page_name: 'Expenses', page_route: '/expenses', description: 'Navigate to Expense Tracker', shortcut_key: 'Alt+E', category: 'Navigation' },
      { page_name: 'Employees', page_route: '/employees', description: 'Navigate to Employee Directory', shortcut_key: 'Alt+M', category: 'Navigation' },
      { page_name: 'Salary', page_route: '/salary', description: 'Navigate to Employee Salary & Payroll', shortcut_key: 'Alt+S', category: 'Navigation' },
      { page_name: 'Loans', page_route: '/loans', description: 'Navigate to Loans Ledger', shortcut_key: 'Alt+L', category: 'Navigation' },
      { page_name: 'Accounts', page_route: '/accounts', description: 'Navigate to Financial Accounts Ledger', shortcut_key: 'Alt+K', category: 'Navigation' },
      { page_name: 'Credit List', page_route: '/credit-list', description: 'Navigate to Credit Transactions', shortcut_key: 'Alt+R', category: 'Navigation' },
      { page_name: 'Udhar List', page_route: '/udhar-list', description: 'Navigate to Udhar / Khata Book', shortcut_key: 'Alt+U', category: 'Navigation' },
      { page_name: 'Reports', page_route: '/reports', description: 'Navigate to Analytics & Financial Reports', shortcut_key: 'Alt+N', category: 'Navigation' },
      { page_name: 'Roles & Permissions', page_route: '/roles', description: 'Navigate to Security & Access Controls', shortcut_key: 'Alt+Y', category: 'Navigation' },
      { page_name: 'Financial Year', page_route: '/financial-year', description: 'Navigate to Financial Year Accounting', shortcut_key: 'Alt+F', category: 'Navigation' },
      { page_name: 'GST / PST', page_route: '/gst-pst', description: 'Navigate to Tax Rates & Calculations', shortcut_key: 'Alt+G', category: 'Navigation' },
      { page_name: 'Audit Logs', page_route: '/history', description: 'Navigate to System Audit Logs & History', shortcut_key: 'Alt+H', category: 'Navigation' },
      { page_name: 'Delivery Memos', page_route: '/memos', description: 'Navigate to Delivery Memos & COD Returns', shortcut_key: 'Alt+V', category: 'Navigation' },
      { page_name: 'Settings', page_route: '/settings', description: 'Navigate to System Settings & Shortcuts Manager', shortcut_key: 'Alt+X', category: 'Navigation' },
    ];

    const existingShortcuts = await db.query('SELECT COUNT(*) as count FROM shortcuts');
    if (parseInt(existingShortcuts.rows[0]?.count || 0, 10) === 0) {
      for (const item of defaultShortcutsList) {
        await db.query(
          `INSERT INTO shortcuts (page_name, page_route, description, shortcut_key, category)
           VALUES ($1, $2, $3, $4, $5)`,
          [item.page_name, item.page_route, item.description, item.shortcut_key, item.category]
        );
      }
    }

    // 11. Seed Awards Table & Defaults
    await db.query(`
      CREATE TABLE IF NOT EXISTS awards (
          id VARCHAR(100) PRIMARY KEY,
          year VARCHAR(20) NOT NULL,
          title VARCHAR(255) NOT NULL,
          organization VARCHAR(255),
          location VARCHAR(255),
          category VARCHAR(255),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_awards_year ON awards(year);
    `);

    const defaultAwardsList = [
      {
        id: 'award-1',
        year: '2025',
        title: 'Best Architectural Joinery System',
        organization: 'Milan Architecture Biennale',
        location: 'Milan, Italy',
        category: 'Haute Joinery Gold Medal',
      },
      {
        id: 'award-2',
        year: '2024',
        title: 'Excellence in Sustainable Luxury',
        organization: 'Geneva Design & Forestry Guild',
        location: 'Geneva, Switzerland',
        category: '100% FSC Provenance',
      },
      {
        id: 'award-3',
        year: '2024',
        title: 'Innovative Sommelier Vault System',
        organization: 'Wallpaper* Design Awards',
        location: 'London, UK',
        category: 'Best Storage Architecture',
      },
      {
        id: 'award-4',
        year: '2023',
        title: 'Master Joiner Craftsmanship Trophy',
        organization: 'European Millwork Federation',
        location: 'Paris, France',
        category: 'Precision Engineering',
      },
    ];

    try {
      const existingAwards = await db.query('SELECT COUNT(*) as count FROM awards');
      if (parseInt(existingAwards.rows[0]?.count || 0, 10) === 0) {
        for (const a of defaultAwardsList) {
          await db.query(
            `INSERT INTO awards (id, year, title, organization, location, category)
             VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING`,
            [a.id, a.year, a.title, a.organization, a.location, a.category]
          );
        }
      }
    } catch (awErr) {
      console.warn('Awards database seeding note:', awErr.message);
    }

    // 12. Seed Company Credentials Table (Single Record)
    await db.query(`
      CREATE TABLE IF NOT EXISTS company_credentials (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          company_name VARCHAR(255) NOT NULL DEFAULT 'GB Cabinet Doors Ltd.',
          business_number VARCHAR(100) DEFAULT '987654321 BC0001',
          gst_number VARCHAR(100) DEFAULT '12345 6789 RT0001',
          pst_number VARCHAR(100) DEFAULT 'PST-1001-8849',
          company_email VARCHAR(255) DEFAULT 'info@gbcabinetdoors.ca',
          company_phone VARCHAR(100) DEFAULT '(604) 503-3711',
          website VARCHAR(255) DEFAULT 'https://gbcabinetdoors.ca',
          address_line1 VARCHAR(255) DEFAULT '12885 85 Ave',
          address_line2 VARCHAR(255) DEFAULT 'Unit 104',
          city VARCHAR(100) DEFAULT 'Surrey',
          province VARCHAR(100) DEFAULT 'BC',
          postal_code VARCHAR(50) DEFAULT 'V3W 0K8',
          country VARCHAR(100) DEFAULT 'Canada',
          invoice_prefix VARCHAR(50) DEFAULT 'INV',
          invoice_footer TEXT DEFAULT 'Thank you for your business. Payment terms: Net 30 days.',
          payment_terms TEXT DEFAULT 'Net 30 Days. Payments accepted via Interac e-Transfer, Credit Card, or Direct Deposit.',
          thank_you_message TEXT DEFAULT 'Thank you for choosing GB Cabinet Doors Ltd. We appreciate your business!',
          logo_url TEXT DEFAULT '',
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    try {
      const existingCreds = await db.query('SELECT COUNT(*) as count FROM company_credentials');
      if (parseInt(existingCreds.rows[0]?.count || 0, 10) === 0) {
        await db.query(`
          INSERT INTO company_credentials (
            company_name, business_number, gst_number, pst_number, company_email, company_phone,
            website, address_line1, address_line2, city, province, postal_code, country,
            invoice_prefix, invoice_footer, payment_terms, thank_you_message, logo_url
          ) VALUES (
            'GB Cabinet Doors Ltd.', '987654321 BC0001', '12345 6789 RT0001', 'PST-1001-8849',
            'info@gbcabinetdoors.ca', '(604) 503-3711', 'https://gbcabinetdoors.ca',
            '12885 85 Ave', 'Unit 104', 'Surrey', 'BC', 'V3W 0K8', 'Canada',
            'INV', 'Thank you for your business. Payment terms: Net 30 days.',
            'Net 30 Days. Payments accepted via Interac e-Transfer, Credit Card, or Direct Deposit.',
            'Thank you for choosing GB Cabinet Doors Ltd. We appreciate your business!', ''
          )
        `);
      }
    } catch (cErr) {
      console.warn('Company credentials database seeding note:', cErr.message);
    }

    console.log('✅ Database Seeding Completed Cleanly!');
  } catch (err) {
    console.error('⚠️ Database Seeding Warning:', err.message);
  }
};

if (require.main === module) {
  seedDatabase().then(() => process.exit(0));
}

module.exports = seedDatabase;
