-- =========================================================
-- BILLION PIXEL CANVAS
-- Cloudflare D1 Migration 0001
-- =========================================================

PRAGMA foreign_keys = ON;


-- =========================================================
-- PROJECT CONFIGURATION
-- =========================================================

CREATE TABLE IF NOT EXISTS project_config (

    key TEXT PRIMARY KEY,

    value TEXT NOT NULL,

    updated_at TEXT NOT NULL
        DEFAULT CURRENT_TIMESTAMP

);


INSERT OR IGNORE INTO project_config
    (key, value)
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
        CHECK (
            adult_only IN (0, 1)
        ),

    description TEXT NOT NULL,

    created_at TEXT NOT NULL
        DEFAULT CURRENT_TIMESTAMP

);


INSERT OR IGNORE INTO districts
    (
        id,
        name,
        minimum_pixels,
        adult_only,
        description
    )
VALUES

(
    'people',
    'People''s District',
    1,
    0,
    'General public district.'
),

(
    'giants',
    'Giants District',
    100000,
    0,
    'Large-format district for major purchases.'
),

(
    'youth',
    'Youth District',
    1,
    0,
    'Family-friendly district.'
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
        CHECK (
            age_verified IN (0, 1)
        ),

    created_at TEXT NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    updated_at TEXT NOT NULL
        DEFAULT CURRENT_TIMESTAMP

);


CREATE INDEX IF NOT EXISTS idx_users_email
ON users(email);


CREATE INDEX IF NOT EXISTS idx_users_username
ON users(username);


-- =========================================================
-- ORDERS
-- =========================================================

CREATE TABLE IF NOT EXISTS orders (

    id TEXT PRIMARY KEY,

    user_id TEXT,

    district_id TEXT NOT NULL,

    quantity INTEGER NOT NULL,

    price_usd INTEGER NOT NULL,

    payment_currency TEXT NOT NULL
        DEFAULT 'BTC',

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
        price_usd = quantity
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


CREATE INDEX IF NOT EXISTS idx_orders_status
ON orders(status);


CREATE INDEX IF NOT EXISTS idx_orders_user
ON orders(user_id);


-- =========================================================
-- PIXEL RESERVATIONS
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

    status TEXT NOT NULL
        DEFAULT 'ACTIVE',

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

    CHECK (
        width > 0
    ),

    CHECK (
        height > 0
    ),

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
-- PERMANENT PIXEL OWNERSHIP
-- =========================================================
--
-- IMPORTANT:
--
-- There is intentionally NO resale mechanism.
--
-- There is intentionally NO transfer mechanism.
--
-- A completed ownership record is permanently SOLD.
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

    status TEXT NOT NULL
        DEFAULT 'SOLD',

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
        width > 0
    ),

    CHECK (
        height > 0
    ),

    CHECK (
        pixel_count =
        width * height
    ),

    CHECK (
        price_usd =
        pixel_count
    )

);


CREATE INDEX IF NOT EXISTS idx_ownership_district
ON pixel_ownership(district_id);


CREATE INDEX IF NOT EXISTS idx_ownership_user
ON pixel_ownership(user_id);


CREATE INDEX IF NOT EXISTS idx_ownership_coordinates
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

    received_satoshis INTEGER NOT NULL
        DEFAULT 0,

    transaction_id TEXT UNIQUE,

    detected_at TEXT,

    confirmed_at TEXT,

    confirmation_count INTEGER NOT NULL
        DEFAULT 0,

    status TEXT NOT NULL
        DEFAULT 'AWAITING_PAYMENT',

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


CREATE INDEX IF NOT EXISTS idx_bitcoin_payment_status
ON bitcoin_payments(status);


CREATE INDEX IF NOT EXISTS idx_bitcoin_transaction
ON bitcoin_payments(transaction_id);


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

    is_adult_content INTEGER NOT NULL
        DEFAULT 0
        CHECK (
            is_adult_content IN (0, 1)
        ),

    status TEXT NOT NULL
        DEFAULT 'PUBLISHED',

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


-- =========================================================
-- CONTENT REPORTS
-- =========================================================

CREATE TABLE IF NOT EXISTS content_reports (

    id TEXT PRIMARY KEY,

    content_id TEXT NOT NULL,

    reporter_user_id TEXT,

    reason TEXT NOT NULL,

    details TEXT,

    status TEXT NOT NULL
        DEFAULT 'OPEN',

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
-- PERMANENT OWNERSHIP SAFETY TRIGGER
-- =========================================================
--
-- Once ownership is SOLD, it cannot be changed to another
-- status through a normal UPDATE.
--
-- This is an additional database-level safeguard.
-- =========================================================

CREATE TRIGGER IF NOT EXISTS prevent_ownership_status_change

BEFORE UPDATE OF status
ON pixel_ownership

FOR EACH ROW

WHEN OLD.status = 'SOLD'
     AND NEW.status <> 'SOLD'

BEGIN

    SELECT RAISE(
        ABORT,
        'SOLD pixel ownership is permanent.'
    );

END;


-- =========================================================
-- PREVENT OWNERSHIP DELETION
-- =========================================================
--
-- A sold pixel must never return to inventory because of a
-- normal DELETE operation.
--
-- =========================================================

CREATE TRIGGER IF NOT EXISTS prevent_ownership_delete

BEFORE DELETE
ON pixel_ownership

FOR EACH ROW

BEGIN

    SELECT RAISE(
        ABORT,
        'SOLD pixel ownership cannot be deleted.'
    );

END;


-- =========================================================
-- CANVAS STATISTICS
-- =========================================================

CREATE VIEW IF NOT EXISTS canvas_statistics AS

SELECT

    COALESCE(
        (
            SELECT
                SUM(pixel_count)
            FROM pixel_ownership
            WHERE status = 'SOLD'
        ),
        0
    )
    AS pixels_sold,

    (
        1000000000 -
        COALESCE(
            (
                SELECT
                    SUM(pixel_count)
                FROM pixel_ownership
                WHERE status = 'SOLD'
            ),
            0
        )
    )
    AS pixels_available,

    COALESCE(
        (
            SELECT
                SUM(price_usd)
            FROM pixel_ownership
            WHERE status = 'SOLD'
        ),
        0
    )
    AS total_raised;


-- =========================================================
-- MIGRATION COMPLETE
-- =========================================================
