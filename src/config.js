/**
 * =========================================================
 * BILLION PIXEL CANVAS
 * CENTRAL PROJECT CONFIGURATION
 * =========================================================
 *
 * MASTER COMMERCIAL RULES
 *
 * 1 PIXEL = $1 USD
 *
 * This price is permanently fixed.
 *
 * Bitcoin's market price does NOT change the USD price of
 * a pixel.
 *
 * =========================================================
 *
 * OWNERSHIP
 *
 * - Minimum purchase: 1 pixel
 * - Maximum purchase: none
 * - Sold pixels cannot be purchased again
 * - Sold pixels cannot be resold through this platform
 * - There is no auction system
 * - There is no resale marketplace
 * - There is no "resale slot"
 *
 * =========================================================
 */

"use strict";


/* =========================================================
   PROJECT IDENTITY
========================================================= */

export const PROJECT = Object.freeze({

    name:
        "Billion Pixel Canvas",

    slug:
        "billion-pixel-canvas",

    version:
        "1.0.0",

    currency:
        "USD"

});


/* =========================================================
   CANVAS
========================================================= */

export const CANVAS = Object.freeze({

    /*
     * Exactly one billion pixels.
     */

    totalPixels:
        1_000_000_000,


    /*
     * Conceptual square canvas.
     *
     * 31,622 × 31,622 is approximately one billion,
     * but the actual allocation system uses a logical
     * one-dimensional pixel ID internally.
     *
     * The coordinate layer maps IDs to the visual canvas.
     */

    width:
        31_623,

    height:
        31_623

});


/* =========================================================
   PRICING
========================================================= */

export const PRICING = Object.freeze({

    /*
     * THE fundamental commercial rule.
     */

    pricePerPixelUsd:
        1,


    /*
     * Minimum purchase.
     */

    minimumPixels:
        1,


    /*
     * No maximum purchase.
     *
     * The practical maximum is the number of currently
     * unsold pixels remaining.
     */

    maximumPixels:
        null,


    /*
     * Price cannot be changed by BTC/USD movements.
     */

    priceIsPermanent:
        true,


    /*
     * Resale is not part of the platform.
     */

    resaleEnabled:
        false,


    auctionEnabled:
        false,


    transferMarketplaceEnabled:
        false

});


/* =========================================================
   PAYMENT
========================================================= */

export const PAYMENT = Object.freeze({

    currency:
        "BTC",


    /*
     * Public Bitcoin receiving address supplied for this
     * project.
     */

    bitcoinAddress:
        "bc1qk8ehysk2fthd2p07zgdqz84tyvudkdn4565u40",


    /*
     * Number of confirmations required before ownership is
     * finalized.
     */

    requiredConfirmations:
        3,


    /*
     * BTC is only the payment currency.
     *
     * The underlying product price remains USD.
     */

    pricingCurrency:
        "USD",


    /*
     * Once a BTC quote is generated for an order, the BTC
     * amount is locked for that order.
     */

    quoteLocked:
        true

});


/* =========================================================
   ORDER STATES
========================================================= */

export const ORDER_STATUS = Object.freeze({

    RESERVED:
        "RESERVED",

    PAYMENT_PENDING:
        "PAYMENT_PENDING",

    PAYMENT_DETECTED:
        "PAYMENT_DETECTED",

    CONFIRMING:
        "CONFIRMING",

    PAID:
        "PAID",

    COMPLETED:
        "COMPLETED",

    EXPIRED:
        "EXPIRED",

    CANCELLED:
        "CANCELLED",

    UNDERPAID:
        "UNDERPAID",

    FAILED:
        "FAILED"

});


/* =========================================================
   OWNERSHIP STATES
========================================================= */

export const OWNERSHIP_STATUS = Object.freeze({

    SOLD:
        "SOLD",

    RESERVED:
        "RESERVED"

});


/* =========================================================
   OWNERSHIP POLICY
========================================================= */

export const OWNERSHIP_POLICY = Object.freeze({

    permanent:
        true,

    resale:
        false,

    auction:
        false,

    automaticExpirationAfterSale:
        false,


    /*
     * Once ownership has been finalized, that coordinate
     * can never return to inventory.
     */

    soldPixelsReturnToInventory:
        false,


    /*
     * The platform itself does not provide a resale mechanism.
     */

    platformTransferMarketplace:
        false

});


/* =========================================================
   DISTRICTS
========================================================= */

export const DISTRICTS = Object.freeze({

    /*
     * Main general-purpose canvas.
     */

    MAIN:
        "main",


    /*
     * Large-format district for major buyers.
     *
     * There is no special price.
     * Every pixel remains exactly $1.
     */

    GIANTS:
        "giants",


    /*
     * Youth/family-oriented district.
     */

    YOUTH:
        "youth",


    /*
     * Adult-only district.
     *
     * Separate rules apply.
     */

    ADULT:
        "adult"

});


/* =========================================================
   DISTRICT PURCHASE RULES
========================================================= */

