/**
 * =========================================================
 * BILLION PIXEL CANVAS
 * Cloudflare Worker / API
 * =========================================================
 *
 * IMPORTANT:
 *
 * This worker is the server-side foundation.
 *
 * It does NOT trust the browser to:
 * - determine ownership
 * - determine the final price
 * - mark pixels as sold
 * - verify Bitcoin payments
 *
 * Those operations must happen server-side.
 *
 * The database binding is added in the next step.
 * =========================================================
 */

const JSON_HEADERS = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
};


/* =========================================================
   RESPONSE HELPERS
========================================================= */

function json(data, status = 200, extraHeaders = {}) {

    return new Response(
        JSON.stringify(data),
        {
            status,
            headers: {
                ...JSON_HEADERS,
                ...extraHeaders
            }
        }
    );

}


function error(message, status = 400, code = "BAD_REQUEST") {

    return json(
        {
            ok: false,

            error: {
                code,
                message
            }
        },
        status
    );

}


function success(data = {}) {

    return json({
        ok: true,
        ...data
    });

}


/* =========================================================
   PROJECT CONFIGURATION
========================================================= */

function getConfig(env) {

    const totalPixels =
        Number(env.TOTAL_PIXELS || 1_000_000_000);

    const pixelPriceUsd =
        Number(env.PIXEL_PRICE_USD || 1);

    const btcAddress =
        String(
            env.BTC_RECEIVING_ADDRESS || ""
        ).trim();

    return {
        projectName:
            env.PROJECT_NAME ||
            "Billion Pixel Canvas",

        totalPixels,

        pixelPriceUsd,

        paymentCurrency:
            env.PAYMENT_CURRENCY ||
            "BTC",

        btcAddress
    };

}


/* =========================================================
   DISTRICT DEFINITIONS
========================================================= */

const DISTRICTS = Object.freeze({

    people: Object.freeze({
        id: "people",
        name: "People's District",
        minimumPixels: 1,
        adultOnly: false
    }),

    giants: Object.freeze({
        id: "giants",
        name: "Giants District",
        minimumPixels: 100000,
        adultOnly: false
    }),

    youth: Object.freeze({
        id: "youth",
        name: "Youth District",
        minimumPixels: 1,
        adultOnly: false
    }),

    adult: Object.freeze({
        id: "adult",
        name: "Adult District",
        minimumPixels: 100000,
        adultOnly: true
    })

});


/* =========================================================
   DISTRICT VALIDATION
========================================================= */

function getDistrict(id) {

    if (
        typeof id !== "string" ||
        !Object.prototype.hasOwnProperty.call(
            DISTRICTS,
            id
        )
    ) {

        return null;

    }

    return DISTRICTS[id];

}


/* =========================================================
   QUANTITY VALIDATION
========================================================= */

function validateQuantity(
    quantity,
    district,
    config
) {

    if (
        typeof quantity !== "number" ||
        !Number.isSafeInteger(quantity)
    ) {

        return {
            valid: false,
            message:
                "Pixel quantity must be a whole number."
        };

    }

    if (quantity < 1) {

        return {
            valid: false,
            message:
                "Minimum purchase is 1 pixel."
        };

    }

    if (
        quantity <
        district.minimumPixels
    ) {

        return {
            valid: false,
            message:
                `${district.name} requires a minimum purchase of ` +
                `${district.minimumPixels.toLocaleString()} pixels.`
        };

    }

    if (
        quantity >
        config.totalPixels
    ) {

        return {
            valid: false,
            message:
                "Requested quantity exceeds the total canvas size."
        };

    }

    return {
        valid: true
    };

}


/* =========================================================
   PRICE CALCULATION
========================================================= */

function calculatePriceUsd(
    quantity,
    config
) {

    /*
     * The browser is never trusted for this calculation.
     */

    return quantity *
        config.pixelPriceUsd;

}


/* =========================================================
   BTC ADDRESS VALIDATION
========================================================= */

function validateConfiguredBtcAddress(
    config
) {

    /*
     * This is intentionally basic.

     * A production implementation should validate the address
     * using a Bitcoin library appropriate to the supported
     * address/network format.
     */

    if (
        !config.btcAddress ||
        !config.btcAddress.startsWith("bc1")
    ) {

        return false;

    }

    return true;

}


