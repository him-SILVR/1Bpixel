/**
 * =========================================================
 * BILLION PIXEL CANVAS
 * AUTHENTICATION + SESSION ENGINE
 * =========================================================
 *
 * Uses:
 *
 * - Email + password
 * - Secure password hashing
 * - HttpOnly session cookie
 * - Server-side sessions stored in D1
 *
 * NEVER store plaintext passwords.
 * NEVER store private Bitcoin keys.
 */

"use strict";


/* =========================================================
   CONSTANTS
========================================================= */

const SESSION_COOKIE =
    "bpc_session";


const SESSION_DAYS =
    30;


const SESSION_SECONDS =
    SESSION_DAYS *
    24 *
    60 *
    60;


const MIN_PASSWORD_LENGTH =
    12;


const MAX_EMAIL_LENGTH =
    320;


/* =========================================================
   PASSWORD HASHING
========================================================= */

const PBKDF2_ITERATIONS =
    210_000;


const PBKDF2_HASH =
    "SHA-256";


const PBKDF2_KEY_LENGTH =
    256;


/* =========================================================
   REGISTER USER
========================================================= */

export async function registerUser(
    db,
    {
        email,
        password
    }
) {

    const normalizedEmail =
        normalizeEmail(
            email
        );


    validatePassword(
        password
    );


    /*
     * Check whether account already exists.
     */

    const existing =
        await db.prepare(
            `
            SELECT
                id
            FROM users
            WHERE email = ?
            LIMIT 1
            `
        )
        .bind(
            normalizedEmail
        )
        .first();


    if (existing) {

        const error =
            new Error(
                "An account with this email already exists."
            );


        error.status =
            409;


        throw error;

    }


    /*
     * Generate a random salt.
     */

    const salt =
        randomBytes(
            16
        );


    const passwordHash =
        await hashPassword(
            password,
            salt
        );


    const userId =
        `user_${crypto.randomUUID()}`;


    await db.prepare(
        `
        INSERT INTO users (

            id,

            email,

            password_hash,

            password_salt,

            email_verified,

            age_verified,

            created_at,

            updated_at

        )

        VALUES (

            ?,

            ?,

            ?,

            ?,

            0,

            0,

            CURRENT_TIMESTAMP,

            CURRENT_TIMESTAMP

        )
        `
    )
    .bind(

        userId,

        normalizedEmail,

        passwordHash,

        bytesToBase64(
            salt
        )

    )
    .run();


    return {

        id:
            userId,

        email:
            normalizedEmail,

        emailVerified:
            false,

        ageVerified:
            false

    };

}


/* =========================================================
   LOGIN
========================================================= */

export async function loginUser(
    db,
    {
        email,
        password
    }
) {

    const normalizedEmail =
        normalizeEmail(
            email
        );


    const user =
        await db.prepare(
            `
            SELECT
                *
            FROM users
            WHERE email = ?
            LIMIT 1
            `
        )
        .bind(
            normalizedEmail
        )
        .first();


    /*
     * Use the same generic error for unknown users and
     * incorrect passwords.
     */

    if (!user) {

        throw new Error(
            "Invalid email or password."
        );

    }


    const salt =
        base64ToBytes(
            user.password_salt
        );


    const suppliedHash =
        await hashPassword(
            password,
            salt
        );


    const valid =
        constantTimeEqual(
            suppliedHash,
            user.password_hash
        );


    if (!valid) {

        throw new Error(
            "Invalid email or password."
        );

    }


    /*
     * Create a new session.
     */

    const session =
        await createSession(
            db,
            user.id
        );


    return {

        user: sanitizeUser(
            user
        ),

        sessionToken:
            session.token,

        expiresAt:
            session.expiresAt

    };

}


/* =========================================================
   CREATE SESSION
========================================================= */

async function createSession(
    db,
    userId
) {

    const rawToken =
        bytesToBase64Url(
            randomBytes(
                32
            )
        );


    /*
     * Store only a hash of the session token.
     */

    const tokenHash =
        await sha256(
            rawToken
        );


    const sessionId =
        `session_${crypto.randomUUID()}`;


    const expiresAt =
        new Date(
            Date.now() +
            SESSION_SECONDS *
            1000
        )
            .toISOString();


    await db.prepare(
        `
        INSERT INTO sessions (

            id,

            user_id,

            token_hash,

            expires_at,

            created_at,

            last_used_at

        )

        VALUES (

            ?,

            ?,

            ?,

            ?,

            CURRENT_TIMESTAMP,

            CURRENT_TIMESTAMP

        )
        `
    )
    .bind(

        sessionId,

        userId,

        tokenHash,

        expiresAt

    )
    .run();


    return {

        id:
            sessionId,

        token:
            rawToken,

        expiresAt

    };

}


