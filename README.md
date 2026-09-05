# Lytronix

One backend, two frontends, single monorepo.

```
lytronix/
├── server/            # Express + Mongoose API — serves BOTH frontends
├── apps/
│   ├── storefront/    # Customer-facing store (public, no login)
│   └── admin/         # Admin panel (login required)
└── package.json       # root workspace scripts
```

Previously the storefront and admin projects each shipped their own copy of
the backend (byte-for-byte identical). That's gone now — there's one API,
and the admin routes are protected by login + role permissions while the
storefront-facing routes (browsing products, placing an order, tracking a
parcel) stay public.

## First-time setup

Each of `server/`, `apps/storefront/` and `apps/admin/` is a **fully
standalone project** — its own `package.json`, its own `node_modules`, its
own lockfile. This is intentionally *not* an npm-workspaces monorepo; the
root `package.json` only orchestrates the three via `--prefix`, so a single
command still installs/builds/runs everything:

```bash
npm run install:all          # installs root tooling + server + both frontends independently
cp server/.env.example server/.env
cp apps/admin/.env.example apps/admin/.env
cp apps/storefront/.env.example apps/storefront/.env
```

Edit `server/.env`:
- `MONGODB_URI` — your MongoDB connection string
- `JWT_SECRET` — any long random string
- `SEED_ADMIN_PHONE` (**required**) / `SEED_ADMIN_PASSWORD` / `SEED_ADMIN_EMAIL` (optional) —
  the first admin login you want created. Phone is mandatory for every admin account,
  including this one — it's the login identifier that always works and where "forgot
  password" SMS gets sent.
- `STEADFAST_*` — from your Steadfast merchant portal
- `ANTHROPIC_API_KEY` (optional) — powers the admin's AI order-extraction panel

Then seed the database with default roles, a starter category tree + your
first superadmin account:

```bash
npm run seed
```

This prints the login you should use. **Log in and change the password
immediately** — it's stored in plaintext in your `.env` until you do.

If you have existing products that used the old free-text `category` string,
convert them to real Category records once:

```bash
npm run migrate:categories --prefix server
```

## Running everything

```bash
npm run dev
```

Starts all three (API on `:5000`, storefront on `:5173`, admin on `:5174`)
in one terminal, color-coded. Or run them individually:

```bash
npm run dev:server
npm run dev:storefront
npm run dev:admin
```

Building both frontends for production is also a single command:

```bash
npm run build          # builds apps/storefront/dist and apps/admin/dist
```

## Admin UI

Rebuilt as a proper e-commerce admin console (not a "logbook"):
- Desktop: fixed sidebar with sectioned navigation (Sales / Catalogue /
  Administration) + a slim top bar showing the current section
- Mobile: bottom tab bar (Home, Orders, New, Catalogue, More) with an
  elevated primary action button, and a "More" bottom sheet for secondary
  destinations (Customers, Staff, Roles, account)
- Dashboard home page: revenue/orders KPI cards, status breakdown, recent
  orders feed, permission-aware quick actions
- Design tokens live in `apps/admin/tailwind.config.js` under the `ui` and
  `accent` color keys — change the palette there and it propagates
  everywhere (buttons, cards, badges, nav) via the shared `.btn-primary`,
  `.btn-secondary`, `.card`, `.input` classes in `src/styles/index.css`.

## Storefront customer accounts

The storefront (`apps/storefront/`) is a real shop now, not a "send a
request" form:

- **Browse**: category / sub-category tree, price + in-stock filters,
  sort, search and pagination — all URL-driven (`/shop`, `/shop/c/:slug`,
  `/shop/p/:slug`). Product pages log a view for analytics.
- **Sign in with a phone number only** (`/shop/login`): we text a one-time
  code (BulkSMSBD). No password. When the SMS gateway isn't configured and
  `NODE_ENV!=production`, the code comes back in the API response so the
  flow is still testable.
- **Account area** (`/shop/account/*`): profile (name), saved addresses
  (district / police-station / address, one default), order history +
  detail with status timeline, payment history, and saved products.
- **Cart lives in the database** for signed-in customers (`Cart` model) and
  in `localStorage` for guests; the guest cart merges into the account
  cart on login.
