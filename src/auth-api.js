"use strict";

/**
 * =========================================================
 * BILLION PIXEL CANVAS
 * AUTHENTICATION API
 * =========================================================
 *
 * Routes:
 *
 * POST /api/auth/register
 * POST /api/auth/login
 * POST /api/auth/logout
 * GET  /api/auth/me
 *
 * This file handles HTTP authentication requests.
 *
 * Passwords are processed by auth.js.
 * Session tokens are stored server-side.
 * =========================================================
 */

import {
    registerUser,
    loginUser,
    logoutUser,
    getAuthenticatedUser,
    sessionCookieHeaders,
    logoutCookieHeaders
} from "./auth.js";


/* =========================================================
   REGISTER
========================================================= */

export async function register(
    request,
    env
) {

    const body =
        await readJson(
            request
        );


    const email =
        body.email;


    const password =
        body.password;


    const user =
        await registerUser(
            env.DB,
            {
                email,
                password
            }
        );


    /*
     * Registration does not automatically log the user in.
     *
     * Email verification can be added before enabling
     * sensitive account functionality.
     */

    return json(
        {
            success:
                true,

            user: {

                id:
                    user.id,

                email:
                    user.email,

                emailVerified:
                    false,

                ageVerified:
                    false

            }

        },
        201
    );

}


/* =========================================================
   LOGIN
========================================================= */

export async function login(
    request,
    env
) {

    const body =
        await readJson(
            request
        );


    const result =
        await loginUser(
            env.DB,
            {

                email:
                    body.email,

                password:
                    body.password

            }
        );


    const response =
        json(
            {

                success:
                    true,

                user:
                    result.user,

                expiresAt:
                    result.expiresAt

            }
        );


    /*
     * Session token is returned ONLY as an HttpOnly cookie.
     *
     * It is not placed in JSON.
     */

    for (
        const [
            name,
            value
        ]
        of Object.entries(
            sessionCookieHeaders(
                result.sessionToken
            )
        )
    ) {

        response.headers.set(
            name,
            value
        );

    }


    return response;

}


/* =========================================================
   CURRENT USER
========================================================= */

export async function me(
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

                authenticated:
                    false,

                user:
                    null

            }
        );

    }


    return json(
        {

            authenticated:
                true,

            user

        }
    );

}


/* =========================================================
   LOGOUT
========================================================= */

export async function logout(
    request,
    env
) {

    const result =
        await logoutUser(
            request,
            env
        );


    const response =
        json(
            {
                success:
                    result.success
            }
        );


    for (
        const [
            name,
            value
        ]
        of Object.entries(
            logoutCookieHeaders()
        )
    ) {

        response.headers.set(
            name,
            value
        );

    }


    return response;

}


/* =========================================================
   ROUTER
========================================================= */

export async function handleAuthApi(
    request,
    env
) {

    const url =
        new URL(
            request.url
        );


    const path =
        url.pathname
            .replace(
                /^\/api\/auth\/?/,
                ""
            )
            .replace(
                /\/+$/,
                ""
            );


    const method =
        request.method.toUpperCase();


    /*
     * Registration
     */

    if (
        method === "POST" &&
        path === "register"
    ) {

        return register(
            request,
            env
        );

    }


    /*
     * Login
     */

    if (
        method === "POST" &&
        path === "login"
    ) {

        return login(
            request,
            env
        );

    }


    /*
     * Current session
     */

    if (
        method === "GET" &&
        path === "me"
    ) {

        return me(
            request,
            env
        );

    }


    /*
     * Logout
     */

    if (
        method === "POST" &&
        path === "logout"
    ) {

        return logout(
            request,
            env
        );

    }


    return json(
        {
            error:
                "Authentication endpoint not found."
        },
        404
    );

}


/* =========================================================
   JSON BODY
========================================================= */

async function readJson(
    request
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
