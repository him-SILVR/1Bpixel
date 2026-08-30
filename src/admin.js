"use strict";


/**
 * =========================================================
 * BILLION PIXEL CANVAS
 * ADMIN + MODERATION ENGINE
 * =========================================================
 *
 * Administrators can:
 *
 * - Review reports
 * - Review content
 * - Remove prohibited content
 * - Restore content after review
 * - View platform statistics
 *
 * IMPORTANT:
 *
 * Admin powers do NOT include:
 *
 * - changing the $1 pixel price
 * - selling somebody else's pixels
 * - transferring ownership
 * - enabling resale
 * - changing a SOLD pixel back to AVAILABLE
 *
 * Pixel ownership is permanent.
 */


/* =========================================================
   ADMIN ROLES
========================================================= */

const ADMIN_ROLES =
    new Set([
        "ADMIN",
        "MODERATOR"
    ]);


/* =========================================================
   REQUIRE ADMIN
========================================================= */

export async function requireAdmin(
    db,
    userId
) {

    if (
        !userId
    ) {

        const error =
            new Error(
                "Authentication required."
            );

        error.status =
            401;

        throw error;

    }


    const user =
        await db.prepare(
            `
            SELECT
                id,
                email,
                role
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

        const error =
            new Error(
                "User not found."
            );

        error.status =
            404;

        throw error;

    }


    if (
        !ADMIN_ROLES.has(
            user.role
        )
    ) {

        const error =
            new Error(
                "Administrator or moderator access required."
            );

        error.status =
            403;

        throw error;

    }


    return user;

}


/* =========================================================
   GET REPORTS
========================================================= */

export async function getReports(
    db,
    {
        status = "OPEN",
        limit = 50,
        offset = 0
    } = {}
) {

    const safeLimit =
        Math.min(
            Math.max(
                Number(limit) || 50,
                1
            ),
            100
        );


    const safeOffset =
        Math.max(
            Number(offset) || 0,
            0
        );


    const rows =
        await db.prepare(
            `
            SELECT

                r.id,

                r.content_id,

                r.reporter_user_id,

                r.reason,

                r.details,

                r.status,

                r.reviewed_by,

                r.reviewed_at,

                r.resolution,

                r.created_at,

                c.title AS content_title,

                c.content_type,

                c.is_adult_content

            FROM content_reports r

            LEFT JOIN ownership_content c
                ON c.id = r.content_id

            WHERE r.status = ?

            ORDER BY r.created_at ASC

            LIMIT ?

            OFFSET ?
            `
        )
        .bind(
            status,
            safeLimit,
            safeOffset
        )
        .all();


    return (
        rows.results ||
        []
    );

}


/* =========================================================
   GET REPORT
========================================================= */

export async function getReport(
    db,
    reportId
) {

    if (
        !reportId
    ) {

        throw new Error(
            "Report ID is required."
        );

    }


    const report =
        await db.prepare(
            `
            SELECT

                r.*,

                c.title AS content_title,

                c.content_type,

                c.description AS content_description,

                c.image_url,

                c.external_url,

                c.is_adult_content,

                c.status AS content_status

            FROM content_reports r

            LEFT JOIN ownership_content c
                ON c.id = r.content_id

            WHERE r.id = ?

            LIMIT 1
            `
        )
        .bind(
            reportId
        )
        .first();


    return report || null;

}


/* =========================================================
   START REPORT REVIEW
========================================================= */

export async function startReportReview(
    db,
    {
        reportId,
        moderatorUserId
    }
) {

    await requireAdmin(
        db,
        moderatorUserId
    );


    const report =
        await getReport(
            db,
            reportId
        );


    if (!report) {

        throw new Error(
            "Report not found."
        );

    }


    await db.prepare(
        `
        UPDATE content_reports

        SET

            status =
                'UNDER_REVIEW',

            reviewed_by =
                ?,

            reviewed_at =
                CURRENT_TIMESTAMP

        WHERE id = ?

          AND status =
              'OPEN'
        `
    )
    .bind(
        moderatorUserId,
        reportId
    )
    .run();


    return getReport(
        db,
        reportId
    );

}


/* =========================================================
   RESOLVE REPORT
========================================================= */

export async function resolveReport(
    db,
    {
        reportId,
        moderatorUserId,
        resolution,
        removeContent = false
    }
) {

    await requireAdmin(
        db,
        moderatorUserId
    );


    const report =
        await getReport(
            db,
            reportId
        );


    if (!report) {

        throw new Error(
            "Report not found."
        );

    }


    const normalizedResolution =
        String(
            resolution ||
            ""
        )
            .trim()
            .slice(
                0,
                2_000
            );


    if (
        !normalizedResolution
    ) {

        throw new Error(
            "A resolution is required."
        );

    }


    /*
     * If the review determines that content must be removed,
     * use the moderation system.
     */

    if (
        removeContent &&
        report.content_id
    ) {

        const {
            removeContent: remove
        } = await import(
            "./content.js"
        );


        await remove(
            db,
            {

                contentId:
                    report.content_id,

                moderatorUserId,

                reason:
                    normalizedResolution

            }
        );

    }


    await db.prepare(
        `
        UPDATE content_reports

        SET

            status =
                'RESOLVED',

            reviewed_by =
                ?,

            reviewed_at =
                CURRENT_TIMESTAMP,

            resolution =
                ?

        WHERE id = ?
        `
    )
    .bind(
        moderatorUserId,
        normalizedResolution,
        reportId
    )
    .run();


    await writeModerationAudit(
        db,
        {

            moderatorUserId,

            reportId,

            action:
                removeContent
                    ? "REPORT_RESOLVED_CONTENT_REMOVED"
                    : "REPORT_RESOLVED",

            metadata: {

                resolution:
                    normalizedResolution

            }

        }
    );


    return getReport(
        db,
        reportId
    );

}


/* =========================================================
   DISMISS REPORT
========================================================= */

export async function dismissReport(
    db,
    {
        reportId,
        moderatorUserId,
        resolution
    }
) {

    await requireAdmin(
        db,
        moderatorUserId
    );


    const report =
        await getReport(
            db,
            reportId
        );


    if (!report) {

        throw new Error(
            "Report not found."
        );

    }


    const normalizedResolution =
        String(
            resolution ||
            "Report dismissed after review."
        )
            .trim()
            .slice(
                0,
                2_000
            );


    await db.prepare(
        `
        UPDATE content_reports

        SET

            status =
                'DISMISSED',

            reviewed_by =
                ?,

            reviewed_at =
                CURRENT_TIMESTAMP,

            resolution =
                ?

        WHERE id = ?
        `
    )
    .bind(
        moderatorUserId,
        normalizedResolution,
        reportId
    )
    .run();


    await writeModerationAudit(
        db,
        {

            moderatorUserId,

            reportId,

            action:
                "REPORT_DISMISSED",

            metadata: {

                resolution:
                    normalizedResolution

            }

        }
    );


    return getReport(
        db,
        reportId
    );

}


/* =========================================================
   RESTORE CONTENT
========================================================= */

export async function restoreContent(
    db,
    {
        contentId,
        moderatorUserId,
        reason
    }
) {

    const moderator =
        await requireAdmin(
            db,
            moderatorUserId
        );


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
        content.status !==
        "REMOVED"
    ) {

        throw new Error(
            "Only removed content can be restored."
        );

    }


    /*
     * Restoration returns content to DRAFT.
     *
     * It does not automatically publish it.
     */

    await db.prepare(
        `
        UPDATE ownership_content

        SET

            status =
                'DRAFT',

            updated_at =
                CURRENT_TIMESTAMP

        WHERE id = ?

          AND status =
              'REMOVED'
        `
    )
    .bind(
        contentId
    )
    .run();


    await writeModerationAudit(
        db,
        {

            moderatorUserId:

                moderator.id,

            contentId,

            ownershipId:
                content.ownership_id,

            action:
                "CONTENT_RESTORED",

            metadata: {

                reason:
                    String(
                        reason ||
                        "Content restored after review."
                    )
                        .slice(
                            0,
                            2_000
                        )

            }

        }
    );


    return {

        contentId,

        status:
            "DRAFT"

    };

}


/* =========================================================
   HIDE CONTENT
========================================================= */

export async function adminHideContent(
    db,
    {
        contentId,
        moderatorUserId,
        reason
    }
) {

    await requireAdmin(
        db,
        moderatorUserId
    );


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
                'HIDDEN',

            hidden_at =
                CURRENT_TIMESTAMP,

            updated_at =
                CURRENT_TIMESTAMP

        WHERE id = ?

          AND status !=
              'REMOVED'
        `
    )
    .bind(
        contentId
    )
    .run();


    await writeModerationAudit(
        db,
        {

            moderatorUserId,

            contentId,

            ownershipId:
                content.ownership_id,

            action:
                "CONTENT_HIDDEN",

            metadata: {

                reason:
                    String(
                        reason ||
                        "Content hidden by moderator."
                    )
                        .slice(
                            0,
                            2_000
                        )

            }

        }
    );


    return {

        contentId,

        status:
            "HIDDEN"

    };

}


