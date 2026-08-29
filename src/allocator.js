"use strict";

import {
    CANVAS_WIDTH,
    CANVAS_HEIGHT,
    TOTAL_PIXELS,
    coordinateToPixelId,
    pixelIdToCoordinate,
    getDistrict,
    getDistrictAtCoordinate,
    validatePixelId,
    validateCoordinate
} from "./coordinates.js";


/* =========================================================
   BILLION PIXEL CANVAS
   PIXEL ALLOCATION ENGINE
========================================================= */


/*
 * IMPORTANT:
 *
 * Empty pixels do not need database rows.
 *
 * A pixel is considered:
 *
 * AVAILABLE
 *     if it has never been sold/reserved.
 *
 * RESERVED
 *     if it is temporarily attached to an unpaid order.
 *
 * SOLD
 *     if permanent ownership has been created.
 *
 * This dramatically reduces database storage.
 */


/* =========================================================
   PIXEL STATE
========================================================= */

export const PIXEL_STATE = Object.freeze({

    AVAILABLE:
        "AVAILABLE",

    RESERVED:
        "RESERVED",

    SOLD:
        "SOLD"

});


/* =========================================================
   GET PIXEL STATE
========================================================= */

export async function getPixelState(
    db,
    pixelId
) {

    validatePixelId(
        Number(pixelId)
    );


    const id =
        Number(pixelId);


    const row =
        await db.prepare(
            `
            SELECT
                pixel_id,
                district_id,
                x,
                y,
                status,
                owner_user_id,
                reservation_order_id,
                sold_order_id
            FROM canvas_pixels
            WHERE pixel_id = ?
            LIMIT 1
            `
        )
        .bind(
            id
        )
        .first();


    /*
     * No physical database row means the pixel has never
     * been reserved or sold.
     */

    if (!row) {

        const coordinate =
            pixelIdToCoordinate(
                id
            );


        const district =
            getDistrictAtCoordinate(
                coordinate.x,
                coordinate.y
            );


        return {

            pixelId:
                id,

            x:
                coordinate.x,

            y:
                coordinate.y,

            districtId:
                district?.id || null,

            status:
                PIXEL_STATE.AVAILABLE,

            ownerUserId:
                null,

            reservationOrderId:
                null,

            soldOrderId:
                null

        };

    }


    return {

        pixelId:
            row.pixel_id,

        x:
            row.x,

        y:
            row.y,

        districtId:
            row.district_id,

        status:
            row.status,

        ownerUserId:
            row.owner_user_id,

        reservationOrderId:
            row.reservation_order_id,

        soldOrderId:
            row.sold_order_id

    };

}


/* =========================================================
   FIND OWNERSHIP AT COORDINATE
========================================================= */

export async function findOwnershipAt(
    db,
    districtId,
    x,
    y
) {

    const coordinateX =
        Number(x);

    const coordinateY =
        Number(y);


    validateCoordinate(
        coordinateX,
        coordinateY
    );


    const district =
        getDistrictAtCoordinate(
            coordinateX,
            coordinateY
        );


    if (
        !district ||
        district.id !== districtId
    ) {

        return null;

    }


    const pixelId =
        coordinateToPixelId(
            coordinateX,
            coordinateY
        );


    const ownership =
        await db.prepare(
            `
            SELECT
                id,
                user_id,
                order_id,
                pixel_id,
                district_id,
                x,
                y,
                status,
                created_at
            FROM pixel_ownership
            WHERE pixel_id = ?
              AND status = 'SOLD'
            LIMIT 1
            `
        )
        .bind(
            pixelId
        )
        .first();


    return ownership || null;

}


/* =========================================================
   GET OWNERSHIP
========================================================= */

