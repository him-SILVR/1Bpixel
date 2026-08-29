/**
 * =========================================================
 * BILLION PIXEL CANVAS
 * API ROUTER
 * =========================================================
 *
 * This file connects the frontend to:
 *
 * - User accounts
 * - Login / logout
 * - Canvas districts
 * - Pixel availability
 * - Orders
 * - Bitcoin quotes
 * - Bitcoin payment verification
 * - Permanent ownership
 * - User content
 * - Content reports
 *
 * IMPORTANT
 *
 * The browser never decides:
 *
 * - pixel price
 * - BTC amount
 * - coordinates
 * - ownership
 * - payment confirmation
 *
 * Those decisions are made server-side.
 * =========================================================
 */

"use strict";


import {
    createUser,
    loginUser,
    logoutUser,
    authenticateRequest,
    getCurrentUser,
    markAgeVerified,
    createSessionCookie,
    clearSessionCookie
} from "./auth.js";


import {
    createOrder,
    getOrder,
    getOrderStatus,
    cancelOrder,
    completePaidOrder,
    expireOrders
} from "./orders.js";


import {
    createBitcoinQuote,
    attachBitcoinQuoteToOrder,
    verifyBitcoinPayment,
    getBitcoinPaymentStatus,
    getBitcoinConfiguration
} from "./bitcoin.js";


import {
    getOwnership,
    findOwnershipAt
} from "./allocator.js";


import {
    createContent,
    getContent,
    listOwnershipContent,
    publishContent,
    hideContent,
    reportContent
} from "./content.js";


import {
    requireRateLimit,
    readJsonBody,
    requireMethod,
    assertAllowedOrigin,
    validateCoordinates,
    validatePixelQuantity,
    validateHttpUrl,
    sanitizeText,
    jsonResponse,
    errorResponse,
    corsHeaders,
    securityHeaders
} from "./security.js";


/* =========================================================
   ROUTER
========================================================= */

export async function handleApi(
    request,
    env,
    ctx
) {

    try {

        assertAllowedOrigin(
            request,
            env
        );


        /*
         * OPTIONS is used by browser CORS preflight requests.
         */

        if (
            request.method.toUpperCase() ===
            "OPTIONS"
        ) {

            return new Response(
                null,
                {
                    status: 204,

                    headers: {
                        ...securityHeaders(),
                        ...corsHeaders(
                            request,
                            env
                        )
                    }
                }
            );

        }


        const url =
            new URL(
                request.url
            );


        const path =
            url.pathname
                .replace(
                    /^\/api/,
                    ""
                )
                .replace(
                    /\/+$/,
                    ""
                ) ||
            "/";


        /*
         * Route request.
         */

        const response =
            await route(
                request,
                env,
                ctx,
                path,
                url
            );


        /*
         * Add security/CORS headers.
         */

        const headers =
            new Headers(
                response.headers
            );


        const security =
            securityHeaders();


        for (
            const [
                key,
                value
            ]
            of Object.entries(
                security
            )
        ) {

            headers.set(
                key,
                value
            );

        }


        const cors =
            corsHeaders(
                request,
                env
            );


        for (
            const [
                key,
                value
            ]
            of Object.entries(
                cors
            )
        ) {

            headers.set(
                key,
                value
            );

        }


        return new Response(
            response.body,
            {
                status:
                    response.status,

                headers
            }
        );

    } catch (
        error
    ) {

        console.error(
            "API error:",
            error
        );


        return errorResponse(
            error
        );

    }

}


/* =========================================================
   ROUTE DISPATCHER
========================================================= */

