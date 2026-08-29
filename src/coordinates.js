/**
 * =========================================================
 * BILLION PIXEL CANVAS
 * Coordinate & Allocation Engine
 * =========================================================
 *
 * Coordinate system:
 *
 *     (0,0) ----------------------> X
 *       |
 *       |
 *       |
 *       v
 *       Y
 *
 * Every logical pixel has:
 *
 *     x
 *     y
 *
 * Coordinates are zero-based.
 *
 * We do NOT create 1 billion database rows.
 *
 * Large purchases are represented as rectangular ownership
 * blocks whenever possible.
 * =========================================================
 */

"use strict";


/* =========================================================
   CANVAS CONSTANTS
========================================================= */

export const CANVAS_WIDTH = 31623;

export const CANVAS_HEIGHT = 31623;

export const TOTAL_CANVAS_PIXELS =
    1_000_014_129;


/*
 * 31,623 × 31,623 is slightly larger than one billion.
 *
 * Therefore the final implementation uses a logical
 * one-billion-pixel boundary rather than assuming every
 * coordinate in the square is valid.
 */

export const REQUIRED_PIXEL_COUNT =
    1_000_000_000;


/* =========================================================
   DISTRICT DEFINITIONS
========================================================= */

export const DISTRICTS = Object.freeze({

    people: Object.freeze({

        id: "people",

        name: "People's District",

        minimumPurchasePixels: 1,

        adultOnly: false,

        x: 0,

        y: 0,

        width: 15812,

        height: 31623

    }),


    giants: Object.freeze({

        id: "giants",

        name: "Giants District",

        minimumPurchasePixels: 100000,

        adultOnly: false,

        x: 15812,

        y: 0,

        width: 7906,

        height: 31623

    }),


    youth: Object.freeze({

        id: "youth",

        name: "Youth District",

        minimumPurchasePixels: 1,

        adultOnly: false,

        x: 23718,

        y: 0,

        width: 3953,

        height: 31623

    }),


    adult: Object.freeze({

        id: "adult",

        name: "Adult District",

        minimumPurchasePixels: 100000,

        adultOnly: true,

        x: 27671,

        y: 0,

        width: 3952,

        height: 31623

    })

});


/* =========================================================
   BASIC MATH
========================================================= */

export function rectanglePixelCount(
    width,
    height
) {

    if (
        !Number.isSafeInteger(width) ||
        !Number.isSafeInteger(height)
    ) {

        throw new Error(
            "Rectangle dimensions must be integers."
        );

    }

    if (
        width <= 0 ||
        height <= 0
    ) {

        throw new Error(
            "Rectangle dimensions must be positive."
        );

    }

    return width * height;

}


/* =========================================================
   DISTRICT CAPACITY
========================================================= */

export function getDistrictCapacity(
    district
) {

    return rectanglePixelCount(
        district.width,
        district.height
    );

}


/* =========================================================
   CANVAS BOUNDS
========================================================= */

export function isInsideCanvas(
    x,
    y
) {

    if (
        !Number.isSafeInteger(x) ||
        !Number.isSafeInteger(y)
    ) {

        return false;

    }

    if (
        x < 0 ||
        y < 0
    ) {

        return false;

    }

    /*
     * The logical canvas is one billion pixels.
     *
     * Coordinates beyond the configured rectangular
     * capacity are rejected.
     */

    if (
        x >= CANVAS_WIDTH ||
        y >= CANVAS_HEIGHT
    ) {

        return false;

    }

    return true;

}


/* =========================================================
   DISTRICT BOUNDS
========================================================= */

export function isInsideDistrict(
    x,
    y,
    districtId
) {

    const district =
        DISTRICTS[districtId];

    if (!district) {

        return false;

    }

    if (
        !isInsideCanvas(
            x,
            y
        )
    ) {

        return false;

    }

    return (
        x >= district.x &&
        x < district.x + district.width &&
        y >= district.y &&
        y < district.y + district.height
    );

}


/* =========================================================
   GET DISTRICT
========================================================= */

export function getDistrict(
    districtId
) {

    const district =
        DISTRICTS[districtId];

    if (!district) {

        throw new Error(
            `Unknown district: ${districtId}`
        );

    }

    return district;

}


/* =========================================================
   PIXEL ID
========================================================= */

