-- =========================================================
-- BILLION PIXEL CANVAS
-- ORDER + PIXEL OWNERSHIP MIGRATION
-- =========================================================

PRAGMA foreign_keys = ON;


-- =========================================================
-- PROJECT CONFIGURATION
-- =========================================================

CREATE TABLE IF NOT EXISTS project_config (

    key TEXT PRIMARY KEY,

    value TEXT NOT NULL

);


INSERT OR IGNORE INTO project_config (
    key,
    value
)
VALUES
(
    'project_name',
    'Billion Pixel Canvas'
),
(
    'total_pixels',
    '1000000000'
),
(
    'pixel_price_usd',
    '1'
),
(
    'payment_currency',
    'BTC'
),
(
    'ownership_policy',
    'PERMANENT_NO_RESALE'
),
(
    'resale_enabled',
    'false'
);


-- =========================================================
-- DISTRICTS
-- =========================================================

CREATE TABLE IF NOT EXISTS districts (

    id TEXT PRIMARY KEY,

    name TEXT NOT NULL UNIQUE,

    minimum_pixels INTEGER NOT NULL DEFAULT 1,

    adult_only INTEGER NOT NULL DEFAULT 0
        CHECK (
            adult_only IN (0, 1)
        ),

    description TEXT,

    created_at TEXT NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    CHECK (
        minimum_pixels >= 1
    )

);


-- =========================================================
-- INITIAL DISTRICTS
-- =========================================================

INSERT OR IGNORE INTO districts (
    id,
    name,
    minimum_pixels,
    adult_only,
    description
)
VALUES
(
    'main',
    'Main District',
    1,
    0,
    'The main Billion Pixel Canvas.'
),
(
    'giants',
    'Giants District',
    1,
    0,
    'Large-format area for major pixel purchases.'
),
(
    'youth',
    'Youth District',
    1,
    0,
    'Family-oriented district.'
),
(
    'adult',
    'Adult District',
    100000,
    1,
    '18+ district with a minimum purchase of 100,000 pixels.'
);


-- =========================================================
-- CANVAS PIXELS
-- =========================================================
--
-- IMPORTANT:
--
-- One billion individual SQLite rows is NOT something we
-- should blindly create during migration.
--
-- The production allocator can use deterministic coordinate
-- ranges/chunks and populate ownership records as pixels are
-- purchased.
--
-- This table represents pixels that have been materialized
-- into the database.
--
-- The allocator must never create duplicate pixel IDs.
-- =========================================================

CREATE TABLE IF NOT EXISTS canvas_pixels (

    id INTEGER PRIMARY KEY,

    pixel_id INTEGER NOT NULL UNIQUE,

    district_id TEXT NOT NULL,

    x INTEGER NOT NULL,

    y INTEGER NOT NULL,

    status TEXT NOT NULL DEFAULT 'AVAILABLE',

    owner_user_id TEXT,

    reservation_order_id TEXT,

    reserved_by TEXT,

    reserved_at TEXT,

    sold_order_id TEXT,

    sold_at TEXT,

    created_at TEXT NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    updated_at TEXT NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (
        district_id
    )
    REFERENCES districts(id),

    FOREIGN KEY (
        owner_user_id
    )
    REFERENCES users(id)
    ON DELETE SET NULL,

    CHECK (
        status IN (
            'AVAILABLE',
            'RESERVED',
            'SOLD'
        )
    ),

    CHECK (
        x >= 0
    ),

    CHECK (
        y >= 0
    )

);


-- =========================================================
-- CANVAS PIXEL INDEXES
-- =========================================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_canvas_pixel_coordinate
ON canvas_pixels(
    district_id,
    x,
    y
);


CREATE INDEX IF NOT EXISTS idx_canvas_pixel_status
ON canvas_pixels(
    district_id,
    status
);


CREATE INDEX IF NOT EXISTS idx_canvas_pixel_owner
ON canvas_pixels(
    owner_user_id
);


CREATE INDEX IF NOT EXISTS idx_canvas_pixel_order
ON canvas_pixels(
    sold_order_id
);


CREATE INDEX IF NOT EXISTS idx_canvas_pixel_reservation
ON canvas_pixels(
    reservation_order_id
);


-- =========================================================
-- ORDERS
-- =========================================================

CREATE TABLE IF NOT EXISTS orders (

    id TEXT PRIMARY KEY,

    user_id TEXT NOT NULL,

    district_id TEXT NOT NULL,

    quantity INTEGER NOT NULL,

    price_usd INTEGER NOT NULL,

    payment_currency TEXT NOT NULL DEFAULT 'BTC',

    btc_amount_satoshis INTEGER,

    btc_rate_usd REAL,

    payment_address TEXT,

    status TEXT NOT NULL DEFAULT 'RESERVED',

    created_at TEXT NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    updated_at TEXT NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    completed_at TEXT,

    FOREIGN KEY (
        user_id
    )
    REFERENCES users(id),

    FOREIGN KEY (
        district_id
    )
    REFERENCES districts(id),

    CHECK (
        quantity >= 1
    ),

    CHECK (
        price_usd = quantity
    ),

    CHECK (
        payment_currency = 'BTC'
    ),

    CHECK (
        status IN (
            'RESERVED',
            'PAYMENT_PENDING',
            'PAYMENT_DETECTED',
            'CONFIRMING',
            'PAID',
            'COMPLETED',
            'EXPIRED',
            'CANCELLED',
            'UNDERPAID',
            'FAILED'
        )
    )

);


