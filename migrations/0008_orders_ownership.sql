-- =========================================================
-- BILLION PIXEL CANVAS
-- ORDERS + OWNERSHIP FOUNDATION
-- MIGRATION 0008
-- =========================================================

PRAGMA foreign_keys = ON;


-- =========================================================
-- DISTRICTS
-- =========================================================

CREATE TABLE IF NOT EXISTS districts (

    id TEXT PRIMARY KEY,

    name TEXT NOT NULL,

    x INTEGER NOT NULL,

    y INTEGER NOT NULL,

    width INTEGER NOT NULL,

    height INTEGER NOT NULL,

    minimum_pixels INTEGER NOT NULL DEFAULT 1,

    adult_only INTEGER NOT NULL DEFAULT 0
        CHECK (
            adult_only IN (0, 1)
        ),

    created_at TEXT NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    CHECK (
        x >= 0
    ),

    CHECK (
        y >= 0
    ),

    CHECK (
        width > 0
    ),

    CHECK (
        height > 0
    ),

    CHECK (
        minimum_pixels > 0
    )

);


-- =========================================================
-- DISTRICT DATA
-- =========================================================

INSERT OR IGNORE INTO districts (
    id,
    name,
    x,
    y,
    width,
    height,
    minimum_pixels,
    adult_only
)
VALUES
(
    'main',
    'Main District',
    0,
    0,
    40000,
    18000,
    1,
    0
),
(
    'giants',
    'Giants District',
    4000,
    4000,
    10000,
    6000,
    1,
    0
),
(
    'youth',
    'Youth District',
    26000,
    4000,
    10000,
    6000,
    1,
    0
),
(
    'adult',
    'Adult District',
    0,
    18000,
    40000,
    7000,
    100000,
    1
);


-- =========================================================
-- DISTRICT INDEXES
-- =========================================================

CREATE INDEX IF NOT EXISTS idx_districts_adult
ON districts(adult_only);


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
    REFERENCES users(id)
    ON DELETE RESTRICT,

    FOREIGN KEY (
        district_id
    )
    REFERENCES districts(id)
    ON DELETE RESTRICT,

    CHECK (
        quantity >= 1
    ),

    CHECK (
        price_usd >= 1
    ),

    CHECK (
        payment_currency = 'BTC'
    ),

    CHECK (
        status IN (
            'RESERVED',
            'PAYMENT_PENDING',
            'CONFIRMING',
            'UNDERPAID',
            'PAID',
            'COMPLETED',
            'CANCELLED',
            'EXPIRED'
        )
    )

);


-- =========================================================
-- ORDER INDEXES
-- =========================================================

CREATE INDEX IF NOT EXISTS idx_orders_user
ON orders(user_id);


CREATE INDEX IF NOT EXISTS idx_orders_district
ON orders(district_id);


CREATE INDEX IF NOT EXISTS idx_orders_status
ON orders(status);


CREATE INDEX IF NOT EXISTS idx_orders_created
ON orders(created_at);


-- =========================================================
-- CANVAS PIXELS
-- =========================================================
--
-- Only touched pixels are stored.
--
-- One billion AVAILABLE pixels do NOT require one billion
-- database records.
-- =========================================================

CREATE TABLE IF NOT EXISTS canvas_pixels (

    pixel_id INTEGER PRIMARY KEY,

    district_id TEXT NOT NULL,

    x INTEGER NOT NULL,

    y INTEGER NOT NULL,

    status TEXT NOT NULL,

    owner_user_id TEXT,

    reservation_order_id TEXT,

    reserved_by TEXT,

    reserved_at TEXT,

    sold_order_id TEXT,

    sold_at TEXT,

    updated_at TEXT NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (
        district_id
    )
    REFERENCES districts(id)
    ON DELETE RESTRICT,

    FOREIGN KEY (
        owner_user_id
    )
    REFERENCES users(id)
    ON DELETE SET NULL,

    FOREIGN KEY (
        reservation_order_id
    )
    REFERENCES orders(id)
    ON DELETE SET NULL,

    FOREIGN KEY (
        sold_order_id
    )
    REFERENCES orders(id)
    ON DELETE SET NULL,

    CHECK (
        pixel_id >= 0
    ),

    CHECK (
        x >= 0
    ),

    CHECK (
        y >= 0
    ),

    CHECK (
        status IN (
            'RESERVED',
            'SOLD'
        )
    )

);


-- =========================================================
-- PIXEL CONSTRAINTS
-- =========================================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_canvas_pixels_coordinate
ON canvas_pixels(x, y);


CREATE INDEX IF NOT EXISTS idx_canvas_pixels_district
ON canvas_pixels(district_id);


CREATE INDEX IF NOT EXISTS idx_canvas_pixels_owner
ON canvas_pixels(owner_user_id);


CREATE INDEX IF NOT EXISTS idx_canvas_pixels_reservation
ON canvas_pixels(reservation_order_id);


CREATE INDEX IF NOT EXISTS idx_canvas_pixels_sold_order
ON canvas_pixels(sold_order_id);


