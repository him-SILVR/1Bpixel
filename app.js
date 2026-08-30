"use strict";

import {
    getPublicConfig
} from "./config.js";

import {
    getCanvasStatistics,
    getPixelState,
    findOwnershipAt
} from "./allocator.js";

import {
    createOrder,
    getOrderStatus,
    cancelOrder
} from "./orders.js";

import {
    createBitcoinQuote,
    attachBitcoinQuoteToOrder,
    getBitcoinPaymentStatus,
    verifyBitcoinPayment
} from "./bitcoin.js";

import {
    createContent,
    getContent,
    listOwnershipContent,
    publishContent,
    hideContent,
    reportContent
} from "./content.js";


/* =========================================================
   API ROUTER
========================================================= */

export async function handleApi(
    request,
    env,
    ctx
) {

    const url =
        new URL(
            request.url
        );


    const path =
        url.pathname
            .replace(
                /^\/api\/?/,
                ""
            )
            .replace(
                /\/+$/,
                ""
            );


    const method =
        request.method.toUpperCase();


    try {

        /*
         * Public configuration.
         */

        if (
            method === "GET" &&
            path === "config"
        ) {

            return json(
                getPublicConfig()
            );

        }


        /*
         * Canvas statistics.
         */

        if (
            method === "GET" &&
            path === "canvas/stats"
        ) {

            const stats =
                await getCanvasStatistics(
                    env.DB
                );


            return json(
                stats
            );

        }


        /*
         * Pixel lookup.
         *
         * /api/pixel/123
         */

        const pixelMatch =
            path.match(
                /^pixel\/(\d+)$/
            );


        if (
            method === "GET" &&
            pixelMatch
        ) {

            const pixelId =
                Number(
                    pixelMatch[1]
                );


            const pixel =
                await getPixelState(
                    env.DB,
                    pixelId
                );


            return json(
                sanitizePixel(
                    pixel
                )
            );

        }


        /*
         * Coordinate ownership lookup.
         *
         * /api/ownership/main/100/200
         */

        const coordinateMatch =
            path.match(
                /^ownership\/([^/]+)\/(\d+)\/(\d+)$/
            );


        if (
            method === "GET" &&
            coordinateMatch
        ) {

            const districtId =
                decodeURIComponent(
                    coordinateMatch[1]
                );


            const x =
                Number(
                    coordinateMatch[2]
                );


            const y =
                Number(
                    coordinateMatch[3]
                );


            const ownership =
                await findOwnershipAt(
                    env.DB,
                    districtId,
                    x,
                    y
                );


            return json(
                ownership
                    ? sanitizeOwnership(
                        ownership
                    )
                    : null
            );

        }


        /*
         * Create order.
         *
         * POST /api/orders
         *
         * Body:
         *
         * {
         *   "districtId": "main",
         *   "quantity": 10
         * }
         */

        if (
            method === "POST" &&
            path === "orders"
        ) {

            const user =
                await requireUser(
                    request,
                    env
                );


            const body =
                await readJson(
                    request
                );


            const order =
                await createOrder(
                    env.DB,
                    {

                        userId:
                            user.id,

                        districtId:
                            body.districtId,

                        quantity:
                            body.quantity

                    }
                );


            /*
             * Generate BTC quote using the server-side USD
             * order total.
             */

            const quote =
                await createBitcoinQuote(
                    order.priceUsd,
                    env
                );


            await attachBitcoinQuoteToOrder(
                env.DB,
                {

                    orderId:
                        order.id,

                    quote

                }
            );


            return json({

                orderId:
                    order.id,

                quantity:
                    order.quantity,

                priceUsd:
                    order.priceUsd,

                pricePerPixelUsd:
                    1,

                paymentCurrency:
                    "BTC",

                bitcoinAmount:
                    quote.btcAmount,

                bitcoinAmountSatoshis:
                    quote.btcAmountSatoshis,

                paymentAddress:
                    quote.paymentAddress,

                btcUsdRate:
                    quote.btcUsdRate,

                quoteExpiresAt:
                    quote.expiresAt

            }, 201);

        }


        /*
         * Get order.
         *
         * GET /api/orders/:id
         */

        const orderMatch =
            path.match(
                /^orders\/([^/]+)$/
            );


        if (
            method === "GET" &&
            orderMatch
        ) {

            const user =
                await requireUser(
                    request,
                    env
                );


            const orderId =
                decodeURIComponent(
                    orderMatch[1]
                );


            const result =
                await getOrderStatus(
                    env.DB,
                    orderId
                );


            if (!result) {

                return json(
                    {
                        error:
                            "Order not found."
                    },
                    404
                );

            }


            if (
                result.order.user_id !==
                user.id
            ) {

                return json(
                    {
                        error:
                            "Access denied."
                    },
                    403
                );

            }


            return json(
                sanitizeOrder(
                    result
                )
            );

        }


        /*
         * Cancel order.
         *
         * POST /api/orders/:id/cancel
         */

        const cancelMatch =
            path.match(
                /^orders\/([^/]+)\/cancel$/
            );


        if (
            method === "POST" &&
            cancelMatch
        ) {

            const user =
                await requireUser(
                    request,
                    env
                );


            const orderId =
                decodeURIComponent(
                    cancelMatch[1]
                );


            const existing =
                await getOrderStatus(
                    env.DB,
                    orderId
                );


            if (!existing) {

                return json(
                    {
                        error:
                            "Order not found."
                    },
                    404
                );

            }


            if (
                existing.order.user_id !==
                user.id
            ) {

                return json(
                    {
                        error:
                            "Access denied."
                    },
                    403
                );

            }


            const result =
                await cancelOrder(
                    env.DB,
                    orderId
                );


            return json(
                result
            );

        }


        /*
         * Get Bitcoin payment status.
         *
         * GET /api/orders/:id/payment
         */

        const paymentMatch =
            path.match(
                /^orders\/([^/]+)\/payment$/
            );


        if (
            method === "GET" &&
            paymentMatch
        ) {

            const user =
                await requireUser(
                    request,
                    env
                );


            const orderId =
                decodeURIComponent(
                    paymentMatch[1]
                );


            const order =
                await getOrderStatus(
                    env.DB,
                    orderId
                );


            if (!order) {

                return json(
                    {
                        error:
                            "Order not found."
                    },
                    404
                );

            }


            if (
                order.order.user_id !==
                user.id
            ) {

                return json(
                    {
                        error:
                            "Access denied."
                    },
                    403
                );

            }


            const payment =
                await getBitcoinPaymentStatus(
                    env.DB,
                    orderId
                );


            return json(
                payment
            );

        }


        /*
         * Verify Bitcoin payment.
         *
         * The transaction ID is optional.
         *
         * The server independently verifies the blockchain
         * transaction and receiving address.
         */

        const verifyPaymentMatch =
            path.match(
                /^orders\/([^/]+)\/verify-payment$/
            );


        if (
            method === "POST" &&
            verifyPaymentMatch
        ) {

            const user =
                await requireUser(
                    request,
                    env
                );


            const orderId =
                decodeURIComponent(
                    verifyPaymentMatch[1]
                );


            const order =
                await getOrderStatus(
                    env.DB,
                    orderId
                );


            if (!order) {

                return json(
                    {
                        error:
                            "Order not found."
                    },
                    404
                );

            }


            if (
                order.order.user_id !==
                user.id
            ) {

                return json(
                    {
                        error:
                            "Access denied."
                    },
                    403
                );

            }


            const body =
                await readJson(
                    request,
                    true
                );


            const payment =
                await verifyBitcoinPayment(
                    env.DB,
                    env,
                    {

                        orderId,

                        transactionId:
                            body?.transactionId ||
                            null

                    }
                );


            /*
             * When payment is fully confirmed, permanently
             * finalize ownership.
             */

            if (
                payment.status ===
                "CONFIRMED"
            ) {

                const {
                    completePaidOrder
                } = await import(
                    "./orders.js"
                );


                await completePaidOrder(
                    env.DB,
                    orderId
                );

            }


            return json(
                payment
            );

        }


        /*
         * Create content.
         *
         * POST /api/content
         */

        if (
            method === "POST" &&
            path === "content"
        ) {

            const user =
                await requireUser(
                    request,
                    env
                );


            const body =
                await readJson(
                    request
                );


            const result =
                await createContent(
                    env.DB,
                    {

                        ownershipId:
                            body.ownershipId,

                        userId:
                            user.id,

                        content:
                            body.content

                    }
                );


            return json(
                sanitizeContent(
                    result
                ),
                201
            );

        }


        /*
         * Get content.
         *
         * GET /api/content/:id
         */

        const contentMatch =
            path.match(
                /^content\/([^/]+)$/
            );


        if (
            method === "GET" &&
            contentMatch
        ) {

            const contentId =
                decodeURIComponent(
                    contentMatch[1]
                );


            const content =
                await getContent(
                    env.DB,
                    contentId
                );


            if (!content) {

                return json(
                    {
                        error:
                            "Content not found."
                    },
                    404
                );

            }


            return json(
                sanitizeContent(
                    content
                )
            );

        }


        /*
         * Publish content.
         */

        const publishMatch =
            path.match(
                /^content\/([^/]+)\/publish$/
            );


        if (
            method === "POST" &&
            publishMatch
        ) {

            const user =
                await requireUser(
                    request,
                    env
                );


            const contentId =
                decodeURIComponent(
                    publishMatch[1]
                );


            const result =
                await publishContent(
                    env.DB,
                    {

                        contentId,

                        userId:
                            user.id

                    }
                );


            return json(
                sanitizeContent(
                    result
                )
            );

        }


        /*
         * Hide content.
         */

        const hideMatch =
            path.match(
                /^content\/([^/]+)\/hide$/
            );


        if (
            method === "POST" &&
            hideMatch
        ) {

            const user =
                await requireUser(
                    request,
                    env
                );


            const contentId =
                decodeURIComponent(
                    hideMatch[1]
                );


            const result =
                await hideContent(
                    env.DB,
                    {

                        contentId,

                        userId:
                            user.id

                    }
                );


            return json(
                sanitizeContent(
                    result
                )
            );

        }


        /*
         * List content belonging to an ownership record.
         */

        const ownershipContentMatch =
            path.match(
                /^ownership\/([^/]+)\/content$/
            );


        if (
            method === "GET" &&
            ownershipContentMatch
        ) {

            const ownershipId =
                decodeURIComponent(
                    ownershipContentMatch[1]
                );


            const result =
                await listOwnershipContent(
                    env.DB,
                    ownershipId
                );


            return json(
                result.results.map(
                    sanitizeContent
                )
            );

        }


        /*
         * Report content.
         */

        const reportMatch =
            path.match(
                /^content\/([^/]+)\/report$/
            );


        if (
            method === "POST" &&
            reportMatch
        ) {

            const user =
                await optionalUser(
                    request,
                    env
                );


            const body =
                await readJson(
                    request
                );


            const result =
                await reportContent(
                    env.DB,
                    {

                        contentId:
                            decodeURIComponent(
                                reportMatch[1]
                            ),

                        reporterUserId:
                            user?.id ||
                            null,

                        reason:
                            body.reason,

                        details:
                            body.details

                    }
                );


            return json(
                result,
                201
            );

        }


        return json(
            {
                error:
                    "API endpoint not found."
            },
            404
        );


    } catch (
        error
    ) {

        console.error(
            "API error:",
            error
        );


        const status =
            Number(
                error.status
            ) ||
            400;


        return json(
            {
                error:
                    error.message ||
                    "Request failed."
            },
            status
        );

    }

}


