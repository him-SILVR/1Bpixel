"use strict";

/**
 * BILLION PIXEL CANVAS
 * ADMIN API
 */

import {
    requireAdmin,
    getReports,
    getReport,
    startReportReview,
    resolveReport,
    dismissReport,
    restoreContent,
    adminHideContent,
    getAdminStatistics
} from "./admin.js";

import {
    getAuthenticatedUser
} from "./auth.js";


/* =========================================================
   ROUTER
========================================================= */

export async function handleAdminApi(
    request,
    env
) {

    const user =
        await getAuthenticatedUser(
            request,
            env
        );


    if (!user) {

        return json(
            {
                error:
                    "Authentication required."
            },
            401
        );

    }


    await requireAdmin(
        env.DB,
        user.id
    );


    const url =
        new URL(
            request.url
        );


    const path =
        url.pathname
            .replace(
                /^\/api\/admin\/?/,
                ""
            )
            .replace(
                /\/+$/,
                ""
            );


    const method =
        request.method.toUpperCase();


    /* =====================================================
       STATISTICS
    ===================================================== */

    if (
        method === "GET" &&
        path === "stats"
    ) {

        const stats =
            await getAdminStatistics(
                env.DB,
                user.id
            );


        return json(
            stats
        );

    }


    /* =====================================================
       REPORT LIST
    ===================================================== */

    if (
        method === "GET" &&
        path === "reports"
    ) {

        const status =
            url.searchParams.get(
                "status"
            ) ||
            "OPEN";


        const limit =
            url.searchParams.get(
                "limit"
            ) ||
            "50";


        const offset =
            url.searchParams.get(
                "offset"
            ) ||
            "0";


        const reports =
            await getReports(
                env.DB,
                {
                    status,
                    limit,
                    offset
                }
            );


        return json(
            {
                reports
            }
        );

    }


    /* =====================================================
       SINGLE REPORT
    ===================================================== */

    const reportMatch =
        path.match(
            /^reports\/([^/]+)$/
        );


    if (
        method === "GET" &&
        reportMatch
    ) {

        const reportId =
            decodeURIComponent(
                reportMatch[1]
            );


        const report =
            await getReport(
                env.DB,
                reportId
            );


        if (!report) {

            return json(
                {
                    error:
                        "Report not found."
                },
                404
            );

        }


        return json(
            {
                report
            }
        );

    }


    /* =====================================================
       START REVIEW
    ===================================================== */

    const reviewMatch =
        path.match(
            /^reports\/([^/]+)\/review$/
        );


    if (
        method === "POST" &&
        reviewMatch
    ) {

        const reportId =
            decodeURIComponent(
                reviewMatch[1]
            );


        const result =
            await startReportReview(
                env.DB,
                {

                    reportId,

                    moderatorUserId:
                        user.id

                }
            );


        return json(
            {
                report:
                    result
            }
        );

    }


    /* =====================================================
       RESOLVE REPORT
    ===================================================== */

    const resolveMatch =
        path.match(
            /^reports\/([^/]+)\/resolve$/
        );


    if (
        method === "POST" &&
        resolveMatch
    ) {

        const reportId =
            decodeURIComponent(
                resolveMatch[1]
            );


        const body =
            await readJson(
                request
            );


        const result =
            await resolveReport(
                env.DB,
                {

                    reportId,

                    moderatorUserId:
                        user.id,

                    resolution:
                        body.resolution,

                    removeContent:
                        Boolean(
                            body.removeContent
                        )

                }
            );


        return json(
            {
                report:
                    result
            }
        );

    }


    /* =====================================================
       DISMISS REPORT
    ===================================================== */

    const dismissMatch =
        path.match(
            /^reports\/([^/]+)\/dismiss$/
        );


    if (
        method === "POST" &&
        dismissMatch
    ) {

        const reportId =
            decodeURIComponent(
                dismissMatch[1]
            );


        const body =
            await readJson(
                request
            );


        const result =
            await dismissReport(
                env.DB,
                {

                    reportId,

                    moderatorUserId:
                        user.id,

                    resolution:
                        body.resolution

                }
            );


        return json(
            {
                report:
                    result
            }
        );

    }


    /* =====================================================
       HIDE CONTENT
    ===================================================== */

    const hideMatch =
        path.match(
            /^content\/([^/]+)\/hide$/
        );


    if (
        method === "POST" &&
        hideMatch
    ) {

        const contentId =
            decodeURIComponent(
                hideMatch[1]
            );


        const body =
            await readJson(
                request,
                true
            );


        const result =
            await adminHideContent(
                env.DB,
                {

                    contentId,

                    moderatorUserId:
                        user.id,

                    reason:
                        body.reason

                }
            );


        return json(
            result
        );

    }


    /* =====================================================
       RESTORE CONTENT
    ===================================================== */

    const restoreMatch =
        path.match(
            /^content\/([^/]+)\/restore$/
        );


    if (
        method === "POST" &&
        restoreMatch
    ) {

        const contentId =
            decodeURIComponent(
                restoreMatch[1]
            );


        const body =
            await readJson(
                request,
                true
            );


        const result =
            await restoreContent(
                env.DB,
                {

                    contentId,

                    moderatorUserId:
                        user.id,

                    reason:
                        body.reason

                }
            );


        return json(
            result
        );

    }


    return json(
        {
            error:
                "Admin endpoint not found."
        },
        404
    );

}


/* =========================================================
   JSON BODY
========================================================= */

async function readJson(
    request,
    optional = false
) {

    const contentType =
        request.headers.get(
            "content-type"
        ) ||
        "";


    if (
        !contentType
            .toLowerCase()
            .includes(
                "application/json"
            )
    ) {

        if (
            optional
        ) {

            return {};

        }


        const error =
            new Error(
                "Request must use application/json."
            );


        error.status =
            415;


        throw error;

    }


    try {

        return await request.json();

    } catch {

        const error =
            new Error(
                "Invalid JSON request body."
            );


        error.status =
            400;


        throw error;

    }

}


/* =========================================================
   JSON RESPONSE
========================================================= */

function json(
    data,
    status = 200
) {

    return new Response(

        JSON.stringify(
            data
        ),

        {

            status,

            headers: {

                "Content-Type":
                    "application/json; charset=utf-8",

                "Cache-Control":
                    "no-store"

            }

        }

    );

}
