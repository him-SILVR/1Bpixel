"use strict";

/**
 * =========================================================
 * BILLION PIXEL CANVAS
 * CLOUDFLARE CRON WORKER
 * =========================================================
 *
 * This worker periodically checks pending Bitcoin payments.
 *
 * Flow:
 *
 * Buyer creates order
 *       ↓
 * BTC quote generated
 *       ↓
 * Buyer sends BTC
 *       ↓
 * Cron checks blockchain
 *       ↓
 * Payment confirmed
 *       ↓
 * Order marked PAID
 *       ↓
 * Pixels become permanently SOLD
 *
 * IMPORTANT:
 *
 * This worker never changes the $1 USD pixel price.
 *
 * It only verifies payment against the already-created
 * order quote.
 */

import {
    verifyBitcoinPayment
} from "./bitcoin.js";

import {
    completePaidOrder
} from "./orders.js";


/* =========================================================
   CRON CONFIGURATION
========================================================= */

const MAX_ORDERS_PER_RUN =
    50;


/*
 * Only process orders that have recently been active.
 *
 * This prevents a single cron execution from scanning an
 * unlimited number of records.
 */

const MAX_ORDER_AGE_HOURS =
    48;


/* =========================================================
   CRON ENTRY POINT
========================================================= */

export async function runBitcoinPaymentMonitor(
    env,
    ctx
) {

    if (
        !env?.DB
    ) {

        throw new Error(
            "D1 database binding is missing."
        );

    }


    const orders =
        await getPendingPaymentOrders(
            env.DB
        );


    const results = [];


    for (
        const order
        of orders
    ) {

        try {

            const payment =
                await verifyBitcoinPayment(
                    env.DB,
                    env,
                    {

                        orderId:
                            order.id

                    }
                );


            /*
             * Once blockchain payment is sufficiently confirmed,
             * permanently complete the order.
             */

            if (
                payment.status ===
                "CONFIRMED"
            ) {

                const completed =
                    await completePaidOrder(
                        env.DB,
                        order.id
                    );


                results.push({

                    orderId:
                        order.id,

                    status:
                        "COMPLETED",

                    payment,

                    completed

                });


                continue;

            }


            results.push({

                orderId:
                    order.id,

                status:
                    payment.status,

                confirmations:
                    payment.confirmations ||
                    0

            });

        } catch (
            error
        ) {

            /*
             * One broken order must never stop the entire
             * monitoring cycle.
             */

            console.error(
                "Bitcoin payment monitor error:",
                order.id,
                error
            );


            results.push({

                orderId:
                    order.id,

                status:
                    "ERROR",

                error:
                    error.message

            });

        }

    }


    return {

        processed:
            orders.length,

        results

    };

}


/* =========================================================
   GET PENDING ORDERS
========================================================= */

async function getPendingPaymentOrders(
    db
) {

    const rows =
        await db.prepare(
            `
            SELECT

                id,

                user_id,

                quantity,

                price_usd,

                btc_amount_satoshis,

                payment_address,

                status,

                created_at,

                updated_at

            FROM orders

            WHERE status IN (

                'PAYMENT_PENDING',

                'CONFIRMING',

                'UNDERPAID'

            )

            AND created_at >=
                datetime(
                    'now',
                    ?
                )

            ORDER BY created_at ASC

            LIMIT ?
            `
        )
        .bind(

            `-${MAX_ORDER_AGE_HOURS} hours`,

            MAX_ORDERS_PER_RUN

        )
        .all();


    return (
        rows.results ||
        []
    );

}


/* =========================================================
   CLEAN EXPIRED ORDERS
========================================================= */

export async function expireOldOrders(
    env
) {

    const db =
        env.DB;


    /*
     * Expired orders must not become sold.
     *
     * Their reservations can be released.
     */

    const rows =
        await db.prepare(
            `
            SELECT
                id
            FROM orders

            WHERE status IN (
                'RESERVED',
                'PAYMENT_PENDING',
                'CONFIRMING'
            )

            AND created_at <
                datetime(
                    'now',
                    '-24 hours'
                )

            LIMIT 100
            `
        )
        .all();


    const orders =
        rows.results ||
        [];


    const released = [];


    const {
        releaseReservations
    } = await import(
        "./allocator.js"
    );


    for (
        const order
        of orders
    ) {

        try {

            await releaseReservations(
                db,
                order.id
            );


            await db.prepare(
                `
                UPDATE orders

                SET

                    status =
                        'EXPIRED',

                    updated_at =
                        CURRENT_TIMESTAMP

                WHERE id = ?

                  AND status IN (
                      'RESERVED',
                      'PAYMENT_PENDING',
                      'CONFIRMING'
                  )
                `
            )
            .bind(
                order.id
            )
            .run();


            released.push(
                order.id
            );

        } catch (
            error
        ) {

            console.error(
                "Unable to expire order:",
                order.id,
                error
            );

        }

    }


    return {

        expired:
            released.length,

        orders:
            released

    };

}


/* =========================================================
   CLEAN OLD SESSIONS
========================================================= */

export async function cleanExpiredSessions(
    env
) {

    const result =
        await env.DB.prepare(
            `
            DELETE FROM sessions

            WHERE expires_at <=
                CURRENT_TIMESTAMP
            `
        )
        .run();


    return {

        deleted:
            result.meta?.changes ||
            0

    };

}


/* =========================================================
   CLEAN OLD VERIFICATION TOKENS
========================================================= */

export async function cleanExpiredTokens(
    env
) {

    const results =
        await env.DB.batch([

            env.DB.prepare(
                `
                DELETE FROM email_verification_tokens

                WHERE expires_at <=
                    CURRENT_TIMESTAMP

                   OR used_at IS NOT NULL
                `
            ),

            env.DB.prepare(
                `
                DELETE FROM password_reset_tokens

                WHERE expires_at <=
                    CURRENT_TIMESTAMP

                   OR used_at IS NOT NULL
                `
            )

        ]);


    return {

        emailTokensDeleted:
            results[0]
                ?.meta
                ?.changes ||
            0,

        passwordTokensDeleted:
            results[1]
                ?.meta
                ?.changes ||
            0

    };

}


/* =========================================================
   FULL MAINTENANCE
========================================================= */

export async function runMaintenance(
    env,
    ctx
) {

    const paymentResult =
        await runBitcoinPaymentMonitor(
            env,
            ctx
        );


    const expiryResult =
        await expireOldOrders(
            env
        );


    const sessionResult =
        await cleanExpiredSessions(
            env
        );


    const tokenResult =
        await cleanExpiredTokens(
            env
        );


    return {

        payments:
            paymentResult,

        expiredOrders:
            expiryResult,

        expiredSessions:
            sessionResult,

        expiredTokens:
            tokenResult

    };

}


/* =========================================================
   CLOUDFLARE WORKER HANDLER
========================================================= */

export default {

    async scheduled(
        event,
        env,
        ctx
    ) {

        /*
         * waitUntil keeps the scheduled execution alive while
         * the maintenance operation runs.
         */

        ctx.waitUntil(
            runMaintenance(
                env,
                ctx
            )
        );

    }

};
