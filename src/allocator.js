/**
 * =========================================================
 * BILLION PIXEL CANVAS
 * Pixel Allocation Engine
 * =========================================================
 *
 * Responsibilities:
 *
 * 1. Validate purchase quantity.
 * 2. Validate district.
 * 3. Find an available rectangular region.
 * 4. Prevent overlap with existing reservations/ownership.
 * 5. Create temporary reservations.
 * 6. Convert reservations into permanent ownership.
 *
 * IMPORTANT:
 *
 * This module is intended to run server-side.
 *
 * The browser must NEVER be allowed to directly create
 * pixel_ownership records.
 * =========================================================
 */

"use strict";

import {
    getDistrict,
    getDistrictCapacity,
    validateRectangle,
    rectangleArea,
    createRectangle
} from "./coordinates.js";


/* =========================================================
   CONSTANTS
========================================================= */

export const RESERVATION_MINUTES = 15;


/* =========================================================
   TIME HELPERS
========================================================= */

export function getExpirationDate(
    minutes = RESERVATION_MINUTES
) {

    const date =
        new Date();

    date.setMinutes(
        date.getMinutes() +
        minutes
    );

    return date.toISOString();

}


/* =========================================================
   UUID
========================================================= */

export function createId(
    prefix
) {

    return `${prefix}_${crypto.randomUUID()}`;

}


/* =========================================================
   DATE COMPARISON
========================================================= */

export function isExpired(
    isoDate
) {

    if (!isoDate) {

        return true;

    }

    return (
        new Date(isoDate).getTime() <=
        Date.now()
    );

}


/* =========================================================
   QUANTITY VALIDATION
========================================================= */

export function validatePurchaseQuantity(
    quantity,
    district
) {

    if (
        !Number.isSafeInteger(
            quantity
        )
    ) {

        return {
            valid: false,
            error:
                "Quantity must be a whole number."
        };

    }


    if (
        quantity <= 0
    ) {

        return {
            valid: false,
            error:
                "Quantity must be at least 1."
        };

    }


    if (
        quantity <
        district.minimumPurchasePixels
    ) {

        return {
            valid: false,
            error:
                `${district.name} requires at least ` +
                `${district.minimumPurchasePixels.toLocaleString()} pixels.`
        };

    }


    if (
        quantity >
        getDistrictCapacity(
            district
        )
    ) {

        return {
            valid: false,
            error:
                "Requested quantity exceeds the district capacity."
        };

    }


    return {
        valid: true
    };

}


/* =========================================================
   RECTANGLE OVERLAP SQL CONDITION
========================================================= */

function overlapCondition() {

    /*
     * Two rectangles overlap if neither is completely
     * to the left/right/above/below the other.
     */

    return `
        x_start < :candidate_right
        AND
        x_start + width > :candidate_left

        AND

        y_start < :candidate_bottom
        AND
        y_start + height > :candidate_top
    `;

}


/* =========================================================
   CHECK RESERVED/OWNED OVERLAP
========================================================= */

async function hasOverlap(
    db,
    districtId,
    rectangle
) {

    const candidateLeft =
        rectangle.x;

    const candidateTop =
        rectangle.y;

    const candidateRight =
        rectangle.x +
        rectangle.width;

    const candidateBottom =
        rectangle.y +
        rectangle.height;


    /*
     * Check permanent ownership.
     */

    const ownership =
        await db.prepare(
            `
            SELECT id
            FROM pixel_ownership
            WHERE district_id = :district_id
              AND status = 'SOLD'
              AND
              ${overlapCondition()}
            LIMIT 1
            `
        )
        .bind({

            district_id:
                districtId,

            candidate_left:
                candidateLeft,

            candidate_top:
                candidateTop,

            candidate_right:
                candidateRight,

            candidate_bottom:
                candidateBottom

        })
        .first();


    if (ownership) {

        return true;

    }


    /*
     * Check active reservations.
     *
     * Expired reservations are ignored by time.
     */

    const reservation =
        await db.prepare(
            `
            SELECT id
            FROM pixel_reservations
            WHERE district_id = :district_id
              AND status = 'ACTIVE'
              AND expires_at > CURRENT_TIMESTAMP
              AND
              ${overlapCondition()}
            LIMIT 1
            `
        )
        .bind({

            district_id:
                districtId,

            candidate_left:
                candidateLeft,

            candidate_top:
                candidateTop,

            candidate_right:
                candidateRight,

            candidate_bottom:
                candidateBottom

        })
        .first();


    if (reservation) {

        return true;

    }


    return false;

}


