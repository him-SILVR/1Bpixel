/**
 * =========================================================
 * BILLION PIXEL CANVAS
 * Authentication & Sessions
 * =========================================================
 *
 * PURPOSE
 *
 * - Create user accounts
 * - Authenticate users
 * - Create secure sessions
 * - Authenticate API requests
 * - Verify ownership access
 * - Handle age-verification state
 *
 * SECURITY
 *
 * Passwords are NEVER stored directly.
 *
 * Passwords are hashed with Web Crypto PBKDF2.
 *
 * Sessions use cryptographically random tokens.
 *
 * The raw session token is NOT stored in the database.
 * Only its SHA-256 hash is stored.
 *
 * =========================================================
 */

"use strict";


/* =========================================================
   CONSTANTS
========================================================= */

const SESSION_DAYS = 30;

const SESSION_COOKIE =
    "bpc_session";


const PBKDF2_ITERATIONS =
    310000;


const PBKDF2_HASH =
    "SHA-256";


const PASSWORD_MIN_LENGTH =
    12;


const PASSWORD_MAX_LENGTH =
    128;


/* =========================================================
   ENCODING
========================================================= */

function bytesToHex(
    bytes
) {

    return Array.from(
        new Uint8Array(
            bytes
        )
    )
        .map(
            byte =>
                byte
                    .toString(16)
                    .padStart(2, "0")
        )
        .join("");

}


function hexToBytes(
    hex
) {

    if (
        typeof hex !== "string" ||
        hex.length % 2 !== 0
    ) {

        throw new Error(
            "Invalid hexadecimal data."
        );

    }


    const bytes =
        new Uint8Array(
            hex.length / 2
        );


    for (
        let i = 0;
        i < bytes.length;
        i++
    ) {

        bytes[i] =
            parseInt(
                hex.slice(
                    i * 2,
                    i * 2 + 2
                ),
                16
            );

    }


    return bytes;

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
   RANDOM TOKEN
========================================================= */

function randomToken(
    byteLength = 32
) {

    return bytesToHex(
        randomBytes(
            byteLength
        )
    );

}


/* =========================================================
   SHA-256
========================================================= */

async function sha256(
    value
) {

    const encoded =
        new TextEncoder().encode(
            value
        );


    const digest =
        await crypto.subtle.digest(
            "SHA-256",
            encoded
        );


    return bytesToHex(
        digest
    );

}


/* =========================================================
   PASSWORD VALIDATION
========================================================= */

function validatePassword(
    password
) {

    if (
        typeof password !== "string"
    ) {

        throw new Error(
            "Password is required."
        );

    }


    if (
        password.length <
        PASSWORD_MIN_LENGTH
    ) {

        throw new Error(
            `Password must contain at least ${PASSWORD_MIN_LENGTH} characters.`
        );

    }


    if (
        password.length >
        PASSWORD_MAX_LENGTH
    ) {

        throw new Error(
            "Password is too long."
        );

    }


    return true;

}


/* =========================================================
   PASSWORD HASH
========================================================= */

export async function hashPassword(
    password
) {

    validatePassword(
        password
    );


    const salt =
        randomBytes(
            16
        );


    const passwordBytes =
        new TextEncoder().encode(
            password
        );


    const key =
        await crypto.subtle.importKey(
            "raw",
            passwordBytes,
            {
                name:
                    "PBKDF2"
            },
            false,
            [
                "deriveBits"
            ]
        );


    const derivedBits =
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

            key,

            256
        );


    return {

        algorithm:
            "PBKDF2",

        hash:
            PBKDF2_HASH,

        iterations:
            PBKDF2_ITERATIONS,

        salt:
            bytesToHex(
                salt
            ),

        derived:
            bytesToHex(
                derivedBits
            )

    };

}


/* =========================================================
   CONSTANT-TIME COMPARISON
========================================================= */

function constantTimeEqual(
    first,
    second
) {

    if (
        typeof first !== "string" ||
        typeof second !== "string"
    ) {

        return false;

    }


    if (
        first.length !==
        second.length
    ) {

        return false;

    }


    let result = 0;


    for (
        let i = 0;
        i < first.length;
        i++
    ) {

        result |=
            first.charCodeAt(i) ^
            second.charCodeAt(i);

    }


    return result === 0;

}


/* =========================================================
   VERIFY PASSWORD
========================================================= */

