-- =========================================================
-- BILLION PIXEL CANVAS
-- Cloudflare D1 / SQLite Database Schema
-- =========================================================

PRAGMA foreign_keys = ON;


-- =========================================================
-- PROJECT CONFIGURATION
-- =========================================================

CREATE TABLE IF NOT EXISTS project_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);


INSERT OR IGNORE INTO project_config
    (key, value)
VALUES
    ('project_name', 'Billion Pixel Canvas'),
    ('total_pixels', '1000000000'),
    ('pixel_price_usd', '1'),
    ('payment_currency', 'BTC'),
    (
        'btc_receiving_address',
        'bc1qk8ehysk2fthd2p07zgdqz84tyvudkdn4565u40'
    ),
    (
        'ownership_policy',
        'PERMANENT_NO_RESALE_NO_TRANSFER'
    );


-- =========================================================
-- DISTRICTS
-- =========================================================

CREATE TABLE IF NOT EXISTS districts (

    id TEXT PRIMARY KEY,

    name TEXT NOT NULL UNIQUE,

    minimum_pixels INTEGER NOT NULL,

    adult_only INTEGER NOT NULL DEFAULT 0
        CHECK (adult_only IN (0, 1)),

    description TEXT NOT NULL,

    created_at TEXT NOT NULL
        DEFAULT CURRENT_TIMESTAMP

);


INSERT OR IGNORE INTO districts
    (id, name, minimum_pixels, adult_only, description)
VALUES

(
    'people',
    'People''s District',
    1,
    0,
    'General participation district.'
),

(
    'giants',
    'Giants District',
    100000,
    0,
    'Large-purchase district.'
),

(
    'youth',
    'Youth District',
    1,
    0,
    'Family-friendly youth district.'
),

(
    'adult',
    'Adult District',
    100000,
    1,
    '18+ district for legally permissible adult content.'
);


-- =========================================================
-- USERS
-- =========================================================

CREATE TABLE IF NOT EXISTS users (

    id TEXT PRIMARY KEY,

    email TEXT UNIQUE,

    username TEXT UNIQUE,

    display_name TEXT,

    avatar_url TEXT,

    date_of_birth TEXT,

    age_verified INTEGER NOT NULL DEFAULT 0
        CHECK (age_verified IN (0, 1)),

    created_at TEXT NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    updated_at TEXT NOT NULL
        DEFAULT CURRENT_TIMESTAMP

);


CREATE INDEX IF NOT EXISTS idx_users_username
ON users(username);


CREATE INDEX IF NOT EXISTS idx_users_email
ON users(email);


-- =========================================================
-- CANVAS REGIONS
-- =========================================================
--
-- The canvas contains one billion logical pixels.
--
-- We DO NOT insert 1 billion rows.
--
-- Each district occupies a predetermined coordinate range.
--
-- A production coordinate allocator will calculate the next
-- available contiguous region.
--
-- =========================================================

CREATE TABLE IF NOT EXISTS canvas_regions (

    id TEXT PRIMARY KEY,

    district_id TEXT NOT NULL,

    x_start INTEGER NOT NULL,

    y_start INTEGER NOT NULL,

    width INTEGER NOT NULL,

    height INTEGER NOT NULL,

    pixel_count INTEGER NOT NULL,

    created_at TEXT NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (
        district_id
    )
    REFERENCES districts(id),

    CHECK (x_start >= 0),

    CHECK (y_start >= 0),

    CHECK (width > 0),

    CHECK (height > 0),

    CHECK (
        pixel_count =
        width * height
    )

);


CREATE INDEX IF NOT EXISTS idx_canvas_regions_district
ON canvas_regions(district_id);


-- =========================================================
-- ORDERS
-- =========================================================

CREATE TABLE IF NOT EXISTS orders (

    id TEXT PRIMARY KEY,

    user_id TEXT,

    district_id TEXT NOT NULL,

    quantity INTEGER NOT NULL,

    price_usd INTEGER NOT NULL,

    payment_currency TEXT NOT NULL DEFAULT 'BTC',

    btc_amount_satoshis INTEGER,

    btc_rate_usd REAL,

    payment_address TEXT NOT NULL,

    status TEXT NOT NULL,

    expires_at TEXT,

    created_at TEXT NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    updated_at TEXT NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (
        user_id
    )
    REFERENCES users(id),

    FOREIGN KEY (
        district_id
    )
    REFERENCES districts(id),

    CHECK (
        quantity > 0
    ),

    CHECK (
        price_usd =
        quantity
    ),

    CHECK (
        status IN (
            'PENDING',
            'RESERVED',
            'PAYMENT_DETECTED',
            'CONFIRMING',
            'PAID',
            'COMPLETED',
            'EXPIRED',
            'CANCELLED',
            'FAILED'
        )
    )

);


