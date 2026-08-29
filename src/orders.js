/**
 * =========================================================
 * BILLION PIXEL CANVAS
 * Order Management
 * =========================================================
 *
 * Order lifecycle:
 *
 * PENDING
 *    ↓
 * RESERVED
 *    ↓
 * PAYMENT_DETECTED
 *    ↓
 * CONFIRMING
 *    ↓
 * PAID
 *    ↓
 * COMPLETED
 *
 * Failed/expired orders never create ownership.
 *
 * IMPORTANT:
 *
 * The server calculates the price.
 * The browser cannot choose the price.
 *
 * $1 = exactly 1 pixel.
 * =========================================================
 */

"use strict";

import {
    getDistrict,
    getDistrictCapacity
} from "./coordinates.js";

import {
    createId,
    createReservation,
    getReservation,
    finalizeOwnership,
    expireReservations
} from "./allocator.js";


/* =========================================================
   CONSTANTS
========================================================= */

const PIXEL_PRICE_USD = 1;

const ORDER_EXPIRATION_MINUTES = 15;


/* =========================================================
   HELPERS
========================================================= */

function nowIso() {

    return new Date().toISOString();

}


function expirationIso(
    minutes = ORDER_EXPIRATION_MINUTES
) {

    const date =
        new Date();

    date.setMinutes(
        date.getMinutes() +
        minutes
    );

    return date.toISOString();

}


function safeInteger(
    value
) {

    const number =
        Number(value);

    if (
        !Number.isSafeInteger(
            number
        )
    ) {

        return null;

    }

    return number;

}


/* =========================================================
   PRICE
========================================================= */

export function calculateOrderPrice(
    quantity
) {

    const pixels =
        safeInteger(
            quantity
        );


    if (
        pixels === null ||
        pixels < 1
    ) {

        throw new Error(
            "Invalid pixel quantity."
        );

    }


    /*
     * Never accept a price from the client.
     *
     * The server owns this calculation.
     */

    return pixels *
        PIXEL_PRICE_USD;

}


/* =========================================================
   DISTRICT VALIDATION
========================================================= */

export function validateDistrictPurchase(
    districtId,
    quantity
) {

    const district =
        getDistrict(
            districtId
        );


    const pixels =
        safeInteger(
            quantity
        );


    if (
        pixels === null
    ) {

        throw new Error(
            "Pixel quantity must be a whole number."
        );

    }


    if (
        pixels < 1
    ) {

        throw new Error(
            "Minimum purchase is 1 pixel."
        );

    }


    if (
        pixels <
        district.minimumPurchasePixels
    ) {

        throw new Error(
            `${district.name} requires a minimum purchase of ` +
            `${district.minimumPurchasePixels.toLocaleString()} pixels.`
        );

    }


    const capacity =
        getDistrictCapacity(
            district
        );


    if (
        pixels >
        capacity
    ) {

        throw new Error(
            "Requested purchase exceeds district capacity."
        );

    }


    return district;

}


/* =========================================================
   CREATE ORDER
========================================================= */