async function route(
    request,
    env,
    ctx,
    path,
    url
) {

    const db =
        env.DB;


    if (!db) {

        const error =
            new Error(
                "Database binding is not configured."
            );


        error.status =
            500;


        throw error;

    }


    /* -----------------------------------------------------
       HEALTH
    ----------------------------------------------------- */

    if (
        path === "/health"
    ) {

        requireMethod(
            request,
            ["GET"]
        );


        return jsonResponse({

            ok:
                true,

            service:
                "Billion Pixel Canvas",

            timestamp:
                new Date().toISOString()

        });

    }


    /* -----------------------------------------------------
       PROJECT CONFIG
    ----------------------------------------------------- */

    if (
        path === "/config"
    ) {

        requireMethod(
            request,
            ["GET"]
        );


        const config =
            await getProjectConfig(
                db
            );


        return jsonResponse(
            config
        );

    }


    /* -----------------------------------------------------
       DISTRICTS
    ----------------------------------------------------- */

    if (
        path === "/districts"
    ) {

        requireMethod(
            request,
            ["GET"]
        );


        const districts =
            await db.prepare(
                `
                SELECT
                    id,
                    name,
                    minimum_pixels,
                    adult_only,
                    description
                FROM districts
                ORDER BY id
                `
            )
            .all();


        return jsonResponse(
            districts.results || []
        );

    }


    /* -----------------------------------------------------
       REGISTER
    ----------------------------------------------------- */

    if (
        path === "/auth/register"
    ) {

        await requireRateLimit(
            db,
            request,
            "register"
        );


        requireMethod(
            request,
            ["POST"]
        );


        const body =
            await readJsonBody(
                request
            );


        /*
         * Create account with credential storage.
         */

        const user =
            await registerUserSafely(
                db,
                body
            );


        return jsonResponse(
            {
                user
            },
            {
                status: 201
            }
        );

    }


    /* -----------------------------------------------------
       LOGIN
    ----------------------------------------------------- */

    if (
        path === "/auth/login"
    ) {

        await requireRateLimit(
            db,
            request,
            "login"
        );


        requireMethod(
            request,
            ["POST"]
        );


        const body =
            await readJsonBody(
                request
            );


        const result =
            await loginUser(
                db,
                {

                    email:
                        body.email,

                    password:
                        body.password

                }
            );


        /*
         * Update last login.
         */

        await db.prepare(
            `
            UPDATE users

            SET
                last_login_at =
                    CURRENT_TIMESTAMP,

                updated_at =
                    CURRENT_TIMESTAMP

            WHERE id = ?
            `
        )
        .bind(
            result.user.id
        )
        .run();


        const response =
            jsonResponse({

                user:
                    result.user,

                csrfToken:
                    await createCsrfTokenForRequest(
                        request
                    )

            });


        response.headers.append(
            "Set-Cookie",
            createSessionCookie(
                result.session.token,
                result.session.expiresAt
            )
        );


        return response;

    }


    /* -----------------------------------------------------
       LOGOUT
    ----------------------------------------------------- */

    if (
        path === "/auth/logout"
    ) {

        requireMethod(
            request,
            ["POST"]
        );


        const auth =
            await authenticateRequest(
                db,
                request
            );


        if (
            auth
        ) {

            await logoutUser(
                db,
                request
            );

        }


        const response =
            jsonResponse({

                loggedOut:
                    true

            });


        response.headers.append(
            "Set-Cookie",
            clearSessionCookie()
        );


        return response;

    }


    /* -----------------------------------------------------
       CURRENT USER
    ----------------------------------------------------- */

    if (
        path === "/auth/me"
    ) {

        requireMethod(
            request,
            ["GET"]
        );


        const user =
            await getCurrentUser(
                db,
                request
            );


        return jsonResponse({

            authenticated:
                Boolean(user),

            user:
                user || null

        });

    }


    /* -----------------------------------------------------
       AGE VERIFICATION
    ----------------------------------------------------- */

    if (
        path === "/auth/age-verify"
    ) {

        await requireRateLimit(
            db,
            request,
            "general"
        );


        requireMethod(
            request,
            ["POST"]
        );


        const auth =
            await requireAuth(
                db,
                request
            );


        const body =
            await readJsonBody(
                request
            );


        /*
         * This endpoint does not pretend that a checkbox is
         * legally sufficient everywhere.
         *
         * A production deployment may replace this with a
         * compliant third-party age-verification provider.
         */

        if (
            body.confirmed !== true
        ) {

            const error =
                new Error(
                    "Age verification confirmation is required."
                );


            error.status =
                400;


            throw error;

        }


        await markAgeVerified(
            db,
            auth.userId
        );


        await db.prepare(
            `
            INSERT INTO age_verification_records (

                id,
                user_id,
                method,
                status,
                verified_at

            )

            VALUES (

                ?,
                ?,
                'SELF_ATTESTATION',
                'VERIFIED',
                CURRENT_TIMESTAMP

            )

            ON CONFLICT(user_id)

            DO UPDATE SET

                method =
                    'SELF_ATTESTATION',

                status =
                    'VERIFIED',

                verified_at =
                    CURRENT_TIMESTAMP,

                updated_at =
                    CURRENT_TIMESTAMP
            `
        )
        .bind(

            `age_${crypto.randomUUID()}`,

            auth.userId

        )
        .run();


        return jsonResponse({

            ageVerified:
                true

        });

    }


    /* -----------------------------------------------------
       CREATE ORDER
    ----------------------------------------------------- */

    if (
        path === "/orders"
    ) {

        await requireRateLimit(
            db,
            request,
            "order"
        );


        requireMethod(
            request,
            ["POST"]
        );


        const auth =
            await requireAuth(
                db,
                request
            );


        const body =
            await readJsonBody(
                request
            );


        const districtId =
            sanitizeText(
                body.districtId,
                100
            );


        const quantity =
            validatePixelQuantity(
                body.quantity
            );


        /*
         * Create the server-side order.
         *
         * The price is calculated by orders.js.
         */

        const order =
            await createOrder(
                db,
                {

                    userId:
                        auth.userId,

                    districtId,

                    quantity

                }
            );


        /*
         * Calculate the BTC equivalent from the fixed USD
         * price and lock the quote into this order.
         */

        const quote =
            await createBitcoinQuote(
                order.priceUsd,
                env
            );


        const lockedQuote =
            await attachBitcoinQuoteToOrder(
                db,
                {

                    orderId:
                        order.id,

                    quote

                }
            );


        return jsonResponse(
            {

                order: {

                    ...order,

                    bitcoin: {

                        amount:
                            lockedQuote.btcAmount,

                        satoshis:
                            lockedQuote.btcAmountSatoshis,

                        btcUsdRate:
                            lockedQuote.btcUsdRate,

                        paymentAddress:
                            lockedQuote.paymentAddress

                    }

                }

            },
            {
                status: 201
            }
        );

    }


    /* -----------------------------------------------------
       GET ORDER
    ----------------------------------------------------- */

    if (
        path.startsWith(
            "/orders/"
        ) &&
        path.endsWith(
            "/status"
        )
    ) {

        requireMethod(
            request,
            ["GET"]
        );


        const auth =
            await requireAuth(
                db,
                request
            );


        const orderId =
            path
                .replace(
                    "/orders/",
                    ""
                )
                .replace(
                    "/status",
                    ""
                );


        const result =
            await getOrderStatus(
                db,
                orderId
            );


        if (
            !result
        ) {

            const error =
                new Error(
                    "Order not found."
                );


            error.status =
                404;


            throw error;

        }


        /*
         * Users may only inspect their own orders.
         */

        const order =
            await getOrder(
                db,
                orderId
            );


        if (
            order.order.user_id !==
            auth.userId
        ) {

            const error =
                new Error(
                    "You do not have access to this order."
                );


            error.status =
                403;


            throw error;

        }


        return jsonResponse(
            result
        );

    }


    /* -----------------------------------------------------
       VERIFY BTC PAYMENT
    ----------------------------------------------------- */

    if (
        path.startsWith(
            "/orders/"
        ) &&
        path.endsWith(
            "/bitcoin/verify"
        )
    ) {

        await requireRateLimit(
            db,
            request,
            "payment"
        );


        requireMethod(
            request,
            ["POST"]
        );


        const auth =
            await requireAuth(
                db,
                request
            );


        const orderId =
            path
                .replace(
                    "/orders/",
                    ""
                )
                .replace(
                    "/bitcoin/verify",
                    ""
                );


        const order =
            await getOrder(
                db,
                orderId
            );


        if (
            !order
        ) {

            const error =
                new Error(
                    "Order not found."
                );


            error.status =
                404;


            throw error;

        }


        if (
            order.order.user_id !==
            auth.userId
        ) {

            const error =
                new Error(
                    "You do not have access to this order."
                );


            error.status =
                403;


            throw error;

        }


        const body =
            await readJsonBody(
                request
            );


        const result =
            await verifyBitcoinPayment(
                db,
                env,
                {

                    orderId,

                    transactionId:
                        body.transactionId

                }
            );


        /*
         * Ownership is finalized only after the payment
         * verification says the transaction has enough
         * confirmations and the correct amount was received.
         */

        if (
            result.status ===
            "CONFIRMED"
        ) {

            await completePaidOrder(
                db,
                orderId
            );

        }


        return jsonResponse(
            result
        );

    }


    /* -----------------------------------------------------
       BTC PAYMENT STATUS
    ----------------------------------------------------- */

    if (
        path.startsWith(
            "/orders/"
        ) &&
        path.endsWith(
            "/bitcoin"
        )
    ) {

        requireMethod(
            request,
            ["GET"]
        );


        const auth =
            await requireAuth(
                db,
                request
            );


        const orderId =
            path
                .replace(
                    "/orders/",
                    ""
                )
                .replace(
                    "/bitcoin",
                    ""
                );


        const order =
            await getOrder(
                db,
                orderId
            );


        if (
            !order
        ) {

            const error =
                new Error(
                    "Order not found."
                );


            error.status =
                404;


            throw error;

        }


        if (
            order.order.user_id !==
            auth.userId
        ) {

            const error =
                new Error(
                    "You do not have access to this order."
                );


            error.status =
                403;


            throw error;

        }


        const payment =
            await getBitcoinPaymentStatus(
                db,
                orderId
            );


        return jsonResponse(
            payment
        );

    }


    /* -----------------------------------------------------
       CANCEL ORDER
    ----------------------------------------------------- */

    if (
        path.startsWith(
            "/orders/"
        ) &&
        path.endsWith(
            "/cancel"
        )
    ) {

        await requireRateLimit(
            db,
            request,
            "order"
        );


        requireMethod(
            request,
            ["POST"]
        );


        const auth =
            await requireAuth(
                db,
                request
            );


        const orderId =
            path
                .replace(
                    "/orders/",
                    ""
                )
                .replace(
                    "/cancel",
                    ""
                );


        const order =
            await getOrder(
                db,
                orderId
            );


        if (
            !order
        ) {

            const error =
                new Error(
                    "Order not found."
                );


            error.status =
                404;


            throw error;

        }


        if (
            order.order.user_id !==
            auth.userId
        ) {

            const error =
                new Error(
                    "You do not have access to this order."
                );


            error.status =
                403;


            throw error;

        }


        const result =
            await cancelOrder(
                db,
                orderId
            );


        return jsonResponse(
            result
        );

    }


    /* -----------------------------------------------------
       CANVAS POINT LOOKUP
    ----------------------------------------------------- */

    if (
        path === "/canvas/lookup"
    ) {

        requireMethod(
            request,
            ["GET"]
        );


        const districtId =
            sanitizeText(
                url.searchParams.get(
                    "district"
                ),
                100
            );


        const x =
            url.searchParams.get(
                "x"
            );

        const y =
            url.searchParams.get(
                "y"
            );


        const coordinates =
            validateCoordinates(
                x,
                y
            );


        const ownership =
            await findOwnershipAt(
                db,
                districtId,
                coordinates.x,
                coordinates.y
            );


        return jsonResponse({

            district:
                districtId,

            x:
                coordinates.x,

            y:
                coordinates.y,

            sold:
                Boolean(ownership),

            ownership:
                ownership || null

        });

    }


    /* -----------------------------------------------------
       GET OWNERSHIP
    ----------------------------------------------------- */

    if (
        path.startsWith(
            "/ownership/"
        )
    ) {

        requireMethod(
            request,
            ["GET"]
        );


        const ownershipId =
            path.replace(
                "/ownership/",
                ""
            );


        const ownership =
            await getOwnership(
                db,
                ownershipId
            );


        return jsonResponse(
            {
                ownership
            }
        );

    }


    /* -----------------------------------------------------
       OWNERSHIP CONTENT
    ----------------------------------------------------- */

    if (
        path.startsWith(
            "/ownership/"
        ) &&
        path.endsWith(
            "/content"
        )
    ) {

        requireMethod(
            request,
            ["GET"]
        );


        const ownershipId =
            path
                .replace(
                    "/ownership/",
                    ""
                )
                .replace(
                    "/content",
                    ""
                );


        const content =
            await listOwnershipContent(
                db,
                ownershipId
            );


        return jsonResponse(
            content.results || []
        );

    }


    /* -----------------------------------------------------
       CREATE CONTENT
    ----------------------------------------------------- */

    if (
        path === "/content"
    ) {

        await requireRateLimit(
            db,
            request,
            "content"
        );


        requireMethod(
            request,
            ["POST"]
        );


        const auth =
            await requireAuth(
                db,
                request
            );


        const body =
            await readJsonBody(
                request
            );


        const content =
            await createContent(
                db,
                {

                    ownershipId:
                        body.ownershipId,

                    userId:
                        auth.userId,

                    content: {

                        contentType:
                            body.contentType,

                        title:
                            body.title,

                        description:
                            body.description,

                        imageUrl:
                            body.imageUrl,

                        externalUrl:
                            body.externalUrl,

                        altText:
                            body.altText,

                        isAdultContent:
                            body.isAdultContent === true

                    }

                }
            );


        return jsonResponse(
            {
                content
            },
            {
                status: 201
            }
        );

    }


    /* -----------------------------------------------------
       PUBLISH CONTENT
    ----------------------------------------------------- */

    if (
        path.startsWith(
            "/content/"
        ) &&
        path.endsWith(
            "/publish"
        )
    ) {

        await requireRateLimit(
            db,
            request,
            "content"
        );


        requireMethod(
            request,
            ["POST"]
        );


        const auth =
            await requireAuth(
                db,
                request
            );


        const contentId =
            path
                .replace(
                    "/content/",
                    ""
                )
                .replace(
                    "/publish",
                    ""
                );


        const content =
            await publishContent(
                db,
                {

                    contentId,

                    userId:
                        auth.userId

                }
            );


        return jsonResponse(
            {
                content
            }
        );

    }


    /* -----------------------------------------------------
       HIDE CONTENT
    ----------------------------------------------------- */

    if (
        path.startsWith(
            "/content/"
        ) &&
        path.endsWith(
            "/hide"
        )
    ) {

        await requireRateLimit(
            db,
            request,
            "content"
        );


        requireMethod(
            request,
            ["POST"]
        );


        const auth =
            await requireAuth(
                db,
                request
            );


        const contentId =
            path
                .replace(
                    "/content/",
                    ""
                )
                .replace(
                    "/hide",
                    ""
                );


        const content =
            await hideContent(
                db,
                {

                    contentId,

                    userId:
                        auth.userId

                }
            );


        return jsonResponse(
            {
                content
            }
        );

    }


    /* -----------------------------------------------------
       GET CONTENT
    ----------------------------------------------------- */

    if (
        path.startsWith(
            "/content/"
        )
    ) {

        requireMethod(
            request,
            ["GET"]
        );


        const contentId =
            path.replace(
                "/content/",
                ""
            );


        const content =
            await getContent(
                db,
                contentId
            );


        if (
            !content
        ) {

            const error =
                new Error(
                    "Content not found."
                );


            error.status =
                404;


            throw error;

        }


        /*
         * Do not expose removed content through the public
         * endpoint.
         */

        if (
            content.status ===
            "REMOVED"
        ) {

            const error =
                new Error(
                    "Content not available."
                );


            error.status =
                404;


            throw error;

        }


        return jsonResponse(
            {
                content
            }
        );

    }


    /* -----------------------------------------------------
       REPORT CONTENT
    ----------------------------------------------------- */

    if (
        path.startsWith(
            "/content/"
        ) &&
        path.endsWith(
            "/report"
        )
    ) {

        await requireRateLimit(
            db,
            request,
            "report"
        );


        requireMethod(
            request,
            ["POST"]
        );


        const auth =
            await authenticateRequest(
                db,
                request
            );


        const body =
            await readJsonBody(
                request
            );


        const contentId =
            path
                .replace(
                    "/content/",
                    ""
                )
                .replace(
                    "/report",
                    ""
                );


        const result =
            await reportContent(
                db,
                {

                    contentId,

                    reporterUserId:
                        auth?.userId ||
                        null,

                    reason:
                        body.reason,

                    details:
                        body.details

                }
            );


        return jsonResponse(
            result,
            {
                status: 201
            }
        );

    }


    /* -----------------------------------------------------
       BTC CONFIGURATION
    ----------------------------------------------------- */

    if (
        path === "/bitcoin/config"
    ) {

        requireMethod(
            request,
            ["GET"]
        );


        return jsonResponse(
            getBitcoinConfiguration(
                env
            )
        );

    }


    /* -----------------------------------------------------
       CLEANUP
    ----------------------------------------------------- */

    if (
        path === "/admin/cleanup"
    ) {

        requireMethod(
            request,
            ["POST"]
        );


        /*
         * This endpoint is intentionally disabled until
         * administrator authentication is implemented.
         */

        const error =
            new Error(
                "Administrator authentication is required."
            );


        error.status =
            403;


        throw error;

    }


    /* -----------------------------------------------------
       NOT FOUND
    ----------------------------------------------------- */

    const error =
        new Error(
            "API endpoint not found."
        );


    error.status =
        404;


    throw error;

}