CREATE INDEX IF NOT EXISTS idx_orders_user
ON orders(user_id);


CREATE INDEX IF NOT EXISTS idx_orders_status
ON orders(status);


CREATE INDEX IF NOT EXISTS idx_orders_created
ON orders(created_at);


-- =========================================================
-- PIXEL RESERVATIONS
-- =========================================================
--
-- Reservations are temporary.
--
-- They prevent two buyers from attempting to purchase the
-- same coordinate range simultaneously.
--
-- A reservation either becomes SOLD or expires.
--
-- =========================================================

CREATE TABLE IF NOT EXISTS pixel_reservations (

    id TEXT PRIMARY KEY,

    order_id TEXT NOT NULL,

    district_id TEXT NOT NULL,

    x_start INTEGER NOT NULL,

    y_start INTEGER NOT NULL,

    width INTEGER NOT NULL,

    height INTEGER NOT NULL,

    pixel_count INTEGER NOT NULL,

    expires_at TEXT NOT NULL,

    status TEXT NOT NULL DEFAULT 'ACTIVE',

    created_at TEXT NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (
        order_id
    )
    REFERENCES orders(id),

    FOREIGN KEY (
        district_id
    )
    REFERENCES districts(id),

    CHECK (x_start >= 0),

    CHECK (y_start >= 0),

    CHECK (width > 0),

    CHECK (height > 0),

    CHECK (
        pixel_count =
        width * height
    ),

    CHECK (
        status IN (
            'ACTIVE',
            'CONVERTED',
            'EXPIRED',
            'CANCELLED'
        )
    )

);


CREATE INDEX IF NOT EXISTS idx_reservations_order
ON pixel_reservations(order_id);


CREATE INDEX IF NOT EXISTS idx_reservations_status
ON pixel_reservations(status);


CREATE INDEX IF NOT EXISTS idx_reservations_expiry
ON pixel_reservations(expires_at);


-- =========================================================
-- PERMANENT OWNERSHIP
-- =========================================================
--
-- IMPORTANT:
--
-- A row here represents an area that has been permanently sold.
--
-- There is intentionally NO resale table.
--
-- There is intentionally NO transfer mechanism.
--
-- A SOLD ownership record must never be returned to inventory.
--
-- =========================================================

CREATE TABLE IF NOT EXISTS pixel_ownership (

    id TEXT PRIMARY KEY,

    order_id TEXT NOT NULL,

    user_id TEXT,

    district_id TEXT NOT NULL,

    x_start INTEGER NOT NULL,

    y_start INTEGER NOT NULL,

    width INTEGER NOT NULL,

    height INTEGER NOT NULL,

    pixel_count INTEGER NOT NULL,

    price_usd INTEGER NOT NULL,

    status TEXT NOT NULL DEFAULT 'SOLD',

    sold_at TEXT NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    created_at TEXT NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (
        order_id
    )
    REFERENCES orders(id),

    FOREIGN KEY (
        user_id
    )
    REFERENCES users(id),

    FOREIGN KEY (
        district_id
    )
    REFERENCES districts(id),

    CHECK (
        status = 'SOLD'
    ),

    CHECK (
        pixel_count =
        width * height
    ),

    CHECK (
        price_usd =
        pixel_count
    ),

    CHECK (x_start >= 0),

    CHECK (y_start >= 0),

    CHECK (width > 0),

    CHECK (height > 0)

);


CREATE INDEX IF NOT EXISTS idx_pixel_ownership_user
ON pixel_ownership(user_id);


CREATE INDEX IF NOT EXISTS idx_pixel_ownership_district
ON pixel_ownership(district_id);


CREATE INDEX IF NOT EXISTS idx_pixel_ownership_order
ON pixel_ownership(order_id);


CREATE INDEX IF NOT EXISTS idx_pixel_ownership_coordinates
ON pixel_ownership(
    district_id,
    x_start,
    y_start
);


-- =========================================================
-- BITCOIN PAYMENTS
-- =========================================================

CREATE TABLE IF NOT EXISTS bitcoin_payments (

    id TEXT PRIMARY KEY,

    order_id TEXT NOT NULL UNIQUE,

    payment_address TEXT NOT NULL,

    expected_satoshis INTEGER NOT NULL,

    received_satoshis INTEGER NOT NULL DEFAULT 0,

    transaction_id TEXT UNIQUE,

    detected_at TEXT,

    confirmed_at TEXT,

    confirmation_count INTEGER NOT NULL DEFAULT 0,

    status TEXT NOT NULL DEFAULT 'AWAITING_PAYMENT',

    created_at TEXT NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    updated_at TEXT NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (
        order_id
    )
    REFERENCES orders(id),

    CHECK (
        expected_satoshis > 0
    ),

    CHECK (
        received_satoshis >= 0
    ),

    CHECK (
        confirmation_count >= 0
    ),

    CHECK (
        status IN (
            'AWAITING_PAYMENT',
            'PAYMENT_DETECTED',
            'CONFIRMING',
            'CONFIRMED',
            'UNDERPAID',
            'OVERPAID',
            'EXPIRED',
            'FAILED'
        )
    )

);