/* =========================================================
   REQUEST BODY
========================================================= */

async function readJson(request) {

    try {

        return await request.json();

    } catch {

        return null;

    }

}


/* =========================================================
   DATABASE PLACEHOLDER
========================================================= */

function databaseAvailable(env) {

    return Boolean(
        env.DB
    );

}


/*
 * IMPORTANT:
 *
 * We deliberately do not create fake ownership here.
 *
 * A production purchase requires:
 *
 * 1. Database transaction
 * 2. Atomic pixel reservation
 * 3. Payment order
 * 4. BTC amount calculation
 * 5. Blockchain monitoring
 * 6. Confirmation policy
 * 7. Permanent ownership commit
 *
 * The database schema comes next.
 */


/* =========================================================
   GET PROJECT STATUS
========================================================= */

async function getStatus(env) {

    const config =
        getConfig(env);


    /*
     * Until the database is connected,
     * soldPixels is reported as zero rather than
     * pretending that frontend/localStorage data is real.
     */

    let soldPixels = 0;


    if (databaseAvailable(env)) {

        /*
         * Database query will be implemented after the schema
         * and D1 binding are added.
         *
         * We intentionally do not assume a schema yet.
         */

        try {

            const result =
                await env.DB.prepare(
                    `
                    SELECT COUNT(*) AS sold_pixels
                    FROM pixel_ownership
                    WHERE status = 'SOLD'
                    `
                ).first();

            soldPixels =
                Number(
                    result?.sold_pixels || 0
                );

        } catch (databaseError) {

            console.error(
                "Status database error:",
                databaseError
            );

            return error(
                "The ownership database is not ready.",
                503,
                "DATABASE_NOT_READY"
            );

        }

    }


    const availablePixels =
        Math.max(
            0,
            config.totalPixels -
            soldPixels
        );


    return success({

        project: {
            name:
                config.projectName,

            totalPixels:
                config.totalPixels,

            pixelPriceUsd:
                config.pixelPriceUsd,

            paymentCurrency:
                config.paymentCurrency
        },

        canvas: {

            soldPixels,

            availablePixels,

            completionPercent:
                (
                    soldPixels /
                    config.totalPixels
                ) *
                100

        },

        payment: {

            currency:
                config.paymentCurrency,

            configured:
                validateConfiguredBtcAddress(
                    config
                )

        }

    });

}


/* =========================================================
   CREATE ORDER
========================================================= */

async function createOrder(
    request,
    env
) {

    const config =
        getConfig(env);

    const body =
        await readJson(request);


    if (!body) {

        return error(
            "Invalid JSON request.",
            400,
            "INVALID_JSON"
        );

    }


    const district =
        getDistrict(
            body.district
        );


    if (!district) {

        return error(
            "Invalid district.",
            400,
            "INVALID_DISTRICT"
        );

    }


    const quantity =
        Number(
            body.quantity
        );


    const quantityValidation =
        validateQuantity(
            quantity,
            district,
            config
        );


    if (!quantityValidation.valid) {

        return error(
            quantityValidation.message,
            400,
            "INVALID_QUANTITY"
        );

    }


    if (
        !validateConfiguredBtcAddress(
            config
        )
    ) {

        return error(
            "Bitcoin payment configuration is incomplete.",
            503,
            "PAYMENT_NOT_CONFIGURED"
        );

    }


    /*
     * The production order creation must happen atomically
     * with the pixel reservation.
     *
     * We will implement this after adding the D1 schema.
     */

    if (!databaseAvailable(env)) {

        return error(
            "Ownership database is not connected.",
            503,
            "DATABASE_NOT_CONFIGURED"
        );

    }


    const priceUsd =
        calculatePriceUsd(
            quantity,
            config
        );


    /*
     * DO NOT mark pixels as sold here.
     *
     * At this stage they must be reserved temporarily.
     *
     * The server must allocate actual coordinates through
     * an atomic database operation.
     */


    return success({

        status:
            "ORDER_PIPELINE_READY",

        order: {

            quantity,

            district:
                district.id,

            districtName:
                district.name,

            priceUsd,

            paymentCurrency:
                config.paymentCurrency,

            receivingAddress:
                config.btcAddress

        },

        message:
            "Order validation succeeded. " +
            "Atomic reservation and Bitcoin invoice creation " +
            "will be completed by the production payment layer."

    });

}