export async function getOwnership(
    db,
    ownershipId
) {

    if (
        typeof ownershipId !==
        "string" ||
        !ownershipId.trim()
    ) {

        throw new Error(
            "Ownership ID is required."
        );

    }


    const ownership =
        await db.prepare(
            `
            SELECT
                po.id,
                po.user_id,
                po.order_id,
                po.pixel_id,
                po.district_id,
                po.x,
                po.y,
                po.status,
                po.created_at,
                d.name AS district_name
            FROM pixel_ownership po
            LEFT JOIN districts d
                ON d.id = po.district_id
            WHERE po.id = ?
            LIMIT 1
            `
        )
        .bind(
            ownershipId
        )
        .first();


    if (!ownership) {

        return null;

    }


    return ownership;

}


/* =========================================================
   CHECK PIXEL IS AVAILABLE
========================================================= */

export async function isPixelAvailable(
    db,
    pixelId
) {

    const state =
        await getPixelState(
            db,
            pixelId
        );


    return (
        state.status ===
        PIXEL_STATE.AVAILABLE
    );

}


/* =========================================================
   GET AVAILABLE PIXEL
========================================================= */

export async function getNextAvailablePixel(
    db,
    districtId,
    startPixelId = 0
) {

    const district =
        getDistrict(
            districtId
        );


    if (!district) {

        throw new Error(
            "District not found."
        );

    }


    const start =
        Number(
            startPixelId
        );


    if (
        !Number.isSafeInteger(
            start
        )
    ) {

        throw new Error(
            "Invalid starting pixel."
        );

    }


    /*
     * We search the logical coordinate space rather than
     * requiring every available pixel to exist in D1.
     *
     * For production, sold/reserved pixels are skipped using
     * the database lookup.
     */

    const districtStart =
        coordinateToPixelId(
            district.x,
            district.y
        );


    const districtEnd =
        coordinateToPixelId(

            district.x +
                district.width -
                1,

            district.y +
                district.height -
                1

        );


    let candidate =
        Math.max(
            start,
            districtStart
        );


    /*
     * Prevent scanning outside the district.
     */

    while (
        candidate <=
        districtEnd
    ) {

        const coordinate =
            pixelIdToCoordinate(
                candidate
            );


        if (
            coordinate.x <
                district.x ||
            coordinate.x >=
                district.x +
                    district.width ||
            coordinate.y <
                district.y ||
            coordinate.y >=
                district.y +
                    district.height
        ) {

            candidate++;

            continue;

        }


        const state =
            await getPixelState(
                db,
                candidate
            );


        if (
            state.status ===
            PIXEL_STATE.AVAILABLE
        ) {

            return state;

        }


        candidate++;

    }


    return null;

}


/* =========================================================
   GET AVAILABLE PIXELS
========================================================= */

export async function getAvailablePixels(
    db,
    districtId,
    quantity,
    startPixelId = 0
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


    const result = [];


    let cursor =
        Number(
            startPixelId
        );


    /*
     * Continue until enough available pixels are found.
     */

    while (
        result.length <
            amount
    ) {

        const pixel =
            await getNextAvailablePixel(
                db,
                districtId,
                cursor
            );


        if (!pixel) {

            break;

        }


        result.push(
            pixel
        );


        cursor =
            pixel.pixelId +
            1;

    }


    return result;

}


/* =========================================================
   RESERVE ONE PIXEL
========================================================= */

