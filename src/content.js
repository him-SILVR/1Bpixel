/**
 * =========================================================
 * BILLION PIXEL CANVAS
 * CONTENT ENGINE
 * =========================================================
 *
 * Content belongs to permanent pixel ownership.
 *
 * The owner of a pixel may publish permitted content to it.
 *
 * IMPORTANT:
 *
 * Ownership does NOT override applicable law or platform
 * safety rules.
 *
 * Prohibited material includes, among other things:
 *
 * - child sexual abuse material
 * - sexual exploitation
 * - non-consensual intimate imagery
 * - terrorism-related material
 * - illegal threats/incitement
 * - illegal content generally
 * - prohibited hate content
 *
 * Adult content may only exist inside the Adult District
 * and requires the district's minimum purchase of 100,000
 * pixels.
 *
 * =========================================================
 */

"use strict";


import {
    getOwnership
} from "./allocator.js";


import {
    getDistrict
} from "./coordinates.js";


/* =========================================================
   CONSTANTS
========================================================= */

const MAX_TITLE_LENGTH =
    200;


const MAX_DESCRIPTION_LENGTH =
    5_000;


const MAX_ALT_TEXT_LENGTH =
    500;


const MAX_URL_LENGTH =
    2_048;


/* =========================================================
   CONTENT TYPES
========================================================= */

const ALLOWED_CONTENT_TYPES =
    new Set([

        "IMAGE",

        "TEXT",

        "LOGO",

        "LINK",

        "ARTWORK"

    ]);


/* =========================================================
   CONTENT STATUS
========================================================= */

export const CONTENT_STATUS =
    Object.freeze({

        DRAFT:
            "DRAFT",

        PUBLISHED:
            "PUBLISHED",

        HIDDEN:
            "HIDDEN",

        REMOVED:
            "REMOVED"

    });


/* =========================================================
   BASIC STRING CLEANING
========================================================= */

function cleanString(
    value,
    maxLength
) {

    if (
        value === null ||
        value === undefined
    ) {

        return "";

    }


    if (
        typeof value !== "string"
    ) {

        throw new Error(
            "Invalid text value."
        );

    }


    return value
        .normalize("NFKC")
        .trim()
        .slice(
            0,
            maxLength
        );

}


/* =========================================================
   URL VALIDATION
========================================================= */

function validateUrl(
    value
) {

    const url =
        cleanString(
            value,
            MAX_URL_LENGTH
        );


    if (
        !url
    ) {

        return null;

    }


    let parsed;


    try {

        parsed =
            new URL(
                url
            );

    } catch {

        throw new Error(
            "Invalid URL."
        );

    }


    if (
        parsed.protocol !== "https:" &&
        parsed.protocol !== "http:"
    ) {

        throw new Error(
            "Only HTTP and HTTPS URLs are allowed."
        );

    }


    return parsed.toString();

}


/* =========================================================
   CONTENT TYPE
========================================================= */

function validateContentType(
    value
) {

    const type =
        String(
            value || ""
        )
            .trim()
            .toUpperCase();


    if (
        !ALLOWED_CONTENT_TYPES.has(
            type
        )
    ) {

        throw new Error(
            "Unsupported content type."
        );

    }


    return type;

}


/* =========================================================
   CONTENT SAFETY
========================================================= */

/**
 * This function provides a server-side policy gate.
 *
 * It does NOT attempt to perfectly classify arbitrary images
 * or text. A production deployment should add automated
 * moderation and human review where appropriate.
 */

function validateContentPolicy(
    content,
    district
) {

    const adult =
        content.isAdultContent === true;


    /*
     * Adult material can only be attached to the Adult
     * District.
     */

    if (
        adult &&
        !district.adultOnly
    ) {

        throw new Error(
            "Adult content is only permitted in the Adult District."
        );

    }


    /*
     * The Adult District itself is restricted.
     */

    if (
        adult &&
        district.id !== "adult"
    ) {

        throw new Error(
            "Invalid adult-content district."
        );

    }


    /*
     * Never allow the platform to be used for illegal material.
     *
     * These fields are supplied by the application/admin
     * moderation layer when content has been reviewed.
     */

    if (
        content.policyStatus ===
        "PROHIBITED"
    ) {

        throw new Error(
            "This content is prohibited."
        );

    }


    return true;

}


/* =========================================================
   OWNERSHIP CHECK
========================================================= */

