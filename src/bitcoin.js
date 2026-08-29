/**
 * =========================================================
 * BILLION PIXEL CANVAS
 * Bitcoin Payment Engine
 * =========================================================
 *
 * CORE COMMERCIAL RULE
 *
 * 1 PIXEL = $1 USD
 *
 * This price NEVER changes because of Bitcoin's price.
 *
 * Example:
 *
 * 1 pixel       = $1
 * 100 pixels    = $100
 * 100,000 pixels = $100,000
 *
 * BTC is only the payment currency.
 *
 * At the moment an order is created:
 *
 *     USD order value
 *            ↓
 *     current BTC/USD rate
 *            ↓
 *     exact BTC amount
 *            ↓
 *     amount is LOCKED into order
 *
 * The buyer must send that BTC amount to:
 *
 * bc1qk8ehysk2fthd2p07zgdqz84tyvudkdn4565u40
 *
 * The receiving address belongs to the project.
 *
 * =========================================================
 *
 * IMPORTANT
 *
 * NEVER store a Bitcoin private key or seed phrase here.
 *
 * This application only needs the PUBLIC receiving address.
 *
 * =========================================================
 */

"use strict";


/* =========================================================
   CONSTANTS
========================================================= */

export const PIXEL_PRICE_USD = 1;

export const SATOSHIS_PER_BTC = 100000000;

export const REQUIRED_CONFIRMATIONS = 3;


/*
 * YOUR PROJECT BTC ADDRESS
 */

export const BTC_RECEIVING_ADDRESS =
    "bc1qk8ehysk2fthd2p07zgdqz84tyvudkdn4565u40";


/*
 * Public Bitcoin infrastructure.
 *
 * For launch we can use this API.
 * At larger scale, move to dedicated Bitcoin infrastructure.
 */

const DEFAULT_BITCOIN_API =
    "https://mempool.space/api";


/* =========================================================
   VALIDATION
========================================================= */

export function normalizeTxId(
    txid
) {

    if (
        typeof txid !== "string"
    ) {

        return null;

    }


    const normalized =
        txid
            .trim()
            .toLowerCase();


    if (
        !/^[a-f0-9]{64}$/.test(
            normalized
        )
    ) {

        return null;

    }


    return normalized;

}


/* =========================================================
   BTC ADDRESS
========================================================= */

export function getReceivingAddress(
    env
) {

    /*
     * The configured environment value can override the
     * default address after deployment.
     */

    const configured =
        String(
            env?.BTC_RECEIVING_ADDRESS || ""
        ).trim();


    if (
        configured
    ) {

        return configured;

    }


    return BTC_RECEIVING_ADDRESS;

}


/* =========================================================
   BTC ADDRESS BASIC CHECK
========================================================= */

export function isValidBitcoinAddress(
    address
) {

    if (
        typeof address !== "string"
    ) {

        return false;

    }


    /*
     * This project currently uses a Bitcoin mainnet Bech32
     * address.
     *
     * Full address validation is additionally performed by
     * the Bitcoin infrastructure/API.
     */

    return /^bc1[a-z0-9]{20,90}$/.test(
        address.trim()
    );

}


/* =========================================================
   USD → SATOSHIS
========================================================= */

/*
 * This function converts a USD price into BTC satoshis
 * using the BTC/USD exchange rate captured at order creation.
 *
 * Example:
 *
 * $100 order
 *
 * BTC = $100,000
 *
 * 100 / 100,000 BTC
 *
 * = 0.001 BTC
 *
 * = 100,000 satoshis
 */

export function usdToSatoshis(
    usdAmount,
    btcUsdRate
) {

    const usd =
        Number(
            usdAmount
        );

    const rate =
        Number(
            btcUsdRate
        );


    if (
        !Number.isFinite(usd) ||
        usd <= 0
    ) {

        throw new Error(
            "Invalid USD amount."
        );

    }


    if (
        !Number.isFinite(rate) ||
        rate <= 0
    ) {

        throw new Error(
            "Invalid BTC/USD exchange rate."
        );

    }


    const btc =
        usd /
        rate;


    const satoshis =
        Math.round(
            btc *
            SATOSHIS_PER_BTC
        );


    if (
        !Number.isSafeInteger(
            satoshis
        ) ||
        satoshis <= 0
    ) {

        throw new Error(
            "Calculated BTC amount is invalid."
        );

    }


    return satoshis;

}