/* =========================================================
   FIND AVAILABLE RECTANGLE
========================================================= */

export async function findAvailableRectangle(
    db,
    districtId,
    quantity
) {

    const district =
        getDistrict(
            districtId
        );


    const quantityValidation =
        validatePurchaseQuantity(
            quantity,
            district
        );


    if (
        !quantityValidation.valid
    ) {

        throw new Error(
            quantityValidation.error
        );

    }


    /*
     * We need a rectangle containing at least `quantity`
     * pixels.
     *
     * Start with shapes that fit naturally into the district.
     */

    const possibleShapes =
        generateCandidateShapes(
            quantity,
            district
        );


    for (
        const shape
        of possibleShapes
    ) {

        /*
         * Scan using a deterministic grid.
         *
         * This is the initial allocator.
         *
         * For a very large production canvas, this should
         * eventually be replaced by a spatial index / free-space
         * allocator to avoid excessive scanning.
         */

        const maxX =
            district.x +
            district.width -
            shape.width;

        const maxY =
            district.y +
            district.height -
            shape.height;


        const step =
            Math.max(
                1,
                Math.floor(
                    Math.sqrt(
                        quantity
                    )
                )
            );


        for (
            let y =
                district.y;
            y <= maxY;
            y += step
        ) {

            for (
                let x =
                    district.x;
                x <= maxX;
                x += step
            ) {

                const rectangle = {

                    x,

                    y,

                    width:
                        shape.width,

                    height:
                        shape.height

                };


                const validation =
                    validateRectangle(
                        rectangle,
                        districtId
                    );


                if (
                    !validation.valid
                ) {

                    continue;

                }


                /*
                 * The rectangle may contain more pixels than
                 * requested if the shape is larger.
                 *
                 * We only generate exact shapes in the normal
                 * path, so this should equal quantity.
                 */

                if (
                    validation.pixelCount <
                    quantity
                ) {

                    continue;

                }


                const overlap =
                    await hasOverlap(
                        db,
                        districtId,
                        rectangle
                    );


                if (
                    !overlap
                ) {

                    return {

                        ...rectangle,

                        pixelCount:
                            validation.pixelCount

                    };

                }

            }

        }

    }


    /*
     * If no simple rectangle was found, try a more complete
     * row-based search.
     */

    const fallback =
        await findRowBasedRectangle(
            db,
            districtId,
            quantity
        );


    if (fallback) {

        return fallback;

    }


    throw new Error(
        "No contiguous pixel block of the requested size is currently available."
    );

}


/* =========================================================
   CANDIDATE SHAPES
========================================================= */

function generateCandidateShapes(
    quantity,
    district
) {

    const shapes = [];


    /*
     * Perfect square.
     */

    const square =
        Math.floor(
            Math.sqrt(
                quantity
            )
        );


    if (
        square *
        square ===
        quantity
    ) {

        shapes.push({

            width:
                square,

            height:
                square

        });

    }


    /*
     * Try factor pairs.
     */

    for (
        let width = 1;
        width <= Math.sqrt(quantity);
        width++
    ) {

        if (
            quantity %
            width !==
            0
        ) {

            continue;

        }


        const height =
            quantity /
            width;


        if (
            width <=
            district.width &&
            height <=
            district.height
        ) {

            shapes.push({

                width,

                height

            });


            if (
                width !== height
            ) {

                shapes.push({

                    width:
                        height,

                    height:
                        width

                });

            }

        }

    }


    /*
     * If the number isn't factorizable into a convenient
     * rectangle, use a single-row rectangle when possible.
     */

    if (
        quantity <=
        district.width
    ) {

        shapes.push({

            width:
                quantity,

            height:
                1

        });

    }


    /*
     * Use the full district width as a final candidate.
     */

    if (
        district.width > 0
    ) {

        const height =
            Math.ceil(
                quantity /
                district.width
            );


        if (
            height <=
            district.height
        ) {

            /*
             * This can be larger than the requested quantity.
             * Only add it when it is exact.
             */

            if (
                district.width *
                height ===
                quantity
            ) {

                shapes.push({

                    width:
                        district.width,

                    height

                });

            }

        }

    }


    /*
     * Remove duplicate shapes.
     */

    const unique =
        new Map();


    for (
        const shape
        of shapes
    ) {

        const key =
            `${shape.width}x${shape.height}`;

        unique.set(
            key,
            shape
        );

    }


    return [
        ...unique.values()
    ];

}


