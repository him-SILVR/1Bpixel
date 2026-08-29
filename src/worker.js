/**
 * =========================================================
 * BILLION PIXEL CANVAS
 * Cloudflare Worker Entry Point
 * =========================================================
 *
 * Request flow:
 *
 * Browser
 *    ↓
 * Cloudflare Worker
 *    ↓
 * /api/*  → API router
 * /       → Canvas application
 * other   → Static assets
 *
 * =========================================================
 */

"use strict";


import { handleApi } from "./api.js";

import {
    securityHeaders,
    corsHeaders
} from "./security.js";


/* =========================================================
   WORKER
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

        } catch (error) {

            console.error(
                "Worker error:",
                error
            );


            return new Response(
                JSON.stringify({

                    error:
                        "Internal server error."

                }),
                {

                    status:
                        500,

                    headers: {

                        "Content-Type":
                            "application/json; charset=utf-8",

                        ...securityHeaders(),

                        ...corsHeaders(
                            request,
                            env
                        )

                    }

                }
            );

        }

    }

};


/* =========================================================
   REQUEST HANDLER
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


    /*
     * API requests.
     */

    if (
        url.pathname === "/api" ||
        url.pathname.startsWith(
            "/api/"
        )
    ) {

        return handleApi(
            request,
            env,
            ctx
        );

    }


    /*
     * Health endpoint.
     *
     * Useful for Cloudflare deployment checks.
     */

    if (
        url.pathname === "/health"
    ) {

        return new Response(
            JSON.stringify({

                ok:
                    true,

                service:
                    "Billion Pixel Canvas",

                timestamp:
                    new Date().toISOString()

            }),
            {

                status:
                    200,

                headers: {

                    "Content-Type":
                        "application/json; charset=utf-8",

                    ...securityHeaders()

                }

            }
        );

    }


    /*
     * Everything else is handled by Cloudflare's static
     * asset layer.
     */

    return serveStaticAsset(
        request,
        env,
        ctx
    );

}


/* =========================================================
   STATIC ASSETS
========================================================= */

async function serveStaticAsset(
    request,
    env,
    ctx
) {

    /*
     * Cloudflare Workers with an ASSETS binding expose the
     * uploaded website through env.ASSETS.
     *
     * The exact binding is configured in wrangler.toml.
     */

    if (
        env.ASSETS &&
        typeof env.ASSETS.fetch ===
            "function"
    ) {

        return env.ASSETS.fetch(
            request
        );

    }


    /*
     * If ASSETS isn't configured, return a clear error
     * rather than silently failing.
     */

    return new Response(
        "Billion Pixel Canvas static assets are not configured.",
        {

            status:
                503,

            headers: {

                "Content-Type":
                    "text/plain; charset=utf-8",

                ...securityHeaders()

            }

        }
    );

}