export async function reservePixel(
    db,
    {
        pixelId,
        orderId,
        userId
    }
) {

    const id =
        Number(
            pixelId
        );


    validatePixelId(
        id
    );


    if (!orderId) {

        throw new Error(
            "Order ID is required."
        );

    }


    if (!userId) {

        throw new Error(
            "User ID is required."
        );

    }


    const coordinate =
        pixelIdToCoordinate(
            id
        );


    const district =
        getDistrictAtCoordinate(
            coordinate.x,
            coordinate.y
        );


    if (!district) {

        throw new Error(
            "Pixel does not belong to a valid district."
        );

    }


    /*
     * First try to create the row.
     *
     * This works because empty pixels have no row.
     */

    try {

        await db.prepare(
            `
            INSERT INTO canvas_pixels (

                pixel_id,
                district_id,
                x,
                y,
                status,
                reservation_order_id,
                reserved_by,
                reserved_at

            )

            VALUES (

                ?,
                ?,
                ?,
                ?,
                'RESERVED',
                ?,
                ?,
                CURRENT_TIMESTAMP

            )
            `
        )
        .bind(

            id,

            district.id,

            coordinate.x,

            coordinate.y,

            orderId,

            userId

        )
        .run();


        return {

            pixelId:
                id,

            districtId:
                district.id,

            x:
                coordinate.x,

            y:
                coordinate.y,

            status:
                PIXEL_STATE.RESERVED

        };

    } catch (
        error
    ) {

        /*
         * The row may already exist because another request
         * reserved or sold the pixel.
         */

        const existing =
            await getPixelState(
                db,
                id
            );


        if (
            existing.status !==
            PIXEL_STATE.AVAILABLE
        ) {

            throw new Error(
                "Pixel is no longer available."
            );

        }


        throw error;

    }

}


/* =========================================================
   RESERVE PIXELS
========================================================= */

export async function reservePixels(
    db,
    {
        districtId,
        quantity,
        orderId,
        userId
    }
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


    const available =
        await getAvailablePixels(
            db,
            districtId,
            amount
        );


    if (
        available.length !==
        amount
    ) {

        throw new Error(
            "There are not enough available pixels."
        );

    }


    const reserved = [];


    try {

        for (
            const pixel
            of available
        ) {

            const result =
                await reservePixel(
                    db,
                    {

                        pixelId:
                            pixel.pixelId,

                        orderId,

                        userId

                    }
                );


            reserved.push(
                result
            );

        }

    } catch (
        error
    ) {

        /*
         * Roll back reservations belonging to this order.
         */

        await releaseReservations(
            db,
            orderId
        );


        throw error;

    }


    return reserved;

}


/* =========================================================
   RELEASE RESERVATIONS
========================================================= */

export async function releaseReservations(
    db,
    orderId
) {

    if (!orderId) {

        throw new Error(
            "Order ID is required."
        );

    }


    /*
     * A reservation can only return to AVAILABLE while it is
     * still RESERVED.
     *
     * SOLD pixels can never be released.
     */

    const reservations =
        await db.prepare(
            `
            SELECT
                pixel_id
            FROM canvas_pixels
            WHERE reservation_order_id = ?
              AND status = 'RESERVED'
            `
        )
        .bind(
            orderId
        )
        .all();


    const pixels =
        reservations.results || [];


    await db.prepare(
        `
        DELETE FROM canvas_pixels

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
            status = 'RELEASED',
            updated_at = CURRENT_TIMESTAMP

        WHERE order_id = ?

          AND status = 'RESERVED'
        `
    )
    .bind(
        orderId
    )
    .run();


    return {

        released:
            pixels.length

    };

}


/* =========================================================
   PERMANENTLY SELL PIXEL
========================================================= */

