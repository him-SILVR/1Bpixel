/**
 * =========================================================
 * BILLION PIXEL CANVAS
 * COORDINATE SYSTEM
 * =========================================================
 *
 * TOTAL CANVAS:
 *
 * 1,000,000,000 pixels
 *
 * Every pixel has a permanent logical ID:
 *
 *     pixel_id
 *
 * and a visual coordinate:
 *
 *     x
 *     y
 *
 * =========================================================
 *
 * IMPORTANT
 *
 * The canvas is represented logically.
 *
 * We do NOT create one billion database rows just to
 * represent unsold pixels.
 *
 * Only purchased/reserved pixels need database records.
 *
 * =========================================================
 */

"use strict";


/* =========================================================
   MASTER CANVAS
========================================================= */

export const TOTAL_PIXELS =
    1_000_000_000;


/*
 * We use a rectangular logical grid.
 *
 * WIDTH × HEIGHT must be >= 1 billion.
 */

export const CANVAS_WIDTH =
    40_000;


export const CANVAS_HEIGHT =
    25_000;


/*
 * Exactly:
 *
 * 40,000 × 25,000
 * = 1,000,000,000
 */

if (
    CANVAS_WIDTH *
    CANVAS_HEIGHT !==
    TOTAL_PIXELS
) {

    throw new Error(
        "Canvas dimensions do not equal one billion pixels."
    );

}


/* =========================================================
   PIXEL ID → COORDINATE
========================================================= */

/**
 * Convert a zero-based pixel ID into x/y coordinates.
 *
 * pixel_id 0:
 * x = 0
 * y = 0
 *
 * pixel_id 1:
 * x = 1
 * y = 0
 *
 * ...
 */

export function pixelIdToCoordinate(
    pixelId
) {

    const id =
        Number(
            pixelId
        );


    validatePixelId(
        id
    );


    const x =
        id %
        CANVAS_WIDTH;


    const y =
        Math.floor(
            id /
            CANVAS_WIDTH
        );


    return {

        pixelId:
            id,

        x,

        y

    };

}


/* =========================================================
   COORDINATE → PIXEL ID
========================================================= */

export function coordinateToPixelId(
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


    return (
        coordinateY *
        CANVAS_WIDTH
    ) +
    coordinateX;

}


/* =========================================================
   VALIDATE PIXEL ID
========================================================= */

export function validatePixelId(
    pixelId
) {

    if (
        !Number.isSafeInteger(
            pixelId
        )
    ) {

        throw new Error(
            "Pixel ID must be an integer."
        );

    }


    if (
        pixelId < 0 ||
        pixelId >= TOTAL_PIXELS
    ) {

        throw new Error(
            "Pixel ID is outside the Billion Pixel Canvas."
        );

    }


    return true;

}


/* =========================================================
   VALIDATE COORDINATE
========================================================= */

export function validateCoordinate(
    x,
    y
) {

    if (
        !Number.isSafeInteger(x) ||
        !Number.isSafeInteger(y)
    ) {

        throw new Error(
            "Canvas coordinates must be integers."
        );

    }


    if (
        x < 0 ||
        x >= CANVAS_WIDTH
    ) {

        throw new Error(
            "X coordinate is outside the canvas."
        );

    }


    if (
        y < 0 ||
        y >= CANVAS_HEIGHT
    ) {

        throw new Error(
            "Y coordinate is outside the canvas."
        );

    }


    return true;

}


/* =========================================================
   COORDINATE KEY
========================================================= */

export function coordinateKey(
    x,
    y
) {

    validateCoordinate(
        x,
        y
    );


    return `${x}:${y}`;

}


/* =========================================================
   PIXEL KEY
========================================================= */

export function pixelKey(
    pixelId
) {

    validatePixelId(
        pixelId
    );


    return `pixel:${pixelId}`;

}


/* =========================================================
   CHECK RECTANGLE
========================================================= */