async function requireOwnership(
    db,
    ownershipId,
    userId
) {

    if (
        !ownershipId
    ) {

        throw new Error(
            "Ownership ID is required."
        );

    }


    if (
        !userId
    ) {

        throw new Error(
            "Authentication required."
        );

    }


    const ownership =
        await getOwnership(
            db,
            ownershipId
        );


    if (!ownership) {

        const error =
            new Error(
                "Ownership record not found."
            );


        error.status =
            404;


        throw error;

    }


    if (
        ownership.status !==
        "SOLD"
    ) {

        throw new Error(
            "Only permanently owned pixels can publish content."
        );

    }


    if (
        ownership.user_id !==
        userId
    ) {

        const error =
            new Error(
                "You do not own this pixel."
            );


        error.status =
            403;


        throw error;

    }


    return ownership;

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
        await requireOwnership(
            db,
            ownershipId,
            userId
        );


    if (
        !content
    ) {

        throw new Error(
            "Content data is required."
        );

    }


    const contentType =
        validateContentType(
            content.contentType
        );


    const title =
        cleanString(
            content.title,
            MAX_TITLE_LENGTH
        );


    const description =
        cleanString(
            content.description,
            MAX_DESCRIPTION_LENGTH
        );


    const altText =
        cleanString(
            content.altText,
            MAX_ALT_TEXT_LENGTH
        );


    const imageUrl =
        validateUrl(
            content.imageUrl
        );


    const externalUrl =
        validateUrl(
            content.externalUrl
        );


    const isAdultContent =
        content.isAdultContent === true;


    const district =
        getDistrict(
            ownership.district_id
        );


    if (!district) {

        throw new Error(
            "Ownership district does not exist."
        );

    }


    validateContentPolicy(
        {

            contentType,

            title,

            description,

            imageUrl,

            externalUrl,

            altText,

            isAdultContent

        },
        district
    );


    /*
     * Adult content requires age verification.
     */

    if (
        isAdultContent
    ) {

        const user =
            await db.prepare(
                `
                SELECT
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


        if (
            Number(
                user?.age_verified
            ) !== 1
        ) {

            const error =
                new Error(
                    "Age verification is required for Adult District content."
                );


            error.status =
                403;


            throw error;

        }

    }


    const contentId =
        `content_${crypto.randomUUID()}`;


    await db.prepare(
        `
        INSERT INTO ownership_content (

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

        contentType,

        title,

        description,

        imageUrl,

        externalUrl,

        altText,

        isAdultContent ? 1 : 0

    )
    .run();


    await createContentEvent(
        db,
        {

            contentId,

            userId,

            eventType:
                "CREATED"

        }
    );


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

    if (
        !contentId
    ) {

        return null;

    }


    const content =
        await db.prepare(
            `
            SELECT

                c.*,

                d.name AS district_name,

                d.adult_only

            FROM ownership_content c

            JOIN pixel_ownership po
                ON po.id = c.ownership_id

            JOIN districts d
                ON d.id = po.district_id

            WHERE c.id = ?

            LIMIT 1
            `
        )
        .bind(
            contentId
        )
        .first();


    if (!content) {

        return null;

    }


    /*
     * Public response deliberately does not expose internal
     * moderation/audit information.
     */

    return {

        id:
            content.id,

        ownershipId:
            content.ownership_id,

        userId:
            content.user_id,

        contentType:
            content.content_type,

        title:
            content.title,

        description:
            content.description,

        imageUrl:
            content.image_url,

        externalUrl:
            content.external_url,

        altText:
            content.alt_text,

        isAdultContent:
            Number(
                content.is_adult_content
            ) === 1,

        status:
            content.status,

        district:
            content.district_name,

        createdAt:
            content.created_at,

        publishedAt:
            content.published_at

    };

}


/* =========================================================
   LIST OWNERSHIP CONTENT
========================================================= */

export async function listOwnershipContent(
    db,
    ownershipId
) {

    const rows =
        await db.prepare(
            `
            SELECT
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
                status,
                created_at,
                published_at
            FROM ownership_content
            WHERE ownership_id = ?

              AND status IN (
                  'PUBLISHED',
                  'HIDDEN'
              )

            ORDER BY created_at DESC
            `
        )
        .bind(
            ownershipId
        )
        .all();


    return {

        results:
            (rows.results || [])
                .map(
                    row => ({

                        id:
                            row.id,

                        ownershipId:
                            row.ownership_id,

                        contentType:
                            row.content_type,

                        title:
                            row.title,

                        description:
                            row.description,

                        imageUrl:
                            row.image_url,

                        externalUrl:
                            row.external_url,

                        altText:
                            row.alt_text,

                        isAdultContent:
                            Number(
                                row.is_adult_content
                            ) === 1,

                        status:
                            row.status,

                        createdAt:
                            row.created_at,

                        publishedAt:
                            row.published_at

                    })
                )

    };

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
        await db.prepare(
            `
            SELECT
                *
            FROM ownership_content
            WHERE id = ?
            LIMIT 1
            `
        )
        .bind(
            contentId
        )
        .first();


    if (!content) {

        throw new Error(
            "Content not found."
        );

    }


    if (
        content.user_id !==
        userId
    ) {

        const error =
            new Error(
                "You cannot publish content you do not own."
            );


        error.status =
            403;


        throw error;

    }


    if (
        content.status ===
        "REMOVED"
    ) {

        throw new Error(
            "Removed content cannot be published."
        );

    }


    const ownership =
        await requireOwnership(
            db,
            content.ownership_id,
            userId
        );


    const district =
        getDistrict(
            ownership.district_id
        );


    if (!district) {

        throw new Error(
            "District not found."
        );

    }


    /*
     * Adult content requires age verification at publication
     * time as well.
     */

    if (
        Number(
            content.is_adult_content
        ) === 1
    ) {

        const user =
            await db.prepare(
                `
                SELECT
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


        if (
            Number(
                user?.age_verified
            ) !== 1
        ) {

            const error =
                new Error(
                    "Age verification is required."
                );


            error.status =
                403;


            throw error;

        }

    }


    await db.prepare(
        `
        UPDATE ownership_content

        SET

            status =
                'PUBLISHED',

            published_at =
                CURRENT_TIMESTAMP,

            updated_at =
                CURRENT_TIMESTAMP

        WHERE id = ?

          AND user_id = ?

          AND status !=
              'REMOVED'
        `
    )
    .bind(
        contentId,
        userId
    )
    .run();


    await createContentEvent(
        db,
        {

            contentId,

            userId,

            eventType:
                "PUBLISHED"

        }
    );


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
        await db.prepare(
            `
            SELECT
                *
            FROM ownership_content
            WHERE id = ?
            LIMIT 1
            `
        )
        .bind(
            contentId
        )
        .first();


    if (!content) {

        throw new Error(
            "Content not found."
        );

    }


    if (
        content.user_id !==
        userId
    ) {

        const error =
            new Error(
                "You cannot modify content you do not own."
            );


        error.status =
            403;


        throw error;

    }


    await db.prepare(
        `
        UPDATE ownership_content

        SET

            status =
                'HIDDEN',

            hidden_at =
                CURRENT_TIMESTAMP,

            updated_at =
                CURRENT_TIMESTAMP

        WHERE id = ?

          AND user_id = ?

          AND status !=
              'REMOVED'
        `
    )
    .bind(
        contentId,
        userId
    )
    .run();


    await createContentEvent(
        db,
        {

            contentId,

            userId,

            eventType:
                "HIDDEN"

        }
    );


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
        await db.prepare(
            `
            SELECT
                id,
                status
            FROM ownership_content
            WHERE id = ?
            LIMIT 1
            `
        )
        .bind(
            contentId
        )
        .first();


    if (!content) {

        const error =
            new Error(
                "Content not found."
            );


        error.status =
            404;


        throw error;

    }


    const normalizedReason =
        cleanString(
            reason,
            200
        );


    const normalizedDetails =
        cleanString(
            details,
            2_000
        );


    if (
        !normalizedReason
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

        normalizedReason,

        normalizedDetails

    )
    .run();


    await createContentEvent(
        db,
        {

            contentId,

            userId:
                reporterUserId,

            eventType:
                "REPORTED"

        }
    );


    return {

        reportId,

        status:
            "OPEN"

    };

}


/* =========================================================
   CREATE CONTENT EVENT
========================================================= */

async function createContentEvent(
    db,
    {
        contentId,
        userId,
        eventType,
        metadata = null
    }
) {

    await db.prepare(
        `
        INSERT INTO content_events (

            id,

            content_id,

            user_id,

            event_type,

            metadata_json

        )

        VALUES (

            ?,

            ?,

            ?,

            ?,

            ?

        )
        `
    )
    .bind(

        `event_${crypto.randomUUID()}`,

        contentId,

        userId || null,

        eventType,

        metadata
            ? JSON.stringify(
                metadata
            )
            : null

    )
    .run();

}


/* =========================================================
   MODERATION REMOVE
========================================================= */

export async function removeContent(
    db,
    {
        contentId,
        moderatorUserId,
        reason
    }
) {

    if (
        !moderatorUserId
    ) {

        throw new Error(
            "Moderator authentication is required."
        );

    }


    const content =
        await db.prepare(
            `
            SELECT
                *
            FROM ownership_content
            WHERE id = ?
            LIMIT 1
            `
        )
        .bind(
            contentId
        )
        .first();


    if (!content) {

        throw new Error(
            "Content not found."
        );

    }


    await db.prepare(
        `
        UPDATE ownership_content

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


    await db.prepare(
        `
        INSERT INTO moderation_actions (

            id,

            content_id,

            ownership_id,

            moderator_user_id,

            action,

            reason

        )

        VALUES (

            ?,

            ?,

            ?,

            ?,

            'REMOVE_CONTENT',

            ?

        )
        `
    )
    .bind(

        `moderation_${crypto.randomUUID()}`,

        contentId,

        content.ownership_id,

        moderatorUserId,

        cleanString(
            reason,
            1_000
        )

    )
    .run();


    await createContentEvent(
        db,
        {

            contentId,

            userId:
                moderatorUserId,

            eventType:
                "MODERATION_REMOVED"

        }
    );


    return {

        contentId,

        status:
            "REMOVED"

    };

}


/* =========================================================
   EXPORTS
========================================================= */

export {

    ALLOWED_CONTENT_TYPES,

    createContent,

    getContent,

    listOwnershipContent,

    publishContent,

    hideContent,

    reportContent,

    removeContent

};
