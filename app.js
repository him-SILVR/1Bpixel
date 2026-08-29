/* =========================================================
   BILLION PIXEL CANVAS
   Frontend Application
========================================================= */

"use strict";


/* =========================================================
   PROJECT CONSTANTS
========================================================= */

const TOTAL_PIXELS = 1_000_000_000;

const BTC_RECEIVING_ADDRESS =
    "bc1qk8ehysk2fthd2p07zgdqz84tyvudkdn4565u40";


/*
    IMPORTANT

    This frontend NEVER decides whether a pixel is actually sold.

    Real ownership must be confirmed by the production backend.

    The current application uses temporary frontend state so the
    interface can be developed before connecting the backend.
*/


/* =========================================================
   DISTRICTS
========================================================= */

const DISTRICTS = {

    people: {
        name: "People's District",
        minimumPixels: 1,
        minimumPrice: 1,
        adultOnly: false
    },

    giants: {
        name: "Giants District",
        minimumPixels: 100000,
        minimumPrice: 100000,
        adultOnly: false
    },

    youth: {
        name: "Youth District",
        minimumPixels: 1,
        minimumPrice: 1,
        adultOnly: false
    },

    adult: {
        name: "Adult District",
        minimumPixels: 100000,
        minimumPrice: 100000,
        adultOnly: true
    }

};


/* =========================================================
   APPLICATION STATE
========================================================= */

const state = {

    selectedPixels: 0,

    selectedDistrict: "people",

    zoom: 1,

    panX: 0,

    panY: 0,

    isDragging: false,

    pointerStartX: 0,

    pointerStartY: 0,

    pointerLastX: 0,

    pointerLastY: 0,

    movedDuringPointer: false,

    soldPixels: 0

};


/* =========================================================
   DOM HELPERS
========================================================= */

function getElement(id) {

    return document.getElementById(id);

}


/* =========================================================
   DOM REFERENCES
========================================================= */

const canvasViewport =
    getElement("canvasViewport");

const canvasWorld =
    getElement("canvasWorld");

const districtSelect =
    getElement("districtSelect");

const selectionText =
    getElement("selectionText");

const clearSelectionButton =
    getElement("clearSelection");

const buySelectedButton =
    getElement("buySelectedButton");

const headerBuyButton =
    getElement("headerBuyButton");

const exploreButton =
    getElement("exploreButton");

const finalBuyButton =
    getElement("finalBuyButton");

const zoomInButton =
    getElement("zoomIn");

const zoomOutButton =
    getElement("zoomOut");

const zoomResetButton =
    getElement("zoomReset");

const checkoutOverlay =
    getElement("checkoutOverlay");

const closeCheckoutButton =
    getElement("closeCheckout");

const continueCheckoutButton =
    getElement("continueCheckout");

const pixelQuantityInput =
    getElement("pixelQuantity");

const checkoutDistrict =
    getElement("checkoutDistrict");

const checkoutPixels =
    getElement("checkoutPixels");

const checkoutPrice =
    getElement("checkoutPrice");

const pixelsSold =
    getElement("pixelsSold");

const pixelsAvailable =
    getElement("pixelsAvailable");

const totalRaised =
    getElement("totalRaised");


/* =========================================================
   NUMBER FORMATTING
========================================================= */

function formatNumber(number) {

    return new Intl.NumberFormat("en-US").format(number);

}


function formatCurrency(number) {

    return new Intl.NumberFormat(
        "en-US",
        {
            style: "currency",
            currency: "USD",
            maximumFractionDigits: 0
        }
    ).format(number);

}


/* =========================================================
   STATISTICS
========================================================= */

function updateStatistics() {

    const available =
        TOTAL_PIXELS - state.soldPixels;

    pixelsSold.textContent =
        formatNumber(state.soldPixels);

    pixelsAvailable.textContent =
        formatNumber(Math.max(0, available));

    totalRaised.textContent =
        formatCurrency(state.soldPixels);

}


/* =========================================================
   DISTRICT
========================================================= */

function getCurrentDistrict() {

    return DISTRICTS[state.selectedDistrict];

}


/* =========================================================
   SELECTION
========================================================= */

function updateSelectionDisplay() {

    const count =
        state.selectedPixels;

    selectionText.textContent =
        `${formatNumber(count)} pixel${count === 1 ? "" : "s"} selected`;

    if (count === 0) {

        buySelectedButton.textContent =
            "Buy Selected Pixels";

        return;

    }

    buySelectedButton.textContent =
        `Buy ${formatNumber(count)} Pixel${count === 1 ? "" : "s"}`;

}


