Billion Pixel Canvas

Own a piece of the internet.

Billion Pixel Canvas is a digital canvas containing 1,000,000,000 pixels.

Every pixel has a fixed price of:

$1 USD

You can purchase 1 pixel, 100 pixels, 100,000 pixels, or any larger quantity.

There is no maximum purchase limit.

Once a pixel is sold, it is permanently sold and cannot be resold or transferred through the platform.

⸻

Core Concept

The canvas contains exactly:

1,000,000,000 pixels

Canvas dimensions:

40,000 × 25,000 pixels

Each coordinate identifies a unique location on the canvas.

Example:

X: 1250
Y: 840

represents one unique pixel location.

The canvas is designed so individuals, creators, businesses, brands, communities, and large-scale buyers can permanently own areas of the canvas.

⸻

Pricing

The pricing rule is intentionally simple:

1 pixel       = $1
10 pixels     = $10
100 pixels    = $100
1,000 pixels  = $1,000
100,000 pixels = $100,000
1,000,000 pixels = $1,000,000

There is:

* No dynamic pixel pricing
* No auction
* No premium pixel pricing
* No resale marketplace
* No maximum purchase quantity

The price is permanently defined as:

$1 USD per pixel

⸻

Bitcoin Payments

Bitcoin is the payment method.

The platform calculates the BTC amount required for the buyer’s order using the current BTC/USD conversion rate at the time the order is created.

The underlying pixel price remains:

$1 USD

BTC is simply the payment currency.

Official receiving address

bc1qk8ehysk2fthd2p07zgdqz84tyvudkdn4565u40

Important security rule

The Bitcoin receiving address may be public.

Private keys, seed phrases, wallet passwords, and signing credentials must never be committed to GitHub.

⸻

Permanent Ownership

The fundamental ownership lifecycle is:

AVAILABLE
     ↓
RESERVED
     ↓
PAYMENT CONFIRMED
     ↓
SOLD
     ↓
PERMANENT OWNERSHIP

A SOLD pixel cannot be:

* Resold
* Auctioned
* Transferred
* Reassigned
* Purchased again

The database contains unique ownership constraints to prevent multiple owners from being assigned to the same pixel.

⸻

Large Purchases

The platform supports extremely large purchases.

Examples:

Buyer A → 1 pixel
Buyer B → 100 pixels
Buyer C → 100,000 pixels
Buyer D → 200,000 pixels
Buyer E → 300,000 pixels
Buyer F → 10,000,000 pixels

There is no maximum quantity imposed by the pricing model.

Large buyers can therefore acquire contiguous areas of the canvas where available.

⸻

Districts

The canvas is divided into conceptual districts.

Main District

The primary open area.

Minimum purchase:

1 pixel

No maximum purchase.

⸻

Giants District

Designed for:

* Large buyers
* Brands
* Businesses
* Communities
* Major projects
* Large visual installations

Large blocks can be purchased here.

⸻

Youth District

A dedicated area for youth-oriented creative projects and communities.

Content remains subject to the platform’s safety and legal rules.

⸻

Adult District

A restricted area intended for lawful adult content.

Minimum purchase:

100,000 pixels

Age verification is required.

Illegal content is prohibited.

Content involving children or minors is prohibited.

⸻

Content Policy

Pixel ownership gives the owner control over their permitted content, but ownership does not override applicable law or platform safety requirements.

The platform does not permit:

* Terrorist content
* Child sexual abuse material
* Sexual content involving minors
* Illegal exploitation
* Credible threats of violence
* Content that violates applicable law

Adult content is restricted to the Adult District and requires appropriate age controls.

Reports and moderation tools are included in the platform architecture.

⸻

Technology

The planned stack uses Cloudflare’s infrastructure and a static frontend.

Frontend

HTML
CSS
JavaScript

Backend

Cloudflare Workers

Database

Cloudflare D1

Rate Limiting

Cloudflare KV

Payments

Bitcoin

Blockchain data

The application can use a Bitcoin blockchain API to detect incoming transactions and confirmations.

⸻

Architecture

                    VISITOR
                       │
                       ▼
             ┌──────────────────┐
             │ Cloudflare Pages │
             │    Frontend      │
             └────────┬─────────┘
                      │
                      ▼
             ┌──────────────────┐
             │ Cloudflare Worker│
             │      API         │
             └───────┬──────────┘
                     │
          ┌──────────┼──────────┐
          │          │          │
          ▼          ▼          ▼
       D1 DB        KV       Bitcoin API
          │
          ▼
   Ownership / Orders
          │
          ▼
   Billion Pixel Canvas

⸻

Database Philosophy

The platform does not create one database row for every one billion available pixels.

Instead, the system stores the pixels and ownership information that actually need to be represented.

This makes the architecture substantially more efficient.

Permanent ownership records are unique by pixel.

⸻

Purchase Flow

A typical purchase follows this sequence:

1. User selects a district
2. User selects pixel quantity
3. Server calculates:
   quantity × $1
4. Server creates an order
5. Available pixels are temporarily reserved
6. Server generates the BTC payment requirement
7. Buyer sends BTC
8. Bitcoin transaction is detected
9. Required confirmations are reached
10. Payment is verified
11. Reserved pixels become SOLD
12. Permanent ownership records are created
13. Buyer can manage their owned area

