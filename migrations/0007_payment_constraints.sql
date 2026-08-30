-- =========================================================
-- BILLION PIXEL CANVAS
-- PAYMENT CONSTRAINTS
-- MIGRATION 0007
-- =========================================================

PRAGMA foreign_keys = ON;


-- =========================================================
-- PAYMENT CONFIGURATION
-- =========================================================

INSERT OR REPLACE INTO project_config (
    key,
    value
)
VALUES
(
    'payment_currency',
    'BTC'
),
(
    'bitcoin_receiving_address',
    'bc1qk8ehysk2fthd2p07zgdqz84tyvudkdn4565u40'
),
(
    'pixel_price_usd',
    '1'
),
(
    'price_is_permanent',
    'true'
),
(
    'resale_enabled',
    'false'
),
(
    'minimum_pixels',
    '1'
),
(
    'maximum_pixels',
    'NONE'
),
(
    'required_confirmations',
    '3'
);


-- =========================================================
-- PAYMENT AUDIT TABLE
-- =========================================================

CREATE TABLE IF NOT EXISTS payment_events (

    id TEXT PRIMARY KEY,

    order_id TEXT NOT NULL,

    transaction_id TEXT,

    event_type TEXT NOT NULL,

    amount_satoshis INTEGER,

    confirmation_count INTEGER,

    metadata_json TEXT,

    created_at TEXT NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (
        order_id
    )
    REFERENCES orders(id)
    ON DELETE CASCADE

);


-- =========================================================
-- PAYMENT EVENT INDEXES
-- =========================================================

CREATE INDEX IF NOT EXISTS idx_payment_events_order
ON payment_events(order_id);


CREATE INDEX IF NOT EXISTS idx_payment_events_transaction
ON payment_events(transaction_id);


CREATE INDEX IF NOT EXISTS idx_payment_events_created
ON payment_events(created_at);


-- =========================================================
-- PREVENT MULTIPLE ORDERS FROM CLAIMING THE SAME
-- BITCOIN TRANSACTION
-- =========================================================
--
-- A transaction may only be associated with one order.
--

CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_events_unique_tx
ON payment_events(transaction_id)
WHERE transaction_id IS NOT NULL;


-- =========================================================
-- ORDER PAYMENT INTEGRITY
-- =========================================================

CREATE INDEX IF NOT EXISTS idx_orders_btc_amount
ON orders(
    btc_amount_satoshis
);


CREATE INDEX IF NOT EXISTS idx_orders_payment_address
ON orders(
    payment_address
);


-- =========================================================
-- PAYMENT STATUS LOOKUP
-- =========================================================

CREATE INDEX IF NOT EXISTS idx_bitcoin_payment_processing
ON bitcoin_payments(
    status,
    confirmation_count,
    updated_at
);


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
    'audit_migration_0007',
    'PAYMENT_CONSTRAINT_MIGRATION',
    'SYSTEM',
    '0007',
    '{"description":"Bitcoin payment configuration, payment event ledger and payment integrity indexes installed.","pixel_price_usd":1,"currency":"BTC","resale_enabled":false}'
);