export function coordinateToPixelId(
    x,
    y
) {

    if (
        !isInsideCanvas(
            x,
            y
        )
    ) {

        throw new Error(
            "Coordinate is outside the canvas."
        );

    }

    /*
     * Row-major logical identifier.
     *
     * This ID is deterministic.
     *
     * NOTE:
     * Because the square is slightly larger than one billion
     * coordinates, production code must also check that the
     * resulting ID is within the one-billion logical range.
     */

    const id =
        y * CANVAS_WIDTH +
        x;

    if (
        id >= REQUIRED_PIXEL_COUNT
    ) {

        throw new Error(
            "Coordinate is outside the one-billion-pixel logical range."
        );

    }

    return id;

}


/* =========================================================
   PIXEL ID → COORDINATE
========================================================= */

export function pixelIdToCoordinate(
    pixelId
) {

    if (
        !Number.isSafeInteger(pixelId)
    ) {

        throw new Error(
            "Pixel ID must be an integer."
        );

    }

    if (
        pixelId < 0 ||
        pixelId >= REQUIRED_PIXEL_COUNT
    ) {

        throw new Error(
            "Pixel ID is outside the canvas."
        );

    }

    const y =
        Math.floor(
            pixelId /
            CANVAS_WIDTH
        );

    const x =
        pixelId %
        CANVAS_WIDTH;

    return {
        x,
        y
    };

}


/* =========================================================
   COORDINATE OBJECT
========================================================= */

export function createCoordinate(
    x,
    y,
    districtId
) {

    if (
        !isInsideDistrict(
            x,
            y,
            districtId
        )
    ) {

        throw new Error(
            "Coordinate does not belong to the selected district."
        );

    }

    return {

        pixelId:
            coordinateToPixelId(
                x,
                y
            ),

        x,

        y,

        district:
            districtId

    };

}


/* =========================================================
   RECTANGLE VALIDATION
========================================================= */

export function validateRectangle(
    rectangle,
    districtId
) {

    if (!rectangle) {

        return {
            valid: false,
            reason:
                "Rectangle is required."
        };

    }

    const {
        x,
        y,
        width,
        height
    } = rectangle;


    if (
        !Number.isSafeInteger(x) ||
        !Number.isSafeInteger(y) ||
        !Number.isSafeInteger(width) ||
        !Number.isSafeInteger(height)
    ) {

        return {
            valid: false,
            reason:
                "Rectangle values must be integers."
        };

    }


    if (
        width <= 0 ||
        height <= 0
    ) {

        return {
            valid: false,
            reason:
                "Rectangle dimensions must be positive."
        };

    }


    const district =
        getDistrict(
            districtId
        );


    if (
        x < district.x ||
        y < district.y
    ) {

        return {
            valid: false,
            reason:
                "Rectangle begins outside the district."
        };

    }


    if (
        x + width >
        district.x +
        district.width
    ) {

        return {
            valid: false,
            reason:
                "Rectangle exceeds district width."
        };

    }


    if (
        y + height >
        district.y +
        district.height
    ) {

        return {
            valid: false,
            reason:
                "Rectangle exceeds district height."
        };

    }


    return {

        valid: true,

        pixelCount:
            width *
            height

    };

}


/* =========================================================
   RECTANGLE CREATOR
========================================================= */

export function createRectangle(
    x,
    y,
    width,
    height,
    districtId
) {

    const validation =
        validateRectangle(
            {
                x,
                y,
                width,
                height
            },
            districtId
        );


    if (!validation.valid) {

        throw new Error(
            validation.reason
        );

    }


    return {

        x,

        y,

        width,

        height,

        pixelCount:
            validation.pixelCount,

        district:
            districtId

    };

}


/* =========================================================
   RECTANGLE ITERATOR
========================================================= */

export function* iterateRectangle(
    rectangle
) {

    const {
        x,
        y,
        width,
        height
    } = rectangle;


    for (
        let currentY = y;
        currentY < y + height;
        currentY++
    ) {

        for (
            let currentX = x;
            currentX < x + width;
            currentX++
        ) {

            yield {

                x:
                    currentX,

                y:
                    currentY,

                pixelId:
                    coordinateToPixelId(
                        currentX,
                        currentY
                    )

            };

        }

    }

}


/* =========================================================
   RECTANGLE INTERSECTION
========================================================= */

export function rectanglesOverlap(
    first,
    second
) {

    return !(
        first.x +
        first.width <=
        second.x ||

        second.x +
        second.width <=
        first.x ||

        first.y +
        first.height <=
        second.y ||

        second.y +
        second.height <=
        first.y
    );

}


/* =========================================================
   RECTANGLE AREA
========================================================= */