/* =========================================================
   SATOSHIS → BTC
========================================================= */

export function satoshisToBtc(
    satoshis
) {

    const value =
        Number(
            satoshis
        );


    if (
        !Number.isSafeInteger(
            value
        ) ||
        value < 0
    ) {

        throw new Error(
            "Invalid satoshi amount."
        );

    }


    const whole =
        Math.floor(
            value /
            SATOSHIS_PER_BTC
        );


    const remainder =
        value %
        SATOSHIS_PER_BTC;


    return (
        `${whole}.` +
        String(
            remainder
        ).padStart(
            8,
            "0"
        )
    );

}


/* =========================================================
   GET BTC/USD RATE
========================================================= */

export async function getBtcUsdRate(
    env
) {

    /*
     * Use a configurable rate API if supplied.
     */

    const configuredUrl =
        String(
            env?.BTC_USD_RATE_URL || ""
        ).trim();


    const url =
        configuredUrl ||
        "https://mempool.space/api/v1/prices";


    const response =
        await fetch(
            url,
            {
                headers: {
                    "Accept":
                        "application/json"
                }
            }
        );


    if (
        !response.ok
    ) {

        throw new Error(
            `BTC/USD price service returned HTTP ${response.status}.`
        );

    }


    const data =
        await response.json();


    /*
     * Mempool's price endpoint provides USD.
     */

    const rate =
        Number(
            data?.USD
        );


    if (
        !Number.isFinite(rate) ||
        rate <= 0
    ) {

        throw new Error(
            "BTC/USD price service returned an invalid rate."
        );

    }


    return rate;

}


/* =========================================================
   CREATE LOCKED BTC QUOTE
========================================================= */

export async function createBitcoinQuote(
    usdAmount,
    env
) {

    /*
     * IMPORTANT:
     *
     * The USD price comes from the server.
     *
     * Never accept `btcAmount` from the browser.
     */

    const usd =
        Number(
            usdAmount
        );


    if (
        !Number.isSafeInteger(
            usd
        ) ||
        usd <= 0
    ) {

        throw new Error(
            "Invalid USD order amount."
        );

    }


    /*
     * Retrieve the BTC price exactly when the order is created.
     */

    const btcUsdRate =
        await getBtcUsdRate(
            env
        );


    const satoshis =
        usdToSatoshis(
            usd,
            btcUsdRate
        );


    const btcAmount =
        satoshisToBtc(
            satoshis
        );


    const receivingAddress =
        getReceivingAddress(
            env
        );


    if (
        !isValidBitcoinAddress(
            receivingAddress
        )
    ) {

        throw new Error(
            "Project Bitcoin receiving address is invalid."
        );

    }


    return {

        usdAmount:

            usd,

        btcUsdRate:

            btcUsdRate,

        btcAmount:

            btcAmount,

        satoshis:

            satoshis,

        receivingAddress:

            receivingAddress,

        quotedAt:

            new Date().toISOString()

    };

}


/* =========================================================
   SAVE BTC QUOTE TO ORDER
========================================================= */