function setSelectedPixels(number) {

    let count =
        Math.floor(Number(number));

    if (!Number.isFinite(count)) {

        count = 0;

    }

    count =
        Math.max(0, count);

    const district =
        getCurrentDistrict();

    const available =
        TOTAL_PIXELS - state.soldPixels;

    if (count > available) {

        count = available;

    }

    /*
        District minimum is checked when opening checkout,
        not here, because zero selection is allowed in UI.
    */

    state.selectedPixels =
        count;

    updateSelectionDisplay();

}


function clearSelection() {

    state.selectedPixels =
        0;

    updateSelectionDisplay();

}


/* =========================================================
   DISTRICT SELECTION
========================================================= */

function changeDistrict(value) {

    if (!DISTRICTS[value]) {

        return;

    }

    state.selectedDistrict =
        value;

    clearSelection();

}


/* =========================================================
   CANVAS TRANSFORMATION
========================================================= */

function updateCanvasTransform() {

    canvasWorld.style.transform =
        `
        translate(
            calc(-50% + ${state.panX}px),
            calc(-50% + ${state.panY}px)
        )
        scale(${state.zoom})
        `;

}


/* =========================================================
   ZOOM
========================================================= */

function zoomIn() {

    state.zoom =
        Math.min(
            20,
            state.zoom * 1.25
        );

    updateCanvasTransform();

}


function zoomOut() {

    state.zoom =
        Math.max(
            0.2,
            state.zoom / 1.25
        );

    updateCanvasTransform();

}


function resetZoom() {

    state.zoom =
        1;

    state.panX =
        0;

    state.panY =
        0;

    updateCanvasTransform();

}


/* =========================================================
   CANVAS DRAGGING
========================================================= */

function handlePointerDown(event) {

    state.isDragging =
        true;

    state.movedDuringPointer =
        false;

    state.pointerStartX =
        event.clientX;

    state.pointerStartY =
        event.clientY;

    state.pointerLastX =
        event.clientX;

    state.pointerLastY =
        event.clientY;

    canvasViewport.classList.add(
        "dragging"
    );

    try {

        canvasViewport.setPointerCapture(
            event.pointerId
        );

    } catch (error) {

        /*
            Pointer capture isn't available in every
            browser implementation.
        */

    }

}


function handlePointerMove(event) {

    if (!state.isDragging) {

        return;

    }

    const deltaX =
        event.clientX -
        state.pointerLastX;

    const deltaY =
        event.clientY -
        state.pointerLastY;

    const totalMovement =
        Math.abs(
            event.clientX -
            state.pointerStartX
        ) +
        Math.abs(
            event.clientY -
            state.pointerStartY
        );

    if (totalMovement > 5) {

        state.movedDuringPointer =
            true;

    }

    state.panX +=
        deltaX;

    state.panY +=
        deltaY;

    state.pointerLastX =
        event.clientX;

    state.pointerLastY =
        event.clientY;

    updateCanvasTransform();

}


function handlePointerUp(event) {

    if (!state.isDragging) {

        return;

    }

    state.isDragging =
        false;

    canvasViewport.classList.remove(
        "dragging"
    );

    try {

        canvasViewport.releasePointerCapture(
            event.pointerId
        );

    } catch (error) {

        /*
            Safe to ignore.
        */

    }


    /*
        A click without movement selects one pixel.

        The actual coordinate calculation will be handled
        by the production canvas engine/backend.
    */

    if (!state.movedDuringPointer) {

        setSelectedPixels(
            state.selectedPixels + 1
        );

    }

}


/* =========================================================
   CANVAS WHEEL ZOOM
========================================================= */

function handleWheel(event) {

    event.preventDefault();

    const zoomMultiplier =
        event.deltaY < 0
            ? 1.12
            : 0.89;

    state.zoom =
        Math.max(
            0.2,
            Math.min(
                20,
                state.zoom *
                zoomMultiplier
            )
        );

    updateCanvasTransform();

}


/* =========================================================
   OPEN CHECKOUT
========================================================= */

function openCheckout() {

    const district =
        getCurrentDistrict();

    let quantity =
        state.selectedPixels;


    /*
        If no pixels are selected,
        default to one for the People's/Youth districts.
    */

    if (quantity === 0) {

        quantity =
            district.minimumPixels;

        setSelectedPixels(quantity);

    }


    /*
        Check district minimum.
    */

    if (
        quantity <
        district.minimumPixels
    ) {

        alert(
            `${district.name} requires a minimum purchase of ` +
            `${formatNumber(district.minimumPixels)} pixels ` +
            `(${formatCurrency(district.minimumPrice)}).`
        );

        return;

    }


    /*
        Adult district requires age confirmation.

        The production version should implement proper
        age verification/access controls rather than relying
        on this simple browser prompt.
    */

    if (district.adultOnly) {

        const confirmed =
            window.confirm(
                "The Adult District is restricted to adults. " +
                "You must be legally permitted to access adult content " +
                "in your jurisdiction. Continue?"
            );

        if (!confirmed) {

            return;

        }

    }


    pixelQuantityInput.value =
        quantity;

    checkoutDistrict.value =
        state.selectedDistrict;

    updateCheckoutSummary();

    checkoutOverlay.classList.remove(
        "hidden"
    );

    checkoutOverlay.setAttribute(
        "aria-hidden",
        "false"
    );

    document.body.style.overflow =
        "hidden";

    setTimeout(
        () => {

            pixelQuantityInput.focus();

            pixelQuantityInput.select();

        },
        50
    );

}