export function rectangleArea(
    rectangle
) {

    return (
        rectangle.width *
        rectangle.height
    );

}


/* =========================================================
   FIND SIMPLE BLOCK SHAPE
========================================================= */

export function findSimpleBlockShape(
    pixelCount,
    districtId
) {

    const district =
        getDistrict(
            districtId
        );


    if (
        !Number.isSafeInteger(
            pixelCount
        ) ||
        pixelCount <= 0
    ) {

        throw new Error(
            "Pixel count must be a positive integer."
        );

    }


    if (
        pixelCount >
        getDistrictCapacity(
            district
        )
    ) {

        throw new Error(
            "Requested block exceeds district capacity."
        );

    }


    /*
     * Prefer a square where possible.
     */

    const squareSide =
        Math.floor(
            Math.sqrt(
                pixelCount
            )
        );


    if (
        squareSide > 0 &&
        squareSide *
        squareSide ===
        pixelCount
    ) {

        return {

            width:
                squareSide,

            height:
                squareSide

        };

    }


    /*
     * Otherwise use a single-row rectangle when possible.
     *
     * Large production purchases should use an allocator
     * optimized for the actual available geometry.
     */

    if (
        pixelCount <=
        district.width
    ) {

        return {

            width:
                pixelCount,

            height:
                1

        };

    }


    /*
     * Create the smallest height possible for the district
     * width.
     */

    const width =
        Math.min(
            district.width,
            pixelCount
        );

    const height =
        Math.ceil(
            pixelCount /
            width
        );


    if (
        height >
        district.height
    ) {

        throw new Error(
            "Unable to create a rectangle for requested pixel count."
        );

    }


    return {

        width,

        height

    };

}


/* =========================================================
   DISTRICT VALIDATION
========================================================= */

export function validateDistricts() {

    const districtList =
        Object.values(
            DISTRICTS
        );


    let total =
        0;


    for (
        const district
        of districtList
    ) {

        const capacity =
            getDistrictCapacity(
                district
            );


        if (
            capacity <= 0
        ) {

            throw new Error(
                `District ${district.id} has invalid capacity.`
            );

        }


        if (
            district.x < 0 ||
            district.y < 0
        ) {

            throw new Error(
                `District ${district.id} has invalid origin.`
            );

        }


        if (
            district.x +
            district.width >
            CANVAS_WIDTH
        ) {

            throw new Error(
                `District ${district.id} exceeds canvas width.`
            );

        }


        if (
            district.y +
            district.height >
            CANVAS_HEIGHT
        ) {

            throw new Error(
                `District ${district.id} exceeds canvas height.`
            );

        }


        total +=
            capacity;

    }


    /*
     * Ensure no two districts overlap.
     */

    for (
        let i = 0;
        i < districtList.length;
        i++
    ) {

        for (
            let j = i + 1;
            j < districtList.length;
            j++
        ) {

            if (
                rectanglesOverlap(
                    districtList[i],
                    districtList[j]
                )
            ) {

                throw new Error(
                    `District overlap detected between ` +
                    `${districtList[i].id} and ` +
                    `${districtList[j].id}.`
                );

            }

        }

    }


    return {

        valid: true,

        configuredCapacity:
            total,

        logicalCanvasSize:
            REQUIRED_PIXEL_COUNT

    };

}


/* =========================================================
   EXPORT CANVAS SUMMARY
========================================================= */

export function getCanvasSummary() {

    const validation =
        validateDistricts();


    return {

        width:
            CANVAS_WIDTH,

        height:
            CANVAS_HEIGHT,

        logicalPixels:
            REQUIRED_PIXEL_COUNT,

        configuredDistrictCapacity:
            validation.configuredCapacity,

        districts:
            Object.values(
                DISTRICTS
            ).map(
                district => ({

                    id:
                        district.id,

                    name:
                        district.name,

                    x:
                        district.x,

                    y:
                        district.y,

                    width:
                        district.width,

                    height:
                        district.height,

                    capacity:
                        getDistrictCapacity(
                            district
                        ),

                    minimumPurchasePixels:
                        district.minimumPurchasePixels,

                    adultOnly:
                        district.adultOnly

                })
            )

    };

}


/* =========================================================
   STARTUP VALIDATION
========================================================= */

try {

    validateDistricts();

} catch (error) {

    /*
     * Fail loudly during deployment/development.
     *
     * A production deployment should not start with an
     * invalid district configuration.
     */

    console.error(
        "Canvas configuration error:",
        error.message
    );

}