export async function attachBitcoinQuoteToOrder(
    db,
    {
        orderId,
        quote
    }
) {

    if (
        !quote
    ) {

        throw new Error(
            "Bitcoin quote is required."
        );

    }


    /*
     * Verify order.
     */

    const order =
        await db.prepare(
            `
            SELECT
                id,
                price_usd,
                payment_currency,
                payment_address,
                btc_amount_satoshis,
                btc_rate_usd,
                status
            FROM orders
            WHERE id = ?
            LIMIT 1
            `
        )
        .bind(
            orderId
        )
        .first();


    if (!order) {

        throw new Error(
            "Order not found."
        );

    }


    /*
     * Never overwrite a locked quote.
     *
     * Once a buyer receives a BTC amount, that amount belongs
     * to that order until the payment window expires.
     */

    if (
        order.btc_amount_satoshis
    ) {

        return {

            orderId,

            btcAmountSatoshis:
                order.btc_amount_satoshis,

            btcAmount:
                satoshisToBtc(
                    order.btc_amount_satoshis
                ),

            btcUsdRate:
                order.btc_rate_usd,

            paymentAddress:
                order.payment_address

        };

    }


    /*
     * Make sure quote matches server-side USD price.
     */

    if (
        Number(
            quote.usdAmount
        ) !==
        Number(
            order.price_usd
        )
    ) {

        throw new Error(
            "Bitcoin quote does not match order price."
        );

    }


    await db.prepare(
        `
        UPDATE orders

        SET

            btc_amount_satoshis = ?,

            btc_rate_usd = ?,

            payment_address = ?,

            updated_at =
                CURRENT_TIMESTAMP

        WHERE id = ?

          AND btc_amount_satoshis IS NULL
        `
    )
    .bind(

        quote.satoshis,

        quote.btcUsdRate,

        quote.receivingAddress,

        orderId

    )
    .run();


    return {

        orderId,

        btcAmountSatoshis:
            quote.satoshis,

        btcAmount:
            quote.btcAmount,

        btcUsdRate:
            quote.btcUsdRate,

        paymentAddress:
            quote.receivingAddress,

        quotedAt:
            quote.quotedAt

    };

}


/* =========================================================
   GET TRANSACTION
========================================================= */

export async function getBitcoinTransaction(
    txid,
    env
) {

    const normalized =
        normalizeTxId(
            txid
        );


    if (
        !normalized
    ) {

        throw new Error(
            "Invalid Bitcoin transaction ID."
        );

    }


    const base =
        String(
            env?.BITCOIN_API_BASE ||
            DEFAULT_BITCOIN_API
        ).replace(
            /\/$/,
            ""
        );


    const response =
        await fetch(
            `${base}/tx/${normalized}`,
            {
                headers: {
                    "Accept":
                        "application/json"
                }
            }
        );


    if (
        response.status === 404
    ) {

        return null;

    }


    if (
        !response.ok
    ) {

        throw new Error(
            `Bitcoin transaction service returned HTTP ${response.status}.`
        );

    }


    return response.json();

}


/* =========================================================
   GET TRANSACTION STATUS
========================================================= */

export async function getBitcoinTransactionStatus(
    txid,
    env
) {

    const normalized =
        normalizeTxId(
            txid
        );


    if (
        !normalized
    ) {

        throw new Error(
            "Invalid Bitcoin transaction ID."
        );

    }


    const base =
        String(
            env?.BITCOIN_API_BASE ||
            DEFAULT_BITCOIN_API
        ).replace(
            /\/$/,
            ""
        );


    const response =
        await fetch(
            `${base}/tx/${normalized}/status`,
            {
                headers: {
                    "Accept":
                        "application/json"
                }
            }
        );


    if (
        response.status === 404
    ) {

        return null;

    }


    if (
        !response.ok
    ) {

        throw new Error(
            `Bitcoin status service returned HTTP ${response.status}.`
        );

    }


    return response.json();

}


/* =========================================================
   CURRENT BLOCK HEIGHT
========================================================= */

export async function getCurrentBlockHeight(
    env
) {

    const base =
        String(
            env?.BITCOIN_API_BASE ||
            DEFAULT_BITCOIN_API
        ).replace(
            /\/$/,
            ""
        );


    const response =
        await fetch(
            `${base}/blocks/tip/height`,
            {
                headers: {
                    "Accept":
                        "text/plain"
                }
            }
        );


    if (
        !response.ok
    ) {

        throw new Error(
            `Bitcoin block service returned HTTP ${response.status}.`
        );

    }


    const height =
        Number(
            (
                await response.text()
            ).trim()
        );


    if (
        !Number.isSafeInteger(
            height
        ) ||
        height < 0
    ) {

        throw new Error(
            "Invalid Bitcoin block height."
        );

    }


    return height;

}


