/**
 * =========================================================
 * BILLION PIXEL CANVAS
 * ORDER ENGINE
 * =========================================================
 *
 * MASTER RULE:
 *
 * 1 PIXEL = $1 USD FOREVER
 *
 * - Minimum purchase: 1
 * - No maximum purchase
 * - Buyer may purchase as many available pixels as desired
 * - Sold pixels can never be sold again
 * - No resale marketplace
 * - No auction
 * - No resale slots
 *
 * BTC is only the payment currency.
 *
 * =========================================================
 */

"use strict";

import {
    PRICING,
    ORDER_STATUS,
    OWNERSHIP_STATUS,
    calculatePixelPriceUsd,
    validateDistrictPurchase
} from "./config.js";


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
            "User authentication is required."
        );

    }


    /*
     * Validate and normalize quantity.
     */

    const pixels =
        Number(quantity);


    if (
        !Number.isSafeInteger(pixels) ||
        pixels < PRICING.minimumPixels
    ) {

        throw new Error(
            "Minimum purchase is 1 pixel."
        );

    }


    /*
     * Validate district-specific rules.
     */

    validateDistrictPurchase(
        districtId,
        pixels
    );


    /*
     * IMPORTANT:
     *
     * Price is calculated ONLY on the server.
     *
     * Browser-supplied price is ignored.
     */

    const priceUsd =
        calculatePixelPriceUsd(
            pixels
        );


    /*
     * Verify that enough pixels are actually available.
     *
     * The database allocator is responsible for selecting
     * the exact coordinates.
     */

    const available =
        await countAvailablePixels(
            db,
            districtId
        );


    if (
        available < pixels
    ) {

        throw new Error(
            `Only ${available.toLocaleString()} pixels remain available in this district.`
        );

    }


    /*
     * Create order.
     */

    const orderId =
        `order_${crypto.randomUUID()}`;


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

        districtId,

        pixels,

        priceUsd

    )
    .run();


    /*
     * Reserve the actual pixels.
     *
     * This must happen inside the database transaction/
     * allocation layer so two simultaneous buyers cannot
     * receive the same pixel.
     */

    let allocation;


    try {

        allocation =
            await reservePixels(
                db,
                {
                    orderId,
                    userId,
                    districtId,
                    quantity: pixels
                }
            );

    } catch (
        error
    ) {

        /*
         * If allocation fails, cancel the order.
         */

        await db.prepare(
            `
            UPDATE orders

            SET

                status = 'FAILED',

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


    return {

        id:
            orderId,

        userId,

        districtId,

        quantity:
            pixels,

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
   GET ORDER
========================================================= */

export async function getOrder(
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

        return null;

    }


    const allocation =
        await db.prepare(
            `
            SELECT
                id,
                pixel_id,
                district_id,
                x,
                y,
                status
            FROM pixel_reservations
            WHERE order_id = ?
            ORDER BY pixel_id
            `
        )
        .bind(
            orderId
        )
        .all();


    return {

        order,

        allocation:
            allocation.results || []

    };

}


/* =========================================================
   ORDER STATUS
========================================================= */

export async function getOrderStatus(
    db,
    orderId
) {

    const result =
        await getOrder(
            db,
            orderId
        );


    if (!result) {

        return null;

    }


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

        order:
            result.order,

        allocation:
            result.allocation,

        payment:
            payment || null

    };

}


/* =========================================================
   COUNT AVAILABLE PIXELS
========================================================= */

async function countAvailablePixels(
    db,
    districtId
) {

    const result =
        await db.prepare(
            `
            SELECT
                COUNT(*) AS available
            FROM canvas_pixels
            WHERE district_id = ?
              AND status = 'AVAILABLE'
            `
        )
        .bind(
            districtId
        )
        .first();


    return Number(
        result?.available || 0
    );

}


/* =========================================================
   RESERVE PIXELS
========================================================= */

async function reservePixels(
    db,
    {
        orderId,
        userId,
        districtId,
        quantity
    }
) {

    /*
     * Select available pixels.
     *
     * The database is the source of truth.
     */

    const pixels =
        await db.prepare(
            `
            SELECT
                id,
                pixel_id,
                district_id,
                x,
                y
            FROM canvas_pixels
            WHERE district_id = ?
              AND status = 'AVAILABLE'
            ORDER BY pixel_id
            LIMIT ?
            `
        )
        .bind(
            districtId,
            quantity
        )
        .all();


    const selected =
        pixels.results || [];


    if (
        selected.length !== quantity
    ) {

        throw new Error(
            "Not enough pixels are available."
        );

    }


    /*
     * Reserve every selected pixel.
     *
     * The UPDATE includes status='AVAILABLE'.
     * Therefore an already-reserved/sold pixel cannot be
     * silently overwritten.
     */

    for (
        const pixel
        of selected
    ) {

        const update =
            await db.prepare(
                `
                UPDATE canvas_pixels

                SET

                    status =
                        'RESERVED',

                    reservation_order_id =
                        ?,

                    reserved_by =
                        ?,

                    reserved_at =
                        CURRENT_TIMESTAMP,

                    updated_at =
                        CURRENT_TIMESTAMP

                WHERE id = ?

                  AND status =
                      'AVAILABLE'
                `
            )
            .bind(

                orderId,

                userId,

                pixel.id

            )
            .run();


        if (
            update.meta?.changes !== 1
        ) {

            /*
             * A concurrent request may have taken this pixel.
             */

            await releaseOrderReservations(
                db,
                orderId
            );


            throw new Error(
                "Pixel allocation conflict. Please try again."
            );

        }


        await db.prepare(
            `
            INSERT INTO pixel_reservations (

                id,

                order_id,

                user_id,

                pixel_id,

                district_id,

                x,

                y,

                status

            )

            VALUES (

                ?,

                ?,

                ?,

                ?,

                ?,

                ?,

                ?,

                'RESERVED'

            )
            `
        )
        .bind(

            `reservation_${crypto.randomUUID()}`,

            orderId,

            userId,

            pixel.pixel_id,

            pixel.district_id,

            pixel.x,

            pixel.y

        )
        .run();

    }


    return {

        count:
            selected.length,

        pixels:
            selected.map(
                pixel => ({

                    pixelId:
                        pixel.pixel_id,

                    districtId:
                        pixel.district_id,

                    x:
                        pixel.x,

                    y:
                        pixel.y

                })
            )

    };

}


/* =========================================================
   RELEASE RESERVATIONS
========================================================= */

async function releaseOrderReservations(
    db,
    orderId
) {

    await db.prepare(
        `
        UPDATE canvas_pixels

        SET

            status =
                'AVAILABLE',

            reservation_order_id =
                NULL,

            reserved_by =
                NULL,

            reserved_at =
                NULL,

            updated_at =
                CURRENT_TIMESTAMP

        WHERE reservation_order_id = ?
          AND status = 'RESERVED'
        `
    )
    .bind(
        orderId
    )
    .run();


    await db.prepare(
        `
        UPDATE pixel_reservations

        SET

            status =
                'RELEASED'

        WHERE order_id = ?

          AND status =
              'RESERVED'
        `
    )
    .bind(
        orderId
    )
    .run();

}


/* =========================================================
   CANCEL ORDER
========================================================= */

export async function cancelOrder(
    db,
    orderId
) {

    const order =
        await getOrder(
            db,
            orderId
        );


    if (!order) {

        throw new Error(
            "Order not found."
        );

    }


    if (
        [
            "PAID",
            "COMPLETED"
        ].includes(
            order.order.status
        )
    ) {

        throw new Error(
            "A completed purchase cannot be cancelled."
        );

    }


    await releaseOrderReservations(
        db,
        orderId
    );


    await db.prepare(
        `
        UPDATE orders

        SET

            status =
                'CANCELLED',

            updated_at =
                CURRENT_TIMESTAMP

        WHERE id = ?

          AND status IN (
              'RESERVED',
              'PAYMENT_PENDING',
              'PAYMENT_DETECTED',
              'CONFIRMING'
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
            "CANCELLED"

    };

}


/* =========================================================
   EXPIRE ORDERS
========================================================= */

export async function expireOrders(
    db
) {

    /*
     * Orders which remain unpaid eventually release their
     * temporary reservations.
     *
     * IMPORTANT:
     *
     * Once an order is PAID/COMPLETED, its pixels are never
     * returned to inventory.
     */

    const expired =
        await db.prepare(
            `
            SELECT
                id
            FROM orders

            WHERE status IN (
                'RESERVED',
                'PAYMENT_PENDING',
                'PAYMENT_DETECTED',
                'CONFIRMING'
            )

              AND created_at <
                  datetime(
                      'now',
                      '-30 minutes'
                  )
            `
        )
        .all();


    const orders =
        expired.results || [];


    for (
        const order
        of orders
    ) {

        await releaseOrderReservations(
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
                  'PAYMENT_DETECTED',
                  'CONFIRMING'
              )
            `
        )
        .bind(
            order.id
        )
        .run();

    }


    return {

        expired:
            orders.length

    };

}


/* =========================================================
   COMPLETE PAID ORDER
========================================================= */

export async function completePaidOrder(
    db,
    orderId
) {

    const result =
        await getOrder(
            db,
            orderId
        );


    if (!result) {

        throw new Error(
            "Order not found."
        );

    }


    /*
     * Only confirmed/paid orders can become permanent.
     */

    if (
        ![
            "PAID",
            "COMPLETED"
        ].includes(
            result.order.status
        )
    ) {

        throw new Error(
            "Order has not been confirmed as paid."
        );

    }


    if (
        result.order.status ===
        "COMPLETED"
    ) {

        return result;

    }


    /*
     * Permanently sell every reserved pixel.
     *
     * The condition `status='RESERVED'` prevents a pixel
     * from being accidentally sold twice.
     */

    const reservations =
        await db.prepare(
            `
            SELECT
                *
            FROM pixel_reservations
            WHERE order_id = ?
              AND status = 'RESERVED'
            ORDER BY pixel_id
            `
        )
        .bind(
            orderId
        )
        .all();


    const pixels =
        reservations.results || [];


    if (
        pixels.length !==
        Number(
            result.order.quantity
        )
    ) {

        throw new Error(
            "Pixel reservation count does not match the order."
        );

    }


    for (
        const pixel
        of pixels
    ) {

        const update =
            await db.prepare(
                `
                UPDATE canvas_pixels

                SET

                    status =
                        'SOLD',

                    owner_user_id =
                        ?,

                    reservation_order_id =
                        NULL,

                    reserved_by =
                        NULL,

                    reserved_at =
                        NULL,

                    sold_order_id =
                        ?,

                    sold_at =
                        CURRENT_TIMESTAMP,

                    updated_at =
                        CURRENT_TIMESTAMP

                WHERE pixel_id = ?

                  AND status =
                      'RESERVED'

                  AND reservation_order_id =
                      ?
                `
            )
            .bind(

                result.order.user_id,

                orderId,

                pixel.pixel_id,

                orderId

            )
            .run();


        if (
            update.meta?.changes !== 1
        ) {

            throw new Error(
                "Permanent pixel allocation conflict."
            );

        }


        await db.prepare(
            `
            UPDATE pixel_reservations

            SET

                status =
                    'SOLD'

            WHERE id = ?

              AND status =
                  'RESERVED'
            `
        )
        .bind(
            pixel.id
        )
        .run();


        /*
         * Create permanent ownership record.
         */

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

                status

            )

            VALUES (

                ?,

                ?,

                ?,

                ?,

                ?,

                ?,

                ?,

                'SOLD'

            )
            `
        )
        .bind(

            `ownership_${crypto.randomUUID()}`,

            result.order.user_id,

            orderId,

            pixel.pixel_id,

            pixel.district_id,

            pixel.x,

            pixel.y

        )
        .run();

    }


    /*
     * Mark order completed.
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


    return getOrder(
        db,
        orderId
    );

}


/* =========================================================
   FIND PIXEL
========================================================= */

export async function findPixel(
    db,
    districtId,
    x,
    y
) {

    const pixel =
        await db.prepare(
            `
            SELECT
                *
            FROM canvas_pixels

            WHERE district_id = ?

              AND x = ?

              AND y = ?

            LIMIT 1
            `
        )
        .bind(
            districtId,
            x,
            y
        )
        .first();


    return pixel || null;

}


/* =========================================================
   EXPORTS
========================================================= */

export {

    reservePixels,

    releaseOrderReservations

};
