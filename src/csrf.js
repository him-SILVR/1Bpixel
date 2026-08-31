"use strict";

/**
 * =========================================================
 * BILLION PIXEL CANVAS
 * CSRF TOKEN ENGINE
 * =========================================================
 *
 * The session cookie is HttpOnly, so JavaScript cannot read it.
 * This separate CSRF token is safe for frontend JavaScript to
 * hold and send in the X-CSRF-Token header.
 *
 * The token is stored server-side as a hash.
 * =========================================================
 */


/* =========================================================
   CONSTANTS
========================================================= */

const CSRF_COOKIE =
    "bpc_csrf";

const CSRF_TTL_SECONDS =
    60 * 60 * 24;


/* =========================================================
   CREATE TOKEN
========================================================= */

export async function createCsrfToken(
    db,
    userId
) {

    if (!userId) {

        throw new Error(
            "User ID is required."
        );

    }


    /*
     * Remove old tokens for this user.
     */

    await db.prepare(
        `
        DELETE FROM csrf_tokens
        WHERE user_id = ?
        `
    )
    .bind(
        userId
    )
    .run();


    const token =
        randomToken();


    const tokenHash =
        await sha256(
            token
        );


    const id =
        `csrf_${crypto.randomUUID()}`;


    const expiresAt =
        new Date(
            Date.now() +
            CSRF_TTL_SECONDS *
            1000
        )
        .toISOString();


    await db.prepare(
        `
        INSERT INTO csrf_tokens (

            id,

            user_id,

            token_hash,

            expires_at,

            created_at

        )

        VALUES (

            ?,

            ?,

            ?,

            ?,

            CURRENT_TIMESTAMP

        )
        `
    )
    .bind(

        id,

        userId,

        tokenHash,

        expiresAt

    )
    .run();


    return {

        token,

        expiresAt

    };

}


/* =========================================================
   VALIDATE TOKEN
========================================================= */

export async function validateCsrfToken(
    db,
    userId,
    token
) {

    if (
        !userId ||
        !token
    ) {

        return false;

    }


    const tokenHash =
        await sha256(
            token
        );


    const record =
        await db.prepare(
            `
            SELECT
                token_hash
            FROM csrf_tokens
            WHERE user_id = ?

              AND token_hash = ?

              AND expires_at >
                  CURRENT_TIMESTAMP

            LIMIT 1
            `
        )
        .bind(
            userId,
            tokenHash
        )
        .first();


    if (!record) {

        return false;

    }


    return constantTimeEqual(
        tokenHash,
        record.token_hash
    );

}


/* =========================================================
   CSRF COOKIE
========================================================= */

export function csrfCookie(
    token
) {

    return (
        `${CSRF_COOKIE}=` +
        encodeURIComponent(
            token
        ) +
        `; Max-Age=${CSRF_TTL_SECONDS}` +
        `; Path=/` +
        `; Secure` +
        `; SameSite=Lax`
    );

}


/* =========================================================
   DELETE CSRF COOKIE
========================================================= */

export function clearCsrfCookie() {

    return (
        `${CSRF_COOKIE}=` +
        `; Max-Age=0` +
        `; Path=/` +
        `; Secure` +
        `; SameSite=Lax`
    );

}


/* =========================================================
   GET CSRF COOKIE
========================================================= */

export function getCsrfCookie(
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
                value =>
                    value.trim()
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
            CSRF_COOKIE
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
   CSRF ENDPOINT HELPER
========================================================= */

export async function issueCsrfToken(
    request,
    env,
    userId
) {

    /*
     * Make sure this is an authenticated account.
     */

    if (!userId) {

        const error =
            new Error(
                "Authentication required."
            );


        error.status =
            401;


        throw error;

    }


    const result =
        await createCsrfToken(
            env.DB,
            userId
        );


    return new Response(

        JSON.stringify({

            token:
                result.token,

            expiresAt:
                result.expiresAt

        }),

        {

            status:
                200,

            headers: {

                "Content-Type":
                    "application/json; charset=utf-8",

                "Cache-Control":
                    "no-store",

                "Set-Cookie":
                    csrfCookie(
                        result.token
                    )

            }

        }

    );

}


/* =========================================================
   RANDOM TOKEN
========================================================= */

function randomToken() {

    const bytes =
        new Uint8Array(
            32
        );


    crypto.getRandomValues(
        bytes
    );


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
   SHA-256
========================================================= */

async function sha256(
    value
) {

    const data =
        new TextEncoder()
            .encode(
                value
            );


    const digest =
        await crypto.subtle.digest(
            "SHA-256",
            data
        );


    const bytes =
        new Uint8Array(
            digest
        );


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


    let result =
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


        result |=
            left ^
            right;

    }


    return result === 0;

}


/* =========================================================
   EXPORTS
========================================================= */

export {

    CSRF_COOKIE,

    CSRF_TTL_SECONDS

};