- **Saved products / wishlist** are stored per account (`SavedProduct`).
- **Checkout** works signed-in (pick a saved address — no re-typing) or as
  a guest, with the same COD / bKash-manual / bKash-automated options as
  before. A signed-in order is linked to the account and the address is
  saved for next time. Every checkout still upserts the admin-side
  `Customer` rolodex by phone.
- **Footer, homepage banner, About and Contact pages** round it out as a
  real storefront: a hero with trust badges + a "shop by category" strip on
  `/shop`, a footer with contact info and quick links on every page,
  `/shop/about`, and `/shop/contact` (direct call/WhatsApp/email links plus
  a message form that posts to `POST /api/contact` and shows up in the
  admin notification bell — no separate inbox to check). The placeholder
  email/address in `src/utils/company.js` are meant to be swapped for real
  ones.

Customer sessions use a separate JWT (`typ: "customer"`,
`JWT_CUSTOMER_EXPIRES_IN`, default 30d) that can't be replayed against
admin routes.

## Categories

- `Category` model: a tree via `parent` (self-reference). The admin UI
  (**Catalogue → Categories**, needs `categories:manage`) is built around
  two visible levels but nesting can go deeper.
- Each product points at one category; `Product.categoryPath` denormalises
  the ancestor chain so the storefront can filter "everything under X,
  including sub-categories" in one query.
- Deleting a category is blocked while it has sub-categories, and prompts
  to reassign its products.

## Analytics

- Lightweight append-only `AnalyticsEvent` stream (site visits by
  anonymous session id, product/category views, add-to-cart, orders) plus
  running `viewCount` / `orderCount` on each product.
- Admin **Insights → Analytics** (`analytics:view`): visitors
  (today / 7d / 30d), page & product views, orders, revenue, conversion
  rate, a 30-day visitors-vs-orders trend, and top products / categories
  by views, units and revenue. The dashboard shows a compact "Store
  traffic" card.
- Raw events are pruned after `ANALYTICS_EVENT_TTL_DAYS` (default 180);
  the per-product totals survive.

## Roles & permissions

Seeded roles — edit any built-in role's **permissions** from the admin's
**Roles** page (built-in roles keep their name; only the Super Admin role
is fully locked):

| Role | Permissions |
|---|---|
| Super Admin | everything, including staff & role management |
| Store Manager | full catalogue, orders, payments, customers, analytics, reports |
| Catalogue Manager | products + categories only |
| Order Processor | catalogue view + orders + payments |
| Viewer | read-only catalogue, orders, analytics, reports |

Permission codes (`server/models/Role.js`, grouped for the UI via
`PERMISSION_GROUPS`): `catalogue:view`, `products:manage`,
`categories:manage`, `orders:view`, `orders:manage`, `payments:manage`,
`customers:manage`, `analytics:view`, `reports:view`, `users:manage`,
`roles:manage`, `settings:manage`.

Create staff accounts from the admin's **Staff** page — each account gets
one role, and the role's permissions decide what they can see/do.

## Admin accounts: sign-in, forgot password, staff creation

- **Phone is mandatory on every admin account**, including the superadmin — name and
  email are optional. Sign in with either an **email or phone number** as the
  identifier (`POST /api/auth/login { identifier, password }`).
- **Forgot password** (Login page → "Forgot password?"): enter the email or phone on
  the account; if it matches, a brand-new password is generated and **texted to the
  account's phone** via the same SMS gateway as everything else, and the account is
  flagged `mustChangePassword` (a banner then points the admin at **Profile → Change
  password**, which requires the current password). The response is always the same
  generic message, whether or not an account matched, so it can't be used to find out
  which emails/phones have accounts.
- Create staff from **Staff** (`users:manage`) with just a phone number, password and
  role — name/email are optional there too.

## Logging

`server/services/logger.js` (winston) writes leveled logs to the console and to
`server/logs/{combined,error}.log` (gitignored) — set `LOG_LEVEL` in `.env` to quiet
HTTP access lines (default level is `http`, which includes them). Explicit log points
cover order requests and status transitions, courier booking attempts/results, every
Steadfast webhook callback received, and every SMS send attempt (success or failure) —
on top of the existing `SmsLog` collection, which stays the DB-queryable record of
every SMS.

## AI address matching