export function validateRectangle(
    x,
    y,
    width,
    height
) {

    const startX =
        Number(x);

    const startY =
        Number(y);

    const rectangleWidth =
        Number(width);

    const rectangleHeight =
        Number(height);


    if (
        !Number.isSafeInteger(
            startX
        ) ||
        !Number.isSafeInteger(
            startY
        ) ||
        !Number.isSafeInteger(
            rectangleWidth
        ) ||
        !Number.isSafeInteger(
            rectangleHeight
        )
    ) {

        throw new Error(
            "Rectangle coordinates and dimensions must be integers."
        );

    }


    if (
        rectangleWidth < 1 ||
        rectangleHeight < 1
    ) {

        throw new Error(
            "Rectangle dimensions must be positive."
        );

    }


    if (
        startX < 0 ||
        startY < 0
    ) {

        throw new Error(
            "Rectangle cannot start outside the canvas."
        );

    }


    if (
        startX +
        rectangleWidth >
        CANVAS_WIDTH
    ) {

        throw new Error(
            "Rectangle extends beyond the canvas width."
        );

    }


    if (
        startY +
        rectangleHeight >
        CANVAS_HEIGHT
    ) {

        throw new Error(
            "Rectangle extends beyond the canvas height."
        );

    }


    return {

        x:
            startX,

        y:
            startY,

        width:
            rectangleWidth,

        height:
            rectangleHeight,

        area:
            rectangleWidth *
            rectangleHeight

    };

}


/* =========================================================
   ITERATE RECTANGLE
========================================================= */

/**
 * Generate pixel IDs for a rectangle.
 *
 * This is intentionally a generator so a large rectangle
 * does not have to be copied into memory all at once.
 */

export function* iterateRectangle(
    x,
    y,
    width,
    height
) {

    const rectangle =
        validateRectangle(
            x,
            y,
            width,
            height
        );


    for (
        let row = 0;
        row < rectangle.height;
        row++
    ) {

        const currentY =
            rectangle.y +
            row;


        for (
            let column = 0;
            column < rectangle.width;
            column++
        ) {

            const currentX =
                rectangle.x +
                column;


            yield {

                pixelId:
                    coordinateToPixelId(
                        currentX,
                        currentY
                    ),

                x:
                    currentX,

                y:
                    currentY

            };

        }

    }

}


/* =========================================================
   DISTRICT SYSTEM
========================================================= */

/*
 * Districts are logical regions of the canvas.
 *
 * The exact visual layout can be changed before launch
 * without changing the permanent pixel ID system.
 *
 * Current planned structure:
 *
 * ┌──────────────────────────────────────────────┐
 * │                                              │
 * │                 MAIN DISTRICT                │
 * │                                              │
 * │       ┌──────────────┐                       │
 * │       │ GIANTS       │                       │
 * │       │ DISTRICT     │                       │
 * │       └──────────────┘                       │
 * │                                              │
 * │                         ┌──────────────────┐  │
 * │                         │ YOUTH DISTRICT   │  │
 * │                         └──────────────────┘  │
 * │                                              │
 * │  ┌────────────────────────────────────────┐  │
 * │  │ ADULT DISTRICT — 18+ / 100K MINIMUM   │  │
 * │  └────────────────────────────────────────┘  │
 * └──────────────────────────────────────────────┘
 *
 *
 * NOTE:
 *
 * District boundaries below are configuration, not ownership.
 *
 * A pixel still has one unique global pixel_id.
 */


/* =========================================================
   DISTRICT DEFINITIONS
========================================================= */

