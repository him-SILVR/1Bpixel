-- =========================================================
-- BILLION PIXEL CANVAS
-- AUTHENTICATION MIGRATION
-- MIGRATION 0006
-- =========================================================

PRAGMA foreign_keys = ON;


-- =========================================================
-- USERS
-- =========================================================

CREATE TABLE IF NOT EXISTS users (

    id TEXT PRIMARY KEY,

    email TEXT NOT NULL UNIQUE,

    password_hash TEXT NOT NULL,

    password_salt TEXT NOT NULL,

    email_verified INTEGER NOT NULL DEFAULT 0
        CHECK (
            email_verified IN (0, 1)
        ),

    age_verified INTEGER NOT NULL DEFAULT 0
        CHECK (
            age_verified IN (0, 1)
        ),

    role TEXT NOT NULL DEFAULT 'USER'
        CHECK (
            role IN (
                'USER',
                'MODERATOR',
                'ADMIN'
            )
        ),

    created_at TEXT NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    updated_at TEXT NOT NULL
        DEFAULT CURRENT_TIMESTAMP

);


-- =========================================================
-- USER INDEXES
-- =========================================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email
ON users(email);


CREATE INDEX IF NOT EXISTS idx_users_role
ON users(role);


CREATE INDEX IF NOT EXISTS idx_users_created
ON users(created_at);


-- =========================================================
-- SESSIONS
-- =========================================================

CREATE TABLE IF NOT EXISTS sessions (

    id TEXT PRIMARY KEY,

    user_id TEXT NOT NULL,

    token_hash TEXT NOT NULL UNIQUE,

    expires_at TEXT NOT NULL,

    created_at TEXT NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    last_used_at TEXT NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (
        user_id
    )
    REFERENCES users(id)
    ON DELETE CASCADE

);


-- =========================================================
-- SESSION INDEXES
-- =========================================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_token
ON sessions(token_hash);


CREATE INDEX IF NOT EXISTS idx_sessions_user
ON sessions(user_id);


CREATE INDEX IF NOT EXISTS idx_sessions_expiry
ON sessions(expires_at);


-- =========================================================
-- EMAIL VERIFICATION TOKENS
-- =========================================================

CREATE TABLE IF NOT EXISTS email_verification_tokens (

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


CREATE INDEX IF NOT EXISTS idx_email_verification_user
ON email_verification_tokens(user_id);


CREATE INDEX IF NOT EXISTS idx_email_verification_expiry
ON email_verification_tokens(expires_at);


-- =========================================================
-- AGE VERIFICATION RECORDS
-- =========================================================
--
-- We deliberately do NOT store identity documents here.
--
-- The application should store only the minimum state
-- required to establish that the account passed its
-- age-verification process.
-- =========================================================

CREATE TABLE IF NOT EXISTS age_verification_records (

    id TEXT PRIMARY KEY,

    user_id TEXT NOT NULL UNIQUE,

    status TEXT NOT NULL DEFAULT 'PENDING'
        CHECK (
            status IN (
                'PENDING',
                'VERIFIED',
                'REJECTED',
                'EXPIRED'
            )
        ),

    provider TEXT,

    provider_reference TEXT,

    verified_at TEXT,

    expires_at TEXT,

    created_at TEXT NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    updated_at TEXT NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (
        user_id
    )
    REFERENCES users(id)
    ON DELETE CASCADE

);


CREATE INDEX IF NOT EXISTS idx_age_verification_status
ON age_verification_records(status);


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
-- AUTH AUDIT EVENTS
-- =========================================================

CREATE TABLE IF NOT EXISTS auth_events (

    id TEXT PRIMARY KEY,

    user_id TEXT,

    event_type TEXT NOT NULL,

    success INTEGER NOT NULL DEFAULT 1
        CHECK (
            success IN (0, 1)
        ),

    metadata_json TEXT,

    created_at TEXT NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (
        user_id
    )
    REFERENCES users(id)
    ON DELETE SET NULL

);


CREATE INDEX IF NOT EXISTS idx_auth_events_user
ON auth_events(user_id);


CREATE INDEX IF NOT EXISTS idx_auth_events_type
ON auth_events(event_type);


CREATE INDEX IF NOT EXISTS idx_auth_events_created
ON auth_events(created_at);


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
    'audit_migration_0006',
    'AUTHENTICATION_MIGRATION',
    'SYSTEM',
    '0006',
    '{"description":"User accounts, sessions, email verification, age verification and password reset infrastructure installed."}'
);
