"use strict";

/*
 * =========================================================
 * BILLION PIXEL CANVAS
 * FRONTEND APPLICATION
 * =========================================================
 *
 * The browser NEVER decides:
 *
 * - pixel price
 * - ownership
 * - Bitcoin amount
 * - payment confirmation
 *
 * Those values come from the server.
 */


/* =========================================================
   CONFIG
========================================================= */

const API_BASE =
    "/api";


const CANVAS_WIDTH =
    40000;


const CANVAS_HEIGHT =
    25000;


const TOTAL_PIXELS =
    1_000_000_000;


const PRICE_PER_PIXEL =
    1;


const ADULT_MINIMUM =
    100_000;


/* =========================================================
   STATE
========================================================= */

const state = {

    user:
        null,

    authenticated:
        false,

    selectedDistrict:
        "main",

    quantity:
        1,

    zoom:
        1,

    canvas:

        null,

    context:

        null,

    viewport:

        null,

    dragging:
        false,

    dragStartX:
        0,

    dragStartY:
        0,

    offsetX:
        0,

    offsetY:
        0,

    pixels:
        new Map(),

    stats:
        {

            total:
                TOTAL_PIXELS,

            sold:
                0,

            available:
                TOTAL_PIXELS,

            valueSold:
                0

        },

    csrfToken:
        null

};


/* =========================================================
   DOM
========================================================= */

const $ =
    selector =>
        document.querySelector(
            selector
        );


const canvas =
    $("#pixelCanvas");


const viewport =
    $("#canvasViewport");


/* =========================================================
   INITIALIZATION
========================================================= */

document.addEventListener(
    "DOMContentLoaded",
    initialize
);


async function initialize() {

    state.canvas =
        canvas;


    state.context =
        canvas.getContext(
            "2d"
        );


    state.viewport =
        viewport;


    setupNavigation();

    setupPurchaseUI();

    setupAuthUI();

    setupCanvas();

    setupDistricts();

    await loadStats();

    await loadCurrentUser();

    drawCanvas();

}


/* =========================================================
   NAVIGATION
========================================================= */

function setupNavigation() {

    $("#buyHeroButton")
        ?.addEventListener(
            "click",
            () => openPurchase(
                "main"
            )
        );


    $("#loginButton")
        ?.addEventListener(
            "click",
            openAuth
        );


    $("#logoutButton")
        ?.addEventListener(
            "click",
            logout
        );

}


/* =========================================================
   PURCHASE UI
========================================================= */

function setupPurchaseUI() {

    $("#closePurchase")
        ?.addEventListener(
            "click",
            closePurchase
        );


    $("#continuePurchase")
        ?.addEventListener(
            "click",
            beginPurchase
        );


    $("#pixelQuantity")
        ?.addEventListener(
            "input",
            updatePurchaseTotal
        );


    $("#districtSelect")
        ?.addEventListener(
            "change",
            event => {

                state.selectedDistrict =
                    event.target.value;

                updateAdultNotice();

                updatePurchaseTotal();

            }
        );

}


/* =========================================================
   OPEN PURCHASE
========================================================= */

function openPurchase(
    district = "main"
) {

    state.selectedDistrict =
        district;


    $("#districtSelect").value =
        district;


    $("#pixelQuantity").value =
        district === "adult"
            ? ADULT_MINIMUM
            : 1;


    updateAdultNotice();

    updatePurchaseTotal();


    const panel =
        $("#purchasePanel");


    panel.classList.remove(
        "hidden"
    );


    panel.setAttribute(
        "aria-hidden",
        "false"
    );

}


/* =========================================================
   CLOSE PURCHASE
========================================================= */

function closePurchase() {

    const panel =
        $("#purchasePanel");


    panel.classList.add(
        "hidden"
    );


    panel.setAttribute(
        "aria-hidden",
        "true"
    );

}


/* =========================================================
   PURCHASE TOTAL
========================================================= */

function updatePurchaseTotal() {

    const quantity =
        getQuantity();


    const total =
        quantity *
        PRICE_PER_PIXEL;


    $("#purchaseTotal")
        .textContent =
            formatUsd(
                total
            );

}


/* =========================================================
   ADULT NOTICE
========================================================= */

function updateAdultNotice() {

    const isAdult =
        state.selectedDistrict ===
        "adult";


    $("#adultNotice")
        .classList.toggle(
            "hidden",
            !isAdult
        );


    $("#pixelQuantity")
        .min =
            isAdult
                ? String(
                    ADULT_MINIMUM
                )
                : "1";

}


