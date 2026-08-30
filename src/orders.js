"use strict";

/**
 * =========================================================
 * BILLION PIXEL CANVAS
 * ORDER + PURCHASE ENGINE
 * =========================================================
 *
 * PRICE:
 *
 *     $1 USD = 1 pixel
 *
 * There is:
 *
 *     - no resale
 *     - no auction
 *     - no price increase
 *     - no maximum purchase quantity
 *
 * Once a pixel is SOLD, it remains SOLD permanently.
 *
 * =========================================================
 */

import {
    PRICING
} from "./config.js";

import {
    reservePixels,
    releaseReservations,
    sellOrderPixels
} from "./allocator.js";

import {
    getDistrict
} from "./coordinates.js";


/* =========================================================
   ORDER STATES
========================================================= */

export const ORDER_STATUS =
    Object.freeze({

        RESERVED:
            "RESERVED",

        PAYMENT_PENDING:
            "PAYMENT_PENDING",

        CONFIRMING:
            "CONFIRMING",

        UNDERPAID:
            "UNDERPAID",

        PAID:
            "PAID",

        COMPLETED:
            "COMPLETED",

        CANCELLED:
            "CANCELLED",

        EXPIRED:
            "EXPIRED"

    });


/* =========================================================
   CREATE ORDER
========================================================= */

export async function createOrder(
    db,
    {
        userId,
        districtId,
        quantity
    }
) {

    if (!userId) {

        throw new Error(
            "User ID is required."
        );

    }


    const district =
        getDistrict(
            districtId
        );


    if (!district) {

        throw new Error(
            "Invalid district."
        );

    }


    const amount =
        Number(
            quantity
        );


    /*
     * Minimum is always one pixel.
     *
     * There is intentionally no maximum purchase limit.
     */

    if (
        !Number.isSafeInteger(
            amount
        ) ||
        amount < 1
    ) {

        throw new Error(
            "You must purchase at least 1 pixel."
        );

    }


    /*
     * Adult District has a minimum purchase of 100,000.
     */

    if (
        district.adultOnly &&
        amount <
            district.minimumPixels
    ) {

        throw new Error(
            `The ${district.name} requires a minimum purchase of ${district.minimumPixels.toLocaleString()} pixels.`
        );

    }


    /*
     * The price is calculated server-side.
     *
     * Browser-supplied price is never trusted.
     */

    const priceUsd =
        amount *
        PRICING.pricePerPixelUsd;


    if (
        !Number.isSafeInteger(
            priceUsd
        )
    ) {

        throw new Error(
            "Order value is outside supported limits."
        );

    }


    const orderId =
        `order_${crypto.randomUUID()}`;


    /*
     * Create order first.
     */

    await db.prepare(
        `
        INSERT INTO orders (

            id,

            user_id,

            district_id,

            quantity,

            price_usd,

            payment_currency,

            status,

            created_at,

            updated_at

        )

        VALUES (

            ?,

            ?,

            ?,

            ?,

            ?,

            'BTC',

            'RESERVED',

            CURRENT_TIMESTAMP,

            CURRENT_TIMESTAMP

        )
        `
    )
    .bind(

        orderId,

        userId,

        district.id,

        amount,

        priceUsd

    )
    .run();


    /*
     * Reserve the requested pixels.
     *
     * Reservations are temporary.
     */

    let allocation;


    try {

        allocation =
            await reservePixels(
                db,
                {

                    districtId:
                        district.id,

                    quantity:
                        amount,

                    orderId,

                    userId

                }
            );

    } catch (
        error
    ) {

        await db.prepare(
            `
            UPDATE orders

            SET

                status =
                    'CANCELLED',

                updated_at =
                    CURRENT_TIMESTAMP

            WHERE id = ?
            `
        )
        .bind(
            orderId
        )
        .run();


        throw error;

    }


    /*
     * Store reservation records.
     */

    for (
        const pixel
        of allocation
    ) {

        await db.prepare(
            `
            INSERT INTO pixel_reservations (

                id,

                order_id,

                user_id,

                pixel_id,

                district_id,

                status,

                created_at,

                updated_at

            )

            VALUES (

                ?,

                ?,

                ?,

                ?,

                ?,

                'RESERVED',

                CURRENT_TIMESTAMP,

                CURRENT_TIMESTAMP

            )
            `
        )
        .bind(

            `reservation_${crypto.randomUUID()}`,

            orderId,

            userId,

            pixel.pixelId,

            district.id

        )
        .run();

    }


    await db.prepare(
        `
        UPDATE orders

        SET

            status =
                'RESERVED',

            updated_at =
                CURRENT_TIMESTAMP

        WHERE id = ?
        `
    )
    .bind(
        orderId
    )
    .run();


    return {

        id:
            orderId,

        userId,

        districtId:
            district.id,

        quantity:
            amount,

        priceUsd,

        pricePerPixelUsd:
            PRICING.pricePerPixelUsd,

        paymentCurrency:
            "BTC",

        status:
            ORDER_STATUS.RESERVED,

        allocation

    };

}


