-- PostgreSQL DDL Schema for Complete Production Ready Backend

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- USERS TABLE
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(150) NOT NULL,
    mobile_number VARCHAR(20),
    username VARCHAR(100) UNIQUE NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    password VARCHAR(255),
    google_id VARCHAR(255),
    profile_image VARCHAR(255),
    role VARCHAR(20) NOT NULL DEFAULT 'employee',
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- CATEGORY TABLE
CREATE TABLE IF NOT EXISTS category (
    category_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category_name VARCHAR(150) NOT NULL,
    description TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- PRODUCT TABLE (Prices are stored exclusively in user_prices table)
CREATE TABLE IF NOT EXISTS products (
    p_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category_id UUID REFERENCES category(category_id) ON DELETE SET NULL,
    product_name VARCHAR(200) NOT NULL,
    product_description TEXT,
    buy_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    gst_percent NUMERIC(5, 2) NOT NULL DEFAULT 5.00,
    pst_percent NUMERIC(5, 2) NOT NULL DEFAULT 7.00,
    stock INT NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE products DROP COLUMN IF EXISTS sell_price CASCADE;
ALTER TABLE products DROP COLUMN IF EXISTS custom_price CASCADE;

-- PRODUCT IMAGE TABLE
CREATE TABLE IF NOT EXISTS product_images (
    image_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    p_id UUID NOT NULL REFERENCES products(p_id) ON DELETE CASCADE,
    image_url TEXT NOT NULL,
    image_public_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE product_images ADD COLUMN IF NOT EXISTS image_public_id TEXT;

-- USER PRODUCT PRICE TABLE
CREATE TABLE IF NOT EXISTS user_prices (
    price_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(p_id) ON DELETE CASCADE,
    custom_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_user_product UNIQUE (user_id, product_id)
);

-- ORDER TABLE
CREATE TABLE IF NOT EXISTS orders (
    order_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    address TEXT NOT NULL,
    pincode VARCHAR(20) NOT NULL,
    payment_type VARCHAR(20) NOT NULL CHECK (payment_type IN ('Cash', 'Online', 'Credit', 'Partial')),
    measurement_type VARCHAR(20) NOT NULL CHECK (measurement_type IN ('Sqft', 'Sqin', 'Sqm')),
    height NUMERIC(10, 2) DEFAULT 0.00,
    width NUMERIC(10, 2) DEFAULT 0.00,
    quantity INT NOT NULL DEFAULT 1,
    subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    gst_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    pst_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    paid_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    credit_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    status VARCHAR(30) NOT NULL DEFAULT 'Pending',
    pst_number VARCHAR(50),
    pst_verified BOOLEAN DEFAULT FALSE,
    pst_exempt BOOLEAN DEFAULT FALSE,
    pst_verification_date TIMESTAMP WITH TIME ZONE,
    order_number VARCHAR(100),
    po_number VARCHAR(100),
    order_date DATE DEFAULT CURRENT_DATE,
    delivery_date DATE,
    finishing VARCHAR(150),
    panel_profile VARCHAR(150),
    edge_profile VARCHAR(150),
    measurement_unit VARCHAR(10) DEFAULT 'INCH',
    rail_size NUMERIC(12, 3) DEFAULT 2.250,
    stile_size NUMERIC(12, 3) DEFAULT 2.250,
    door_thickness NUMERIC(10, 3) DEFAULT 0.750,
    panel_thickness NUMERIC(10, 3) DEFAULT 0.250,
    wood_species VARCHAR(150),
    material VARCHAR(150),
    door_style VARCHAR(150),
    grain_direction VARCHAR(100),
    stain_color VARCHAR(150),
    glass_type VARCHAR(150),
    glass_thickness NUMERIC(10, 3),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS door_height NUMERIC(12, 3) DEFAULT 80.000;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS door_width NUMERIC(12, 3) DEFAULT 36.000;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS stile_size NUMERIC(12, 3) DEFAULT 2.250;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS additional_rail_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS additional_rail_size NUMERIC(12, 3) DEFAULT 2.250;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS additional_rail_position VARCHAR(150);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS door_thickness NUMERIC(10, 3) DEFAULT 0.750;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS panel_thickness NUMERIC(10, 3) DEFAULT 0.250;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS wood_species VARCHAR(150);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS material VARCHAR(150) DEFAULT 'Solid Wood';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS door_style VARCHAR(150);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS grain_direction VARCHAR(100);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS stain_color VARCHAR(150);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS glass_type VARCHAR(150);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS glass_thickness NUMERIC(10, 3);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS glass_width NUMERIC(10, 3);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS glass_height NUMERIC(10, 3);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS calculated_panel_height NUMERIC(12, 3);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS calculated_panel_width NUMERIC(12, 3);

-- ORDER SIZING ITEMS (DYNAMIC CUT LIST & SIZING ROWS)
CREATE TABLE IF NOT EXISTS order_sizing_items (
    sizing_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
    category_id UUID REFERENCES category(category_id) ON DELETE SET NULL,
    product_id UUID REFERENCES products(p_id) ON DELETE SET NULL,
    description TEXT,
    quantity INT NOT NULL DEFAULT 1,
    door_height NUMERIC(12, 3) NOT NULL DEFAULT 0.000,
    door_width NUMERIC(12, 3) NOT NULL DEFAULT 0.000,
    door_height_text VARCHAR(50),
    door_width_text VARCHAR(50),
    area NUMERIC(12, 4) DEFAULT 0,
    price NUMERIC(12, 2) DEFAULT 0,
    total NUMERIC(12, 2) DEFAULT 0,
    panel_height NUMERIC(12, 3) NOT NULL DEFAULT 0.000,
    panel_width NUMERIC(12, 3) NOT NULL DEFAULT 0.000,
    stile_length NUMERIC(12, 3) NOT NULL DEFAULT 0.000,
    stile_quantity INT NOT NULL DEFAULT 0,
    rail_length NUMERIC(12, 3) NOT NULL DEFAULT 0.000,
    rail_quantity INT NOT NULL DEFAULT 0,
    measurement_unit VARCHAR(10) DEFAULT 'INCH',
    sort_order INT DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ORDER ITEMS
CREATE TABLE IF NOT EXISTS order_items (
    item_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(p_id) ON DELETE RESTRICT,
    price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    quantity INT NOT NULL DEFAULT 1,
    gst NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    pst NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    total NUMERIC(12, 2) NOT NULL DEFAULT 0.00
);

-- INVOICE TABLE
CREATE TABLE IF NOT EXISTS invoice (
    invoice_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    invoice_number VARCHAR(100) UNIQUE NOT NULL,
    invoice_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    payment_status VARCHAR(20) NOT NULL CHECK (payment_status IN ('Paid', 'Unpaid', 'Partial')),
    paid_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    remaining_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ACCOUNT LEDGER
CREATE TABLE IF NOT EXISTS accounts (
    transaction_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    order_id UUID REFERENCES orders(order_id) ON DELETE SET NULL,
    type VARCHAR(30) NOT NULL CHECK (type IN ('Credit', 'Debit', 'Payment', 'Adjustment', 'Advance')),
    amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    opening_balance NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    closing_balance NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    payment_method TEXT,
    transaction_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    description TEXT
);

-- EXPENSE TABLE
CREATE TABLE IF NOT EXISTS expenses (
    expense_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category VARCHAR(100) NOT NULL DEFAULT 'Miscellaneous',
    title VARCHAR(200) NOT NULL,
    amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    payment_mode VARCHAR(50) NOT NULL DEFAULT 'Bank Transfer',
    description TEXT,
    bill_image TEXT,
    expense_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS bill_image TEXT;


-- EMPLOYEE TABLE
CREATE TABLE IF NOT EXISTS employees (
    employee_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(150) NOT NULL,
    mobile VARCHAR(20) NOT NULL,
    salary NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    joining_date DATE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- SALARY TABLE
CREATE TABLE IF NOT EXISTS salary (
    salary_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id UUID NOT NULL REFERENCES employees(employee_id) ON DELETE CASCADE,
    month INT NOT NULL CHECK (month BETWEEN 1 AND 12),
    year INT NOT NULL,
    salary NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    paid NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    payment_method VARCHAR(30) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_emp_month_year UNIQUE (employee_id, month, year)
);

-- LOAN TABLE
CREATE TABLE IF NOT EXISTS loans (
    loan_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    person_name VARCHAR(150) NOT NULL,
    loan_type VARCHAR(30) NOT NULL CHECK (loan_type IN ('Given', 'Taken')),
    amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    interest NUMERIC(5, 2) DEFAULT 0.00,
    remaining NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    monthly_installment NUMERIC(12, 2) DEFAULT 0.00,
    status VARCHAR(20) NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Closed')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- PAYMENT TABLE
CREATE TABLE IF NOT EXISTS payments (
    payment_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES orders(order_id) ON DELETE SET NULL,
    customer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    method TEXT NOT NULL,
    transaction_id VARCHAR(100),
    payment_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- HISTORY TABLE (AUDIT LOGS)
CREATE TABLE IF NOT EXISTS history (
    history_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(20) NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'OTHER')),
    table_name VARCHAR(50) NOT NULL,
    record_id VARCHAR(100),
    old_data JSONB,
    new_data JSONB,
    ip_address VARCHAR(45),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- PERMISSIONS TABLE
CREATE TABLE IF NOT EXISTS permissions (
    permission_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    role VARCHAR(30) NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    permission_key VARCHAR(100) NOT NULL,
    is_allowed BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- DELIVERY MEMO TABLE (COD SYSTEM)
CREATE TABLE IF NOT EXISTS delivery_memos (
    memo_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    memo_number VARCHAR(100) UNIQUE NOT NULL,
    order_id UUID REFERENCES orders(order_id) ON DELETE CASCADE,
    customer_id UUID REFERENCES users(id) ON DELETE SET NULL,
    reason TEXT NOT NULL,
    photos JSONB DEFAULT '[]'::jsonb,
    driver_notes TEXT,
    amount_lost NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    courier_name VARCHAR(100),
    status VARCHAR(30) NOT NULL DEFAULT 'Pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- FINANCIAL YEAR ACCOUNTING TABLE
CREATE TABLE IF NOT EXISTS financial_years (
    fy_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    fy_name VARCHAR(100) UNIQUE NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    total_debit NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    total_credit NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    net_opening_balance NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    net_closing_balance NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    status VARCHAR(20) NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Closed')),
    closed_at TIMESTAMP WITH TIME ZONE,
    closed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- KEYBOARD SHORTCUTS TABLE
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

-- AWARDS TABLE
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

-- INDEXES FOR PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_user_prices_user ON user_prices(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_accounts_user ON accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_history_user ON history(user_id);
CREATE INDEX IF NOT EXISTS idx_permissions_role ON permissions(role);
CREATE INDEX IF NOT EXISTS idx_permissions_user ON permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_delivery_memos_order ON delivery_memos(order_id);
CREATE INDEX IF NOT EXISTS idx_shortcuts_page ON shortcuts(page_name);
-- COMPANY CREDENTIALS TABLE (SINGLE RECORD)
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
CREATE INDEX IF NOT EXISTS idx_awards_year ON awards(year);
