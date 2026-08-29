/**
 * =========================================================
 * BILLION PIXEL CANVAS
 * Content Management
 * =========================================================
 *
 * OWNERSHIP RULE
 *
 * Buying pixels gives the buyer permanent ownership of the
 * purchased canvas area.
 *
 * It does NOT grant ownership of the website itself and does
 * not override applicable law or platform rules.
 *
 * =========================================================
 *
 * CONTENT TYPES
 *
 * IMAGE
 * TEXT
 * LOGO
 * LINK
 * ARTWORK
 *
 * =========================================================
 *
 * SAFETY
 *
 * The platform supports broad expression, but content that is
 * illegal or otherwise prohibited by applicable law/platform
 * requirements cannot be published.
 *
 * Adult content:
 *
 * - Adult District only
 * - 18+ users only
 * - age verification required
 * - no child sexual content
 * - no sexual exploitation
 * - no non-consensual sexual content
 * - no trafficking content
 * - no illegal sexual material
 *
 * =========================================================
 */

"use strict";


/* =========================================================
   CONSTANTS
========================================================= */

export const CONTENT_TYPES = Object.freeze([
    "IMAGE",
    "TEXT",
    "LOGO",
    "LINK",
    "ARTWORK"
]);


export const CONTENT_STATUSES = Object.freeze([
    "DRAFT",
    "PUBLISHED",
    "HIDDEN",
    "REMOVED"
]);


export const MAX_TITLE_LENGTH = 160;

export const MAX_DESCRIPTION_LENGTH = 5000;

export const MAX_ALT_TEXT_LENGTH = 500;

export const MAX_EXTERNAL_URL_LENGTH = 2048;


/* =========================================================
   DISTRICT RULES
========================================================= */

const DISTRICT_RULES = Object.freeze({

    people: {

        adultOnly:
            false,

        familyFriendly:
            false

    },


    giants: {

        adultOnly:
            false,

        familyFriendly:
            false

    },


    youth: {

        adultOnly:
            false,

        familyFriendly:
            true

    },


    adult: {

        adultOnly:
            true,

        familyFriendly:
            false

    }

});


/* =========================================================
   VALIDATION HELPERS
========================================================= */

function cleanString(
    value,
    maxLength
) {

    if (
        typeof value !== "string"
    ) {

        return "";

    }


    return value
        .trim()
        .slice(
            0,
            maxLength
        );

}


function isValidUrl(
    value
) {

    if (
        typeof value !== "string"
    ) {

        return false;

    }


    if (
        value.length >
        MAX_EXTERNAL_URL_LENGTH
    ) {

        return false;

    }


    try {

        const url =
            new URL(
                value
            );


        /*
         * Only web URLs are accepted.
         */

        return (
            url.protocol === "https:" ||
            url.protocol === "http:"
        );

    } catch {

        return false;

    }

}


/* =========================================================
   DISTRICT
========================================================= */

function getDistrictRule(
    districtId
) {

    return (
        DISTRICT_RULES[districtId] ||
        null
    );

}


/* =========================================================
   CONTENT TYPE
========================================================= */

export function validateContentType(
    contentType
) {

    if (
        !CONTENT_TYPES.includes(
            contentType
        )
    ) {

        throw new Error(
            "Unsupported content type."
        );

    }

}


/* =========================================================
   BASIC CONTENT VALIDATION
========================================================= */