/* =========================================================
   FIND PAYMENT TO PROJECT ADDRESS
========================================================= */

export function findPaymentToAddress(
    transaction,
    receivingAddress
) {

    if (
        !transaction ||
        !Array.isArray(
            transaction.vout
        )
    ) {

        return {

            found:
                false,

            receivedSatoshis:
                0

        };

    }


    let receivedSatoshis =
        0;


    for (
        const output
        of transaction.vout
    ) {

        const address =
            output?.scriptpubkey_address;


        if (
            address !==
            receivingAddress
        ) {

            continue;

        }


        const value =
            Number(
                output?.value
            );


        if (
            !Number.isSafeInteger(
                value
            ) ||
            value <= 0
        ) {

            continue;

        }


        receivedSatoshis +=
            value;

    }


    return {

        found:
            receivedSatoshis > 0,

        receivedSatoshis

    };

}


/* =========================================================
   CONFIRMATION COUNT
========================================================= */

export function calculateConfirmations(
    status,
    currentBlockHeight
) {

    if (
        !status?.confirmed
    ) {

        return 0;

    }


    const blockHeight =
        Number(
            status.block_height
        );


    if (
        !Number.isSafeInteger(
            blockHeight
        )
    ) {

        return 0;

    }


    if (
        currentBlockHeight <
        blockHeight
    ) {

        return 0;

    }


    return (
        currentBlockHeight -
        blockHeight +
        1
    );

}


/* =========================================================
   VERIFY PAYMENT
========================================================= */