/* =========================================================
   GET ORDER STATUS
========================================================= */

export async function getOrderStatus(
    db,
    orderId
) {

    if (!orderId) {

        throw new Error(
            "Order ID is required."
        );

    }


    const order =
        await db.prepare(
            `
            SELECT
                *
            FROM orders
            WHERE id = ?
            LIMIT 1
            `
        )
        .bind(
            orderId
        )
        .first();


    if (!order) {

        return null;

    }


    const allocation =
        await db.prepare(
            `
            SELECT

                cp.pixel_id,

                cp.district_id,

                cp.x,

                cp.y,

                cp.status

            FROM canvas_pixels cp

            WHERE cp.reservation_order_id = ?

               OR cp.sold_order_id = ?

            ORDER BY cp.pixel_id
            `
        )
        .bind(
            orderId,
            orderId
        )
        .all();


    const payment =
        await db.prepare(
            `
            SELECT
                *
            FROM bitcoin_payments
            WHERE order_id = ?
            LIMIT 1
            `
        )
        .bind(
            orderId
        )
        .first();


    return {

        order,

        allocation:
            allocation.results ||
            [],

        payment:
            payment || null

    };

}


/* =========================================================
   CANCEL ORDER
========================================================= */

export async function cancelOrder(
    db,
    orderId
) {

    const order =
        await db.prepare(
            `
            SELECT
                id,
                status
            FROM orders
            WHERE id = ?
            LIMIT 1
            `
        )
        .bind(
            orderId
        )
        .first();


    if (!order) {

        throw new Error(
            "Order not found."
        );

    }


    /*
     * Completed orders cannot be cancelled.
     *
     * Sold pixels are permanent.
     */

    if (
        order.status ===
        ORDER_STATUS.COMPLETED
    ) {

        throw new Error(
            "Completed orders cannot be cancelled."
        );

    }


    if (
        [
            ORDER_STATUS.PAID,
            ORDER_STATUS.COMPLETED
        ].includes(
            order.status
        )
    ) {

        throw new Error(
            "Paid orders cannot be cancelled through this endpoint."
        );

    }


    await releaseReservations(
        db,
        orderId
    );


    await db.prepare(
        `
        UPDATE pixel_reservations

        SET

            status =
                'RELEASED',

            updated_at =
                CURRENT_TIMESTAMP

        WHERE order_id = ?

          AND status =
              'RESERVED'
        `
    )
    .bind(
        orderId
    )
    .run();


    await db.prepare(
        `
        UPDATE orders

        SET

            status =
                'CANCELLED',

            updated_at =
                CURRENT_TIMESTAMP

        WHERE id = ?

          AND status NOT IN (
              'COMPLETED',
              'CANCELLED'
          )
        `
    )
    .bind(
        orderId
    )
    .run();


    return {

        orderId,

        status:
            ORDER_STATUS.CANCELLED

    };

}


/* =========================================================
   COMPLETE PAID ORDER
========================================================= */

/**
 * This is the irreversible payment → ownership step.
 */