/* =========================================================
   AUTH HELPER
========================================================= */

async function requireAuth(
    db,
    request
) {

    const auth =
        await authenticateRequest(
            db,
            request
        );


    if (!auth) {

        const error =
            new Error(
                "Authentication required."
            );


        error.status =
            401;


        throw error;

    }


    /*
     * Suspended/banned accounts cannot perform transactions.
     */

    const user =
        await db.prepare(
            `
            SELECT
                account_status
            FROM users
            WHERE id = ?
            LIMIT 1
            `
        )
        .bind(
            auth.userId
        )
        .first();


    if (
        !user ||
        user.account_status !==
        "ACTIVE"
    ) {

        const error =
            new Error(
                "This account is not active."
            );


        error.status =
            403;


        throw error;

    }


    return auth;

}


/* =========================================================
   PROJECT CONFIG
========================================================= */

async function getProjectConfig(
    db
) {

    const rows =
        await db.prepare(
            `
            SELECT
                key,
                value
            FROM project_config
            `
        )
        .all();


    const config = {};


    for (
        const row
        of rows.results || []
    ) {

        config[
            row.key
        ] =
            row.value;

    }


    /*
     * Do not expose secrets.
     */

    return {

        projectName:
            config.project_name,

        totalPixels:
            Number(
                config.total_pixels
            ),

        pixelPriceUsd:
            Number(
                config.pixel_price_usd
            ),

        paymentCurrency:
            config.payment_currency,

        ownershipPolicy:
            config.ownership_policy

    };

}