export async function sellPixel(
    db,
    {
        pixelId,
        orderId,
        userId
    }
) {

    const id =
        Number(
            pixelId
        );


    validatePixelId(
        id
    );


    const pixel =
        await db.prepare(
            `
            SELECT
                *
            FROM canvas_pixels
            WHERE pixel_id = ?
            LIMIT 1
            `
        )
        .bind(
            id
        )
        .first();


    if (!pixel) {

        throw new Error(
            "Pixel reservation does not exist."
        );

    }


    /*
     * Only the order that reserved the pixel can finalize it.
     */

    if (
        pixel.status !==
        PIXEL_STATE.RESERVED ||
        pixel.reservation_order_id !==
        orderId ||
        pixel.reserved_by !==
        userId
    ) {

        throw new Error(
            "Pixel is not reserved by this order."
        );

    }


    /*
     * Change RESERVED → SOLD.
     *
     * This is the irreversible ownership transition.
     */

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

              AND reserved_by =
                  ?
            `
        )
        .bind(

            userId,

            orderId,

            id,

            orderId,

            userId

        )
        .run();


    if (
        update.meta?.changes !== 1
    ) {

        throw new Error(
            "Pixel could not be permanently allocated."
        );

    }


    return {

        pixelId:
            id,

        status:
            PIXEL_STATE.SOLD,

        ownerUserId:
            userId,

        orderId

    };

}


/* =========================================================
   PERMANENTLY SELL ORDER PIXELS
========================================================= */

export async function sellOrderPixels(
    db,
    {
        orderId,
        userId
    }
) {

    const reservations =
        await db.prepare(
            `
            SELECT
                pixel_id
            FROM canvas_pixels
            WHERE reservation_order_id = ?
              AND status = 'RESERVED'
              AND reserved_by = ?
            ORDER BY pixel_id
            `
        )
        .bind(
            orderId,
            userId
        )
        .all();


    const pixels =
        reservations.results || [];


    if (
        pixels.length === 0
    ) {

        throw new Error(
            "No reserved pixels found for this order."
        );

    }


    const sold = [];


    for (
        const pixel
        of pixels
    ) {

        const result =
            await sellPixel(
                db,
                {

                    pixelId:
                        pixel.pixel_id,

                    orderId,

                    userId

                }
            );


        sold.push(
            result
        );

    }


    return sold;

}


/* =========================================================
   COUNT SOLD PIXELS
========================================================= */

export async function countSoldPixels(
    db
) {

    const result =
        await db.prepare(
            `
            SELECT
                COUNT(*) AS total
            FROM canvas_pixels
            WHERE status = 'SOLD'
            `
        )
        .first();


    return Number(
        result?.total || 0
    );

}


/* =========================================================
   COUNT REMAINING PIXELS
========================================================= */

export async function countRemainingPixels(
    db
) {

    const sold =
        await countSoldPixels(
            db
        );


    return Math.max(
        0,
        TOTAL_PIXELS -
        sold
    );

}


/* =========================================================
   GET CANVAS STATISTICS
========================================================= */

export async function getCanvasStatistics(
    db
) {

    const result =
        await db.prepare(
            `
            SELECT

                SUM(
                    CASE
                        WHEN status = 'SOLD'
                        THEN 1
                        ELSE 0
                    END
                ) AS sold,

                SUM(
                    CASE
                        WHEN status = 'RESERVED'
                        THEN 1
                        ELSE 0
                    END
                ) AS reserved

            FROM canvas_pixels
            `
        )
        .first();


    const sold =
        Number(
            result?.sold || 0
        );


    const reserved =
        Number(
            result?.reserved || 0
        );


    return {

        totalPixels:
            TOTAL_PIXELS,

        soldPixels:
            sold,

        reservedPixels:
            reserved,

        availablePixels:
            Math.max(
                0,
                TOTAL_PIXELS -
                sold -
                reserved
            ),

        percentageSold:
            (
                sold /
                TOTAL_PIXELS
            ) *
            100,

        canvasWidth:
            CANVAS_WIDTH,

        canvasHeight:
            CANVAS_HEIGHT

    };

}


/* =========================================================
   VERIFY OWNERSHIP
========================================================= */

export async function verifyOwnership(
    db,
    {
        pixelId,
        userId
    }
) {

    const ownership =
        await db.prepare(
            `
            SELECT
                id,
                user_id,
                order_id,
                pixel_id,
                district_id,
                x,
                y,
                status,
                created_at
            FROM pixel_ownership
            WHERE pixel_id = ?
              AND user_id = ?
              AND status = 'SOLD'
            LIMIT 1
            `
        )
        .bind(
            pixelId,
            userId
        )
        .first();


    return Boolean(
        ownership
    );

}


/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {

    PIXEL_STATE,

    getPixelState,

    findOwnershipAt,

    getOwnership,

    isPixelAvailable,

    getNextAvailablePixel,

    getAvailablePixels,

    reservePixel,

    reservePixels,

    releaseReservations,

    sellPixel,

    sellOrderPixels,

    countSoldPixels,

    countRemainingPixels,

    getCanvasStatistics,

    verifyOwnership

};