export async function verifyBitcoinPayment(
    db,
    env,
    {
        orderId,
        transactionId
    }
) {

    const txid =
        normalizeTxId(
            transactionId
        );


    if (
        !txid
    ) {

        throw new Error(
            "Invalid Bitcoin transaction ID."
        );

    }


    /*
     * Retrieve the order.
     */

    const order =
        await db.prepare(
            `
            SELECT
                *
            FROM orders
            WHERE id = ?
            LIMIT 1
            `
        )
        .bind(
            orderId
        )
        .first();


    if (!order) {

        throw new Error(
            "Order not found."
        );

    }


    /*
     * The BTC quote MUST already be locked.
     */

    if (
        !order.btc_amount_satoshis
    ) {

        throw new Error(
            "BTC payment amount has not been locked for this order."
        );

    }


    const expectedSatoshis =
        Number(
            order.btc_amount_satoshis
        );


    /*
     * Check whether transaction was already used.
     */

    const existing =
        await db.prepare(
            `
            SELECT
                order_id
            FROM bitcoin_payments
            WHERE transaction_id = ?
            LIMIT 1
            `
        )
        .bind(
            txid
        )
        .first();


    if (
        existing &&
        existing.order_id !==
        orderId
    ) {

        throw new Error(
            "This Bitcoin transaction has already been used."
        );

    }


    /*
     * Retrieve transaction from Bitcoin infrastructure.
     */

    const transaction =
        await getBitcoinTransaction(
            txid,
            env
        );


    if (!transaction) {

        throw new Error(
            "Bitcoin transaction was not found."
        );

    }


    /*
     * Verify destination.
     */

    const payment =
        findPaymentToAddress(
            transaction,
            order.payment_address
        );


    if (
        !payment.found
    ) {

        throw new Error(
            "The transaction does not pay the project's Bitcoin address."
        );

    }


    /*
     * Underpayment:
     *
     * NEVER grant ownership.
     */

    if (
        payment.receivedSatoshis <
        expectedSatoshis
    ) {

        await recordPayment(
            db,
            {
                orderId,

                transactionId:
                    txid,

                expectedSatoshis,

                receivedSatoshis:
                    payment.receivedSatoshis,

                confirmations:
                    0,

                status:
                    "UNDERPAID"
            }
        );


        return {

            valid:
                false,

            status:
                "UNDERPAID",

            orderId,

            transactionId:
                txid,

            expectedSatoshis,

            receivedSatoshis:
                payment.receivedSatoshis,

            confirmations:
                0

        };

    }


    /*
     * Get blockchain confirmation state.
     */

    const transactionStatus =
        await getBitcoinTransactionStatus(
            txid,
            env
        );


    const currentHeight =
        await getCurrentBlockHeight(
            env
        );


    const confirmations =
        calculateConfirmations(
            transactionStatus,
            currentHeight
        );


    const confirmed =
        confirmations >=
        REQUIRED_CONFIRMATIONS;


    await recordPayment(
        db,
        {

            orderId,

            transactionId:
                txid,

            expectedSatoshis,

            receivedSatoshis:
                payment.receivedSatoshis,

            confirmations,

            status:
                confirmed
                    ? "CONFIRMED"
                    : "CONFIRMING"

        }
    );


    if (
        confirmed
    ) {

        await db.prepare(
            `
            UPDATE orders

            SET

                status =
                    'PAID',

                updated_at =
                    CURRENT_TIMESTAMP

            WHERE id = ?

              AND status IN (
                  'RESERVED',
                  'PAYMENT_DETECTED',
                  'CONFIRMING'
              )
            `
        )
        .bind(
            orderId
        )
        .run();


        return {

            valid:
                true,

            status:
                "CONFIRMED",

            orderId,

            transactionId:
                txid,

            expectedSatoshis,

            receivedSatoshis:
                payment.receivedSatoshis,

            confirmations

        };

    }


    await db.prepare(
        `
        UPDATE orders

        SET

            status =
                'CONFIRMING',

            updated_at =
                CURRENT_TIMESTAMP

        WHERE id = ?

          AND status IN (
              'RESERVED',
              'PAYMENT_DETECTED'
          )
        `
    )
    .bind(
        orderId
    )
    .run();


    return {

        valid:
            false,

        status:
            "CONFIRMING",

        orderId,

        transactionId:
            txid,

        expectedSatoshis,

        receivedSatoshis:
            payment.receivedSatoshis,

        confirmations

    };

}


/* =========================================================
   RECORD PAYMENT
========================================================= */

async function recordPayment(
    db,
    {
        orderId,
        transactionId,
        expectedSatoshis,
        receivedSatoshis,
        confirmations,
        status
    }
) {

    const paymentId =
        `btc_${crypto.randomUUID()}`;


    await db.prepare(
        `
        INSERT INTO bitcoin_payments (

            id,

            order_id,

            payment_address,

            expected_satoshis,

            received_satoshis,

            transaction_id,

            detected_at,

            confirmation_count,

            status

        )

        VALUES (

            ?,

            ?,

            (
                SELECT payment_address
                FROM orders
                WHERE id = ?
            ),

            ?,

            ?,

            ?,

            CURRENT_TIMESTAMP,

            ?,

            ?

        )

        ON CONFLICT(order_id)

        DO UPDATE SET

            received_satoshis =
                excluded.received_satoshis,

            transaction_id =
                excluded.transaction_id,

            confirmation_count =
                excluded.confirmation_count,

            status =
                excluded.status,

            updated_at =
                CURRENT_TIMESTAMP
        `
    )
    .bind(

        paymentId,

        orderId,

        orderId,

        expectedSatoshis,

        receivedSatoshis,

        transactionId,

        confirmations,

        status

    )
    .run();

}


/* =========================================================
   EXPORT CONFIGURATION
========================================================= */

export function getBitcoinConfiguration(
    env
) {

    const address =
        getReceivingAddress(
            env
        );


    return {

        currency:
            "BTC",

        pixelPriceUsd:
            PIXEL_PRICE_USD,

        receivingAddress:
            address,

        requiredConfirmations:
            REQUIRED_CONFIRMATIONS

    };

}