/* =========================================================
   AUTHENTICATED USER
========================================================= */

export async function getAuthenticatedUser(
    request,
    env
) {

    const token =
        getSessionCookie(
            request
        );


    if (!token) {

        return null;

    }


    const tokenHash =
        await sha256(
            token
        );


    const session =
        await env.DB.prepare(
            `
            SELECT

                s.id AS session_id,

                s.user_id,

                s.expires_at,

                u.id,

                u.email,

                u.email_verified,

                u.age_verified,

                u.created_at

            FROM sessions s

            JOIN users u
                ON u.id = s.user_id

            WHERE s.token_hash = ?

              AND s.expires_at >
                  CURRENT_TIMESTAMP

            LIMIT 1
            `
        )
        .bind(
            tokenHash
        )
        .first();


    if (!session) {

        return null;

    }


    /*
     * Refresh last-used timestamp.
     */

    await env.DB.prepare(
        `
        UPDATE sessions

        SET

            last_used_at =
                CURRENT_TIMESTAMP

        WHERE id = ?
        `
    )
    .bind(
        session.session_id
    )
    .run();


    return {

        id:
            session.user_id,

        email:
            session.email,

        emailVerified:
            Number(
                session.email_verified
            ) === 1,

        ageVerified:
            Number(
                session.age_verified
            ) === 1,

        createdAt:
            session.created_at

    };

}


/* =========================================================
   LOGOUT
========================================================= */

export async function logoutUser(
    request,
    env
) {

    const token =
        getSessionCookie(
            request
        );


    if (token) {

        const tokenHash =
            await sha256(
                token
            );


        await env.DB.prepare(
            `
            DELETE FROM sessions
            WHERE token_hash = ?
            `
        )
        .bind(
            tokenHash
        )
        .run();

    }


    return {

        success:
            true,

        headers:
            logoutCookieHeaders()

    };

}


/* =========================================================
   SET SESSION COOKIE
========================================================= */

export function sessionCookieHeaders(
    token
) {

    return {

        "Set-Cookie":
            `${SESSION_COOKIE}=${encodeURIComponent(
                token
            )}; Max-Age=${SESSION_SECONDS}; Path=/; HttpOnly; Secure; SameSite=Lax`

    };

}


/* =========================================================
   LOGOUT COOKIE
========================================================= */

export function logoutCookieHeaders() {

    return {

        "Set-Cookie":
            `${SESSION_COOKIE}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax`

    };

}


/* =========================================================
   GET COOKIE
========================================================= */

function getSessionCookie(
    request
) {

    const header =
        request.headers.get(
            "Cookie"
        );


    if (!header) {

        return null;

    }


    const cookies =
        header
            .split(";")
            .map(
                part =>
                    part.trim()
            );


    for (
        const cookie
        of cookies
    ) {

        const separator =
            cookie.indexOf("=");


        if (
            separator === -1
        ) {

            continue;

        }


        const name =
            cookie.slice(
                0,
                separator
            );


        if (
            name !==
            SESSION_COOKIE
        ) {

            continue;

        }


        const value =
            cookie.slice(
                separator + 1
            );


        try {

            return decodeURIComponent(
                value
            );

        } catch {

            return null;

        }

    }


    return null;

}


/* =========================================================
   NORMALIZE EMAIL
========================================================= */

function normalizeEmail(
    email
) {

    if (
        typeof email !==
        "string"
    ) {

        throw new Error(
            "Email is required."
        );

    }


    const normalized =
        email
            .trim()
            .toLowerCase();


    if (
        !normalized ||
        normalized.length >
            MAX_EMAIL_LENGTH
    ) {

        throw new Error(
            "Invalid email address."
        );

    }


    /*
     * Deliberately conservative validation.
     */

    if (
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/
            .test(
                normalized
            )
    ) {

        throw new Error(
            "Invalid email address."
        );

    }


    return normalized;

}


