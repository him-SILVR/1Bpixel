"use strict";

import {
    PAYMENT,
    PRICING
} from "./config.js";


/* =========================================================
   BILLION PIXEL CANVAS
   BITCOIN PAYMENT ENGINE
========================================================= */


/*
 * MASTER PAYMENT RULE
 *
 * Pixel price:
 *
 *     $1 USD
 *
 * forever.
 *
 * BTC is only the payment method.
 *
 * Example:
 *
 * 100 pixels = $100
 *
 * If BTC = $100,000:
 *
 * $100 / $100,000 = 0.001 BTC
 *
 * If BTC = $200,000:
 *
 * $100 / $200,000 = 0.0005 BTC
 *
 * The pixel price NEVER changes.
 */


/* =========================================================
   CONSTANTS
========================================================= */

const SATOSHIS_PER_BTC =
    100_000_000;


const DEFAULT_CONFIRMATIONS =
    PAYMENT.requiredConfirmations;


/*
 * Mempool.space is used as the default public Bitcoin
 * blockchain data source.
 */

const DEFAULT_API_BASE =
    "https://mempool.space/api";


/*
 * Quote validity.
 *
 * The buyer receives a locked BTC amount for the order.
 *
 * This does NOT change the $1 pixel price.
 */

const QUOTE_VALIDITY_SECONDS =
    15 * 60;


/* =========================================================
   BITCOIN ADDRESS
========================================================= */

export function getBitcoinAddress(
    env
) {

    /*
     * Environment variable is preferred.
     *
     * config.js contains the public fallback.
     */

    return String(
        env?.BTC_RECEIVING_ADDRESS ||
        PAYMENT.bitcoinAddress
    )
        .trim();

}


/* =========================================================
   API BASE
========================================================= */

function getApiBase(
    env
) {

    return String(
        env?.BITCOIN_API_BASE ||
        DEFAULT_API_BASE
    )
        .replace(
            /\/+$/,
            ""
        );

}


/* =========================================================
   BTC PRICE
========================================================= */

export async function getBitcoinUsdPrice(
    env
) {

    const base =
        getApiBase(
            env
        );


    /*
     * Mempool.space exposes a simple price endpoint.
     */

    const response =
        await fetch(
            `${base}/v1/prices`
        );


    if (
        !response.ok
    ) {

        throw new Error(
            "Unable to obtain the current Bitcoin/USD price."
        );

    }


    const data =
        await response.json();


    const price =
        Number(
            data.USD
        );


    if (
        !Number.isFinite(price) ||
        price <= 0
    ) {

        throw new Error(
            "Bitcoin/USD price is invalid."
        );

    }


    return price;

}


/* =========================================================
   USD → SATOSHIS
========================================================= */