/* =========================================================
   QUANTITY
========================================================= */

function getQuantity() {

    const input =
        $("#pixelQuantity");


    const quantity =
        Number(
            input.value
        );


    if (
        !Number.isSafeInteger(
            quantity
        )
    ) {

        return 1;

    }


    if (
        quantity < 1
    ) {

        return 1;

    }


    return quantity;

}


/* =========================================================
   BEGIN PURCHASE
========================================================= */

async function beginPurchase() {

    const quantity =
        getQuantity();


    state.quantity =
        quantity;


    if (
        state.selectedDistrict ===
        "adult" &&
        quantity <
            ADULT_MINIMUM
    ) {

        showMessage(
            "adultNotice",
            `Adult District requires at least ${ADULT_MINIMUM.toLocaleString()} pixels.`
        );

        return;

    }


    /*
     * Login required.
     */

    if (
        !state.authenticated
    ) {

        closePurchase();

        openAuth();

        showAuthMessage(
            "Sign in or create an account before purchasing."
        );

        return;

    }


    try {

        const order =
            await api(
                "/orders",
                {

                    method:
                        "POST",

                    body: {

                        districtId:
                            state.selectedDistrict,

                        quantity

                    }

                }
            );


        closePurchase();


        showPaymentModal(
            order
        );

    } catch (
        error
    ) {

        alert(
            error.message
        );

    }

}


/* =========================================================
   PAYMENT MODAL
========================================================= */

function showPaymentModal(
    order
) {

    const overlay =
        document.createElement(
            "div"
        );


    overlay.className =
        "purchase-panel";


    overlay.id =
        "paymentOverlay";


    overlay.innerHTML = `

        <div class="purchase-card">

            <button
                class="modal-close"
                id="closePayment"
                type="button"
            >
                ×
            </button>

            <div class="eyebrow">
                BITCOIN PAYMENT
            </div>

            <h2>
                Complete your purchase.
            </h2>

            <div class="payment-summary">

                <div>
                    <span>Pixels</span>
                    <strong>
                        ${formatNumber(
                            order.quantity
                        )}
                    </strong>
                </div>

                <div>
                    <span>Total</span>
                    <strong>
                        ${formatUsd(
                            order.priceUsd
                        )}
                    </strong>
                </div>

                <div>
                    <span>BTC to send</span>
                    <strong>
                        ${escapeHtml(
                            String(
                                order.bitcoinAmount
                            )
                        )}
                    </strong>
                </div>

            </div>

            <div class="btc-address">

                <span>
                    Send BTC to
                </span>

                <code>
                    ${escapeHtml(
                        order.paymentAddress
                    )}
                </code>

                <button
                    id="copyBtcAddress"
                    class="button button-outline button-wide"
                    type="button"
                >
                    Copy address
                </button>

            </div>

            <div class="payment-status">
                <span>
                    Payment status
                </span>

                <strong id="paymentStatus">
                    Awaiting payment
                </strong>
            </div>

            <button
                id="verifyPayment"
                class="button button-primary button-wide"
                type="button"
            >
                Check payment
            </button>

            <p class="purchase-note">
                Your pixels become permanently sold only
                after the Bitcoin payment has been independently
                verified and confirmed.
            </p>

        </div>

    `;


    document.body.appendChild(
        overlay
    );


    $("#closePayment")
        .addEventListener(
            "click",
            () => {

                overlay.remove();

            }
        );


    $("#copyBtcAddress")
        .addEventListener(
            "click",
            async () => {

                try {

                    await navigator.clipboard.writeText(
                        order.paymentAddress
                    );


                    $("#copyBtcAddress")
                        .textContent =
                            "Copied";

                } catch {

                    alert(
                        order.paymentAddress
                    );

                }

            }
        );


    $("#verifyPayment")
        .addEventListener(
            "click",
            () =>
                checkPayment(
                    order.id
                )
        );


    pollPayment(
        order.id
    );

}


/* =========================================================
   PAYMENT POLLING
========================================================= */

let paymentPollingTimer =
    null;


function pollPayment(
    orderId
) {

    clearInterval(
        paymentPollingTimer
    );


    paymentPollingTimer =
        setInterval(
            () =>
                checkPayment(
                    orderId,
                    true
                ),
            15_000
        );


    checkPayment(
        orderId,
        true
    );

}