CREATE INDEX IF NOT EXISTS idx_bitcoin_tx
ON bitcoin_payments(transaction_id);


CREATE INDEX IF NOT EXISTS idx_bitcoin_status
ON bitcoin_payments(status);


-- =========================================================
-- CONTENT
-- =========================================================

CREATE TABLE IF NOT EXISTS canvas_content (

    id TEXT PRIMARY KEY,

    ownership_id TEXT NOT NULL,

    user_id TEXT,

    content_type TEXT NOT NULL,

    title TEXT,

    description TEXT,

    image_url TEXT,

    external_url TEXT,

    alt_text TEXT,

    is_adult_content INTEGER NOT NULL DEFAULT 0
        CHECK (is_adult_content IN (0, 1)),

    status TEXT NOT NULL DEFAULT 'PUBLISHED',

    created_at TEXT NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    updated_at TEXT NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (
        ownership_id
    )
    REFERENCES pixel_ownership(id),

    FOREIGN KEY (
        user_id
    )
    REFERENCES users(id),

    CHECK (
        content_type IN (
            'IMAGE',
            'TEXT',
            'LOGO',
            'LINK',
            'ARTWORK'
        )
    ),

    CHECK (
        status IN (
            'DRAFT',
            'PUBLISHED',
            'HIDDEN',
            'REMOVED'
        )
    )

);


CREATE INDEX IF NOT EXISTS idx_content_ownership
ON canvas_content(ownership_id);


CREATE INDEX IF NOT EXISTS idx_content_status
ON canvas_content(status);


-- =========================================================
-- CONTENT REPORTS
-- =========================================================

CREATE TABLE IF NOT EXISTS content_reports (

    id TEXT PRIMARY KEY,

    content_id TEXT NOT NULL,

    reporter_user_id TEXT,

    reason TEXT NOT NULL,

    details TEXT,

    status TEXT NOT NULL DEFAULT 'OPEN',

    created_at TEXT NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    reviewed_at TEXT,

    FOREIGN KEY (
        content_id
    )
    REFERENCES canvas_content(id),

    FOREIGN KEY (
        reporter_user_id
    )
    REFERENCES users(id),

    CHECK (
        status IN (
            'OPEN',
            'REVIEWING',
            'RESOLVED',
            'DISMISSED'
        )
    )

);


CREATE INDEX IF NOT EXISTS idx_reports_content
ON content_reports(content_id);


CREATE INDEX IF NOT EXISTS idx_reports_status
ON content_reports(status);


-- =========================================================
-- AUDIT LOG
-- =========================================================
--
-- Critical ownership/payment events are recorded here.
--
-- This provides an independent history of what happened.
--
-- =========================================================

CREATE TABLE IF NOT EXISTS audit_log (

    id TEXT PRIMARY KEY,

    event_type TEXT NOT NULL,

    entity_type TEXT NOT NULL,

    entity_id TEXT NOT NULL,

    user_id TEXT,

    metadata_json TEXT,

    created_at TEXT NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (
        user_id
    )
    REFERENCES users(id)

);


CREATE INDEX IF NOT EXISTS idx_audit_entity
ON audit_log(
    entity_type,
    entity_id
);


CREATE INDEX IF NOT EXISTS idx_audit_event
ON audit_log(event_type);


CREATE INDEX IF NOT EXISTS idx_audit_created
ON audit_log(created_at);


-- =========================================================
-- PURCHASE STATISTICS VIEW
-- =========================================================

CREATE VIEW IF NOT EXISTS canvas_statistics AS

SELECT

    (
        SELECT
            COALESCE(
                SUM(pixel_count),
                0
            )
        FROM pixel_ownership
        WHERE status = 'SOLD'
    )
    AS pixels_sold,

    (
        1000000000 -
        (
            SELECT
                COALESCE(
                    SUM(pixel_count),
                    0
                )
            FROM pixel_ownership
            WHERE status = 'SOLD'
        )
    )
    AS pixels_available,

    (
        SELECT
            COALESCE(
                SUM(price_usd),
                0
            )
        FROM pixel_ownership
        WHERE status = 'SOLD'
    )
    AS total_raised;


-- =========================================================
-- END OF SCHEMA
-- =========================================================