The AI order-extraction (`server/services/ai.js`) runs its district/thana guess
through `server/services/geoResolve.js`, which maps free text onto the same canonical
Packzy district/thana list the order form's dropdowns use — handling common spelling
variants (Cumilla/Comilla, Chattogram/Chittagong, etc.) and fuzzy-matching the rest, so
"Cumilla" correctly selects "Comilla" in the form instead of leaving it blank. When a
district or thana can't be confidently matched, the AI-assist panel flags it instead of
guessing.

## Notification bar

Every admin page has a bell in the top bar backed by a shared event feed
(`Notification` model, polled every 25s + on window focus):

- **New customer order** (storefront checkout) → an entry + a short chime
  (Web Audio, no asset; mute/unmute from the bell menu). Orders staff
  create themselves in the New Order form don't ping.
- **Steadfast webhooks** → every `delivery_status` and `tracking_update`
  call is logged here (a webhook for a parcel we don't recognise still
  shows up as a `system` notice instead of being dropped).
- **Manual bKash payment** placed at checkout → a "verify this" reminder
  linking to the Payments queue.

Read state is per user (`readBy`); rows self-expire after 90 days.

## Steadfast webhook + courier label

- `POST /api/webhooks/steadfast` handles the documented `delivery_status`
  (`pending` / `delivered` / `partial_delivered` / `cancelled` / `unknown`)
  and `tracking_update` payloads, verifying the `Authorization: Bearer`
  header against `STEADFAST_WEBHOOK_TOKEN`, always replying `200` with
  `{ "status": "success", ... }`. A `cancelled` parcel restocks its items;
  a `delivered` one fires the customer "delivered" SMS once.
- The printed courier label (`LabelSlip`) now mirrors Steadfast's own
  default label: Merchant ID (`STEADFAST_MERCHANT_ID`), the SF-ID /
  consignment number as the big figure + CODE128 barcode, Invoice,
  Delivery type, **parcel weight** (new `Order.weightKg`, set on the order
  form, default 0.5 KG), Area (thana + district), the prominent Cash on
  Delivery figure, a "Printed:" timestamp and the `steadfast.com.bd`
  footer — on top of our existing item/price breakdown.

## AI-assisted order creation

On the admin **New Order** page, an "AI assist" panel takes pasted customer
text (Bangla / English / mixed) **or** a screenshot (a chat, a Steadfast
label, a photo of a form) and calls Claude via `server/services/ai.js`
(`POST /api/orders/ai-extract`, `orders:manage`). It returns a structured
draft — customer name/phone/district/thana/address, line items, delivery /
advance / COD amounts, notes, and a confidence flag — which the admin
reviews and clicks **Fill the form** to prefill. Nothing is saved
automatically; existing field values are never overwritten, only blanks
filled and items appended.

Set `ANTHROPIC_API_KEY` in `server/.env` (model defaults to `claude-opus-5`,
override with `AI_MODEL`). Without a key the panel just says it's not
configured and the form works normally.

## What's public vs. admin-only

| Route | Access |
|---|---|
| `GET /api/products`, `GET /api/products/:id`, `POST /api/products/:id/view` | Public — storefront catalogue |
| `GET /api/categories`, `GET /api/categories/:slug` | Public — storefront category tree |
| `POST /api/orders` | Public — storefront checkout (links to a customer account if a customer token is sent) |
| `POST /api/auth/customer/request-otp`, `POST /api/auth/customer/verify-otp` | Public — storefront phone login |
| `POST /api/analytics/track` | Public — storefront event beacon |
| `GET /api/track/:trackingId` | Public — order tracking page |
| `GET /api/meta/steadfast` | Public — label merchant id |
| `POST /api/webhooks/steadfast` | Public, verified via `STEADFAST_WEBHOOK_TOKEN` |
| `POST /api/contact` | Public — storefront Contact page |
| `POST /api/auth/forgot-password` | Public — always returns the same generic message |
| `/api/account/*` | Requires a **customer** token (phone login) |
| `/api/notifications`, `POST /api/orders/ai-extract` | Requires **admin** login (ai-extract also needs `orders:manage`) |
| `/api/analytics/overview` etc., `/api/categories` writes, `/api/products` writes, `/api/orders` GET/PUT/PATCH, `/api/customers`, `/api/users`, `/api/roles`, courier balance | Requires **admin** login + the relevant permission |