/* =========================================================
   CHECK PAYMENT
========================================================= */

async function checkPayment(
    orderId,
    silent = false
) {

    try {

        const payment =
            await api(
                `/orders/${encodeURIComponent(
                    orderId
                )}/payment`
            );


        const status =
            payment.status ||
            "AWAITING_PAYMENT";


        const statusElement =
            $("#paymentStatus");


        if (
            statusElement
        ) {

            statusElement.textContent =
                paymentStatusText(
                    status,
                    payment.confirmations
                );

        }


        if (
            status ===
            "CONFIRMED"
        ) {

            clearInterval(
                paymentPollingTimer
            );


            await finalizePayment(
                orderId
            );

        }

    } catch (
        error
    ) {

        if (!silent) {

            alert(
                error.message
            );

        }

    }

}


/* =========================================================
   FINALIZE PAYMENT
========================================================= */

async function finalizePayment(
    orderId
) {

    try {

        const result =
            await api(
                `/orders/${encodeURIComponent(
                    orderId
                )}/verify-payment`,
                {

                    method:
                        "POST",

                    body: {}

                }
            );


        if (
            result.status ===
            "CONFIRMED"
        ) {

            const status =
                $("#paymentStatus");


            if (
                status
            ) {

                status.textContent =
                    "Payment confirmed. Your pixels are permanently owned.";

            }


            await loadStats();

            drawCanvas();

        }

    } catch (
        error
    ) {

        console.error(
            error
        );

    }

}


/* =========================================================
   PAYMENT STATUS TEXT
========================================================= */

function paymentStatusText(
    status,
    confirmations = 0
) {

    switch (
        status
    ) {

        case "AWAITING_PAYMENT":

            return "Awaiting Bitcoin payment.";

        case "UNDERPAID":

            return "Payment received, but the amount is insufficient.";

        case "CONFIRMING":

            return `Bitcoin payment detected — ${Number(
                confirmations || 0
            )} confirmations.`;

        case "CONFIRMED":

            return "Bitcoin payment confirmed.";

        default:

            return status;

    }

}


/* =========================================================
   AUTH UI
========================================================= */

let authMode =
    "login";


function setupAuthUI() {

    $("#closeAuth")
        ?.addEventListener(
            "click",
            closeAuth
        );


    $("#authForm")
        ?.addEventListener(
            "submit",
            submitAuth
        );


    $("#switchAuthMode")
        ?.addEventListener(
            "click",
            switchAuthMode
        );

}


/* =========================================================
   OPEN AUTH
========================================================= */

function openAuth() {

    authMode =
        "login";


    updateAuthMode();


    const panel =
        $("#authPanel");


    panel.classList.remove(
        "hidden"
    );


    panel.setAttribute(
        "aria-hidden",
        "false"
    );

}


/* =========================================================
   CLOSE AUTH
========================================================= */

function closeAuth() {

    const panel =
        $("#authPanel");


    panel.classList.add(
        "hidden"
    );


    panel.setAttribute(
        "aria-hidden",
        "true"
    );

}


/* =========================================================
   AUTH MODE
========================================================= */

function updateAuthMode() {

    const registerMode =
        authMode ===
        "register";


    $("#authTitle")
        .textContent =
            registerMode
                ? "Create an account."
                : "Sign in.";


    $("#authSubmit")
        .textContent =
            registerMode
                ? "Create account"
                : "Sign in";


    $("#switchAuthMode")
        .textContent =
            registerMode
                ? "Already have an account?"
                : "Create an account";


    const password =
        $("#authPassword");


    if (
        password
    ) {

        password.autocomplete =
            registerMode
                ? "new-password"
                : "current-password";

    }

}


/* =========================================================
   SWITCH AUTH
========================================================= */

function switchAuthMode() {

    authMode =
        authMode ===
        "login"
            ? "register"
            : "login";


    updateAuthMode();

}


/* =========================================================
   SUBMIT AUTH
========================================================= */

async function submitAuth(
    event
) {

    event.preventDefault();


    const email =
        $("#authEmail")
            .value
            .trim();


    const password =
        $("#authPassword")
            .value;


    try {

        if (
            authMode ===
            "register"
        ) {

            await api(
                "/auth/register",
                {

                    method:
                        "POST",

                    body: {

                        email,

                        password

                    }

                }
            );


            showAuthMessage(
                "Account created. You can now sign in."
            );


            authMode =
                "login";


            updateAuthMode();


            return;

        }


        await api(
            "/auth/login",
            {

                method:
                    "POST",

                body: {

                    email,

                    password

                }

            }
        );


        await loadCurrentUser();

        closeAuth();

    } catch (
        error
    ) {

        showAuthMessage(
            error.message
        );

    }

}