/* =========================================================
   CLOSE CHECKOUT
========================================================= */

function closeCheckout() {

    checkoutOverlay.classList.add(
        "hidden"
    );

    checkoutOverlay.setAttribute(
        "aria-hidden",
        "true"
    );

    document.body.style.overflow =
        "";

}


/* =========================================================
   CHECKOUT SUMMARY
========================================================= */

function updateCheckoutSummary() {

    let quantity =
        Math.floor(
            Number(
                pixelQuantityInput.value
            )
        );

    if (
        !Number.isFinite(quantity) ||
        quantity < 1
    ) {

        quantity =
            1;

    }

    const districtKey =
        checkoutDistrict.value;

    const district =
        DISTRICTS[districtKey];

    if (!district) {

        return;

    }

    checkoutPixels.textContent =
        formatNumber(quantity);

    checkoutPrice.textContent =
        formatCurrency(quantity);

}


/* =========================================================
   CHECKOUT DISTRICT CHANGE
========================================================= */

function handleCheckoutDistrictChange() {

    const districtKey =
        checkoutDistrict.value;

    const district =
        DISTRICTS[districtKey];

    if (!district) {

        return;

    }

    let quantity =
        Math.floor(
            Number(
                pixelQuantityInput.value
            )
        );

    if (
        !Number.isFinite(quantity) ||
        quantity < 1
    ) {

        quantity =
            1;

    }

    if (
        quantity <
        district.minimumPixels
    ) {

        quantity =
            district.minimumPixels;

    }

    pixelQuantityInput.value =
        quantity;

    updateCheckoutSummary();

}


/* =========================================================
   QUANTITY VALIDATION
========================================================= */

function validateCheckoutQuantity() {

    const district =
        DISTRICTS[
            checkoutDistrict.value
        ];

    if (!district) {

        return false;

    }

    let quantity =
        Math.floor(
            Number(
                pixelQuantityInput.value
            )
        );

    if (
        !Number.isFinite(quantity) ||
        quantity < 1
    ) {

        quantity =
            1;

    }

    pixelQuantityInput.value =
        quantity;

    if (
        quantity <
        district.minimumPixels
    ) {

        alert(
            `${district.name} requires at least ` +
            `${formatNumber(district.minimumPixels)} pixels.`
        );

        pixelQuantityInput.value =
            district.minimumPixels;

        updateCheckoutSummary();

        return false;

    }

    if (
        quantity >
        TOTAL_PIXELS -
        state.soldPixels
    ) {

        alert(
            "There are not enough pixels available."
        );

        return false;

    }

    return true;

}


/* =========================================================
   PRODUCTION CHECKOUT HANDOFF
========================================================= */

async function continueToProductionCheckout() {

    /*
        THIS IS INTENTIONALLY NOT A REAL PAYMENT CALL.

        The production implementation must send the order
        to a trusted backend.

        Never:
        - trust the client price
        - trust a client-selected coordinate
        - accept a transaction screenshot
        - mark pixels sold from browser JavaScript
        - expose private Bitcoin keys
    */


    if (!validateCheckoutQuantity()) {

        return;

    }

    const quantity =
        Math.floor(
            Number(
                pixelQuantityInput.value
            )
        );

    const district =
        checkoutDistrict.value;


    /*
        Production API contract we will implement later:

        POST /api/orders

        {
            quantity,
            district
        }

        The server will:
        1. Validate availability
        2. Calculate the USD price
        3. Reserve exact coordinates
        4. Calculate BTC amount
        5. Create payment order
        6. Return payment instructions
    */


    const payload = {

        quantity,

        district,

        currency:
            "USD",

        unitPrice:
            1,

        totalUsd:
            quantity,

        paymentCurrency:
            "BTC",

        receivingAddress:
            BTC_RECEIVING_ADDRESS

    };


    /*
        Until the production backend exists,
        show a clear status instead of pretending
        that payment was completed.
    */

    console.info(
        "Production checkout payload:",
        payload
    );

    alert(
        "The production Bitcoin checkout is the next backend step. " +
        "No payment has been made and no pixels have been sold."
    );

}


