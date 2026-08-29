-- =========================================================
-- BILLION PIXEL CANVAS
-- PERFORMANCE INDEXES
-- MIGRATION 0005
-- =========================================================

PRAGMA foreign_keys = ON;


-- =========================================================
-- PIXEL LOOKUPS
-- =========================================================

CREATE INDEX IF NOT EXISTS idx_canvas_pixels_pixel_status
ON canvas_pixels (
    pixel_id,
    status
);


CREATE INDEX IF NOT EXISTS idx_canvas_pixels_coordinate_status
ON canvas_pixels (
    x,
    y,
    status
);


CREATE INDEX IF NOT EXISTS idx_canvas_pixels_sold
ON canvas_pixels (
    status,
    sold_at
);


CREATE INDEX IF NOT EXISTS idx_canvas_pixels_reserved
ON canvas_pixels (
    status,
    reserved_at
);


-- =========================================================
-- OWNERSHIP LOOKUPS
-- =========================================================

CREATE INDEX IF NOT EXISTS idx_ownership_pixel_status
ON pixel_ownership (
    pixel_id,
    status
);


CREATE INDEX IF NOT EXISTS idx_ownership_user_status
ON pixel_ownership (
    user_id,
    status
);


CREATE INDEX IF NOT EXISTS idx_ownership_district_status
ON pixel_ownership (
    district_id,
    status
);


-- =========================================================
-- ORDER LOOKUPS
-- =========================================================

CREATE INDEX IF NOT EXISTS idx_orders_user_status
ON orders (
    user_id,
    status
);


CREATE INDEX IF NOT EXISTS idx_orders_payment_status
ON orders (
    status,
    payment_currency
);


CREATE INDEX IF NOT EXISTS idx_orders_updated
ON orders (
    updated_at
);


-- =========================================================
-- RESERVATION LOOKUPS
-- =========================================================

CREATE INDEX IF NOT EXISTS idx_reservations_order_status
ON pixel_reservations (
    order_id,
    status
);


CREATE INDEX IF NOT EXISTS idx_reservations_user_status
ON pixel_reservations (
    user_id,
    status
);


CREATE INDEX IF NOT EXISTS idx_reservations_pixel_status
ON pixel_reservations (
    pixel_id,
    status
);


-- =========================================================
-- BITCOIN PAYMENT LOOKUPS
-- =========================================================

CREATE INDEX IF NOT EXISTS idx_btc_payment_order_status
ON bitcoin_payments (
    order_id,
    status
);


CREATE INDEX IF NOT EXISTS idx_btc_payment_confirmation
ON bitcoin_payments (
    status,
    confirmation_count
);


-- =========================================================
-- CONTENT LOOKUPS
-- =========================================================

CREATE INDEX IF NOT EXISTS idx_content_ownership_status
ON ownership_content (
    ownership_id,
    status
);


CREATE INDEX IF NOT EXISTS idx_content_user_status
ON ownership_content (
    user_id,
    status
);


CREATE INDEX IF NOT EXISTS idx_content_district_visibility
ON ownership_content (
    status,
    is_adult_content
);


-- =========================================================
-- REPORTING / MODERATION
-- =========================================================

CREATE INDEX IF NOT EXISTS idx_reports_status_created
ON content_reports (
    status,
    created_at
);


CREATE INDEX IF NOT EXISTS idx_reports_content_status
ON content_reports (
    content_id,
    status
);


CREATE INDEX IF NOT EXISTS idx_moderation_created
ON moderation_actions (
    created_at
);


-- =========================================================
-- AUDIT
-- =========================================================

CREATE INDEX IF NOT EXISTS idx_audit_event_type
ON audit_log (
    event_type,
    created_at
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
    'audit_migration_0005',
    'PERFORMANCE_INDEX_MIGRATION',
    'SYSTEM',
    '0005',
    '{"description":"Production lookup indexes installed."}'
);
