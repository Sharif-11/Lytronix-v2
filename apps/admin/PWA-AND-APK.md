# Lytronix Admin — installable PWA + background push + Android APK

The admin is a PWA (`public/manifest.webmanifest`, `public/sw.js`). Once
deployed over HTTPS it can be installed to a phone home screen and receive
**background push notifications with sound** — a new order, a bKash payment to
verify, or a customer chat message alerts even when the app is closed.

## 1. Server env (Render → the API service)

```
VAPID_PUBLIC_KEY=<from `node -e "console.log(require('web-push').generateVAPIDKeys())"`>
VAPID_PRIVATE_KEY=<same command>
VAPID_SUBJECT=mailto:you@example.com
```

A keypair is already in `server/.env` for local dev — reuse it or generate a
fresh one for production. With these unset, push is simply disabled (no errors).

## 2. Deploy the admin (static site)

Root `apps/admin`, build `npm install && npm run build`, publish `dist`,
SPA rewrite `/* → /index.html`. The host must still serve real files first, so
`/sw.js`, `/manifest.webmanifest` and `/.well-known/assetlinks.json` are
served as-is (Render / Netlify / Vercel all do this by default).

## 3. Turn on notifications

Open the deployed admin → bell icon → **"ব্যাকগ্রাউন্ড অ্যালার্ট চালু করুন"**.
Grant the browser permission. Do this once per device/browser. On Android,
also "Add to Home screen" / "Install app" from the browser menu so it runs
standalone and survives the browser being closed.

## 4. Build the APK (TWA wrapper)

The APK is just a Chrome shell around the deployed PWA — push still flows
through Web Push, so nothing in the app changes.

**Easiest — PWABuilder:**
1. Go to https://www.pwabuilder.com and enter the deployed admin URL.
2. Package For Stores → Android → download the `.zip` (contains a signed
   `app-release-signed.apk` / `.aab` and a `assetlinks.json`).
3. Copy the `package_name` and the SHA-256 fingerprint from PWABuilder into
   `apps/admin/public/.well-known/assetlinks.json` (replace both `REPLACE_…`
   values), commit, redeploy the admin. This removes the URL bar in the APK.
4. Sideload the APK on the phone (or upload the `.aab` to Play Console).

**CLI alternative — Bubblewrap:**
```
npm i -g @bubblewrap/cli
bubblewrap init --manifest https://<admin-url>/manifest.webmanifest
bubblewrap build          # -> app-release-signed.apk
```
Then put its `assetlinks.json` at `apps/admin/public/.well-known/`.

## Pushing an app update to installed users

Every `vite build` stamps the git short SHA into `dist/version.json`, the
`SW_VERSION` in `dist/sw.js`, and a `<meta name="app-version">` in
`index.html`. The `<UpdatePrompt>` component (mounted in both apps) polls
`/version.json` every 5 min + on focus/visibility, and also listens for a new
service worker; when the deployed version differs from the one the tab booted
with it shows a bottom bar — **"A new version is available · Reload"** /
**"অ্যাপের নতুন সংস্করণ এসেছে · রিফ্রেশ"** — that calls `location.reload()`.

So: just deploy. Installed PWA / APK users get the banner within ~5 minutes of
next opening the app (or immediately on focus). No store submission is needed
for content changes — the APK is only a shell around the live PWA. Rebuild the
APK **only** when the manifest, icons, or package identity change.

## Troubleshooting — "notifications don't arrive"

Check, in order:

1. **`GET /api/push/config` returns `{"enabled":true,...}`** — if `false`, the
   `VAPID_*` env vars aren't set on the Render **API** service.
2. **It must be the installed PWA, not a browser tab.** Open the deployed
   admin → browser menu → *Install app* / *Add to Home screen*. Background
   push + the app-icon badge only work for the installed app.
3. **Enable it once per device:** bell icon → *ব্যাকগ্রাউন্ড অ্যালার্ট চালু করুন*
   → grant the browser permission. The bell panel shows a **"টেস্ট নোটিফিকেশন
   পাঠান"** button once subscribed — use it to verify the whole path.
4. **The API must be awake.** Render's free tier sleeps after ~15 min idle;
   pushes are not queued, so events while it's asleep never alert. Use a paid
   always-on instance or a 10-min uptime pinger. This is the usual reason a
   real order doesn't ping but the test button (which wakes the API) does.
5. **`/sw.js` must be served as a real file** by the static host — not
   rewritten to `index.html`. Render/Netlify/Vercel do this by default; a
   custom rewrite must exclude `/sw.js`, `/manifest.webmanifest`,
   `/.well-known/`.
6. **Battery optimisation:** on some Android OEMs, exclude the installed app
   from battery optimisation or background push is delayed/dropped.
7. If it worked before and stopped: the browser rotated the subscription. The
   SW's `pushsubscriptionchange` handler now re-registers automatically via
   `POST /api/push/rotate`; reopening the app also self-heals the subscription.

## Notes / limits

- Notification **sound** is the phone's default notification sound (a plain
  Web Push SW can't ship a custom audio file). A fully native sound needs the
  Capacitor + FCM route instead. When the app is open, the in-app chime plays.
- The number on the app icon is the unread-notification count
  (`navigator.setAppBadge`) — set from the push payload while closed, synced
  to the real unread count whenever the app is open; cleared on *Mark all read*
  and logout. Requires an installed PWA.
- iOS: web push + badge work only for a PWA added to the Home Screen on
  iOS 16.4+.