export const DISTRICT_LAYOUT = Object.freeze({

    main: {

        id:
            "main",

        name:
            "Main District",

        x:
            0,

        y:
            0,

        width:
            CANVAS_WIDTH,

        height:
            18_000,

        minimumPixels:
            1,

        adultOnly:
            false

    },


    giants: {

        id:
            "giants",

        name:
            "Giants District",

        x:
            4_000,

        y:
            4_000,

        width:
            10_000,

        height:
            6_000,

        minimumPixels:
            1,

        adultOnly:
            false

    },


    youth: {

        id:
            "youth",

        name:
            "Youth District",

        x:
            26_000,

        y:
            4_000,

        width:
            10_000,

        height:
            6_000,

        minimumPixels:
            1,

        adultOnly:
            false

    },


    adult: {

        id:
            "adult",

        name:
            "Adult District",

        x:
            0,

        y:
            18_000,

        width:
            CANVAS_WIDTH,

        height:
            7_000,

        minimumPixels:
            100_000,

        adultOnly:
            true

    }

});


/* =========================================================
   DISTRICT LOOKUP
========================================================= */

export function getDistrict(
    districtId
) {

    if (
        typeof districtId !== "string"
    ) {

        return null;

    }


    return (
        DISTRICT_LAYOUT[
            districtId
                .trim()
                .toLowerCase()
        ] ||
        null
    );

}


/* =========================================================
   COORDINATE → DISTRICT
========================================================= */

export function getDistrictAtCoordinate(
    x,
    y
) {

    validateCoordinate(
        x,
        y
    );


    /*
     * More specific districts are checked first.
     */

    const districtIds = [

        "giants",

        "youth",

        "adult",

        "main"

    ];


    for (
        const districtId
        of districtIds
    ) {

        const district =
            DISTRICT_LAYOUT[
                districtId
            ];


        if (
            x >= district.x &&

            x <
                district.x +
                district.width &&

            y >= district.y &&

            y <
                district.y +
                district.height
        ) {

            return district;

        }

    }


    return null;

}


/* =========================================================
   DISTRICT AREA
========================================================= */

export function getDistrictArea(
    districtId
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


    return (
        district.width *
        district.height
    );

}


/* =========================================================
   DISTRICT PIXEL ITERATOR
========================================================= */

export function* iterateDistrictPixels(
    districtId
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


    yield* iterateRectangle(

        district.x,

        district.y,

        district.width,

        district.height

    );

}


/* =========================================================
   CHECK PIXEL BELONGS TO DISTRICT
========================================================= */

export function pixelBelongsToDistrict(
    pixelId,
    districtId
) {

    const coordinate =
        pixelIdToCoordinate(
            pixelId
        );


    const district =
        getDistrictAtCoordinate(
            coordinate.x,
            coordinate.y
        );


    if (!district) {

        return false;

    }


    return (
        district.id ===
        districtId
    );

}


/* =========================================================
   GENERATE PIXEL RANGE
========================================================= */

export function getPixelRange(
    startPixelId,
    count
) {

    const start =
        Number(
            startPixelId
        );

    const amount =
        Number(
            count
        );


    validatePixelId(
        start
    );


    if (
        !Number.isSafeInteger(
            amount
        ) ||
        amount < 1
    ) {

        throw new Error(
            "Pixel count must be at least 1."
        );

    }


    const end =
        start +
        amount -
        1;


    if (
        end >= TOTAL_PIXELS
    ) {

        throw new Error(
            "Pixel range exceeds the canvas."
        );

    }


    return {

        start,

        end,

        count:
            amount

    };

}


/* =========================================================
   PUBLIC CANVAS CONFIGURATION
========================================================= */

export function getCanvasConfig() {

    return {

        totalPixels:
            TOTAL_PIXELS,

        width:
            CANVAS_WIDTH,

        height:
            CANVAS_HEIGHT,

        districts:
            Object.values(
                DISTRICT_LAYOUT
            )
                .map(
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

                        minimumPixels:
                            district.minimumPixels,

                        adultOnly:
                            district.adultOnly

                    })
                )

    };

}


/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {

    TOTAL_PIXELS,

    CANVAS_WIDTH,

    CANVAS_HEIGHT,

    DISTRICT_LAYOUT,

    pixelIdToCoordinate,

    coordinateToPixelId,

    getDistrict,

    getDistrictAtCoordinate,

    getDistrictArea,

    pixelBelongsToDistrict,

    getPixelRange

};