export function validateContentInput(
    input
) {

    if (
        !input ||
        typeof input !== "object"
    ) {

        throw new Error(
            "Content payload is required."
        );

    }


    validateContentType(
        input.contentType
    );


    const title =
        cleanString(
            input.title,
            MAX_TITLE_LENGTH
        );


    const description =
        cleanString(
            input.description,
            MAX_DESCRIPTION_LENGTH
        );


    const altText =
        cleanString(
            input.altText,
            MAX_ALT_TEXT_LENGTH
        );


    const externalUrl =
        cleanString(
            input.externalUrl,
            MAX_EXTERNAL_URL_LENGTH
        );


    if (
        externalUrl &&
        !isValidUrl(
            externalUrl
        )
    ) {

        throw new Error(
            "External URL must be a valid HTTP or HTTPS URL."
        );

    }


    if (
        input.contentType ===
        "LINK" &&
        !externalUrl
    ) {

        throw new Error(
            "Link content requires an external URL."
        );

    }


    return {

        contentType:
            input.contentType,

        title,

        description,

        altText,

        imageUrl:
            cleanString(
                input.imageUrl,
                MAX_EXTERNAL_URL_LENGTH
            ),

        externalUrl

    };

}


/* =========================================================
   OWNERSHIP CHECK
========================================================= */

export async function getOwnership(
    db,
    ownershipId
) {

    if (
        typeof ownershipId !== "string" ||
        !ownershipId
    ) {

        throw new Error(
            "Ownership ID is required."
        );

    }


    const ownership =
        await db.prepare(
            `
            SELECT
                *
            FROM pixel_ownership
            WHERE id = ?
              AND status = 'SOLD'
            LIMIT 1
            `
        )
        .bind(
            ownershipId
        )
        .first();


    if (!ownership) {

        throw new Error(
            "Permanent pixel ownership record was not found."
        );

    }


    return ownership;

}


/* =========================================================
   OWNER AUTHORIZATION
========================================================= */

export async function assertOwnershipOwner(
    db,
    {
        ownershipId,
        userId
    }
) {

    if (
        !userId
    ) {

        throw new Error(
            "Authentication is required."
        );

    }


    const ownership =
        await getOwnership(
            db,
            ownershipId
        );


    if (
        ownership.user_id !==
        userId
    ) {

        throw new Error(
            "You do not own this canvas area."
        );

    }


    return ownership;

}


/* =========================================================
   ADULT CONTENT VALIDATION
========================================================= */

export async function validateAdultContent(
    db,
    {
        ownershipId,
        userId,
        isAdultContent
    }
) {

    const ownership =
        await assertOwnershipOwner(
            db,
            {
                ownershipId,
                userId
            }
        );


    const district =
        getDistrictRule(
            ownership.district_id
        );


    if (!district) {

        throw new Error(
            "Invalid district."
        );

    }


    if (
        isAdultContent !== true
    ) {

        return {

            allowed:
                true,

            adult:
                false

        };

    }


    /*
     * Adult content is restricted to the Adult District.
     */

    if (
        !district.adultOnly
    ) {

        throw new Error(
            "Adult content can only be published in the Adult District."
        );

    }


    /*
     * Check user age verification.
     */

    const user =
        await db.prepare(
            `
            SELECT
                id,
                age_verified
            FROM users
            WHERE id = ?
            LIMIT 1
            `
        )
        .bind(
            userId
        )
        .first();


    if (!user) {

        throw new Error(
            "User account was not found."
        );

    }


    if (
        Number(
            user.age_verified
        ) !== 1
    ) {

        throw new Error(
            "18+ age verification is required for Adult District content."
        );

    }


    return {

        allowed:
            true,

        adult:
            true

    };

}


/* =========================================================
   PROHIBITED CONTENT CHECK
========================================================= */