/* =========================================================
   PLATFORM STATISTICS
========================================================= */

export async function getAdminStatistics(
    db,
    moderatorUserId
) {

    await requireAdmin(
        db,
        moderatorUserId
    );


    const result =
        await db.batch([

            db.prepare(
                `
                SELECT
                    COUNT(*) AS total_users
                FROM users
                `
            ),

            db.prepare(
                `
                SELECT
                    COUNT(*) AS sold_pixels
                FROM canvas_pixels
                WHERE status = 'SOLD'
                `
            ),

            db.prepare(
                `
                SELECT
                    COUNT(*) AS reserved_pixels
                FROM canvas_pixels
                WHERE status = 'RESERVED'
                `
            ),

            db.prepare(
                `
                SELECT
                    COUNT(*) AS total_orders
                FROM orders
                `
            ),

            db.prepare(
                `
                SELECT
                    COUNT(*) AS completed_orders
                FROM orders
                WHERE status = 'COMPLETED'
                `
            ),

            db.prepare(
                `
                SELECT
                    COUNT(*) AS open_reports
                FROM content_reports
                WHERE status IN (
                    'OPEN',
                    'UNDER_REVIEW'
                )
                `
            ),

            db.prepare(
                `
                SELECT
                    COUNT(*) AS published_content
                FROM ownership_content
                WHERE status = 'PUBLISHED'
                `
            )

        ]);


    return {

        users:
            Number(
                result[0]?.results?.[0]?.total_users ||
                0
            ),

        soldPixels:
            Number(
                result[1]?.results?.[0]?.sold_pixels ||
                0
            ),

        reservedPixels:
            Number(
                result[2]?.results?.[0]?.reserved_pixels ||
                0
            ),

        totalOrders:
            Number(
                result[3]?.results?.[0]?.total_orders ||
                0
            ),

        completedOrders:
            Number(
                result[4]?.results?.[0]?.completed_orders ||
                0
            ),

        openReports:
            Number(
                result[5]?.results?.[0]?.open_reports ||
                0
            ),

        publishedContent:
            Number(
                result[6]?.results?.[0]?.published_content ||
                0
            )

    };

}


/* =========================================================
   WRITE MODERATION AUDIT
========================================================= */

async function writeModerationAudit(
    db,
    {
        moderatorUserId,
        reportId = null,
        contentId = null,
        ownershipId = null,
        action,
        metadata = null
    }
) {

    await db.prepare(
        `
        INSERT INTO moderation_actions (

            id,

            content_id,

            ownership_id,

            moderator_user_id,

            action,

            reason,

            notes

        )

        VALUES (

            ?,

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

        `moderation_${crypto.randomUUID()}`,

        contentId,

        ownershipId,

        moderatorUserId,

        action,

        reportId
            ? `Report: ${reportId}`
            : null,

        metadata
            ? JSON.stringify(
                metadata
            )
            : null

    )
    .run();

}


/* =========================================================
   EXPORTS
========================================================= */

export {

    ADMIN_ROLES

};
