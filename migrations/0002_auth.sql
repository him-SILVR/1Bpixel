-- =========================================================
-- BILLION PIXEL CANVAS
-- Authentication Migration 0002
-- =========================================================

PRAGMA foreign_keys = ON;


-- =========================================================
-- USER CREDENTIALS
-- =========================================================
--
-- Passwords are never stored as plaintext.
--
-- auth.js stores a JSON object containing:
--
-- {
--   algorithm,
--   hash,
--   iterations,
--   salt,
--   derived
-- }
--
-- =========================================================

ALTER TABLE users
ADD COLUMN password_hash TEXT;


-- =========================================================
-- EMAIL VERIFICATION
-- =========================================================

ALTER TABLE users
ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0
CHECK (
    email_verified IN (0, 1)
);


-- =========================================================
-- ACCOUNT STATUS
-- =========================================================

ALTER TABLE users
ADD COLUMN account_status TEXT NOT NULL DEFAULT 'ACTIVE'
CHECK (
    account_status IN (
        'ACTIVE',
        'SUSPENDED',
        'BANNED',
        'DELETED'
    )
);


-- =========================================================
-- LAST LOGIN
-- =========================================================

ALTER TABLE users
ADD COLUMN last_login_at TEXT;


-- =========================================================
-- USER SECURITY INDEX
-- =========================================================

CREATE INDEX IF NOT EXISTS idx_users_account_status
ON users(account_status);


-- =========================================================
-- SESSIONS
-- =========================================================
--
-- The browser receives the raw session token.
--
-- The database stores only:
--
-- SHA-256(session token)
--
-- Therefore a database leak does not directly reveal
-- active session tokens.
--
-- =========================================================

CREATE TABLE IF NOT EXISTS sessions (

    id TEXT PRIMARY KEY,

    user_id TEXT NOT NULL,

    token_hash TEXT NOT NULL UNIQUE,

    expires_at TEXT NOT NULL,

    created_at TEXT NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    last_used_at TEXT,

    FOREIGN KEY (
        user_id
    )
    REFERENCES users(id)
    ON DELETE CASCADE

);


-- =========================================================
-- SESSION INDEXES
-- =========================================================

CREATE INDEX IF NOT EXISTS idx_sessions_user
ON sessions(user_id);


CREATE INDEX IF NOT EXISTS idx_sessions_expiry
ON sessions(expires_at);


CREATE INDEX IF NOT EXISTS idx_sessions_token
ON sessions(token_hash);


-- =========================================================
-- PASSWORD RESET TOKENS
-- =========================================================

CREATE TABLE IF NOT EXISTS password_reset_tokens (

    id TEXT PRIMARY KEY,

    user_id TEXT NOT NULL,

    token_hash TEXT NOT NULL UNIQUE,

    expires_at TEXT NOT NULL,

    used_at TEXT,

    created_at TEXT NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (
        user_id
    )
    REFERENCES users(id)
    ON DELETE CASCADE

);


CREATE INDEX IF NOT EXISTS idx_password_reset_user
ON password_reset_tokens(user_id);


CREATE INDEX IF NOT EXISTS idx_password_reset_expiry
ON password_reset_tokens(expires_at);


-- =========================================================
-- EMAIL VERIFICATION TOKENS
-- =========================================================

CREATE TABLE IF NOT EXISTS email_verification_tokens (

    id TEXT PRIMARY KEY,

    user_id TEXT NOT NULL,

    token_hash TEXT NOT NULL UNIQUE,

    expires_at TEXT NOT NULL,

    verified_at TEXT,

    created_at TEXT NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (
        user_id
    )
    REFERENCES users(id)
    ON DELETE CASCADE

);


CREATE INDEX IF NOT EXISTS idx_email_verification_user
ON email_verification_tokens(user_id);


CREATE INDEX IF NOT EXISTS idx_email_verification_expiry
ON email_verification_tokens(expires_at);


-- =========================================================
-- AGE VERIFICATION RECORD
-- =========================================================
--
-- `users.age_verified` remains the fast access flag.
--
-- This table records how the verification was performed.
--
-- Do NOT store identity documents directly in D1.
-- A dedicated compliant age-verification provider/storage
-- should be used if document verification is introduced.
--
-- =========================================================

CREATE TABLE IF NOT EXISTS age_verification_records (

    id TEXT PRIMARY KEY,

    user_id TEXT NOT NULL UNIQUE,

    method TEXT NOT NULL,

    status TEXT NOT NULL,

    verified_at TEXT,

    provider_reference TEXT,

    created_at TEXT NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    updated_at TEXT NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (
        user_id
    )
    REFERENCES users(id)
    ON DELETE CASCADE,

    CHECK (
        method IN (
            'SELF_ATTESTATION',
            'THIRD_PARTY',
            'MANUAL_REVIEW'
        )
    ),

    CHECK (
        status IN (
            'PENDING',
            'VERIFIED',
            'FAILED',
            'REVOKED'
        )
    )

);


CREATE INDEX IF NOT EXISTS idx_age_verification_status
ON age_verification_records(status);


-- =========================================================
-- LOGIN SECURITY EVENTS
-- =========================================================

CREATE TABLE IF NOT EXISTS login_security_events (

    id TEXT PRIMARY KEY,

    user_id TEXT,

    email TEXT,

    event_type TEXT NOT NULL,

    ip_hash TEXT,

    user_agent_hash TEXT,

    success INTEGER NOT NULL DEFAULT 0
        CHECK (
            success IN (0, 1)
        ),

    created_at TEXT NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (
        user_id
    )
    REFERENCES users(id)
    ON DELETE SET NULL

);


CREATE INDEX IF NOT EXISTS idx_login_security_user
ON login_security_events(user_id);


CREATE INDEX IF NOT EXISTS idx_login_security_email
ON login_security_events(email);


CREATE INDEX IF NOT EXISTS idx_login_security_created
ON login_security_events(created_at);


-- =========================================================
-- RATE LIMIT BUCKETS
-- =========================================================
--
-- Used by the application layer to limit:
--
-- - login attempts
-- - account creation
-- - password reset attempts
-- - content reports
-- - API abuse
--
-- =========================================================

CREATE TABLE IF NOT EXISTS rate_limit_buckets (

    key TEXT PRIMARY KEY,

    request_count INTEGER NOT NULL DEFAULT 0,

    window_start TEXT NOT NULL,

    updated_at TEXT NOT NULL
        DEFAULT CURRENT_TIMESTAMP

);


-- =========================================================
-- AUTH AUDIT EVENTS
-- =========================================================

INSERT INTO audit_log (

    id,

    event_type,

    entity_type,

    entity_id,

    metadata_json

)

VALUES (

    'audit_migration_0002',

    'AUTH_MIGRATION',

    'SYSTEM',

    '0002',

    '{"description":"Authentication and session infrastructure installed."}'

);