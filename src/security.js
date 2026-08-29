/**
 * =========================================================
 * BILLION PIXEL CANVAS
 * Security Layer
 * =========================================================
 *
 * Responsibilities:
 *
 * - Security headers
 * - CORS protection
 * - CSRF protection
 * - Rate limiting
 * - Request validation
 * - Input size limits
 * - Basic abuse prevention
 * - Safe JSON responses
 *
 * IMPORTANT
 *
 * This is one layer of security, not a guarantee that the
 * application is invulnerable.
 *
 * Financial and ownership operations must remain server-side.
 * =========================================================
 */

"use strict";


/* =========================================================
   CONSTANTS
========================================================= */

export const MAX_REQUEST_BYTES =
    1_000_000;

export const MAX_JSON_BYTES =
    500_000;

export const MAX_TEXT_LENGTH =
    5_000;

export const MAX_USERNAME_LENGTH =
    30;

export const MAX_URL_LENGTH =
    2_048;


/*
 * Rate limits.
 */

export const RATE_LIMITS = Object.freeze({

    login: {
        requests: 10,
        windowSeconds: 900
    },

    register: {
        requests: 5,
        windowSeconds: 900
    },

    order: {
        requests: 20,
        windowSeconds: 300
    },

    payment: {
        requests: 20,
        windowSeconds: 300
    },

    content: {
        requests: 30,
        windowSeconds: 300
    },

    report: {
        requests: 20,
        windowSeconds: 300
    },

    general: {
        requests: 120,
        windowSeconds: 60
    }

});


/* =========================================================
   CLIENT IP
========================================================= */

export function getClientIp(
    request
) {

    /*
     * Cloudflare supplies CF-Connecting-IP.
     */

    const cloudflareIp =
        request.headers.get(
            "CF-Connecting-IP"
        );


    if (
        cloudflareIp
    ) {

        return cloudflareIp.trim();

    }


    /*
     * Fallback for local development.
     */

    return (
        request.headers.get(
            "X-Forwarded-For"
        ) ||
        "unknown"
    )
        .split(",")[0]
        .trim();

}


/* =========================================================
   HASH IDENTIFIER
========================================================= */

