-- =========================================================
-- BILLION PIXEL CANVAS
-- PROJECT CONFIGURATION
-- MIGRATION 0009
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


-- =========================================================
-- CORE PROJECT RULES
-- =========================================================

INSERT OR REPLACE INTO project_config (
    key,
    value,
    updated_at
)
VALUES

(
    'project_name',
    'Billion Pixel Canvas',
    CURRENT_TIMESTAMP
),

(
    'canvas_total_pixels',
    '1000000000',
    CURRENT_TIMESTAMP
),

(
    'canvas_width',
    '40000',
    CURRENT_TIMESTAMP
),

(
    'canvas_height',
    '25000',
    CURRENT_TIMESTAMP
),

(
    'pixel_price_usd',
    '1',
    CURRENT_TIMESTAMP
),

(
    'minimum_purchase_pixels',
    '1',
    CURRENT_TIMESTAMP
),

(
    'maximum_purchase_pixels',
    'NONE',
    CURRENT_TIMESTAMP
),

(
    'payment_currency',
    'BTC',
    CURRENT_TIMESTAMP
),

(
    'resale_enabled',
    'false',
    CURRENT_TIMESTAMP
),

(
    'ownership_transfer_enabled',
    'false',
    CURRENT_TIMESTAMP
),

(
    'sold_pixels_are_permanent',
    'true',
    CURRENT_TIMESTAMP
),

(
    'adult_district_enabled',
    'true',
    CURRENT_TIMESTAMP
),

(
    'adult_district_minimum_pixels',
    '100000',
    CURRENT_TIMESTAMP
),

(
    'adult_content_requires_age_verification',
    'true',
    CURRENT_TIMESTAMP
),

(
    'required_bitcoin_confirmations',
    '3',
    CURRENT_TIMESTAMP
),

(
    'bitcoin_receiving_address',
    'bc1qk8ehysk2fthd2p07zgdqz84tyvudkdn4565u40',
    CURRENT_TIMESTAMP
);


-- =========================================================
-- CANVAS RULES
-- =========================================================
--
-- These rules are informational configuration.
--
-- Critical payment and ownership rules must still be
-- enforced by server-side application code and database
-- constraints.
-- =========================================================

INSERT OR REPLACE INTO project_config (
    key,
    value,
    updated_at
)
VALUES

(
    'content_ownership_rule',
    'Only permanent pixel owners may publish content to their owned pixels.',
    CURRENT_TIMESTAMP
),

(
    'resale_rule',
    'SOLD pixels cannot be resold or transferred through the platform.',
    CURRENT_TIMESTAMP
),

(
    'price_rule',
    'Every pixel costs exactly 1 USD. BTC is only the payment method.',
    CURRENT_TIMESTAMP
),

(
    'availability_rule',
    'Unsold pixels remain available until purchased and permanently sold.',
    CURRENT_TIMESTAMP
),

(
    'adult_content_rule',
    'Adult content is restricted to the Adult District and requires age verification.',
    CURRENT_TIMESTAMP
),

(
    'illegal_content_rule',
    'Illegal content is prohibited regardless of pixel ownership.',
    CURRENT_TIMESTAMP
);


-- =========================================================
-- CONFIGURATION INDEX
-- =========================================================

CREATE INDEX IF NOT EXISTS idx_project_config_updated
ON project_config(updated_at);


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
    'audit_migration_0009',
    'PROJECT_CONFIGURATION_MIGRATION',
    'SYSTEM',
    '0009',
    '{"description":"Billion Pixel Canvas core pricing, ownership, payment and district configuration installed."}'
);