/* =========================================================
   ROUTE HANDLER
========================================================= */

async function handleApi(
    request,
    env,
    url
) {

    const method =
        request.method.toUpperCase();

    const pathname =
        url.pathname;


    /* -----------------------------------------------------
       GET /api/health
    ----------------------------------------------------- */

    if (
        pathname === "/api/health" &&
        method === "GET"
    ) {

        return success({

            service:
                "billion-pixel-canvas-api",

            status:
                "online",

            version:
                "1.0.0"

        });

    }


    /* -----------------------------------------------------
       GET /api/status
    ----------------------------------------------------- */

    if (
        pathname === "/api/status" &&
        method === "GET"
    ) {

        return getStatus(env);

    }


    /* -----------------------------------------------------
       GET /api/districts
    ----------------------------------------------------- */

    if (
        pathname === "/api/districts" &&
        method === "GET"
    ) {

        return success({

            districts:
                Object.values(
                    DISTRICTS
                )

        });

    }


    /* -----------------------------------------------------
       POST /api/orders
    ----------------------------------------------------- */

    if (
        pathname === "/api/orders" &&
        method === "POST"
    ) {

        return createOrder(
            request,
            env
        );

    }


    return error(
        "API endpoint not found.",
        404,
        "NOT_FOUND"
    );

}


/* =========================================================
   CORS
========================================================= */

function addCorsHeaders(
    response,
    request
) {

    const origin =
        request.headers.get(
            "Origin"
        );


    /*
     * During development we allow the browser to communicate
     * with the API.
     *
     * Before production, replace this with your exact
     * production website origin.
     */

    const allowedOrigin =
        origin || "*";


    const headers =
        new Headers(
            response.headers
        );

    headers.set(
        "Access-Control-Allow-Origin",
        allowedOrigin
    );

    headers.set(
        "Access-Control-Allow-Methods",
        "GET,POST,OPTIONS"
    );

    headers.set(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization"
    );

    headers.set(
        "Vary",
        "Origin"
    );


    return new Response(
        response.body,
        {
            status:
                response.status,

            statusText:
                response.statusText,

            headers
        }
    );

}


/* =========================================================
   STATIC ASSET HANDLER
========================================================= */

async function serveStaticAsset(
    request,
    env
) {

    /*
     * Cloudflare's Assets binding serves index.html,
     * styles.css, app.js and other static files.
     */

    if (
        !env.ASSETS
    ) {

        return new Response(
            "Billion Pixel Canvas",
            {
                status: 200,
                headers: {
                    "Content-Type":
                        "text/plain; charset=utf-8"
                }
            }
        );

    }


    return env.ASSETS.fetch(
        request
    );

}


/* =========================================================
   MAIN FETCH HANDLER
========================================================= */

export default {

    async fetch(
        request,
        env
    ) {

        const url =
            new URL(
                request.url
            );


        /* -------------------------------------------------
           CORS preflight
        ------------------------------------------------- */

        if (
            request.method ===
            "OPTIONS"
        ) {

            return new Response(
                null,
                {
                    status: 204,

                    headers: {
                        "Access-Control-Allow-Origin":
                            request.headers.get("Origin") || "*",

                        "Access-Control-Allow-Methods":
                            "GET,POST,OPTIONS",

                        "Access-Control-Allow-Headers":
                            "Content-Type, Authorization",

                        "Access-Control-Max-Age":
                            "86400"
                    }
                }
            );

        }


        /* -------------------------------------------------
           API
        ------------------------------------------------- */

        if (
            url.pathname.startsWith(
                "/api/"
            )
        ) {

            try {

                const response =
                    await handleApi(
                        request,
                        env,
                        url
                    );

                return addCorsHeaders(
                    response,
                    request
                );

            } catch (serverError) {

                console.error(
                    "Unhandled API error:",
                    serverError
                );

                return error(
                    "Internal server error.",
                    500,
                    "INTERNAL_SERVER_ERROR"
                );

            }

        }


        /* -------------------------------------------------
           Static website
        ------------------------------------------------- */

        try {

            return await serveStaticAsset(
                request,
                env
            );

        } catch (assetError) {

            console.error(
                "Asset error:",
                assetError
            );

            return new Response(
                "Unable to load website.",
                {
                    status: 500
                }
            );

        }

    }

};