/* =========================================================
   REGISTER USER SAFELY
========================================================= */

async function registerUserSafely(
    db,
    body
) {

    const email =
        String(
            body.email || ""
        )
            .trim()
            .toLowerCase();


    const username =
        String(
            body.username || ""
        )
            .trim()
            .toLowerCase();


    const password =
        String(
            body.password || ""
        );


    const displayName =
        sanitizeText(
            body.displayName || "",
            100
        );


    /*
     * Import password hashing here so the credential is
     * inserted together with the account.
     */

    const {
        hashPassword
    } =
        await import(
            "./auth.js"
        );


    const passwordHash =
        await hashPassword(
            password
        );


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
            email,
            username
        )
        .first();


    if (
        existing
    ) {

        const error =
            new Error(
                "Email or username is already registered."
            );


        error.status =
            409;


        throw error;

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

            password_hash,

            account_status,

            email_verified,

            age_verified

        )

        VALUES (

            ?,

            ?,

            ?,

            ?,

            ?,

            'ACTIVE',

            0,

            0

        )
        `
    )
    .bind(

        userId,

        email,

        username,

        displayName,

        JSON.stringify(
            passwordHash
        )

    )
    .run();


    return {

        id:
            userId,

        email,

        username,

        displayName,

        emailVerified:
            false,

        ageVerified:
            false

    };

}


/* =========================================================
   CSRF HELPER
========================================================= */

async function createCsrfTokenForRequest(
    request
) {

    /*
     * The login response will later be updated to expose
     * a CSRF token derived from the new session token.
     *
     * For now the actual token generation is completed in
     * the authentication integration layer.
     */

    return null;

}


/* =========================================================
   EXPORT
========================================================= */

export {

    route

};