/* =========================================================
   ROW-BASED FALLBACK
========================================================= */

async function findRowBasedRectangle(
    db,
    districtId,
    quantity
) {

    const district =
        getDistrict(
            districtId
        );


    const width =
        Math.min(
            district.width,
            quantity
        );


    const height =
        Math.ceil(
            quantity /
            width
        );


    if (
        height >
        district.height
    ) {

        return null;

    }


    const maxX =
        district.x +
        district.width -
        width;

    const maxY =
        district.y +
        district.height -
        height;


    /*
     * Deterministic scan.
     */

    for (
        let y =
            district.y;
        y <= maxY;
        y++
    ) {

        for (
            let x =
                district.x;
            x <= maxX;
            x++
        ) {

            const rectangle = {

                x,

                y,

                width,

                height

            };


            const validation =
                validateRectangle(
                    rectangle,
                    districtId
                );


            if (
                !validation.valid
            ) {

                continue;

            }


            /*
             * Do not allocate extra pixels.
             */

            if (
                validation.pixelCount !==
                quantity
            ) {

                continue;

            }


            const overlap =
                await hasOverlap(
                    db,
                    districtId,
                    rectangle
                );


            if (
                !overlap
            ) {

                return {

                    ...rectangle,

                    pixelCount:
                        quantity

                };

            }

        }

    }


    return null;

}


/* =========================================================
   CREATE RESERVATION
========================================================= */

export async function createReservation(
    db,
    {
        orderId,
        userId = null,
        districtId,
        quantity
    }
) {

    const district =
        getDistrict(
            districtId
        );


    const validation =
        validatePurchaseQuantity(
            quantity,
            district
        );


    if (
        !validation.valid
    ) {

        throw new Error(
            validation.error
        );

    }


    /*
     * Find available space.
     */

    const rectangle =
        await findAvailableRectangle(
            db,
            districtId,
            quantity
        );


    /*
     * IMPORTANT:
     *
     * The caller must execute this operation inside an
     * appropriate database transaction/serialization strategy.
     *
     * The reservation itself is not proof of ownership.
     */

    const reservationId =
        createId(
            "res"
        );


    const expiresAt =
        getExpirationDate();


    await db.prepare(
        `
        INSERT INTO pixel_reservations (

            id,

            order_id,

            district_id,

            x_start,

            y_start,

            width,

            height,

            pixel_count,

            expires_at,

            status

        )

        VALUES (

            :id,

            :order_id,

            :district_id,

            :x_start,

            :y_start,

            :width,

            :height,

            :pixel_count,

            :expires_at,

            'ACTIVE'

        )
        `
    )
    .bind({

        id:
            reservationId,

        order_id:
            orderId,

        district_id:
            districtId,

        x_start:
            rectangle.x,

        y_start:
            rectangle.y,

        width:
            rectangle.width,

        height:
            rectangle.height,

        pixel_count:
            rectangle.pixelCount,

        expires_at:
            expiresAt

    })
    .run();


    return {

        id:
            reservationId,

        orderId,

        userId,

        districtId,

        x:
            rectangle.x,

        y:
            rectangle.y,

        width:
            rectangle.width,

        height:
            rectangle.height,

        pixelCount:
            rectangle.pixelCount,

        expiresAt

    };

}


/* =========================================================
   GET RESERVATION
========================================================= */

export async function getReservation(
    db,
    reservationId
) {

    return db.prepare(
        `
        SELECT
            *
        FROM pixel_reservations
        WHERE id = ?
        LIMIT 1
        `
    )
    .bind(
        reservationId
    )
    .first();

}


/* =========================================================
   CONVERT RESERVATION TO OWNERSHIP
========================================================= */