export async function createOrder(
    db,
    {
        userId = null,
        districtId,
        quantity
    }
) {

    const pixels =
        safeInteger(
            quantity
        );


    if (
        pixels === null
    ) {

        throw new Error(
            "Invalid quantity."
        );

    }


    const district =
        validateDistrictPurchase(
            districtId,
            pixels
        );


    const priceUsd =
        calculateOrderPrice(
            pixels
        );


    const orderId =
        createId(
            "order"
        );


    const expiresAt =
        expirationIso();


    /*
     * Get the configured BTC receiving address.
     */

    const config =
        await db.prepare(
            `
            SELECT value
            FROM project_config
            WHERE key = 'btc_receiving_address'
            LIMIT 1
            `
        )
        .first();


    const paymentAddress =
        config?.value || "";


    if (
        !paymentAddress
    ) {

        throw new Error(
            "Bitcoin receiving address is not configured."
        );

    }


    /*
     * Create the order.
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

            payment_address,

            status,

            expires_at

        )

        VALUES (

            ?,

            ?,

            ?,

            ?,

            ?,

            'BTC',

            ?,

            'PENDING',

            ?

        )
        `
    )
    .bind(

        orderId,

        userId,

        district.id,

        pixels,

        priceUsd,

        paymentAddress,

        expiresAt

    )
    .run();


    /*
     * Create a temporary coordinate reservation.
     *
     * IMPORTANT:
     *
     * In the final high-concurrency implementation this operation
     * must be executed using a serialized/atomic reservation
     * strategy. The allocator is deliberately kept server-side.
     */

    let reservation;


    try {

        reservation =
            await createReservation(
                db,
                {

                    orderId,

                    userId,

                    districtId:
                        district.id,

                    quantity:
                        pixels

                }
            );


    } catch (error) {

        await db.prepare(
            `
            UPDATE orders

            SET
                status = 'FAILED',
                updated_at = CURRENT_TIMESTAMP

            WHERE id = ?

              AND status = 'PENDING'
            `
        )
        .bind(
            orderId
        )
        .run();


        throw error;

    }


    /*
     * Change order state to RESERVED.
     */

    await db.prepare(
        `
        UPDATE orders

        SET
            status = 'RESERVED',
            updated_at = CURRENT_TIMESTAMP

        WHERE id = ?

          AND status = 'PENDING'
        `
    )
    .bind(
        orderId
    )
    .run();


    /*
     * Record audit event.
     */

    await writeAuditEvent(
        db,
        {

            eventType:
                "ORDER_CREATED",

            entityType:
                "ORDER",

            entityId:
                orderId,

            userId,

            metadata: {

                district:
                    district.id,

                quantity:
                    pixels,

                priceUsd,

                reservationId:
                    reservation.id

            }

        }
    );


    return {

        id:
            orderId,

        status:
            "RESERVED",

        quantity:
            pixels,

        priceUsd,

        paymentCurrency:
            "BTC",

        paymentAddress,

        expiresAt,

        reservation: {

            id:
                reservation.id,

            x:
                reservation.x,

            y:
                reservation.y,

            width:
                reservation.width,

            height:
                reservation.height,

            pixelCount:
                reservation.pixelCount,

            expiresAt:
                reservation.expiresAt

        }

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

                o.*,

                d.name AS district_name

            FROM orders o

            JOIN districts d
                ON d.id = o.district_id

            WHERE o.id = ?

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


    const reservation =
        await db.prepare(
            `
            SELECT *

            FROM pixel_reservations

            WHERE order_id = ?

            ORDER BY created_at DESC

            LIMIT 1
            `
        )
        .bind(
            orderId
        )
        .first();


    const payment =
        await db.prepare(
            `
            SELECT *

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

        reservation,

        payment

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


    if (
        [
            "COMPLETED",
            "PAID"
        ].includes(
            order.status
        )
    ) {

        throw new Error(
            "A completed or paid order cannot be cancelled."
        );

    }


    await db.prepare(
        `
        UPDATE orders

        SET
            status = 'CANCELLED',
            updated_at = CURRENT_TIMESTAMP

        WHERE id = ?

          AND status NOT IN (
              'COMPLETED',
              'PAID'
          )
        `
    )
    .bind(
        orderId
    )
    .run();


    /*
     * Release active reservation.
     */

    await db.prepare(
        `
        UPDATE pixel_reservations

        SET status = 'CANCELLED'

        WHERE order_id = ?

          AND status = 'ACTIVE'
        `
    )
    .bind(
        orderId
    )
    .run();


    await writeAuditEvent(
        db,
        {

            eventType:
                "ORDER_CANCELLED",

            entityType:
                "ORDER",

            entityId:
                orderId,

            userId:
                order.user_id,

            metadata: {}

        }
    );


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
     * First expire reservations.
     */

    const reservations =
        await expireReservations(
            db
        );


    /*
     * Then expire orders whose reservation/payment window
     * has elapsed.
     */

    const result =
        await db.prepare(
            `
            UPDATE orders

            SET
                status = 'EXPIRED',
                updated_at = CURRENT_TIMESTAMP

            WHERE status IN (
                'PENDING',
                'RESERVED'
            )

              AND expires_at <= CURRENT_TIMESTAMP
            `
        )
        .run();


    return {

        expiredReservations:
            reservations.expired,

        expiredOrders:
            result.meta?.changes || 0

    };

}


/* =========================================================
   PAYMENT STATE
========================================================= */

export async function markPaymentDetected(
    db,
    {
        orderId,
        transactionId,
        receivedSatoshis
    }
) {

    const order =
        await db.prepare(
            `
            SELECT *
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


    if (
        order.status !==
        "RESERVED"
    ) {

        throw new Error(
            `Order cannot receive payment in status ${order.status}.`
        );

    }


    const amount =
        safeInteger(
            receivedSatoshis
        );


    if (
        amount === null ||
        amount <= 0
    ) {

        throw new Error(
            "Invalid Bitcoin amount."
        );

    }


    /*
     * The transaction ID must be unique.
     */

    await db.prepare(
        `
        INSERT INTO bitcoin_payments (

            id,

            order_id,

            payment_address,

            expected_satoshis,

            received_satoshis,

            transaction_id,

            detected_at,

            status

        )

        VALUES (

            ?,

            ?,

            ?,

            COALESCE(
                (
                    SELECT btc_amount_satoshis
                    FROM orders
                    WHERE id = ?
                ),
                0
            ),

            ?,

            ?,

            CURRENT_TIMESTAMP,

            'PAYMENT_DETECTED'

        )
        `
    )
    .bind(

        createId(
            "btc"
        ),

        orderId,

        order.payment_address,

        orderId,

        amount,

        transactionId

    )
    .run();


    await db.prepare(
        `
        UPDATE orders

        SET
            status = 'PAYMENT_DETECTED',
            updated_at = CURRENT_TIMESTAMP

        WHERE id = ?

          AND status = 'RESERVED'
        `
    )
    .bind(
        orderId
    )
    .run();


    await writeAuditEvent(
        db,
        {

            eventType:
                "BTC_PAYMENT_DETECTED",

            entityType:
                "ORDER",

            entityId:
                orderId,

            userId:
                order.user_id,

            metadata: {

                transactionId,

                receivedSatoshis:
                    amount

            }

        }
    );


    return getOrder(
        db,
        orderId
    );

}


/* =========================================================
   MARK PAYMENT CONFIRMED
========================================================= */

export async function markPaymentConfirmed(
    db,
    {
        orderId,
        transactionId,
        confirmations
    }
) {

    const order =
        await db.prepare(
            `
            SELECT *
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


    const payment =
        await db.prepare(
            `
            SELECT *
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
            "Bitcoin payment record not found."
        );

    }


    if (
        payment.transaction_id !==
        transactionId
    ) {

        throw new Error(
            "Transaction ID does not match payment record."
        );

    }


    const confirmationCount =
        safeInteger(
            confirmations
        );


    if (
        confirmationCount === null ||
        confirmationCount < 1
    ) {

        throw new Error(
            "Payment does not have a valid confirmation count."
        );

    }


    /*
     * Payment is considered eligible for completion.
     *
     * The Bitcoin verification module is responsible for
     * deciding whether the transaction is genuinely confirmed
     * and paid to the correct address.
     */

    await db.prepare(
        `
        UPDATE bitcoin_payments

        SET

            confirmation_count = ?,

            confirmed_at =
                CURRENT_TIMESTAMP,

            status =
                'CONFIRMED',

            updated_at =
                CURRENT_TIMESTAMP

        WHERE order_id = ?

          AND transaction_id = ?
        `
    )
    .bind(

        confirmationCount,

        orderId,

        transactionId

    )
    .run();


    await db.prepare(
        `
        UPDATE orders

        SET
            status = 'PAID',
            updated_at = CURRENT_TIMESTAMP

        WHERE id = ?

          AND status IN (
              'PAYMENT_DETECTED',
              'CONFIRMING'
          )
        `
    )
    .bind(
        orderId
    )
    .run();


    await writeAuditEvent(
        db,
        {

            eventType:
                "BTC_PAYMENT_CONFIRMED",

            entityType:
                "ORDER",

            entityId:
                orderId,

            userId:
                order.user_id,

            metadata: {

                transactionId,

                confirmations:
                    confirmationCount

            }

        }
    );


    return getOrder(
        db,
        orderId
    );

}


/* =========================================================
   FINALIZE PAID ORDER
========================================================= */

export async function completePaidOrder(
    db,
    orderId
) {

    const order =
        await db.prepare(
            `
            SELECT *
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


    if (
        order.status !==
        "PAID"
    ) {

        throw new Error(
            "Order is not ready for ownership finalization."
        );

    }


    const payment =
        await db.prepare(
            `
            SELECT *
            FROM bitcoin_payments
            WHERE order_id = ?
            LIMIT 1
            `
        )
        .bind(
            orderId
        )
        .first();


    if (
        !payment ||
        payment.status !==
        "CONFIRMED"
    ) {

        throw new Error(
            "Bitcoin payment is not confirmed."
        );

    }


    const reservation =
        await db.prepare(
            `
            SELECT *
            FROM pixel_reservations
            WHERE order_id = ?
              AND status = 'ACTIVE'
            LIMIT 1
            `
        )
        .bind(
            orderId
        )
        .first();


    if (!reservation) {

        throw new Error(
            "Active pixel reservation not found."
        );

    }


    /*
     * Convert reservation into permanent SOLD ownership.
     */

    const ownership =
        await finalizeOwnership(
            db,
            {
                reservationId:
                    reservation.id
            }
        );


    await writeAuditEvent(
        db,
        {

            eventType:
                "PIXELS_PERMANENTLY_SOLD",

            entityType:
                "OWNERSHIP",

            entityId:
                ownership.ownershipId,

            userId:
                order.user_id,

            metadata: {

                orderId,

                district:
                    ownership.districtId,

                pixelCount:
                    ownership.pixelCount,

                x:
                    ownership.x,

                y:
                    ownership.y

            }

        }
    );


    return ownership;

}


/* =========================================================
   AUDIT EVENT
========================================================= */

export async function writeAuditEvent(
    db,
    {
        eventType,
        entityType,
        entityId,
        userId = null,
        metadata = {}
    }
) {

    await db.prepare(
        `
        INSERT INTO audit_log (

            id,

            event_type,

            entity_type,

            entity_id,

            user_id,

            metadata_json

        )

        VALUES (

            ?,

            ?,

            ?,

            ?,

            ?,

            ?

        )
        `
    )
    .bind(

        createId(
            "audit"
        ),

        eventType,

        entityType,

        entityId,

        userId,

        JSON.stringify(
            metadata
        )

    )
    .run();

}


/* =========================================================
   ORDER STATUS SUMMARY
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


    return {

        orderId,

        status:
            result.order.status,

        quantity:
            result.order.quantity,

        priceUsd:
            result.order.price_usd,

        district:
            result.order.district_id,

        districtName:
            result.order.district_name,

        reservation:
            result.reservation
                ? {

                    x:
                        result.reservation.x_start,

                    y:
                        result.reservation.y_start,

                    width:
                        result.reservation.width,

                    height:
                        result.reservation.height,

                    pixelCount:
                        result.reservation.pixel_count,

                    status:
                        result.reservation.status,

                    expiresAt:
                        result.reservation.expires_at

                }
                : null,

        payment:
            result.payment
                ? {

                    status:
                        result.payment.status,

                    transactionId:
                        result.payment.transaction_id,

                    confirmations:
                        result.payment.confirmation_count,

                    receivedSatoshis:
                        result.payment.received_satoshis

                }
                : null

    };

}