/* =========================================================
   LOAD CURRENT USER
========================================================= */

async function loadCurrentUser() {

    try {

        const result =
            await api(
                "/auth/me"
            );


        state.authenticated =
            Boolean(
                result.authenticated
            );


        state.user =
            result.user ||
            null;


        updateAccountUI();

    } catch {

        state.authenticated =
            false;

        state.user =
            null;

    }

}


/* =========================================================
   LOGOUT
========================================================= */

async function logout() {

    try {

        await api(
            "/auth/logout",
            {
                method:
                    "POST",
                body: {}
            }
        );

    } catch (
        error
    ) {

        console.error(
            error
        );

    }


    state.authenticated =
        false;


    state.user =
        null;


    updateAccountUI();

}


/* =========================================================
   ACCOUNT UI
========================================================= */

function updateAccountUI() {

    const account =
        $("#accountSection");


    const login =
        $("#loginButton");


    if (
        state.authenticated
    ) {

        account
            ?.classList
            .remove(
                "hidden"
            );


        if (
            login
        ) {

            login.textContent =
                "Account";

        }


        $("#accountEmail")
            .textContent =
                state.user?.email ||
                "—";

    } else {

        account
            ?.classList
            .add(
                "hidden"
            );


        if (
            login
        ) {

            login.textContent =
                "Sign in";

        }

    }

}


/* =========================================================
   STATS
========================================================= */

async function loadStats() {

    try {

        const stats =
            await api(
                "/canvas/stats"
            );


        state.stats =
            {

                total:
                    Number(
                        stats.total ||
                        TOTAL_PIXELS
                    ),

                sold:
                    Number(
                        stats.sold ||
                        0
                    ),

                available:
                    Number(
                        stats.available ??
                        (
                            TOTAL_PIXELS -
                            Number(
                                stats.sold ||
                                0
                            )
                        )
                    ),

                valueSold:
                    Number(
                        stats.valueSold ||
                        (
                            Number(
                                stats.sold ||
                                0
                            ) *
                            PRICE_PER_PIXEL
                        )
                    )

            };


        updateStatsUI();

    } catch (
        error
    ) {

        console.error(
            error
        );

    }

}


/* =========================================================
   STATS UI
========================================================= */

function updateStatsUI() {

    $("#totalPixels")
        .textContent =
            formatNumber(
                state.stats.total
            );


    $("#soldPixels")
        .textContent =
            formatNumber(
                state.stats.sold
            );


    $("#availablePixels")
        .textContent =
            formatNumber(
                state.stats.available
            );


    $("#valueSold")
        .textContent =
            formatUsd(
                state.stats.valueSold
            );

}


/* =========================================================
   CANVAS
========================================================= */

function setupCanvas() {

    resizeCanvas();


    window.addEventListener(
        "resize",
        resizeCanvas
    );


    canvas.addEventListener(
        "pointermove",
        handleCanvasMove
    );


    canvas.addEventListener(
        "pointerdown",
        handleCanvasPointerDown
    );


    canvas.addEventListener(
        "pointerup",
        handleCanvasPointerUp
    );


    canvas.addEventListener(
        "pointerleave",
        handleCanvasPointerUp
    );


    canvas.addEventListener(
        "wheel",
        handleCanvasWheel,
        {
            passive:
                false
        }
    );


    $("#zoomInButton")
        ?.addEventListener(
            "click",
            () =>
                changeZoom(
                    1.25
                )
        );


    $("#zoomOutButton")
        ?.addEventListener(
            "click",
            () =>
                changeZoom(
                    0.8
                )
        );

}


/* =========================================================
   RESIZE CANVAS
========================================================= */

function resizeCanvas() {

    const rect =
        viewport.getBoundingClientRect();


    const dpr =
        window.devicePixelRatio ||
        1;


    canvas.width =
        Math.max(
            1,
            Math.floor(
                rect.width *
                dpr
            )
        );


    canvas.height =
        Math.max(
            1,
            Math.floor(
                rect.height *
                dpr
            )
        );


    canvas.style.width =
        `${rect.width}px`;


    canvas.style.height =
        `${rect.height}px`;


    state.context.setTransform(
        dpr,
        0,
        0,
        dpr,
        0,
        0
    );


    drawCanvas();

}