export const DISTRICT_RULES = Object.freeze({

    main: {

        minimumPixels:
            1,

        adultOnly:
            false

    },


    giants: {

        minimumPixels:
            1,

        adultOnly:
            false

    },


    youth: {

        minimumPixels:
            1,

        adultOnly:
            false

    },


    adult: {

        /*
         * Adult District has a 100,000-pixel minimum as
         * previously defined.
         *
         * At $1/pixel this means:
         *
         * $100,000 minimum.
         */

        minimumPixels:
            100_000,

        adultOnly:
            true

    }

});


/* =========================================================
   CONTENT
========================================================= */

export const CONTENT = Object.freeze({

    allowedTypes: [

        "IMAGE",

        "TEXT",

        "LOGO",

        "LINK",

        "ARTWORK"

    ],


    /*
     * Ownership allows publishing within the platform rules.
     */

    ownerCanPublish:
        true,


    /*
     * Platform safety/legal requirements still apply.
     */

    illegalContentAllowed:
        false,


    terrorismContentAllowed:
        false,


    childSexualContentAllowed:
        false,


    sexualExploitationAllowed:
        false,


    nonConsensualSexualContentAllowed:
        false,


    hateContentAllowed:
        false

});


/* =========================================================
   ACCOUNT
========================================================= */

export const ACCOUNT = Object.freeze({

    minimumPasswordLength:
        12,

    sessionDays:
        30,

    emailVerificationRequired:
        true

});


/* =========================================================
   API
========================================================= */

export const API = Object.freeze({

    prefix:
        "/api",

    version:
        "v1"

});


/* =========================================================
   HELPER: PRICE OF PIXELS
========================================================= */

export function calculatePixelPriceUsd(
    quantity
) {

    const pixels =
        Number(
            quantity
        );


    if (
        !Number.isSafeInteger(
            pixels
        )
    ) {

        throw new Error(
            "Pixel quantity must be a whole number."
        );

    }


    if (
        pixels <
        PRICING.minimumPixels
    ) {

        throw new Error(
            "Minimum purchase is 1 pixel."
        );

    }


    return (
        pixels *
        PRICING.pricePerPixelUsd
    );

}


/* =========================================================
   HELPER: DISTRICT RULE
========================================================= */

export function getDistrictRules(
    districtId
) {

    return (
        DISTRICT_RULES[
            String(
                districtId
            ).toLowerCase()
        ] ||
        null
    );

}


/* =========================================================
   HELPER: VALIDATE DISTRICT PURCHASE
========================================================= */

export function validateDistrictPurchase(
    districtId,
    quantity
) {

    const rules =
        getDistrictRules(
            districtId
        );


    if (!rules) {

        throw new Error(
            "Invalid district."
        );

    }


    const pixels =
        Number(
            quantity
        );


    if (
        !Number.isSafeInteger(
            pixels
        )
    ) {

        throw new Error(
            "Pixel quantity must be a whole number."
        );

    }


    if (
        pixels <
        rules.minimumPixels
    ) {

        throw new Error(
            `This district requires a minimum purchase of ${rules.minimumPixels.toLocaleString()} pixels.`
        );

    }


    return true;

}


/* =========================================================
   HELPER: VERIFY PERMANENT OWNERSHIP POLICY
========================================================= */

export function isPermanentOwnership() {

    return (
        OWNERSHIP_POLICY.permanent ===
        true
    );

}


/* =========================================================
   HELPER: VERIFY NO RESALE
========================================================= */

export function isResaleDisabled() {

    return (
        OWNERSHIP_POLICY.resale ===
        false &&
        PRICING.resaleEnabled ===
        false
    );

}


/* =========================================================
   PUBLIC CONFIGURATION
========================================================= */

export function getPublicConfig() {

    return {

        project:
            PROJECT.name,

        version:
            PROJECT.version,

        totalPixels:
            CANVAS.totalPixels,

        pricePerPixelUsd:
            PRICING.pricePerPixelUsd,

        minimumPixels:
            PRICING.minimumPixels,

        maximumPixels:
            PRICING.maximumPixels,

        priceIsPermanent:
            PRICING.priceIsPermanent,

        resaleEnabled:
            PRICING.resaleEnabled,

        auctionEnabled:
            PRICING.auctionEnabled,

        paymentCurrency:
            PAYMENT.currency,

        bitcoinAddress:
            PAYMENT.bitcoinAddress,

        requiredConfirmations:
            PAYMENT.requiredConfirmations,

        districts: {

            main:
                DISTRICT_RULES.main,

            giants:
                DISTRICT_RULES.giants,

            youth:
                DISTRICT_RULES.youth,

            adult:
                DISTRICT_RULES.adult

        }

    };

}


/* =========================================================
   EXPORT ALL CONFIGURATION
========================================================= */

export default {

    PROJECT,

    CANVAS,

    PRICING,

    PAYMENT,

    ORDER_STATUS,

    OWNERSHIP_STATUS,

    OWNERSHIP_POLICY,

    DISTRICTS,

    DISTRICT_RULES,

    CONTENT,

    ACCOUNT,

    API

};
