"use strict";


/**
 * =========================================================
 * BILLION PIXEL CANVAS
 * SECURITY LAYER
 * =========================================================
 *
 * Provides:
 *
 * - Security headers
 * - CORS protection
 * - Basic request validation
 * - Origin validation
 * - Rate limiting using Cloudflare KV
 * - CSRF protection for state-changing requests
 *
 * IMPORTANT:
 *
 * This layer does NOT replace Cloudflare WAF, Turnstile,
 * database constraints, authentication, or application-level
 * authorization.
 */


/* =========================================================
   CONSTANTS
========================================================= */

const STATE_CHANGING_METHODS =
    new Set([
        "POST",
        "PUT",
        "PATCH",
        "DELETE"
    ]);


const MAX_REQUEST_BYTES =
    1_000_000;


const RATE_LIMIT_WINDOW_SECONDS =
    60;


const RATE_LIMIT_MAX_REQUESTS =
    60;


/* =========================================================
   SECURITY HEADERS
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

                "script-src 'self'",

                "style-src 'self'",

                "img-src 'self' data: https:",

                "font-src 'self' https:",

                "connect-src 'self' https:",

                "frame-ancestors 'none'",

                "base-uri 'self'",

                "form-action 'self'",

                "object-src 'none'"

            ].join("; "),

        "Strict-Transport-Security":
            "max-age=31536000; includeSubDomains"

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


    /*
     * Only allow the configured production origin.
     *
     * If no origin is supplied, no CORS header is required.
     */

    if (!origin) {

        return {};

    }


    const allowedOrigin =
        String(
            env?.PUBLIC_ORIGIN ||
            ""
        )
            .trim();


    if (
        allowedOrigin &&
        origin === allowedOrigin
    ) {

        return {

            "Access-Control-Allow-Origin":
                origin,

            "Access-Control-Allow-Credentials":
                "true",

            "Access-Control-Allow-Methods":
                "GET, POST, PUT, PATCH, DELETE, OPTIONS",

            "Access-Control-Allow-Headers":
                "Content-Type, X-CSRF-Token",

            "Vary":
                "Origin"

        };

    }


    /*
     * Do not reflect arbitrary origins.
     */

    return {};

}


/* =========================================================
   CORS PREFLIGHT
========================================================= */

export function handleCorsPreflight(
    request,
    env
) {

    const headers =
        corsHeaders(
            request,
            env
        );


    if (
        !headers[
            "Access-Control-Allow-Origin"
        ]
    ) {

        return new Response(
            "CORS origin not allowed.",
            {
                status: 403,
                headers: {
                    ...securityHeaders()
                }
            }
        );

    }


    return new Response(
        null,
        {
            status: 204,
            headers: {
                ...securityHeaders(),
                ...headers
            }
        }
    );

}


/* =========================================================
   ORIGIN VALIDATION
========================================================= */

export function validateOrigin(
    request,
    env
) {

    const method =
        request.method.toUpperCase();


    if (
        !STATE_CHANGING_METHODS.has(
            method
        )
    ) {

        return true;

    }


    const origin =
        request.headers.get(
            "Origin"
        );


    /*
     * API clients without an Origin header may still exist,
     * so absence alone is not treated as invalid.
     */

    if (!origin) {

        return true;

    }


    const configuredOrigin =
        String(
            env?.PUBLIC_ORIGIN ||
            ""
        )
            .trim();


    if (
        !configuredOrigin
    ) {

        /*
         * Production deployment should always configure this.
         */

        return false;

    }


    return (
        origin ===
        configuredOrigin
    );

}


/* =========================================================
   CSRF TOKEN
========================================================= */

export function generateCsrfToken() {

    const bytes =
        new Uint8Array(
            32
        );


    crypto.getRandomValues(
        bytes
    );


    return bytesToBase64Url(
        bytes
    );

}


/* =========================================================
   CSRF VALIDATION
========================================================= */

export function validateCsrf(
    request,
    expectedToken
) {

    const method =
        request.method.toUpperCase();


    if (
        !STATE_CHANGING_METHODS.has(
            method
        )
    ) {

        return true;

    }


    /*
     * Authentication endpoints that establish a session may
     * be protected by Origin/SameSite controls instead.
     *
     * For authenticated state-changing operations, require
     * an explicit CSRF token.
     */

    if (
        !expectedToken
    ) {

        return false;

    }


    const suppliedToken =
        request.headers.get(
            "X-CSRF-Token"
        );


    if (
        !suppliedToken
    ) {

        return false;

    }


    return constantTimeEqual(
        suppliedToken,
        expectedToken
    );

}


/* =========================================================
   REQUEST SIZE
========================================================= */