-- =========================================================
-- PIXEL RESERVATIONS
-- =========================================================

CREATE TABLE IF NOT EXISTS pixel_reservations (

    id TEXT PRIMARY KEY,

    order_id TEXT NOT NULL,

    user_id TEXT NOT NULL,

    pixel_id INTEGER NOT NULL,

    district_id TEXT NOT NULL,

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
    REFERENCES users(id)
    ON DELETE RESTRICT,

    FOREIGN KEY (
        pixel_id
    )
    REFERENCES canvas_pixels(pixel_id)
    ON DELETE RESTRICT,

    FOREIGN KEY (
        district_id
    )
    REFERENCES districts(id)
    ON DELETE RESTRICT,

    CHECK (
        status IN (
            'RESERVED',
            'SOLD',
            'RELEASED'
        )
    )

);


-- =========================================================
-- RESERVATION CONSTRAINTS
-- =========================================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_reservation_order_pixel
ON pixel_reservations(
    order_id,
    pixel_id
);


CREATE INDEX IF NOT EXISTS idx_reservation_pixel_status
ON pixel_reservations(
    pixel_id,
    status
);


CREATE INDEX IF NOT EXISTS idx_reservation_order
ON pixel_reservations(
    order_id,
    status
);


-- =========================================================
-- PERMANENT PIXEL OWNERSHIP
-- =========================================================
--
-- A SOLD pixel gets exactly one permanent ownership record.
--
-- There is intentionally no transfer/resale field or API.
-- =========================================================

CREATE TABLE IF NOT EXISTS pixel_ownership (

    id TEXT PRIMARY KEY,

    user_id TEXT NOT NULL,

    order_id TEXT NOT NULL,

    pixel_id INTEGER NOT NULL,

    district_id TEXT NOT NULL,

    x INTEGER NOT NULL,

    y INTEGER NOT NULL,

    status TEXT NOT NULL DEFAULT 'SOLD',

    created_at TEXT NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (
        user_id
    )
    REFERENCES users(id)
    ON DELETE RESTRICT,

    FOREIGN KEY (
        order_id
    )
    REFERENCES orders(id)
    ON DELETE RESTRICT,

    FOREIGN KEY (
        pixel_id
    )
    REFERENCES canvas_pixels(pixel_id)
    ON DELETE RESTRICT,

    FOREIGN KEY (
        district_id
    )
    REFERENCES districts(id)
    ON DELETE RESTRICT,

    CHECK (
        status = 'SOLD'
    )

);


-- =========================================================
-- OWNERSHIP CONSTRAINTS
-- =========================================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_ownership_pixel
ON pixel_ownership(pixel_id);


CREATE INDEX IF NOT EXISTS idx_ownership_user
ON pixel_ownership(user_id);


CREATE INDEX IF NOT EXISTS idx_ownership_order
ON pixel_ownership(order_id);


CREATE INDEX IF NOT EXISTS idx_ownership_district
ON pixel_ownership(district_id);


-- =========================================================
-- BITCOIN PAYMENTS
-- =========================================================

CREATE TABLE IF NOT EXISTS bitcoin_payments (

    id TEXT PRIMARY KEY,

    order_id TEXT NOT NULL UNIQUE,

    payment_address TEXT NOT NULL,

    expected_satoshis INTEGER NOT NULL,

    received_satoshis INTEGER NOT NULL DEFAULT 0,

    transaction_id TEXT,

    confirmation_count INTEGER NOT NULL DEFAULT 0,

    status TEXT NOT NULL DEFAULT 'AWAITING_PAYMENT',

    confirmed_at TEXT,

    created_at TEXT NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    updated_at TEXT NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

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
            'CONFIRMING',
            'UNDERPAID',
            'CONFIRMED'
        )
    )

);


-- =========================================================
-- BITCOIN PAYMENT INDEXES
-- =========================================================

CREATE INDEX IF NOT EXISTS idx_btc_order
ON bitcoin_payments(order_id);


CREATE INDEX IF NOT EXISTS idx_btc_status
ON bitcoin_payments(status);


CREATE INDEX IF NOT EXISTS idx_btc_transaction
ON bitcoin_payments(transaction_id);


-- =========================================================
-- AUDIT LOG
-- =========================================================

CREATE TABLE IF NOT EXISTS audit_log (

    id TEXT PRIMARY KEY,

    event_type TEXT NOT NULL,

    entity_type TEXT NOT NULL,

    entity_id TEXT NOT NULL,

    metadata_json TEXT,

    created_at TEXT NOT NULL
        DEFAULT CURRENT_TIMESTAMP

);


CREATE INDEX IF NOT EXISTS idx_audit_entity
ON audit_log(
    entity_type,
    entity_id
);


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
    'audit_migration_0008',
    'ORDERS_OWNERSHIP_MIGRATION',
    'SYSTEM',
    '0008',
    '{"description":"Orders, districts, touched pixels, reservations, permanent ownership and Bitcoin payment tables installed."}'
);