/* =========================================================
   AUTH HELPERS
========================================================= */

async function requireUser(
    request,
    env
) {

    const {
        getAuthenticatedUser
    } = await import(
        "./auth.js"
    );


    const user =
        await getAuthenticatedUser(
            request,
            env
        );


    if (!user) {

        const error =
            new Error(
                "Authentication required."
            );


        error.status =
            401;


        throw error;

    }


    return user;

}


async function optionalUser(
    request,
    env
) {

    try {

        const {
            getAuthenticatedUser
        } = await import(
            "./auth.js"
        );


        return await getAuthenticatedUser(
            request,
            env
        );

    } catch {

        return null;

    }

}


/* =========================================================
   JSON BODY
========================================================= */

async function readJson(
    request,
    optional = false
) {

    const contentType =
        request.headers.get(
            "content-type"
        ) ||
        "";


    if (
        !contentType
            .toLowerCase()
            .includes(
                "application/json"
            )
    ) {

        if (
            optional
        ) {

            return {};

        }


        const error =
            new Error(
                "Request must use application/json."
            );


        error.status =
            415;


        throw error;

    }


    try {

        return await request.json();

    } catch {

        const error =
            new Error(
                "Invalid JSON request body."
            );


        error.status =
            400;


        throw error;

    }

}