/* =========================================================
   DRAW CANVAS
========================================================= */

function drawCanvas() {

    if (
        !state.context ||
        !viewport
    ) {

        return;

    }


    const ctx =
        state.context;


    const rect =
        viewport.getBoundingClientRect();


    ctx.clearRect(
        0,
        0,
        rect.width,
        rect.height
    );


    /*
     * Background.
     */

    ctx.fillStyle =
        "#080808";


    ctx.fillRect(
        0,
        0,
        rect.width,
        rect.height
    );


    /*
     * We intentionally render a zoomed overview rather than
     * attempting to draw one billion individual pixels.
     *
     * Actual ownership blocks will be loaded progressively.
     */

    const baseScale =
        Math.min(
            rect.width /
                CANVAS_WIDTH,
            rect.height /
                CANVAS_HEIGHT
        );


    const scale =
        baseScale *
        state.zoom;


    const width =
        CANVAS_WIDTH *
        scale;


    const height =
        CANVAS_HEIGHT *
        scale;


    const x =
        (
            rect.width -
            width
        ) /
        2 +
        state.offsetX;


    const y =
        (
            rect.height -
            height
        ) /
        2 +
        state.offsetY;


    ctx.strokeStyle =
        "rgba(255,255,255,.15)";


    ctx.lineWidth =
        1;


    ctx.strokeRect(
        x,
        y,
        width,
        height
    );


    /*
     * District outlines.
     */

    drawDistrict(
        ctx,
        x,
        y,
        scale,
        0,
        0,
        40000,
        18000
    );


    drawDistrict(
        ctx,
        x,
        y,
        scale,
        4000,
        4000,
        10000,
        6000
    );


    drawDistrict(
        ctx,
        x,
        y,
        scale,
        26000,
        4000,
        10000,
        6000
    );


    drawDistrict(
        ctx,
        x,
        y,
        scale,
        0,
        18000,
        40000,
        7000
    );


    /*
     * Draw known sold/reserved pixels only.
     */

    for (
        const pixel
        of state.pixels.values()
    ) {

        const px =
            x +
            pixel.x *
            scale;


        const py =
            y +
            pixel.y *
            scale;


        const size =
            Math.max(
                1,
                scale
            );


        ctx.fillStyle =
            pixel.status ===
                "SOLD"
                ? "#ffffff"
                : "#777777";


        ctx.fillRect(
            px,
            py,
            size,
            size
        );

    }

}


/* =========================================================
   DISTRICT DRAW
========================================================= */

function drawDistrict(
    ctx,
    originX,
    originY,
    scale,
    x,
    y,
    width,
    height
) {

    ctx.strokeRect(

        originX +
            x *
            scale,

        originY +
            y *
            scale,

        width *
            scale,

        height *
            scale

    );

}


/* =========================================================
   CANVAS MOVE
========================================================= */

function handleCanvasMove(
    event
) {

    const coordinate =
        eventToCanvasCoordinate(
            event
        );


    if (
        coordinate
    ) {

        $("#cursorCoordinate")
            .textContent =
                `${coordinate.x.toLocaleString()}, ${coordinate.y.toLocaleString()}`;

    }


    if (
        !state.dragging
    ) {

        return;

    }


    state.offsetX =
        event.clientX -
        state.dragStartX +
        state.dragOriginalOffsetX;


    state.offsetY =
        event.clientY -
        state.dragStartY +
        state.dragOriginalOffsetY;


    drawCanvas();

}


/* =========================================================
   POINTER DOWN
========================================================= */

function handleCanvasPointerDown(
    event
) {

    state.dragging =
        true;


    state.dragStartX =
        event.clientX;


    state.dragStartY =
        event.clientY;


    state.dragOriginalOffsetX =
        state.offsetX;


    state.dragOriginalOffsetY =
        state.offsetY;


    canvas.setPointerCapture(
        event.pointerId
    );

}


/* =========================================================
   POINTER UP
========================================================= */

function handleCanvasPointerUp(
    event
) {

    state.dragging =
        false;


    try {

        canvas.releasePointerCapture(
            event.pointerId
        );

    } catch {

        // Ignore.

    }

}


/* =========================================================
   WHEEL ZOOM
========================================================= */

function handleCanvasWheel(
    event
) {

    event.preventDefault();


    changeZoom(
        event.deltaY < 0
            ? 1.1
            : 0.9
    );

}