## ⚠️ Before you go further

The BulkSMSBD API key in your original notes was shared in plaintext in
this chat. **Regenerate it** from the BulkSMSBD dashboard before wiring up
SMS sending, and keep the new one only in `server/.env` (never in frontend
code or committed files).

## Steadfast courier + SMS

Both wired end-to-end now:

- **Steadfast**: from an order's detail page, an admin can edit pricing/discount/delivery charge, then **Book with Steadfast** — this calls their `/create_order` API and stores the consignment ID + tracking code on the order. A **Sync status** button pulls the latest delivery status on demand, and `POST /api/webhooks/steadfast` (public, token-verified via `STEADFAST_WEBHOOK_TOKEN`) keeps it updated automatically as Steadfast's own webhook fires.
- **SMS** (`server/services/sms.js`, via BulkSMSBD): three automatic triggers —
  1. **New order placed** (storefront checkout, public) → every number in `ADMIN_NOTIFY_PHONES` gets a text. This is the "multiple listeners" from the original brief — add as many comma-separated numbers as you want notified.
  2. **Consignment booked** → the customer gets a text with their tracking link.
  3. **Delivered** → the customer gets a thank-you text, fired once on the pending→delivered transition (whether that transition happens via the webhook or a manual sync).
- Every SMS attempt — sent or failed — is written to `SmsLog` (`server/models/SmsLog.js`) with the gateway's response code and error message, viewable per-order on the Order Detail page ("SMS notifications" panel) or via `GET /api/sms-logs`.
- SMS failures never block the order/booking flow itself — they're caught, logged, and surfaced only in that panel.

Add to `server/.env`:
```
SMS_API_KEY=your_bulksmsbd_key
SMS_SENDER_ID=your_approved_sender_id
ADMIN_NOTIFY_PHONES=01700000000,01800000000
STEADFAST_API_KEY=...
STEADFAST_SECRET_KEY=...
STEADFAST_WEBHOOK_TOKEN=... (whatever you configure on Steadfast's side)
```

Without `SMS_API_KEY`/`SMS_SENDER_ID` set, the gateway just logs "not configured" and skips sending — nothing breaks.

## Payments, inventory & images

- **Checkout** (`/shop/checkout`): customers pick Cash on Delivery, bKash manual transfer (with sender number, transaction ID, and an optional screenshot uploaded straight to Cloudinary), or bKash Checkout (automated — currently a documented stub, see below). Every choice creates one persistent `Payment` record via `server/models/Payment.js`, so even "pay on delivery" intent is logged, not just completed transactions.
- **Admin → Payments**: a filterable queue (Needs review / Pending / Verified / Failed) for verifying manual bKash transfers — proof screenshot in a lightbox, transaction ID, one-click Verify/Reject. Verifying a payment mirrors it into the order's existing due-amount ledger automatically.
- **Automated gateways are pluggable** (`server/services/payments/`): `bkash.js` is a real integration *point*, not a fake — it reports itself "not configured" and the storefront gracefully falls back to COD/manual until real `BKASH_*` merchant credentials are added to `.env`. Adding SSLCommerz or another gateway later means writing one file with `{ isConfigured, initiate, verify }` and registering it in `server.js` — no changes to order/payment logic.
- **Inventory**: `Product.stock` + `trackInventory` (per-product opt-out for made-to-order items) + `lowStockThreshold`. Checkout atomically reserves stock (rolls back if the order fails to save, rejects with a clear message if insufficient), and marking an order "returned" restocks it automatically.
- **Cloudinary**: product photos (multi-image, drag-and-drop-free file picker with cover-photo selection in the admin's Product form) and payment-proof screenshots both upload through `server/services/cloudinary.js`. Without `CLOUDINARY_*` set, uploads fail with a clear "not configured" message instead of a silent 500.

Add to `server/.env`:
```
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
BKASH_MERCHANT_NUMBER=01776775495   # shown to customers for manual transfers
# Leave BKASH_APP_KEY/APP_SECRET/USERNAME/PASSWORD blank until you have real bKash merchant credentials
```

Add to `server/.env` for AI order extraction:
```
ANTHROPIC_API_KEY=...
# AI_MODEL=claude-opus-5
```
