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

## Notes / limits

- **The API server must be awake to send a push.** On Render's free tier it
  sleeps after ~15 min idle — pushes are not queued, so anything that happens
  while it's asleep won't alert until it wakes (it wakes on any request).
  A paid always-on instance or an uptime pinger fixes this.
- Notification **sound** is the phone's default notification sound (a plain
  Web Push SW can't ship a custom audio file). A fully native sound needs the
  Capacitor + FCM route instead.
- iOS: web push works only for a PWA added to the Home Screen on iOS 16.4+.
- Aggressive battery savers on some Android OEMs can delay background push —
  exclude the installed app from battery optimization.