/* =========================================================
   PASSWORD VALIDATION
========================================================= */

function validatePassword(
    password
) {

    if (
        typeof password !==
        "string"
    ) {

        throw new Error(
            "Password is required."
        );

    }


    if (
        password.length <
        MIN_PASSWORD_LENGTH
    ) {

        throw new Error(
            `Password must contain at least ${MIN_PASSWORD_LENGTH} characters.`
        );

    }


    if (
        password.length >
        256
    ) {

        throw new Error(
            "Password is too long."
        );

    }


    return true;

}


/* =========================================================
   HASH PASSWORD
========================================================= */

async function hashPassword(
    password,
    salt
) {

    const encoder =
        new TextEncoder();


    const keyMaterial =
        await crypto.subtle.importKey(

            "raw",

            encoder.encode(
                password
            ),

            "PBKDF2",

            false,

            [
                "deriveBits"
            ]

        );


    const bits =
        await crypto.subtle.deriveBits(

            {

                name:
                    "PBKDF2",

                salt,

                iterations:
                    PBKDF2_ITERATIONS,

                hash:
                    PBKDF2_HASH

            },

            keyMaterial,

            PBKDF2_KEY_LENGTH

        );


    return bytesToBase64(
        new Uint8Array(
            bits
        )
    );

}


/* =========================================================
   SHA-256
========================================================= */

async function sha256(
    value
) {

    const encoder =
        new TextEncoder();


    const data =
        encoder.encode(
            value
        );


    const digest =
        await crypto.subtle.digest(
            "SHA-256",
            data
        );


    return bytesToBase64(
        new Uint8Array(
            digest
        )
    );

}


/* =========================================================
   RANDOM BYTES
========================================================= */

function randomBytes(
    length
) {

    const bytes =
        new Uint8Array(
            length
        );


    crypto.getRandomValues(
        bytes
    );


    return bytes;

}


/* =========================================================
   BYTES → BASE64
========================================================= */

function bytesToBase64(
    bytes
) {

    let binary =
        "";


    for (
        const byte
        of bytes
    ) {

        binary +=
            String.fromCharCode(
                byte
            );

    }


    return btoa(
        binary
    );

}


/* =========================================================
   BASE64 → BYTES
========================================================= */

function base64ToBytes(
    value
) {

    const binary =
        atob(
            value
        );


    const bytes =
        new Uint8Array(
            binary.length
        );


    for (
        let i = 0;
        i < binary.length;
        i++
    ) {

        bytes[i] =
            binary.charCodeAt(
                i
            );

    }


    return bytes;

}


/* =========================================================
   BYTES → BASE64URL
========================================================= */

function bytesToBase64Url(
    bytes
) {

    return bytesToBase64(
        bytes
    )
        .replace(
            /\+/g,
            "-"
        )
        .replace(
            /\//g,
            "_"
        )
        .replace(
            /=+$/,
            ""
        );

}


/* =========================================================
   CONSTANT-TIME STRING COMPARISON
========================================================= */

function constantTimeEqual(
    a,
    b
) {

    if (
        typeof a !== "string" ||
        typeof b !== "string"
    ) {

        return false;

    }


    const aLength =
        a.length;


    const bLength =
        b.length;


    let result =
        aLength ^
        bLength;


    const length =
        Math.max(
            aLength,
            bLength
        );


    for (
        let i = 0;
        i < length;
        i++
    ) {

        const aCode =
            i < aLength
                ? a.charCodeAt(i)
                : 0;


        const bCode =
            i < bLength
                ? b.charCodeAt(i)
                : 0;


        result |=
            aCode ^
            bCode;

    }


    return result === 0;

}


/* =========================================================
   USER SANITIZATION
========================================================= */

function sanitizeUser(
    user
) {

    return {

        id:
            user.id,

        email:
            user.email,

        emailVerified:
            Number(
                user.email_verified
            ) === 1,

        ageVerified:
            Number(
                user.age_verified
            ) === 1,

        createdAt:
            user.created_at

    };

}


/* =========================================================
   EXPORTS
========================================================= */

export {

    SESSION_COOKIE,

    SESSION_DAYS,

    MIN_PASSWORD_LENGTH

};