export async function verifyPassword(
    password,
    stored
) {

    if (
        !stored
    ) {

        return false;

    }


    validatePassword(
        password
    );


    const salt =
        hexToBytes(
            stored.salt
        );


    const passwordBytes =
        new TextEncoder().encode(
            password
        );


    const key =
        await crypto.subtle.importKey(
            "raw",
            passwordBytes,
            {
                name:
                    "PBKDF2"
            },
            false,
            [
                "deriveBits"
            ]
        );


    const derivedBits =
        await crypto.subtle.deriveBits(
            {
                name:
                    "PBKDF2",

                salt,

                iterations:
                    stored.iterations,

                hash:
                    stored.hash
            },

            key,

            256
        );


    const derived =
        bytesToHex(
            derivedBits
        );


    return constantTimeEqual(
        derived,
        stored.derived
    );

}


/* =========================================================
   USERNAME VALIDATION
========================================================= */

function validateUsername(
    username
) {

    if (
        typeof username !== "string"
    ) {

        throw new Error(
            "Username is required."
        );

    }


    const value =
        username
            .trim()
            .toLowerCase();


    if (
        !/^[a-z0-9_]{3,30}$/.test(
            value
        )
    ) {

        throw new Error(
            "Username must contain 3–30 letters, numbers or underscores."
        );

    }


    return value;

}


/* =========================================================
   EMAIL VALIDATION
========================================================= */

function validateEmail(
    email
) {

    if (
        typeof email !== "string"
    ) {

        throw new Error(
            "Email is required."
        );

    }


    const value =
        email
            .trim()
            .toLowerCase();


    if (
        value.length > 254
    ) {

        throw new Error(
            "Email address is too long."
        );

    }


    /*
     * Basic format check.
     *
     * Production email verification will confirm ownership
     * of the address.
     */

    if (
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
            value
        )
    ) {

        throw new Error(
            "Invalid email address."
        );

    }


    return value;

}


/* =========================================================
   CREATE USER
========================================================= */