export async function hashIdentifier(
    value
) {

    const encoded =
        new TextEncoder().encode(
            String(value)
        );


    const digest =
        await crypto.subtle.digest(
            "SHA-256",
            encoded
        );


    return Array.from(
        new Uint8Array(
            digest
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


/* =========================================================
   RATE LIMIT KEY
========================================================= */

export async function createRateLimitKey(
    request,
    category
) {

    const ip =
        getClientIp(
            request
        );


    const hashedIp =
        await hashIdentifier(
            ip
        );


    return `rate:${category}:${hashedIp}`;

}


/* =========================================================
   RATE LIMIT
========================================================= */

export async function checkRateLimit(
    db,
    request,
    category = "general"
) {

    const config =
        RATE_LIMITS[category] ||
        RATE_LIMITS.general;


    const key =
        await createRateLimitKey(
            request,
            category
        );


    const now =
        Date.now();


    const existing =
        await db.prepare(
            `
            SELECT
                key,
                request_count,
                window_start
            FROM rate_limit_buckets
            WHERE key = ?
            LIMIT 1
            `
        )
        .bind(
            key
        )
        .first();


    /*
     * No bucket yet.
     */

    if (
        !existing
    ) {

        await db.prepare(
            `
            INSERT INTO rate_limit_buckets (

                key,

                request_count,

                window_start

            )

            VALUES (

                ?,

                1,

                CURRENT_TIMESTAMP

            )
            `
        )
        .bind(
            key
        )
        .run();


        return {

            allowed:
                true,

            remaining:
                config.requests - 1,

            limit:
                config.requests

        };

    }


    const windowStart =
        new Date(
            existing.window_start
        )
            .getTime();


    const elapsed =
        (
            now -
            windowStart
        ) /
        1000;


    /*
     * Start a new window.
     */

    if (
        elapsed >=
        config.windowSeconds
    ) {

        await db.prepare(
            `
            UPDATE rate_limit_buckets

            SET

                request_count = 1,

                window_start =
                    CURRENT_TIMESTAMP,

                updated_at =
                    CURRENT_TIMESTAMP

            WHERE key = ?
            `
        )
        .bind(
            key
        )
        .run();


        return {

            allowed:
                true,

            remaining:
                config.requests - 1,

            limit:
                config.requests

        };

    }


    /*
     * Existing active window.
     */

    const count =
        Number(
            existing.request_count
        );


    if (
        count >=
        config.requests
    ) {

        return {

            allowed:
                false,

            remaining:
                0,

            limit:
                config.requests,

            retryAfter:
                Math.ceil(
                    config.windowSeconds -
                    elapsed
                )

        };

    }


    await db.prepare(
        `
        UPDATE rate_limit_buckets

        SET

            request_count =
                request_count + 1,

            updated_at =
                CURRENT_TIMESTAMP

        WHERE key = ?
        `
    )
    .bind(
        key
    )
    .run();


    return {

        allowed:
            true,

        remaining:
            config.requests -
            count -
            1,

        limit:
            config.requests

    };

}


/* =========================================================
   REQUIRE RATE LIMIT
========================================================= */

export async function requireRateLimit(
    db,
    request,
    category
) {

    const result =
        await checkRateLimit(
            db,
            request,
            category
        );


    if (
        !result.allowed
    ) {

        const error =
            new Error(
                "Too many requests. Please try again later."
            );


        error.status =
            429;


        error.retryAfter =
            result.retryAfter;


        throw error;

    }


    return result;

}


/* =========================================================
   REQUEST SIZE
========================================================= */

export function validateRequestSize(
    request
) {

    const length =
        request.headers.get(
            "Content-Length"
        );


    if (
        !length
    ) {

        return true;

    }


    const bytes =
        Number(
            length
        );


    if (
        !Number.isFinite(bytes)
    ) {

        throw new Error(
            "Invalid Content-Length."
        );

    }


    if (
        bytes >
        MAX_REQUEST_BYTES
    ) {

        const error =
            new Error(
                "Request body is too large."
            );


        error.status =
            413;


        throw error;

    }


    return true;

}


/* =========================================================
   JSON BODY
========================================================= */

export async function readJsonBody(
    request
) {

    validateRequestSize(
        request
    );


    const contentType =
        request.headers.get(
            "Content-Type"
        ) ||
        "";


    if (
        !contentType
            .toLowerCase()
            .includes(
                "application/json"
            )
    ) {

        const error =
            new Error(
                "Content-Type must be application/json."
            );


        error.status =
            415;


        throw error;

    }


    const body =
        await request.text();


    if (
        new TextEncoder()
            .encode(body)
            .byteLength >
        MAX_JSON_BYTES
    ) {

        const error =
            new Error(
                "JSON body is too large."
            );


        error.status =
            413;


        throw error;

    }


    if (
        !body.trim()
    ) {

        throw new Error(
            "Request body is empty."
        );

    }


    try {

        return JSON.parse(
            body
        );

    } catch {

        const error =
            new Error(
                "Invalid JSON."
            );


        error.status =
            400;


        throw error;

    }

}


/* =========================================================
   STRING SANITIZATION
========================================================= */

export function sanitizeText(
    value,
    maxLength = MAX_TEXT_LENGTH
) {

    if (
        value === null ||
        value === undefined
    ) {

        return "";

    }


    if (
        typeof value !== "string"
    ) {

        throw new Error(
            "Expected text value."
        );

    }


    return value
        .normalize("NFKC")
        .trim()
        .slice(
            0,
            maxLength
        );

}


/* =========================================================
   USERNAME SANITIZATION
========================================================= */

export function sanitizeUsername(
    value
) {

    const username =
        sanitizeText(
            value,
            MAX_USERNAME_LENGTH
        )
            .toLowerCase();


    if (
        !/^[a-z0-9_]{3,30}$/.test(
            username
        )
    ) {

        throw new Error(
            "Invalid username."
        );

    }


    return username;

}


/* =========================================================
   URL VALIDATION
========================================================= */

export function validateHttpUrl(
    value
) {

    const url =
        sanitizeText(
            value,
            MAX_URL_LENGTH
        );


    if (
        !url
    ) {

        throw new Error(
            "URL is required."
        );

    }


    let parsed;


    try {

        parsed =
            new URL(
                url
            );

    } catch {

        throw new Error(
            "Invalid URL."
        );

    }


    if (
        parsed.protocol !== "https:" &&
        parsed.protocol !== "http:"
    ) {

        throw new Error(
            "Only HTTP and HTTPS URLs are allowed."
        );

    }


    return parsed.toString();

}


/* =========================================================
   COORDINATE VALIDATION
========================================================= */

export function validateCoordinates(
    x,
    y
) {

    const coordinateX =
        Number(x);

    const coordinateY =
        Number(y);


    if (
        !Number.isSafeInteger(
            coordinateX
        ) ||
        !Number.isSafeInteger(
            coordinateY
        )
    ) {

        throw new Error(
            "Invalid canvas coordinates."
        );

    }


    if (
        coordinateX < 0 ||
        coordinateY < 0
    ) {

        throw new Error(
            "Canvas coordinates cannot be negative."
        );

    }


    return {

        x:
            coordinateX,

        y:
            coordinateY

    };

}


/* =========================================================
   QUANTITY VALIDATION
========================================================= */

export function validatePixelQuantity(
    quantity
) {

    const value =
        Number(
            quantity
        );


    if (
        !Number.isSafeInteger(
            value
        )
    ) {

        throw new Error(
            "Pixel quantity must be a whole number."
        );

    }


    if (
        value < 1
    ) {

        throw new Error(
            "Minimum purchase is 1 pixel."
        );

    }


    return value;

}


/* =========================================================
   CONTENT SECURITY POLICY
========================================================= */

export function securityHeaders() {

    return {

        "X-Content-Type-Options":
            "nosniff",

        "X-Frame-Options":
            "DENY",

        "Referrer-Policy":
            "strict-origin-when-cross-origin",

        "Permissions-Policy":
            "camera=(), microphone=(), geolocation=()",

        "Cross-Origin-Opener-Policy":
            "same-origin",

        "Cross-Origin-Resource-Policy":
            "same-origin",

        "Content-Security-Policy":
            [
                "default-src 'self'",

                "base-uri 'self'",

                "form-action 'self'",

                "frame-ancestors 'none'",

                "object-src 'none'",

                "script-src 'self'",

                "style-src 'self' 'unsafe-inline'",

                "img-src 'self' data: https:",

                "font-src 'self' data:",

                "connect-src 'self' https:",

                "media-src 'self' https:",

                "frame-src 'self' https:"

            ].join("; ")

    };

}


/* =========================================================
   CORS
========================================================= */

export function corsHeaders(
    request,
    env
) {

    const origin =
        request.headers.get(
            "Origin"
        );


    const configuredOrigin =
        String(
            env?.PUBLIC_ORIGIN || ""
        )
            .trim();


    /*
     * For production, PUBLIC_ORIGIN should be the exact
     * Cloudflare Pages/Workers site origin.
     */

    const allowedOrigin =
        configuredOrigin ||
        origin ||
        "";


    const headers = {

        "Vary":
            "Origin",

        "Access-Control-Allow-Methods":
            "GET,POST,PUT,PATCH,DELETE,OPTIONS",

        "Access-Control-Allow-Headers":
            "Content-Type, X-CSRF-Token",

        "Access-Control-Allow-Credentials":
            "true",

        "Access-Control-Max-Age":
            "86400"

    };


    if (
        allowedOrigin
    ) {

        headers[
            "Access-Control-Allow-Origin"
        ] =
            allowedOrigin;

    }


    return headers;

}


/* =========================================================
   CORS ORIGIN CHECK
========================================================= */

export function assertAllowedOrigin(
    request,
    env
) {

    const origin =
        request.headers.get(
            "Origin"
        );


    /*
     * Requests without Origin are permitted because ordinary
     * server-to-server requests and some navigations do not
     * include it.
     */

    if (
        !origin
    ) {

        return true;

    }


    const configured =
        String(
            env?.PUBLIC_ORIGIN || ""
        )
            .trim();


    if (
        !configured
    ) {

        /*
         * Do not allow arbitrary browser origins in production.
         *
         * During development, same-origin requests normally
         * don't require an Origin comparison.
         */

        return true;

    }


    if (
        origin !==
        configured
    ) {

        const error =
            new Error(
                "Origin is not allowed."
            );


        error.status =
            403;


        throw error;

    }


    return true;

}


/* =========================================================
   CSRF TOKEN
========================================================= */

export async function createCsrfToken(
    sessionToken
) {

    if (
        !sessionToken
    ) {

        throw new Error(
            "Session token is required."
        );

    }


    /*
     * Deterministic token derived from the session secret.
     *
     * The raw session token is never returned by this helper.
     */

    return hashIdentifier(
        `csrf:${sessionToken}`
    );

}


/* =========================================================
   CSRF VALIDATION
========================================================= */

export async function validateCsrf(
    request,
    sessionToken
) {

    /*
     * Safe methods do not modify server state.
     */

    if (
        [
            "GET",
            "HEAD",
            "OPTIONS"
        ].includes(
            request.method.toUpperCase()
        )
    ) {

        return true;

    }


    const supplied =
        request.headers.get(
            "X-CSRF-Token"
        );


    if (
        !supplied
    ) {

        const error =
            new Error(
                "CSRF token is required."
            );


        error.status =
            403;


        throw error;

    }


    const expected =
        await createCsrfToken(
            sessionToken
        );


    if (
        supplied !==
        expected
    ) {

        const error =
            new Error(
                "Invalid CSRF token."
            );


        error.status =
            403;


        throw error;

    }


    return true;

}


/* =========================================================
   SAFE JSON RESPONSE
========================================================= */

export function jsonResponse(
    data,
    {
        status = 200,
        headers = {}
    } = {}
) {

    return new Response(
        JSON.stringify(
            data
        ),
        {

            status,

            headers: {

                "Content-Type":
                    "application/json; charset=utf-8",

                ...securityHeaders(),

                ...headers

            }

        }
    );

}


/* =========================================================
   ERROR RESPONSE
========================================================= */

export function errorResponse(
    error
) {

    const status =
        Number(
            error?.status
        ) || 500;


    /*
     * Never expose stack traces to users.
     */

    const message =
        status >= 500
            ? "Internal server error."
            : (
                error?.message ||
                "Request failed."
            );


    const headers = {};


    if (
        error?.retryAfter
    ) {

        headers[
            "Retry-After"
        ] =
            String(
                error.retryAfter
            );

    }


    return jsonResponse(
        {

            error:
                message

        },
        {

            status,

            headers

        }
    );

}


/* =========================================================
   METHOD CHECK
========================================================= */

export function requireMethod(
    request,
    allowedMethods
) {

    const method =
        request.method.toUpperCase();


    if (
        !allowedMethods
            .map(
                value =>
                    value.toUpperCase()
            )
            .includes(
                method
            )
    ) {

        const error =
            new Error(
                "HTTP method is not allowed."
            );


        error.status =
            405;


        throw error;

    }


    return true;

}


/* =========================================================
   SECURITY CLEANUP
========================================================= */

export async function cleanupRateLimitBuckets(
    db
) {

    /*
     * Keep the table from growing forever.
     *
     * Old buckets are not useful.
     */

    await db.prepare(
        `
        DELETE FROM rate_limit_buckets

        WHERE updated_at <
            datetime(
                'now',
                '-24 hours'
            )
        `
    )
    .run();


    return true;

}