export async function finalizeOwnership(
    db,
    {
        reservationId
    }
) {

    const reservation =
        await getReservation(
            db,
            reservationId
        );


    if (!reservation) {

        throw new Error(
            "Reservation not found."
        );

    }


    if (
        reservation.status !==
        "ACTIVE"
    ) {

        throw new Error(
            "Reservation is no longer active."
        );

    }


    if (
        isExpired(
            reservation.expires_at
        )
    ) {

        await db.prepare(
            `
            UPDATE pixel_reservations
            SET status = 'EXPIRED'
            WHERE id = ?
              AND status = 'ACTIVE'
            `
        )
        .bind(
            reservationId
        )
        .run();


        throw new Error(
            "Reservation has expired."
        );

    }


    /*
     * Verify that the reservation still does not overlap
     * permanent ownership.
     */

    const overlap =
        await hasOverlap(
            db,
            reservation.district_id,
            {

                x:
                    reservation.x_start,

                y:
                    reservation.y_start,

                width:
                    reservation.width,

                height:
                    reservation.height

            }
        );


    /*
     * hasOverlap includes active reservations, including
     * this reservation itself, so we need a direct ownership
     * check here instead.
     */

    const ownershipOverlap =
        await db.prepare(
            `
            SELECT id
            FROM pixel_ownership
            WHERE district_id = ?
              AND status = 'SOLD'

              AND x_start < ?
              AND x_start + width > ?

              AND y_start < ?
              AND y_start + height > ?

            LIMIT 1
            `
        )
        .bind(

            reservation.district_id,

            reservation.x_start +
                reservation.width,

            reservation.x_start,

            reservation.y_start +
                reservation.height,

            reservation.y_start

        )
        .first();


    if (
        ownershipOverlap
    ) {

        throw new Error(
            "The reserved region has already been sold."
        );

    }


    /*
     * Create permanent ownership record.
     */

    const ownershipId =
        createId(
            "own"
        );


    const order =
        await db.prepare(
            `
            SELECT
                user_id,
                price_usd
            FROM orders
            WHERE id = ?
            LIMIT 1
            `
        )
        .bind(
            reservation.order_id
        )
        .first();


    if (!order) {

        throw new Error(
            "Associated order was not found."
        );

    }


    await db.prepare(
        `
        INSERT INTO pixel_ownership (

            id,

            order_id,

            user_id,

            district_id,

            x_start,

            y_start,

            width,

            height,

            pixel_count,

            price_usd,

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

            ?,

            ?,

            ?,

            'SOLD'

        )
        `
    )
    .bind(

        ownershipId,

        reservation.order_id,

        order.user_id || null,

        reservation.district_id,

        reservation.x_start,

        reservation.y_start,

        reservation.width,

        reservation.height,

        reservation.pixel_count,

        order.price_usd

    )
    .run();


    /*
     * Permanently consume the reservation.
     */

    await db.prepare(
        `
        UPDATE pixel_reservations

        SET status = 'CONVERTED'

        WHERE id = ?

          AND status = 'ACTIVE'
        `
    )
    .bind(
        reservationId
    )
    .run();


    /*
     * Mark order complete.
     */

    await db.prepare(
        `
        UPDATE orders

        SET
            status = 'COMPLETED',
            updated_at = CURRENT_TIMESTAMP

        WHERE id = ?

          AND status IN (
              'RESERVED',
              'PAYMENT_DETECTED',
              'CONFIRMING',
              'PAID'
          )
        `
    )
    .bind(
        reservation.order_id
    )
    .run();


    return {

        ownershipId,

        orderId:
            reservation.order_id,

        districtId:
            reservation.district_id,

        x:
            reservation.x_start,

        y:
            reservation.y_start,

        width:
            reservation.width,

        height:
            reservation.height,

        pixelCount:
            reservation.pixel_count,

        status:
            "SOLD"

    };

}


/* =========================================================
   EXPIRE OLD RESERVATIONS
========================================================= */

export async function expireReservations(
    db
) {

    const result =
        await db.prepare(
            `
            UPDATE pixel_reservations

            SET status = 'EXPIRED'

            WHERE status = 'ACTIVE'

              AND expires_at <= CURRENT_TIMESTAMP
            `
        )
        .run();


    return {

        expired:
            result.meta?.changes || 0

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

    return db.prepare(
        `
        SELECT
            po.*,
            u.username,
            u.display_name

        FROM pixel_ownership po

        LEFT JOIN users u
            ON u.id = po.user_id

        WHERE po.district_id = ?

          AND po.status = 'SOLD'

          AND po.x_start <= ?
          AND po.x_start + po.width > ?

          AND po.y_start <= ?
          AND po.y_start + po.height > ?

        LIMIT 1
        `
    )
    .bind(

        districtId,

        x,
        x,

        y,
        y

    )
    .first();

}


/* =========================================================
   GET DISTRICT SOLD TOTAL
========================================================= */

export async function getDistrictSoldPixels(
    db,
    districtId
) {

    const result =
        await db.prepare(
            `
            SELECT
                COALESCE(
                    SUM(pixel_count),
                    0
                ) AS sold_pixels

            FROM pixel_ownership

            WHERE district_id = ?

              AND status = 'SOLD'
            `
        )
        .bind(
            districtId
        )
        .first();


    return Number(
        result?.sold_pixels || 0
    );

}