export async function createUser(
    db,
    {
        email,
        username,
        password,
        displayName = ""
    }
) {

    const normalizedEmail =
        validateEmail(
            email
        );


    const normalizedUsername =
        validateUsername(
            username
        );


    const passwordHash =
        await hashPassword(
            password
        );


    /*
     * Check duplicates.
     */

    const existing =
        await db.prepare(
            `
            SELECT
                id
            FROM users
            WHERE email = ?
               OR username = ?
            LIMIT 1
            `
        )
        .bind(
            normalizedEmail,
            normalizedUsername
        )
        .first();


    if (
        existing
    ) {

        throw new Error(
            "Email or username is already registered."
        );

    }


    const userId =
        `user_${crypto.randomUUID()}`;


    await db.prepare(
        `
        INSERT INTO users (

            id,

            email,

            username,

            display_name,

            created_at,

            updated_at

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

        userId,

        normalizedEmail,

        normalizedUsername,

        String(
            displayName || ""
        )
            .trim()
            .slice(0, 100)

    )
    .run();


    /*
     * Password hash is stored separately as JSON in a secure
     * account field in the production schema.
     *
     * The current schema does not yet have that column.
     *
     * FILE 16 will add the security migration and account
     * credential storage.
     */

    return {

        id:
            userId,

        email:
            normalizedEmail,

        username:
            normalizedUsername

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
        validateEmail(
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
     * Do not reveal whether the email exists.
     */

    if (!user) {

        throw new Error(
            "Invalid email or password."
        );

    }


    /*
     * Password verification will use the credential record
     * added by the security migration.
     */

    if (
        !user.password_hash
    ) {

        throw new Error(
            "Account credentials are not configured."
        );

    }


    let stored;


    try {

        stored =
            JSON.parse(
                user.password_hash
            );

    } catch {

        throw new Error(
            "Account credentials are invalid."
        );

    }


    const valid =
        await verifyPassword(
            password,
            stored
        );


    if (
        !valid
    ) {

        throw new Error(
            "Invalid email or password."
        );

    }


    const session =
        await createSession(
            db,
            user.id
        );


    return {

        user: {

            id:
                user.id,

            email:
                user.email,

            username:
                user.username,

            displayName:
                user.display_name,

            ageVerified:
                Number(
                    user.age_verified
                ) === 1

        },

        session

    };

}


/* =========================================================
   CREATE SESSION
========================================================= */

export async function createSession(
    db,
    userId
) {

    const token =
        randomToken(
            32
        );


    const tokenHash =
        await sha256(
            token
        );


    const sessionId =
        `session_${crypto.randomUUID()}`;


    const expires =
        new Date();


    expires.setDate(
        expires.getDate() +
        SESSION_DAYS
    );


    await db.prepare(
        `
        INSERT INTO sessions (

            id,

            user_id,

            token_hash,

            expires_at

        )

        VALUES (

            ?,

            ?,

            ?,

            ?

        )
        `
    )
    .bind(

        sessionId,

        userId,

        tokenHash,

        expires.toISOString()

    )
    .run();


    return {

        token,

        expiresAt:
            expires.toISOString()

    };

}


/* =========================================================
   COOKIE
========================================================= */

export function createSessionCookie(
    token,
    expiresAt
) {

    return [

        `${SESSION_COOKIE}=${token}`,

        "Path=/",

        "HttpOnly",

        "Secure",

        "SameSite=Lax",

        `Expires=${new Date(
            expiresAt
        ).toUTCString()}`

    ].join("; ");

}


/* =========================================================
   CLEAR COOKIE
========================================================= */

export function clearSessionCookie() {

    return [

        `${SESSION_COOKIE}=deleted`,

        "Path=/",

        "HttpOnly",

        "Secure",

        "SameSite=Lax",

        "Max-Age=0"

    ].join("; ");

}


/* =========================================================
   READ COOKIE
========================================================= */

function getCookie(
    request,
    name
) {

    const cookieHeader =
        request.headers.get(
            "Cookie"
        );


    if (
        !cookieHeader
    ) {

        return null;

    }


    const cookies =
        cookieHeader.split(
            ";"
        );


    for (
        const cookie
        of cookies
    ) {

        const index =
            cookie.indexOf(
                "="
            );


        if (
            index === -1
        ) {

            continue;

        }


        const key =
            cookie
                .slice(
                    0,
                    index
                )
                .trim();


        if (
            key !== name
        ) {

            continue;

        }


        return cookie
            .slice(
                index + 1
            )
            .trim();

    }


    return null;

}


/* =========================================================
   AUTHENTICATE REQUEST
========================================================= */

export async function authenticateRequest(
    db,
    request
) {

    const token =
        getCookie(
            request,
            SESSION_COOKIE
        );


    if (
        !token
    ) {

        return null;

    }


    const tokenHash =
        await sha256(
            token
        );


    const session =
        await db.prepare(
            `
            SELECT

                s.id AS session_id,

                s.user_id,

                s.expires_at,

                u.email,

                u.username,

                u.display_name,

                u.age_verified

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


    return {

        sessionId:
            session.session_id,

        userId:
            session.user_id,

        email:
            session.email,

        username:
            session.username,

        displayName:
            session.display_name,

        ageVerified:
            Number(
                session.age_verified
            ) === 1

    };

}


/* =========================================================
   REQUIRE AUTHENTICATION
========================================================= */

export async function requireAuthentication(
    db,
    request
) {

    const user =
        await authenticateRequest(
            db,
            request
        );


    if (!user) {

        throw new Error(
            "Authentication required."
        );

    }


    return user;

}


/* =========================================================
   LOGOUT
========================================================= */

export async function logoutUser(
    db,
    request
) {

    const token =
        getCookie(
            request,
            SESSION_COOKIE
        );


    if (
        token
    ) {

        const tokenHash =
            await sha256(
                token
            );


        await db.prepare(
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

        loggedOut:
            true

    };

}


/* =========================================================
   AGE VERIFICATION
========================================================= */

export async function markAgeVerified(
    db,
    userId
) {

    if (
        !userId
    ) {

        throw new Error(
            "Authentication required."
        );

    }


    await db.prepare(
        `
        UPDATE users

        SET

            age_verified =
                1,

            updated_at =
                CURRENT_TIMESTAMP

        WHERE id = ?
        `
    )
    .bind(
        userId
    )
    .run();


    return {

        userId,

        ageVerified:
            true

    };

}


/* =========================================================
   GET CURRENT USER
========================================================= */

export async function getCurrentUser(
    db,
    request
) {

    const auth =
        await authenticateRequest(
            db,
            request
        );


    if (!auth) {

        return null;

    }


    return {

        id:
            auth.userId,

        email:
            auth.email,

        username:
            auth.username,

        displayName:
            auth.displayName,

        ageVerified:
            auth.ageVerified

    };

}


/* =========================================================
   EXPORTS
========================================================= */

export {

    SESSION_DAYS,

    SESSION_COOKIE,

    PASSWORD_MIN_LENGTH,

    PASSWORD_MAX_LENGTH

};