/* =========================================================
   CHANGE ZOOM
========================================================= */

function changeZoom(
    factor
) {

    state.zoom =
        Math.min(
            50,
            Math.max(
                0.25,
                state.zoom *
                factor
            )
        );


    $("#zoomLevel")
        .textContent =
            `${Math.round(
                state.zoom *
                100
            )}%`;


    drawCanvas();

}


/* =========================================================
   COORDINATE
========================================================= */

function eventToCanvasCoordinate(
    event
) {

    const rect =
        canvas.getBoundingClientRect();


    const baseScale =
        Math.min(
            rect.width /
                CANVAS_WIDTH,
            rect.height /
                CANVAS_HEIGHT
        );


    const scale =
        baseScale *
        state.zoom;


    const canvasWidth =
        CANVAS_WIDTH *
        scale;


    const canvasHeight =
        CANVAS_HEIGHT *
        scale;


    const originX =
        (
            rect.width -
            canvasWidth
        ) /
        2 +
        state.offsetX;


    const originY =
        (
            rect.height -
            canvasHeight
        ) /
        2 +
        state.offsetY;


    const x =
        Math.floor(
            (
                event.clientX -
                rect.left -
                originX
            ) /
            scale
        );


    const y =
        Math.floor(
            (
                event.clientY -
                rect.top -
                originY
            ) /
            scale
        );


    if (
        x < 0 ||
        y < 0 ||
        x >= CANVAS_WIDTH ||
        y >= CANVAS_HEIGHT
    ) {

        return null;

    }


    return {

        x,

        y

    };

}


/* =========================================================
   DISTRICTS
========================================================= */

function setupDistricts() {

    document
        .querySelectorAll(
            ".district-buy"
        )
        .forEach(
            button => {

                button.addEventListener(
                    "click",
                    () =>
                        openPurchase(
                            button.dataset
                                .district
                        )
                );

            }
        );

}


/* =========================================================
   API
========================================================= */

async function api(
    path,
    options = {}
) {

    const requestOptions = {

        method:
            options.method ||
            "GET",

        credentials:
            "include",

        headers: {

            "Accept":
                "application/json",

            ...(options.body
                ? {
                    "Content-Type":
                        "application/json"
                }
                : {}),

            ...(options.headers ||
                {})

        }

    };


    if (
        options.body
    ) {

        requestOptions.body =
            JSON.stringify(
                options.body
            );

    }


    const response =
        await fetch(
            `${API_BASE}${path}`,
            requestOptions
        );


    const contentType =
        response.headers.get(
            "content-type"
        ) ||
        "";


    const data =
        contentType.includes(
            "application/json"
        )
            ? await response.json()
            : null;


    if (
        !response.ok
    ) {

        const error =
            new Error(
                data?.error ||
                `Request failed (${response.status}).`
            );


        error.status =
            response.status;


        throw error;

    }


    return (
        data ||
        {}
    );

}


/* =========================================================
   AUTH MESSAGE
========================================================= */

function showAuthMessage(
    message
) {

    const element =
        $("#authMessage");


    if (
        !element
    ) {

        return;

    }


    element.textContent =
        message;

}


/* =========================================================
   GENERIC MESSAGE
========================================================= */

function showMessage(
    elementId,
    message
) {

    const element =
        document.getElementById(
            elementId
        );


    if (
        element
    ) {

        element.textContent =
            message;

    }

}


/* =========================================================
   NUMBER FORMATTING
========================================================= */

function formatNumber(
    value
) {

    return Number(
        value
    ).toLocaleString(
        "en-US"
    );

}


/* =========================================================
   USD
========================================================= */

function formatUsd(
    value
) {

    return (
        "$" +
        Number(
            value
        ).toLocaleString(
            "en-US",
            {
                maximumFractionDigits:
                    0
            }
        )
    );

}


/* =========================================================
   HTML ESCAPING
========================================================= */

function escapeHtml(
    value
) {

    return String(
        value
    )
        .replace(
            /&/g,
            "&amp;"
        )
        .replace(
            /</g,
            "&lt;"
        )
        .replace(
            />/g,
            "&gt;"
        )
        .replace(
            /"/g,
            "&quot;"
        )
        .replace(
            /'/g,
            "&#039;"
        );

}


/* =========================================================
   EXPORT FOR DEBUGGING
========================================================= */

window.BillionPixelCanvas = {

    state,

    openPurchase,

    openAuth,

    loadStats

};
