-- =========================================================
-- BILLION PIXEL CANVAS
-- CONTENT + MODERATION MIGRATION
-- =========================================================

PRAGMA foreign_keys = ON;


-- =========================================================
-- OWNERSHIP CONTENT
-- =========================================================
--
-- Buyers can publish content attached to pixels they own.
--
-- Ownership does NOT grant permission to publish illegal
-- material or content prohibited by applicable law.
--
-- There is intentionally no resale functionality here.
-- =========================================================

CREATE TABLE IF NOT EXISTS ownership_content (

    id TEXT PRIMARY KEY,

    ownership_id TEXT NOT NULL,

    user_id TEXT NOT NULL,

    content_type TEXT NOT NULL,

    title TEXT,

    description TEXT,

    image_url TEXT,

    external_url TEXT,

    alt_text TEXT,

    is_adult_content INTEGER NOT NULL DEFAULT 0
        CHECK (
            is_adult_content IN (0, 1)
        ),

    status TEXT NOT NULL DEFAULT 'DRAFT',

    created_at TEXT NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    updated_at TEXT NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    published_at TEXT,

    hidden_at TEXT,

    FOREIGN KEY (
        ownership_id
    )
    REFERENCES pixel_ownership(id)
    ON DELETE CASCADE,

    FOREIGN KEY (
        user_id
    )
    REFERENCES users(id)
    ON DELETE CASCADE,

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


-- =========================================================
-- CONTENT INDEXES
-- =========================================================

CREATE INDEX IF NOT EXISTS idx_content_ownership
ON ownership_content(ownership_id);


CREATE INDEX IF NOT EXISTS idx_content_user
ON ownership_content(user_id);


CREATE INDEX IF NOT EXISTS idx_content_status
ON ownership_content(status);


CREATE INDEX IF NOT EXISTS idx_content_published
ON ownership_content(published_at);


CREATE INDEX IF NOT EXISTS idx_content_adult
ON ownership_content(is_adult_content);


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

    reviewed_by TEXT,

    reviewed_at TEXT,

    resolution TEXT,

    created_at TEXT NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (
        content_id
    )
    REFERENCES ownership_content(id)
    ON DELETE CASCADE,

    FOREIGN KEY (
        reporter_user_id
    )
    REFERENCES users(id)
    ON DELETE SET NULL,

    CHECK (
        status IN (
            'OPEN',
            'UNDER_REVIEW',
            'RESOLVED',
            'DISMISSED'
        )
    )

);


-- =========================================================
-- REPORT INDEXES
-- =========================================================

CREATE INDEX IF NOT EXISTS idx_content_reports_content
ON content_reports(content_id);


CREATE INDEX IF NOT EXISTS idx_content_reports_status
ON content_reports(status);


CREATE INDEX IF NOT EXISTS idx_content_reports_created
ON content_reports(created_at);


-- =========================================================
-- MODERATION ACTIONS
-- =========================================================

CREATE TABLE IF NOT EXISTS moderation_actions (

    id TEXT PRIMARY KEY,

    content_id TEXT,

    ownership_id TEXT,

    moderator_user_id TEXT,

    action TEXT NOT NULL,

    reason TEXT,

    notes TEXT,

    created_at TEXT NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (
        content_id
    )
    REFERENCES ownership_content(id)
    ON DELETE SET NULL,

    FOREIGN KEY (
        ownership_id
    )
    REFERENCES pixel_ownership(id)
    ON DELETE SET NULL,

    FOREIGN KEY (
        moderator_user_id
    )
    REFERENCES users(id)
    ON DELETE SET NULL

);


CREATE INDEX IF NOT EXISTS idx_moderation_content
ON moderation_actions(content_id);


CREATE INDEX IF NOT EXISTS idx_moderation_ownership
ON moderation_actions(ownership_id);


-- =========================================================
-- CONTENT EVENTS
-- =========================================================

CREATE TABLE IF NOT EXISTS content_events (

    id TEXT PRIMARY KEY,

    content_id TEXT NOT NULL,

    user_id TEXT,

    event_type TEXT NOT NULL,

    metadata_json TEXT,

    created_at TEXT NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (
        content_id
    )
    REFERENCES ownership_content(id)
    ON DELETE CASCADE,

    FOREIGN KEY (
        user_id
    )
    REFERENCES users(id)
    ON DELETE SET NULL

);


CREATE INDEX IF NOT EXISTS idx_content_events_content
ON content_events(content_id);


CREATE INDEX IF NOT EXISTS idx_content_events_created
ON content_events(created_at);


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

    'audit_migration_0004',

    'CONTENT_MIGRATION',

    'SYSTEM',

    '0004',

    '{"description":"Ownership content, reporting and moderation infrastructure installed."}'

);