/* =========================================================
   HEADER / CTA ACTIONS
========================================================= */

function scrollToCanvas() {

    const canvasSection =
        document.getElementById(
            "canvas"
        );

    if (!canvasSection) {

        return;

    }

    canvasSection.scrollIntoView({
        behavior: "smooth",
        block: "start"
    });

}


function startSinglePixelPurchase() {

    state.selectedDistrict =
        "people";

    districtSelect.value =
        "people";

    setSelectedPixels(1);

    scrollToCanvas();

    setTimeout(
        openCheckout,
        500
    );

}


/* =========================================================
   KEYBOARD SHORTCUTS
========================================================= */

function handleKeyboard(event) {

    /*
        Escape closes checkout.
    */

    if (
        event.key ===
        "Escape"
    ) {

        if (
            !checkoutOverlay.classList.contains(
                "hidden"
            )
        ) {

            closeCheckout();

        }

        return;

    }


    /*
        + / = zoom in
        - zoom out
        0 reset
    */

    if (
        event.target.tagName ===
        "INPUT"
    ) {

        return;

    }

    if (
        event.key === "+" ||
        event.key === "="
    ) {

        zoomIn();

    }

    if (
        event.key === "-"
    ) {

        zoomOut();

    }

    if (
        event.key === "0"
    ) {

        resetZoom();

    }

}


/* =========================================================
   EVENT LISTENERS
========================================================= */

if (districtSelect) {

    districtSelect.addEventListener(
        "change",
        event => {

            changeDistrict(
                event.target.value
            );

        }
    );

}


if (clearSelectionButton) {

    clearSelectionButton.addEventListener(
        "click",
        clearSelection
    );

}


if (buySelectedButton) {

    buySelectedButton.addEventListener(
        "click",
        openCheckout
    );

}


if (headerBuyButton) {

    headerBuyButton.addEventListener(
        "click",
        startSinglePixelPurchase
    );

}


if (finalBuyButton) {

    finalBuyButton.addEventListener(
        "click",
        startSinglePixelPurchase
    );

}


if (exploreButton) {

    exploreButton.addEventListener(
        "click",
        scrollToCanvas
    );

}


if (zoomInButton) {

    zoomInButton.addEventListener(
        "click",
        zoomIn
    );

}


if (zoomOutButton) {

    zoomOutButton.addEventListener(
        "click",
        zoomOut
    );

}


if (zoomResetButton) {

    zoomResetButton.addEventListener(
        "click",
        resetZoom
    );

}


if (canvasViewport) {

    canvasViewport.addEventListener(
        "pointerdown",
        handlePointerDown
    );

    canvasViewport.addEventListener(
        "pointermove",
        handlePointerMove
    );

    canvasViewport.addEventListener(
        "pointerup",
        handlePointerUp
    );

    canvasViewport.addEventListener(
        "pointercancel",
        handlePointerUp
    );

    canvasViewport.addEventListener(
        "wheel",
        handleWheel,
        {
            passive: false
        }
    );

}


if (closeCheckoutButton) {

    closeCheckoutButton.addEventListener(
        "click",
        closeCheckout
    );

}


if (checkoutOverlay) {

    checkoutOverlay.addEventListener(
        "click",
        event => {

            if (
                event.target ===
                checkoutOverlay
            ) {

                closeCheckout();

            }

        }
    );

}


if (pixelQuantityInput) {

    pixelQuantityInput.addEventListener(
        "input",
        updateCheckoutSummary
    );

}


if (checkoutDistrict) {

    checkoutDistrict.addEventListener(
        "change",
        handleCheckoutDistrictChange
    );

}


if (continueCheckoutButton) {

    continueCheckoutButton.addEventListener(
        "click",
        continueToProductionCheckout
    );

}


document.addEventListener(
    "keydown",
    handleKeyboard
);


/* =========================================================
   INITIALIZATION
========================================================= */

function initializeApplication() {

    state.selectedDistrict =
        districtSelect
            ? districtSelect.value
            : "people";

    state.soldPixels =
        0;

    state.selectedPixels =
        0;

    state.zoom =
        1;

    state.panX =
        0;

    state.panY =
        0;

    updateStatistics();

    updateSelectionDisplay();

    updateCanvasTransform();

}


/* =========================================================
   START
========================================================= */

initializeApplication();


/* =========================================================
   DEVELOPMENT DIAGNOSTICS
========================================================= */

window.BillionPixelCanvas =
    {

        version:
            "0.1.0",

        totalPixels:
            TOTAL_PIXELS,

        btcAddress:
            BTC_RECEIVING_ADDRESS,

        districts:
            DISTRICTS,

        getState() {

            return {
                ...state
            };

        }

    };