export function usdToSatoshis(
    usd,
    btcUsdPrice
) {

    const usdValue =
        Number(
            usd
        );


    const btcPrice =
        Number(
            btcUsdPrice
        );


    if (
        !Number.isFinite(
            usdValue
        ) ||
        usdValue <= 0
    ) {

        throw new Error(
            "USD amount must be greater than zero."
        );

    }


    if (
        !Number.isFinite(
            btcPrice
        ) ||
        btcPrice <= 0
    ) {

        throw new Error(
            "Bitcoin/USD price must be greater than zero."
        );

    }


    /*
     * Convert USD → BTC → satoshis.
     *
     * Math.round ensures an integer satoshi amount.
     */

    const satoshis =
        Math.round(
            (
                usdValue /
                btcPrice
            ) *
            SATOSHIS_PER_BTC
        );


    if (
        !Number.isSafeInteger(
            satoshis
        ) ||
        satoshis < 1
    ) {

        throw new Error(
            "Calculated Bitcoin amount is below one satoshi."
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


    return (
        value /
        SATOSHIS_PER_BTC
    );

}


/* =========================================================
   CREATE BTC QUOTE
========================================================= */

export async function createBitcoinQuote(
    priceUsd,
    env
) {

    const usd =
        Number(
            priceUsd
        );


    if (
        !Number.isSafeInteger(
            usd
        ) ||
        usd < 1
    ) {

        throw new Error(
            "Invalid order price."
        );

    }


    const btcUsdRate =
        await getBitcoinUsdPrice(
            env
        );


    const btcAmountSatoshis =
        usdToSatoshis(
            usd,
            btcUsdRate
        );


    const btcAmount =
        satoshisToBtc(
            btcAmountSatoshis
        );


    const createdAt =
        new Date();


    const expiresAt =
        new Date(
            createdAt.getTime() +
            QUOTE_VALIDITY_SECONDS *
            1000
        );


    return {

        currency:
            "BTC",

        priceUsd:
            usd,

        btcUsdRate,

        btcAmountSatoshis,

        btcAmount,

        paymentAddress:
            getBitcoinAddress(
                env
            ),

        createdAt:
            createdAt.toISOString(),

        expiresAt:
            expiresAt.toISOString(),

        validitySeconds:
            QUOTE_VALIDITY_SECONDS

    };

}


/* =========================================================
   ATTACH QUOTE TO ORDER
========================================================= */

export async function attachBitcoinQuoteToOrder(
    db,
    {
        orderId,
        quote
    }
) {

    if (!orderId) {

        throw new Error(
            "Order ID is required."
        );

    }


    if (!quote) {

        throw new Error(
            "Bitcoin quote is required."
        );

    }


    /*
     * Verify the order exists and has not already been
     * completed.
     */

    const order =
        await db.prepare(
            `
            SELECT
                id,
                price_usd,
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


    if (
        [
            "PAID",
            "COMPLETED",
            "CANCELLED",
            "EXPIRED"
        ].includes(
            order.status
        )
    ) {

        throw new Error(
            "Bitcoin quote cannot be attached to this order."
        );

    }


    /*
     * The quote must match the server-side order price.
     */

    if (
        Number(
            order.price_usd
        ) !==
        Number(
            quote.priceUsd
        )
    ) {

        throw new Error(
            "Bitcoin quote does not match order price."
        );

    }


    /*
     * Save the locked payment details directly on the order.
     */

    await db.prepare(
        `
        UPDATE orders

        SET

            btc_amount_satoshis = ?,

            btc_rate_usd = ?,

            payment_address = ?,

            status = 'PAYMENT_PENDING',

            updated_at =
                CURRENT_TIMESTAMP

        WHERE id = ?

          AND status =
              'RESERVED'
        `
    )
    .bind(

        quote.btcAmountSatoshis,

        quote.btcUsdRate,

        quote.paymentAddress,

        orderId

    )
    .run();


    /*
     * Create payment record.
     */

    const paymentId =
        `btc_payment_${crypto.randomUUID()}`;


    await db.prepare(
        `
        INSERT INTO bitcoin_payments (

            id,

            order_id,

            payment_address,

            expected_satoshis,

            received_satoshis,

            confirmation_count,

            status

        )

        VALUES (

            ?,

            ?,

            ?,

            ?,

            0,

            0,

            'AWAITING_PAYMENT'

        )

        ON CONFLICT(order_id)

        DO UPDATE SET

            payment_address =
                excluded.payment_address,

            expected_satoshis =
                excluded.expected_satoshis,

            updated_at =
                CURRENT_TIMESTAMP
        `
    )
    .bind(

        paymentId,

        orderId,

        quote.paymentAddress,

        quote.btcAmountSatoshis

    )
    .run();


    return quote;

}


/* =========================================================
   GET ADDRESS TRANSACTIONS
========================================================= */

async function getAddressTransactions(
    env,
    address
) {

    const base =
        getApiBase(
            env
        );


    const response =
        await fetch(
            `${base}/address/${encodeURIComponent(
                address
            )}/txs`
        );


    if (
        !response.ok
    ) {

        throw new Error(
            "Unable to query Bitcoin transactions."
        );

    }


    const transactions =
        await response.json();


    if (
        !Array.isArray(
            transactions
        )
    ) {

        throw new Error(
            "Bitcoin transaction response is invalid."
        );

    }


    return transactions;

}


/* =========================================================
   GET TRANSACTION
========================================================= */

async function getTransaction(
    env,
    txid
) {

    const base =
        getApiBase(
            env
        );


    const response =
        await fetch(
            `${base}/tx/${encodeURIComponent(
                txid
            )}`
        );


    if (
        !response.ok
    ) {

        throw new Error(
            "Unable to query Bitcoin transaction."
        );

    }


    return response.json();

}


/* =========================================================
   GET TIP HEIGHT
========================================================= */

async function getTipHeight(
    env
) {

    const base =
        getApiBase(
            env
        );


    const response =
        await fetch(
            `${base}/blocks/tip/height`
        );


    if (
        !response.ok
    ) {

        throw new Error(
            "Unable to obtain Bitcoin block height."
        );

    }


    const height =
        Number(
            await response.text()
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
   TRANSACTION RECEIVED AMOUNT
========================================================= */

function getReceivedAmount(
    transaction,
    address
) {

    const outputs =
        transaction?.vout || [];


    let received =
        0;


    for (
        const output
        of outputs
    ) {

        const scriptAddresses =
            output?.scriptpubkey_address;


        if (
            scriptAddresses ===
            address
        ) {

            received +=
                Number(
                    output.value || 0
                );

        }

    }


    return received;

}


/* =========================================================
   TRANSACTION CONFIRMATIONS
========================================================= */

function calculateConfirmations(
    transaction,
    tipHeight
) {

    const status =
        transaction?.status;


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


    return Math.max(
        0,
        tipHeight -
        blockHeight +
        1
    );

}


/* =========================================================
   FIND PAYMENT
========================================================= */

export async function verifyBitcoinPayment(
    db,
    env,
    {
        orderId,
        transactionId = null
    }
) {

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


    if (
        order.status ===
        "COMPLETED"
    ) {

        return {

            orderId,

            status:
                "CONFIRMED",

            confirmations:
                DEFAULT_CONFIRMATIONS

        };

    }


    const payment =
        await db.prepare(
            `
            SELECT
                *
            FROM bitcoin_payments
            WHERE order_id = ?
            LIMIT 1
            `
        )
        .bind(
            orderId
        )
        .first();


    if (!payment) {

        throw new Error(
            "Bitcoin payment record not found."
        );

    }


    /*
     * Never trust a payment address supplied by the browser.
     */

    const paymentAddress =
        payment.payment_address;


    let transactions;


    if (
        transactionId
    ) {

        transactions = [

            await getTransaction(
                env,
                transactionId
            )

        ];

    } else {

        transactions =
            await getAddressTransactions(
                env,
                paymentAddress
            );

    }


    const tipHeight =
        await getTipHeight(
            env
        );


    let matchedTransaction =
        null;

    let receivedSatoshis =
        0;

    let confirmations =
        0;


    for (
        const transaction
        of transactions
    ) {

        const amount =
            getReceivedAmount(
                transaction,
                paymentAddress
            );


        if (
            amount <
            Number(
                payment.expected_satoshis
            )
        ) {

            continue;

        }


        const txid =
            transaction.txid;


        const txConfirmations =
            calculateConfirmations(
                transaction,
                tipHeight
            );


        matchedTransaction =
            transaction;

        receivedSatoshis =
            amount;

        confirmations =
            txConfirmations;


        /*
         * A transaction with the required amount and the most
         * confirmations is the strongest candidate.
         */

        if (
            confirmations >=
            DEFAULT_CONFIRMATIONS
        ) {

            break;

        }

    }


    if (
        !matchedTransaction
    ) {

        await db.prepare(
            `
            UPDATE bitcoin_payments

            SET

                status =
                    'AWAITING_PAYMENT',

                updated_at =
                    CURRENT_TIMESTAMP

            WHERE order_id = ?
            `
        )
        .bind(
            orderId
        )
        .run();


        return {

            orderId,

            status:
                "AWAITING_PAYMENT",

            expectedSatoshis:
                payment.expected_satoshis,

            receivedSatoshis:
                0,

            confirmations:
                0

        };

    }


    const transactionIdValue =
        matchedTransaction.txid;


    /*
     * Correct amount but insufficient confirmations.
     */

    if (
        receivedSatoshis <
        Number(
            payment.expected_satoshis
        )
    ) {

        await db.prepare(
            `
            UPDATE bitcoin_payments

            SET

                received_satoshis = ?,

                transaction_id = ?,

                confirmation_count = ?,

                status = 'UNDERPAID',

                updated_at =
                    CURRENT_TIMESTAMP

            WHERE order_id = ?
            `
        )
        .bind(

            receivedSatoshis,

            transactionIdValue,

            confirmations,

            orderId

        )
        .run();


        await db.prepare(
            `
            UPDATE orders

            SET

                status =
                    'UNDERPAID',

                updated_at =
                    CURRENT_TIMESTAMP

            WHERE id = ?

              AND status NOT IN (
                  'COMPLETED',
                  'CANCELLED'
              )
            `
        )
        .bind(
            orderId
        )
        .run();


        return {

            orderId,

            status:
                "UNDERPAID",

            expectedSatoshis:
                payment.expected_satoshis,

            receivedSatoshis,

            confirmations

        };

    }


    if (
        confirmations <
        DEFAULT_CONFIRMATIONS
    ) {

        await db.prepare(
            `
            UPDATE bitcoin_payments

            SET

                received_satoshis = ?,

                transaction_id = ?,

                confirmation_count = ?,

                status =
                    'CONFIRMING',

                updated_at =
                    CURRENT_TIMESTAMP

            WHERE order_id = ?
            `
        )
        .bind(

            receivedSatoshis,

            transactionIdValue,

            confirmations,

            orderId

        )
        .run();


        await db.prepare(
            `
            UPDATE orders

            SET

                status =
                    'CONFIRMING',

                updated_at =
                    CURRENT_TIMESTAMP

            WHERE id = ?

              AND status NOT IN (
                  'COMPLETED',
                  'CANCELLED'
              )
            `
        )
        .bind(
            orderId
        )
        .run();


        return {

            orderId,

            status:
                "CONFIRMING",

            expectedSatoshis:
                payment.expected_satoshis,

            receivedSatoshis,

            confirmations,

            requiredConfirmations:
                DEFAULT_CONFIRMATIONS,

            transactionId:
                transactionIdValue

        };

    }


    /*
     * Payment has the required amount and confirmations.
     */

    await db.prepare(
        `
        UPDATE bitcoin_payments

        SET

            received_satoshis = ?,

            transaction_id = ?,

            confirmation_count = ?,

            status =
                'CONFIRMED',

            confirmed_at =
                CURRENT_TIMESTAMP,

            updated_at =
                CURRENT_TIMESTAMP

        WHERE order_id = ?
        `
    )
    .bind(

        receivedSatoshis,

        transactionIdValue,

        confirmations,

        orderId

    )
    .run();


    await db.prepare(
        `
        UPDATE orders

        SET

            status =
                'PAID',

            updated_at =
                CURRENT_TIMESTAMP

        WHERE id = ?

          AND status NOT IN (
              'COMPLETED',
              'CANCELLED'
          )
        `
    )
    .bind(
        orderId
    )
    .run();


    return {

        orderId,

        status:
            "CONFIRMED",

        expectedSatoshis:
            payment.expected_satoshis,

        receivedSatoshis,

        confirmations,

        requiredConfirmations:
            DEFAULT_CONFIRMATIONS,

        transactionId:
            transactionIdValue

    };

}


/* =========================================================
   PAYMENT STATUS
========================================================= */

export async function getBitcoinPaymentStatus(
    db,
    orderId
) {

    const payment =
        await db.prepare(
            `
            SELECT
                *
            FROM bitcoin_payments
            WHERE order_id = ?
            LIMIT 1
            `
        )
        .bind(
            orderId
        )
        .first();


    if (!payment) {

        return {

            orderId,

            status:
                "NOT_CREATED"

        };

    }


    return {

        orderId,

        status:
            payment.status,

        paymentAddress:
            payment.payment_address,

        expectedSatoshis:
            payment.expected_satoshis,

        receivedSatoshis:
            payment.received_satoshis,

        transactionId:
            payment.transaction_id,

        confirmations:
            payment.confirmation_count,

        confirmedAt:
            payment.confirmed_at

    };

}


/* =========================================================
   PUBLIC BITCOIN CONFIGURATION
========================================================= */

export function getBitcoinConfiguration(
    env
) {

    return {

        currency:
            "BTC",

        paymentAddress:
            getBitcoinAddress(
                env
            ),

        requiredConfirmations:
            DEFAULT_CONFIRMATIONS,

        priceCurrency:
            "USD",

        pricePerPixelUsd:
            PRICING.pricePerPixelUsd,

        priceIsPermanent:
            PRICING.priceIsPermanent

    };

}


/* =========================================================
   EXPORTS
========================================================= */

export {

    SATOSHIS_PER_BTC,

    QUOTE_VALIDITY_SECONDS

};