export async function completePaidOrder(
    db,
    orderId
) {

    const order =
        await db.prepare(
            `
            SELECT
                *
            FROM orders
            WHERE id = ?
            LIMIT 1
            `
        )
        .bind(
            orderId
        )
        .first();


    if (!order) {

        throw new Error(
            "Order not found."
        );

    }


    /*
     * Idempotency:
     *
     * If the cron job sees the same payment twice, we simply
     * return the already-completed order.
     */

    if (
        order.status ===
        ORDER_STATUS.COMPLETED
    ) {

        return getOrderStatus(
            db,
            orderId
        );

    }


    if (
        order.status !==
        ORDER_STATUS.PAID
    ) {

        throw new Error(
            "Order payment has not been confirmed."
        );

    }


    /*
     * Confirm the payment record.
     */

    const payment =
        await db.prepare(
            `
            SELECT
                *
            FROM bitcoin_payments
            WHERE order_id = ?
            LIMIT 1
            `
        )
        .bind(
            orderId
        )
        .first();


    if (!payment) {

        throw new Error(
            "Payment record not found."
        );

    }


    if (
        payment.status !==
        "CONFIRMED"
    ) {

        throw new Error(
            "Bitcoin payment is not confirmed."
        );

    }


    /*
     * Permanently sell all reserved pixels.
     */

    const sold =
        await sellOrderPixels(
            db,
            {

                orderId,

                userId:
                    order.user_id

            }
        );


    if (
        sold.length !==
        Number(
            order.quantity
        )
    ) {

        throw new Error(
            "Pixel allocation count does not match order quantity."
        );

    }


    /*
     * Create permanent ownership records.
     *
     * Ownership is immutable from the buyer's perspective.
     */

    for (
        const pixel
        of sold
    ) {

        const ownershipId =
            `ownership_${crypto.randomUUID()}`;


        const coordinate =
            await db.prepare(
                `
                SELECT
                    pixel_id,
                    district_id,
                    x,
                    y
                FROM canvas_pixels
                WHERE pixel_id = ?
                LIMIT 1
                `
            )
            .bind(
                pixel.pixelId
            )
            .first();


        if (!coordinate) {

            throw new Error(
                "Sold pixel record disappeared."
            );

        }


        await db.prepare(
            `
            INSERT INTO pixel_ownership (

                id,

                user_id,

                order_id,

                pixel_id,

                district_id,

                x,

                y,

                status,

                created_at

            )

            VALUES (

                ?,

                ?,

                ?,

                ?,

                ?,

                ?,

                ?,

                'SOLD',

                CURRENT_TIMESTAMP

            )
            `
        )
        .bind(

            ownershipId,

            order.user_id,

            orderId,

            coordinate.pixel_id,

            coordinate.district_id,

            coordinate.x,

            coordinate.y

        )
        .run();


        /*
         * Update reservation ledger.
         */

        await db.prepare(
            `
            UPDATE pixel_reservations

            SET

                status =
                    'SOLD',

                updated_at =
                    CURRENT_TIMESTAMP

            WHERE order_id = ?

              AND pixel_id = ?

              AND status =
                  'RESERVED'
            `
        )
        .bind(

            orderId,

            coordinate.pixel_id

        )
        .run();

    }


    /*
     * Mark order permanently completed.
     */

    await db.prepare(
        `
        UPDATE orders

        SET

            status =
                'COMPLETED',

            completed_at =
                CURRENT_TIMESTAMP,

            updated_at =
                CURRENT_TIMESTAMP

        WHERE id = ?

          AND status =
              'PAID'
        `
    )
    .bind(
        orderId
    )
    .run();


    /*
     * Record completion event.
     */

    await db.prepare(
        `
        INSERT INTO audit_log (

            id,

            event_type,

            entity_type,

            entity_id,

            metadata_json

        )

        VALUES (

            ?,

            'ORDER_COMPLETED',

            'ORDER',

            ?,

            ?

        )
        `
    )
    .bind(

        `audit_order_${crypto.randomUUID()}`,

        orderId,

        JSON.stringify({

            quantity:
                order.quantity,

            priceUsd:
                order.price_usd,

            userId:
                order.user_id,

            bitcoinTransaction:
                payment.transaction_id

        })

    )
    .run();


    return getOrderStatus(
        db,
        orderId
    );

}


/* =========================================================
   CALCULATE ORDER PRICE
========================================================= */

export function calculateOrderPrice(
    quantity
) {

    const amount =
        Number(
            quantity
        );


    if (
        !Number.isSafeInteger(
            amount
        ) ||
        amount < 1
    ) {

        throw new Error(
            "Quantity must be at least 1."
        );

    }


    return (
        amount *
        PRICING.pricePerPixelUsd
    );

}


/* =========================================================
   EXPORTS
========================================================= */

export {

    calculateOrderPrice,

    createOrder,

    getOrderStatus,

    cancelOrder,

    completePaidOrder

};