⸻

Payment Security

The browser is never trusted for:

* Pixel pricing
* BTC amount
* Ownership
* Payment confirmation
* Pixel availability

These values must be validated server-side.

For example, a malicious browser request attempting:

price = $0

must still result in the server calculating:

actual price = quantity × $1

⸻

Ownership Security

The platform intentionally contains no resale mechanism.

The ownership model is:

SOLD → PERMANENT

rather than:

SOLD → RESALE → NEW OWNER

This is a fundamental product rule.

⸻

Authentication

Accounts use server-managed sessions.

Planned authentication functionality includes:

* Registration
* Login
* Logout
* Session management
* Password hashing
* Account identification
* CSRF protection

Sensitive session information should never be exposed unnecessarily to frontend JavaScript.

⸻

Moderation

The platform includes moderation functionality for illegal or prohibited material.

Moderators can:

* Review reports
* Review reported content
* Hide content
* Remove prohibited content
* Restore content after review
* Record moderation actions

Moderation actions are recorded in an audit trail.

⸻

Audit Logging

Important system actions are designed to be auditable.

Examples include:

ORDER_CREATED
ORDER_COMPLETED
PAYMENT_CONFIRMED
CONTENT_REMOVED
CONTENT_RESTORED
REPORT_RESOLVED

This helps maintain an operational history of important platform events.

⸻

Security Principles

The project follows several core security principles:

Never trust the client

All important business rules are enforced server-side.

Never store secrets in GitHub

Never commit:

Private keys
Seed phrases
Passwords
API secrets
Authentication secrets

Permanent ownership

The database prevents duplicate ownership of a sold pixel.

Payment verification

A transaction must be independently verified before ownership is finalized.

Idempotency

Repeated payment checks must not create duplicate ownership records.

Rate limiting

Public endpoints should be protected against excessive requests.

⸻

Project Structure

The planned repository structure is:

/
├── index.html
├── app.js
├── styles.css
├── README.md
├── wrangler.toml
│
├── src/
│   ├── index.js
│   ├── api.js
│   ├── auth.js
│   ├── auth-api.js
│   ├── admin.js
│   ├── admin-api.js
│   ├── allocator.js
│   ├── bitcoin.js
│   ├── coordinates.js
│   ├── config.js
│   ├── content.js
│   ├── csrf.js
│   ├── orders.js
│   ├── security.js
│   └── worker-cron.js
│
└── migrations/
    ├── 0001_*.sql
    ├── 0002_*.sql
    ├── 0003_*.sql
    ├── 0004_*.sql
    ├── 0005_*.sql
    ├── 0006_*.sql
    ├── 0007_payment_constraints.sql
    ├── 0008_orders_ownership.sql
    └── 0009_project_config.sql

The exact migration filenames may change during the final database consistency audit.

⸻

Deployment

The intended deployment environment is:

GitHub
   ↓
Cloudflare
   ↓
Cloudflare Pages
   +
Cloudflare Workers
   +
Cloudflare D1
   +
Cloudflare KV

The public frontend can be deployed using a free Cloudflare Pages pages.dev address.

A custom domain is not required for the initial launch.

⸻

Development Principle

The first launch should focus on making the core system reliable:

Canvas
+
Accounts
+
Pixel selection
+
$1 pricing
+
Bitcoin payment
+
Payment verification
+
Permanent ownership

Additional features can be introduced after the core purchase system has been tested and secured.

⸻

Revenue Model

The theoretical maximum gross pixel value is:

1,000,000,000 pixels × $1
=
$1,000,000,000

Therefore the fully sold canvas represents:

$1 BILLION

in cumulative pixel sales at the fixed $1 price.

Example scenarios:

Pixels Sold	Gross Sales
1,000	$1,000
10,000	$10,000
100,000	$100,000
1,000,000	$1,000,000
10,000,000	$10,000,000
100,000,000	$100,000,000
500,000,000	$500,000,000
1,000,000,000	$1,000,000,000

These figures are gross sales, not profit.

They do not account for:

* Taxes
* Payment costs
* Infrastructure
* Legal costs
* Compliance
* Marketing
* Operations
* Refunds or disputes where legally applicable

⸻

Product Vision

Billion Pixel Canvas is designed around a simple idea:

Buy a pixel. Own a permanent place on a billion-pixel digital canvas.

The simplicity is intentional.

One canvas.

One billion pixels.

One fixed price.

No resale.

No auctions.

Permanent ownership.

⸻

Status

Project stage: Development

Target architecture: Cloudflare Pages + Workers + D1 + KV

Payment currency: BTC

Pixel price: $1 USD

Total pixels: 1,000,000,000

Resale: Disabled

Maximum purchase: None

Adult District minimum: 100,000 pixels

⸻

Disclaimer

This repository is software under development and is not a guarantee of commercial, legal, financial, or regulatory compliance.

Before accepting real customer funds, the deployment must undergo:

* Security testing
* Database consistency testing
* Bitcoin payment testing
* Legal review
* Privacy review
* Age-verification/compliance review where applicable
* Production monitoring setup
* Backup and recovery testing

Never deploy the payment system with unverified code or expose private credentials.
