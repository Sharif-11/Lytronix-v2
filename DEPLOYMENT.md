# Lytronix — production deployment

Three deployables from this monorepo:

| part | dir | what it is |
|---|---|---|
| API | `server/` | Express + MongoDB (Atlas). Long-running Node process. |
| Storefront | `apps/storefront/` | Vite/React static site (customer shop). |
| Admin | `apps/admin/` | Vite/React static site (staff panel). |

---

## 1. Fill the placeholders

### `server/.env`  (already written, git-ignored)

Replace every `REPLACE-…` token:

| key | with |
|---|---|
| `CLIENT_URL` | the storefront's public URL, e.g. `https://shop.lytronix.com` |
| `ALLOWED_ORIGINS` | storefront URL **and** admin URL, comma-separated, no trailing slash |
| `STEADFAST_MERCHANT_ID` | Steadfast "Merchant ID" (printed on the courier label) — optional |

Already set for production:
- `MONGODB_URI` → the dedicated **`lytronix`** database on the Atlas cluster
- `NODE_ENV=production` → **SMS is sent for real** via BulkSMSBD (OTP, order alerts)
- `JWT_SECRET` → freshly rotated for the cutover
- Steadfast / Cloudinary / SMS / bKash-manual keys → carried over, live

In the Steadfast merchant portal → **Webhook Integration**:
- Callback URL: `https://<API-domain>/api/webhooks/steadfast`
- Auth Token: the value of `STEADFAST_WEBHOOK_TOKEN` in `server/.env`

### `apps/admin/.env.production` and `apps/storefront/.env.production`

Set `VITE_API_URL` to the API's public base URL **including `/api`**, e.g.
`https://api.lytronix.com/api`. The value is compiled into the bundle, so it
must be right *before* you build.

---

## 2. Build & run

### API

```bash
cd server
npm ci --omit=dev
node server.js          # or: pm2 start server.js --name lytronix-api
```

Health check: `GET https://<API-domain>/api/health` → `{ "ok": true }`

Put a reverse proxy (nginx / Caddy / Cloudflare) in front for TLS. The API
reads `PORT` (default 5000). `server/logs/{combined,error}.log` is written
relative to `server/` — make that dir writable / rotate it.

Background jobs run inside the API process (no cron needed): chat-media
retention sweep (`CHAT_RETENTION_DAYS`, default 30) and analytics-event
pruning (`ANALYTICS_EVENT_TTL_DAYS`, default 180).

### Storefront

```bash
cd apps/storefront
npm ci
npm run build            # -> dist/
```

Deploy `dist/` to any static host. SPA fallback: rewrite all unknown paths to
`/index.html`.

### Admin

```bash
cd apps/admin
npm ci
npm run build            # -> dist/
```

Same static-host + SPA-fallback treatment. Keep it on its own hostname (it's
already in `ALLOWED_ORIGINS`).

---

## 3. First login

Superadmin was seeded:

- **phone:** `01776775495`  (or email `shariful.islam.cuet@gmail.com`)
- **password:** `1804011Lytronix!`

Log in and change it immediately (Profile → Change Password).

---

## What the cutover already did (scripts in `server/scripts/`)

| script | effect |
|---|---|
| `resetDb.js --yes` | dropped every collection in the `lytronix` DB |
| `npm run seed` | 5 roles, the superadmin above, 4 starter categories (+12 sub-categories) |
| `restoreCustomers.js` | re-inserted the 5 customers from `server/backups/customers-backup-2026-09-05T11-40-59-124Z.json` (original `_id`s + timestamps preserved) |
| `cleanupCloudinary.js --yes` | deleted all 40 assets under the `lytronix/` folder in cloud `dqnw5qaoq` (manifest saved to `server/backups/cloudinary-manifest-*.json`) |

Re-runnable if needed: `restoreCustomers.js` skips existing phones;
`cleanupCloudinary.js --dry` previews.

> Note: the Cloudinary account has **automatic backup** on, so a deleted
> asset's metadata record lingers as a `bytes: 0` shell until the account's
> backup retention expires. The originals are gone and the delivery URLs no
> longer serve them.

---

## Pre-flight checklist

- [ ] `server/.env` has no `REPLACE-…` left
- [ ] `apps/*/.env.production` `VITE_API_URL` points at the real API + `/api`
- [ ] Steadfast portal Callback URL + Auth Token set
- [ ] `GET /api/health` returns ok from the public URL
- [ ] admin + storefront origins both in `ALLOWED_ORIGINS`
- [ ] a test order end-to-end (checkout → admin sees it → SMS actually arrives)
- [ ] superadmin password changed