/* =========================================================
   PIXEL SANITIZATION
========================================================= */

function sanitizePixel(
    pixel
) {

    if (!pixel) {

        return null;

    }


    return {

        pixelId:
            pixel.pixelId,

        x:
            pixel.x,

        y:
            pixel.y,

        districtId:
            pixel.districtId,

        status:
            pixel.status,

        /*
         * Do not expose another user's internal IDs through
         * a public pixel lookup.
         */

        owned:
            pixel.status === "SOLD"

    };

}


/* =========================================================
   OWNERSHIP SANITIZATION
========================================================= */

function sanitizeOwnership(
    ownership
) {

    if (!ownership) {

        return null;

    }


    return {

        id:
            ownership.id,

        pixelId:
            ownership.pixel_id,

        districtId:
            ownership.district_id,

        x:
            ownership.x,

        y:
            ownership.y,

        status:
            ownership.status,

        createdAt:
            ownership.created_at

    };

}


/* =========================================================
   ORDER SANITIZATION
========================================================= */

function sanitizeOrder(
    result
) {

    return {

        order: {

            id:
                result.order.id,

            quantity:
                result.order.quantity,

            priceUsd:
                result.order.price_usd,

            paymentCurrency:
                result.order.payment_currency,

            status:
                result.order.status,

            createdAt:
                result.order.created_at,

            completedAt:
                result.order.completed_at

        },

        allocation:
            result.allocation.map(
                pixel => ({

                    pixelId:
                        pixel.pixel_id,

                    districtId:
                        pixel.district_id,

                    x:
                        pixel.x,

                    y:
                        pixel.y,

                    status:
                        pixel.status

                })
            ),

        payment:
            result.payment
                ? {

                    status:
                        result.payment.status,

                    paymentAddress:
                        result.payment.payment_address,

                    expectedSatoshis:
                        result.payment.expected_satoshis,

                    receivedSatoshis:
                        result.payment.received_satoshis,

                    transactionId:
                        result.payment.transaction_id,

                    confirmations:
                        result.payment.confirmation_count

                }
                : null

    };

}


/* =========================================================
   CONTENT SANITIZATION
========================================================= */

function sanitizeContent(
    content
) {

    if (!content) {

        return null;

    }


    return {

        id:
            content.id,

        ownershipId:
            content.ownershipId,

        contentType:
            content.contentType,

        title:
            content.title,

        description:
            content.description,

        imageUrl:
            content.imageUrl,

        externalUrl:
            content.externalUrl,

        altText:
            content.altText,

        isAdultContent:
            Boolean(
                content.isAdultContent
            ),

        status:
            content.status,

        district:
            content.district,

        createdAt:
            content.createdAt,

        publishedAt:
            content.publishedAt

    };

}


/* =========================================================
   RESPONSE
========================================================= */

function json(
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

                "Content-Type":
                    "application/json; charset=utf-8",

                "Cache-Control":
                    "no-store"

            }

        }

    );

}