export function validateRequestSize(
    request
) {

    const lengthHeader =
        request.headers.get(
            "Content-Length"
        );


    if (!lengthHeader) {

        return true;

    }


    const length =
        Number(
            lengthHeader
        );


    if (
        !Number.isSafeInteger(
            length
        )
    ) {

        return false;

    }


    return (
        length <=
        MAX_REQUEST_BYTES
    );

}


/* =========================================================
   RATE LIMIT
========================================================= */

/**
 * Basic KV-based rate limiter.
 *
 * Bind a KV namespace as:
 *
 * RATE_LIMIT
 *
 * in Cloudflare.
 *
 * If the binding is unavailable, the function returns true.
 *
 * Production deployment should configure the KV binding.
 */

export async function rateLimit(
    request,
    env,
    {
        limit =
            RATE_LIMIT_MAX_REQUESTS,

        windowSeconds =
            RATE_LIMIT_WINDOW_SECONDS,

        keyPrefix =
            "api"
    } = {}
) {

    if (
        !env?.RATE_LIMIT
    ) {

        /*
         * Development fallback.
         */

        return {

            allowed:
                true,

            remaining:
                limit

        };

    }


    const ip =
        request.headers.get(
            "CF-Connecting-IP"
        ) ||
        "unknown";


    const now =
        Math.floor(
            Date.now() /
            1000
        );


    const bucket =
        Math.floor(
            now /
            windowSeconds
        );


    const key =
        `${keyPrefix}:${ip}:${bucket}`;


    const existing =
        await env.RATE_LIMIT.get(
            key
        );


    const count =
        Number(
            existing ||
            0
        );


    if (
        count >=
        limit
    ) {

        return {

            allowed:
                false,

            remaining:
                0,

            retryAfter:
                windowSeconds -
                (
                    now %
                    windowSeconds
                )

        };

    }


    await env.RATE_LIMIT.put(
        key,
        String(
            count + 1
        ),
        {
            expirationTtl:
                windowSeconds + 5
        }
    );


    return {

        allowed:
            true,

        remaining:
            Math.max(
                0,
                limit -
                count -
                1
            )

    };

}


/* =========================================================
   SECURITY CHECK
========================================================= */

export async function securityCheck(
    request,
    env,
    {
        csrfToken = null,

        rateLimitOptions = {}

    } = {}
) {

    /*
     * Request size.
     */

    if (
        !validateRequestSize(
            request
        )
    ) {

        return {

            allowed:
                false,

            response:
                securityError(
                    "Request is too large.",
                    413
                )

        };

    }


    /*
     * Origin.
     */

    if (
        !validateOrigin(
            request,
            env
        )
    ) {

        return {

            allowed:
                false,

            response:
                securityError(
                    "Request origin is not allowed.",
                    403
                )

        };

    }


    /*
     * CSRF.
     */

    if (
        !validateCsrf(
            request,
            csrfToken
        )
    ) {

        return {

            allowed:
                false,

            response:
                securityError(
                    "CSRF validation failed.",
                    403
                )

        };

    }


    /*
     * Rate limit.
     */

    const rate =
        await rateLimit(
            request,
            env,
            rateLimitOptions
        );


    if (
        !rate.allowed
    ) {

        const response =
            securityError(
                "Too many requests.",
                429
            );


        response.headers.set(
            "Retry-After",
            String(
                rate.retryAfter ||
                60
            )
        );


        return {

            allowed:
                false,

            response

        };

    }


    return {

        allowed:
            true,

        remaining:
            rate.remaining

    };

}


/* =========================================================
   SECURITY ERROR
========================================================= */

function securityError(
    message,
    status
) {

    return new Response(

        JSON.stringify({

            error:
                message

        }),

        {

            status,

            headers: {

                "Content-Type":
                    "application/json; charset=utf-8",

                ...securityHeaders()

            }

        }

    );

}


/* =========================================================
   CONSTANT-TIME COMPARISON
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


    let difference =
        a.length ^
        b.length;


    const length =
        Math.max(
            a.length,
            b.length
        );


    for (
        let i = 0;
        i < length;
        i++
    ) {

        const left =
            i < a.length
                ? a.charCodeAt(i)
                : 0;


        const right =
            i < b.length
                ? b.charCodeAt(i)
                : 0;


        difference |=
            left ^
            right;

    }


    return difference === 0;

}


/* =========================================================
   BASE64URL
========================================================= */

function bytesToBase64Url(
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
   EXPORTS
========================================================= */

export {

    STATE_CHANGING_METHODS,

    MAX_REQUEST_BYTES,

    RATE_LIMIT_WINDOW_SECONDS,

    RATE_LIMIT_MAX_REQUESTS

};