export function validateProhibitedContent(
    input
) {

    /*
     * This is NOT intended to be the sole moderation system.
     *
     * Images and external links require additional moderation
     * infrastructure.
     *
     * This layer prevents obvious prohibited declarations
     * and establishes the server-side policy boundary.
     */

    const combinedText =
        [
            input.title,
            input.description,
            input.externalUrl
        ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();


    /*
     * The platform must never allow child sexual abuse
     * material, sexual exploitation, trafficking or similar
     * illegal material.
     *
     * Do not rely on keyword filtering alone in production.
     * A proper moderation/review pipeline is required.
     */

    const prohibitedIndicators = [

        "child sexual abuse material",

        "csam",

        "sexual exploitation of a minor",

        "child sexual exploitation"

    ];


    for (
        const indicator
        of prohibitedIndicators
    ) {

        if (
            combinedText.includes(
                indicator
            )
        ) {

            throw new Error(
                "This content cannot be published."
            );

        }

    }


    return true;

}


/* =========================================================
   YOUTH DISTRICT VALIDATION
========================================================= */

export function validateYouthContent(
    districtId,
    isAdultContent
) {

    if (
        districtId !==
        "youth"
    ) {

        return true;

    }


    if (
        isAdultContent === true
    ) {

        throw new Error(
            "Adult content cannot be published in the Youth District."
        );

    }


    return true;

}


/* =========================================================
   CREATE CONTENT
========================================================= */

export async function createContent(
    db,
    {
        ownershipId,
        userId,
        content
    }
) {

    const ownership =
        await assertOwnershipOwner(
            db,
            {
                ownershipId,
                userId
            }
        );


    const validated =
        validateContentInput(
            content
        );


    const isAdult =
        content.isAdultContent === true;


    validateYouthContent(
        ownership.district_id,
        isAdult
    );


    await validateAdultContent(
        db,
        {
            ownershipId,
            userId,
            isAdultContent:
                isAdult
        }
    );


    validateProhibitedContent(
        validated
    );


    const contentId =
        `content_${crypto.randomUUID()}`;


    /*
     * New content is initially stored as DRAFT.
     *
     * Publication can occur only after the platform's
     * publication/moderation rules are satisfied.
     */

    await db.prepare(
        `
        INSERT INTO canvas_content (

            id,

            ownership_id,

            user_id,

            content_type,

            title,

            description,

            image_url,

            external_url,

            alt_text,

            is_adult_content,

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

            'DRAFT'

        )
        `
    )
    .bind(

        contentId,

        ownershipId,

        userId,

        validated.contentType,

        validated.title,

        validated.description,

        validated.imageUrl,

        validated.externalUrl,

        validated.altText,

        isAdult
            ? 1
            : 0

    )
    .run();


    return getContent(
        db,
        contentId
    );

}


/* =========================================================
   GET CONTENT
========================================================= */

export async function getContent(
    db,
    contentId
) {

    const content =
        await db.prepare(
            `
            SELECT
                *
            FROM canvas_content
            WHERE id = ?
            LIMIT 1
            `
        )
        .bind(
            contentId
        )
        .first();


    return content || null;

}


/* =========================================================
   LIST CONTENT FOR OWNERSHIP
========================================================= */

export async function listOwnershipContent(
    db,
    ownershipId
) {

    return db.prepare(
        `
        SELECT
            *
        FROM canvas_content

        WHERE ownership_id = ?

        ORDER BY created_at DESC
        `
    )
    .bind(
        ownershipId
    )
    .all();

}


/* =========================================================
   PUBLISH CONTENT
========================================================= */

export async function publishContent(
    db,
    {
        contentId,
        userId
    }
) {

    const content =
        await getContent(
            db,
            contentId
        );


    if (!content) {

        throw new Error(
            "Content not found."
        );

    }


    await assertOwnershipOwner(
        db,
        {
            ownershipId:
                content.ownership_id,

            userId
        }
    );


    if (
        content.status ===
        "REMOVED"
    ) {

        throw new Error(
            "Removed content cannot be republished."
        );

    }


    /*
     * Revalidate before publication.
     */

    validateYouthContent(
        content.district_id ||
        (
            await getOwnership(
                db,
                content.ownership_id
            )
        ).district_id,

        Number(
            content.is_adult_content
        ) === 1
    );


    /*
     * Adult publication requires current verification.
     */

    await validateAdultContent(
        db,
        {

            ownershipId:
                content.ownership_id,

            userId,

            isAdultContent:
                Number(
                    content.is_adult_content
                ) === 1

        }
    );


    await db.prepare(
        `
        UPDATE canvas_content

        SET

            status =
                'PUBLISHED',

            updated_at =
                CURRENT_TIMESTAMP

        WHERE id = ?

          AND status IN (
              'DRAFT',
              'HIDDEN'
          )
        `
    )
    .bind(
        contentId
    )
    .run();


    return getContent(
        db,
        contentId
    );

}


/* =========================================================
   HIDE CONTENT
========================================================= */

export async function hideContent(
    db,
    {
        contentId,
        userId
    }
) {

    const content =
        await getContent(
            db,
            contentId
        );


    if (!content) {

        throw new Error(
            "Content not found."
        );

    }


    await assertOwnershipOwner(
        db,
        {
            ownershipId:
                content.ownership_id,

            userId
        }
    );


    await db.prepare(
        `
        UPDATE canvas_content

        SET

            status =
                'HIDDEN',

            updated_at =
                CURRENT_TIMESTAMP

        WHERE id = ?

          AND status != 'REMOVED'
        `
    )
    .bind(
        contentId
    )
    .run();


    return getContent(
        db,
        contentId
    );

}


/* =========================================================
   REPORT CONTENT
========================================================= */

export async function reportContent(
    db,
    {
        contentId,
        reporterUserId = null,
        reason,
        details = ""
    }
) {

    const content =
        await getContent(
            db,
            contentId
        );


    if (!content) {

        throw new Error(
            "Content not found."
        );

    }


    const cleanReason =
        cleanString(
            reason,
            500
        );


    const cleanDetails =
        cleanString(
            details,
            5000
        );


    if (
        !cleanReason
    ) {

        throw new Error(
            "A report reason is required."
        );

    }


    const reportId =
        `report_${crypto.randomUUID()}`;


    await db.prepare(
        `
        INSERT INTO content_reports (

            id,

            content_id,

            reporter_user_id,

            reason,

            details,

            status

        )

        VALUES (

            ?,

            ?,

            ?,

            ?,

            ?,

            'OPEN'

        )
        `
    )
    .bind(

        reportId,

        contentId,

        reporterUserId,

        cleanReason,

        cleanDetails

    )
    .run();


    return {

        id:
            reportId,

        status:
            "OPEN"

    };

}


/* =========================================================
   REMOVE CONTENT
========================================================= */

export async function removeContent(
    db,
    {
        contentId,
        reason
    }
) {

    const content =
        await getContent(
            db,
            contentId
        );


    if (!content) {

        throw new Error(
            "Content not found."
        );

    }


    await db.prepare(
        `
        UPDATE canvas_content

        SET

            status =
                'REMOVED',

            updated_at =
                CURRENT_TIMESTAMP

        WHERE id = ?
        `
    )
    .bind(
        contentId
    )
    .run();


    /*
     * The ownership itself remains permanent.
     *
     * Removing content does NOT return pixels to inventory.
     */

    return {

        contentId,

        status:
            "REMOVED",

        reason:
            cleanString(
                reason,
                1000
            )

    };

}


/* =========================================================
   CONTENT SUMMARY
========================================================= */

export async function getContentSummary(
    db,
    ownershipId
) {

    const result =
        await db.prepare(
            `
            SELECT

                COUNT(*) AS total,

                SUM(
                    CASE
                        WHEN status = 'PUBLISHED'
                        THEN 1
                        ELSE 0
                    END
                ) AS published,

                SUM(
                    CASE
                        WHEN status = 'REMOVED'
                        THEN 1
                        ELSE 0
                    END
                ) AS removed

            FROM canvas_content

            WHERE ownership_id = ?
            `
        )
        .bind(
            ownershipId
        )
        .first();


    return {

        total:
            Number(
                result?.total || 0
            ),

        published:
            Number(
                result?.published || 0
            ),

        removed:
            Number(
                result?.removed || 0
            )

    };

}


/* =========================================================
   EXPORTS
========================================================= */

export {

    DISTRICT_RULES

};
