"use strict";

/**
 * =========================================================
 * BILLION PIXEL CANVAS
 * CLOUDFLARE WORKER ENTRY POINT
 * =========================================================
 *
 * Responsibilities:
 *
 * - Receive HTTP requests
 * - Apply security controls
 * - Route API requests
 * - Serve basic health information
 * - Run scheduled maintenance
 *
 * =========================================================
 */

import {
    handleApi
} from "./api.js";

import {
    securityHeaders,
    corsHeaders,
    handleCorsPreflight,
    securityCheck
} from "./security.js";

import {
    runMaintenance
} from "./worker-cron.js";


/* =========================================================
   MAIN FETCH HANDLER
========================================================= */

async function handleRequest(
    request,
    env,
    ctx
) {

    const url =
        new URL(
            request.url
        );


    /* =====================================================
       OPTIONS / CORS PREFLIGHT
    ===================================================== */

    if (
        request.method.toUpperCase() ===
        "OPTIONS"
    ) {

        return handleCorsPreflight(
            request,
            env
        );

    }


    /* =====================================================
       HEALTH CHECK
    ===================================================== */

    if (
        url.pathname ===
        "/health"
    ) {

        return jsonResponse(

            {

                status:
                    "ok",

                service:
                    "billion-pixel-canvas",

                timestamp:
                    new Date()
                        .toISOString()

            }

        );

    }


    /* =====================================================
       API ROUTING
    ===================================================== */

    if (
        url.pathname.startsWith(
            "/api/"
        )
    ) {

        /*
         * Apply security checks before entering the API.
         *
         * CSRF token handling for authenticated browser
         * requests is completed by the frontend/API layer.
         */

        const security =
            await securityCheck(
                request,
                env
            );


        if (
            !security.allowed
        ) {

            return security.response;

        }


        const response =
            await handleApi(
                request,
                env,
                ctx
            );


        return addSecurityHeaders(
            response,
            request,
            env
        );

    }


    /* =====================================================
       NON-API RESPONSE
    ===================================================== */

    return new Response(
        "Billion Pixel Canvas API",
        {

            status:
                200,

            headers: {

                ...securityHeaders(),

                ...corsHeaders(
                    request,
                    env
                ),

                "Content-Type":
                    "text/plain; charset=utf-8"

            }

        }
    );

}


/* =========================================================
   RESPONSE SECURITY HEADERS
========================================================= */

function addSecurityHeaders(
    response,
    request,
    env
) {

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

            statusText:
                response.statusText,

            headers

        }
    );

}


/* =========================================================
   JSON RESPONSE
========================================================= */

function jsonResponse(
    data,
    status = 200
) {

    return new Response(

        JSON.stringify(
            data
        ),

        {

            status,

            headers: {

                ...securityHeaders(),

                "Content-Type":
                    "application/json; charset=utf-8",

                "Cache-Control":
                    "no-store"

            }

        }

    );

}


/* =========================================================
   CLOUDFLARE WORKER
========================================================= */

export default {

    async fetch(
        request,
        env,
        ctx
    ) {

        try {

            return await handleRequest(
                request,
                env,
                ctx
            );

        } catch (
            error
        ) {

            console.error(
                "Unhandled Worker error:",
                error
            );


            return jsonResponse(

                {

                    error:
                        "Internal server error."

                },

                500

            );

        }

    },


    async scheduled(
        event,
        env,
        ctx
    ) {

        /*
         * Cloudflare Cron invokes this handler.
         *
         * Keep the maintenance job alive for the complete
         * execution period.
         */

        ctx.waitUntil(

            runMaintenance(
                env,
                ctx
            )

        );

    }

};