-- =========================================================
-- ORDER INDEXES
-- =========================================================

CREATE INDEX IF NOT EXISTS idx_orders_user
ON orders(user_id);


CREATE INDEX IF NOT EXISTS idx_orders_status
ON orders(status);


CREATE INDEX IF NOT EXISTS idx_orders_district
ON orders(district_id);


CREATE INDEX IF NOT EXISTS idx_orders_created
ON orders(created_at);


CREATE INDEX IF NOT EXISTS idx_orders_payment_address
ON orders(payment_address);


-- =========================================================
-- PIXEL RESERVATIONS
-- =========================================================

CREATE TABLE IF NOT EXISTS pixel_reservations (

    id TEXT PRIMARY KEY,

    order_id TEXT NOT NULL,

    user_id TEXT NOT NULL,

    pixel_id INTEGER NOT NULL,

    district_id TEXT NOT NULL,

    x INTEGER NOT NULL,

    y INTEGER NOT NULL,

    status TEXT NOT NULL DEFAULT 'RESERVED',

    created_at TEXT NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    updated_at TEXT NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (
        order_id
    )
    REFERENCES orders(id)
    ON DELETE CASCADE,

    FOREIGN KEY (
        user_id
    )
    REFERENCES users(id),

    FOREIGN KEY (
        district_id
    )
    REFERENCES districts(id),

    UNIQUE (
        order_id,
        pixel_id
    ),

    CHECK (
        status IN (
            'RESERVED',
            'SOLD',
            'RELEASED'
        )
    )

);


CREATE INDEX IF NOT EXISTS idx_pixel_reservations_order
ON pixel_reservations(order_id);


CREATE INDEX IF NOT EXISTS idx_pixel_reservations_pixel
ON pixel_reservations(pixel_id);


CREATE INDEX IF NOT EXISTS idx_pixel_reservations_status
ON pixel_reservations(status);


-- =========================================================
-- PERMANENT OWNERSHIP
-- =========================================================
--
-- This is the permanent ownership ledger.
--
-- A SOLD pixel has a permanent ownership record.
--
-- There is deliberately NO resale_price column.
--
-- There is deliberately NO marketplace table.
--
-- There is deliberately NO auction table.
--
-- =========================================================

CREATE TABLE IF NOT EXISTS pixel_ownership (

    id TEXT PRIMARY KEY,

    user_id TEXT NOT NULL,

    order_id TEXT NOT NULL,

    pixel_id INTEGER NOT NULL UNIQUE,

    district_id TEXT NOT NULL,

    x INTEGER NOT NULL,

    y INTEGER NOT NULL,

    status TEXT NOT NULL DEFAULT 'SOLD',

    created_at TEXT NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (
        user_id
    )
    REFERENCES users(id),

    FOREIGN KEY (
        order_id
    )
    REFERENCES orders(id),

    FOREIGN KEY (
        district_id
    )
    REFERENCES districts(id),

    CHECK (
        status = 'SOLD'
    )

);


-- =========================================================
-- OWNERSHIP INDEXES
-- =========================================================

CREATE INDEX IF NOT EXISTS idx_pixel_ownership_user
ON pixel_ownership(user_id);


CREATE INDEX IF NOT EXISTS idx_pixel_ownership_district
ON pixel_ownership(district_id);


CREATE INDEX IF NOT EXISTS idx_pixel_ownership_coordinate
ON pixel_ownership(
    district_id,
    x,
    y
);


CREATE INDEX IF NOT EXISTS idx_pixel_ownership_order
ON pixel_ownership(order_id);


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

    confirmation_count INTEGER NOT NULL DEFAULT 0,

    status TEXT NOT NULL DEFAULT 'AWAITING_PAYMENT',

    created_at TEXT NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    updated_at TEXT NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    confirmed_at TEXT,

    FOREIGN KEY (
        order_id
    )
    REFERENCES orders(id)
    ON DELETE CASCADE,

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
            'UNDERPAID',
            'CONFIRMING',
            'CONFIRMED',
            'FAILED'
        )
    )

);


-- =========================================================
-- BITCOIN PAYMENT INDEXES
-- =========================================================

CREATE INDEX IF NOT EXISTS idx_bitcoin_payments_tx
ON bitcoin_payments(transaction_id);


CREATE INDEX IF NOT EXISTS idx_bitcoin_payments_status
ON bitcoin_payments(status);


CREATE INDEX IF NOT EXISTS idx_bitcoin_payments_address
ON bitcoin_payments(payment_address);


-- =========================================================
-- AUDIT LOG
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
    ON DELETE SET NULL

);


CREATE INDEX IF NOT EXISTS idx_audit_entity
ON audit_log(
    entity_type,
    entity_id
);


CREATE INDEX IF NOT EXISTS idx_audit_user
ON audit_log(user_id);


CREATE INDEX IF NOT EXISTS idx_audit_created
ON audit_log(created_at);


-- =========================================================
-- MIGRATION AUDIT
-- =========================================================

INSERT INTO audit_log (

    id,

    event_type,

    entity_type,

    entity_id,

    metadata_json

)

VALUES (

    'audit_migration_0003',

    'ORDER_OWNERSHIP_MIGRATION',

    'SYSTEM',

    '0003',

    '{"description":"Order, pixel reservation, permanent ownership and Bitcoin payment tables installed.","pixel_price_usd":1,"resale_enabled":false}'

);
