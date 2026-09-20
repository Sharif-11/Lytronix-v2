# Lytronix SMS Listener (Android)

Forwards incoming **bKash** payment SMS to the Lytronix server so manual-bKash payments are verified automatically.

## Install

Copy `dist/lytronix-sms-listener.apk` to the phone that receives your bKash SMS and open it
(allow "install unknown apps" for the app you opened it from).

- `lytronix-sms-listener.apk` – the one to use. Talks to the server over **HTTPS only**.
- `lytronix-sms-listener-debug-http-allowed.apk` – only for testing against a server on plain `http://` (e.g. your PC on the LAN).

## Pair the phone with the server

1. Admin panel → **SMS listener** → **Pair a new phone**. It shows an 8-character code (valid 10 minutes, one use) and the server address.
2. In the app enter the server address, the code and a name for the phone → **Pair with server**.
3. Tap **Allow reading incoming SMS**, then **Keep running in the background** and choose *Unrestricted / Don't optimise*.

The server gives the phone a private token at pairing. Only phones holding a token can send messages, and an admin can **Revoke** a phone at any time.

## How it works

- `SmsReceiver` is declared in the manifest, so Android starts the app for every SMS, even when it is closed.
- Only senders in the app's list (default `bKash`, editable in the app) are kept. Each one is written to a local SQLite outbox **before** anything is sent.
- `Scheduler.syncNow` (WorkManager) sends as soon as there is a network — immediately when online, otherwise the moment the phone is back online — retrying with back-off.
- `Scheduler.schedulePeriodic` re-checks every 15 minutes (Android's minimum) for anything still unsent; it is re-armed after reboot and app updates.
- A message stays in the outbox until the server acknowledges it. Re-sending is safe: the server ignores repeats.

## Limits to know about

- If you **force-stop** the app in Android settings, Android will not deliver SMS to it until it is opened again.
- Some phone makers (Xiaomi, Oppo, Vivo, Huawei, Samsung "sleeping apps") stop background apps aggressively. Turn off battery optimisation for the app and allow auto-start.
- Android only ever schedules periodic work every 15 minutes or more; the immediate path covers the normal case.

## Build

Needs JDK 17 and the Android SDK (API 35, build-tools 36). Create `local.properties` with `sdk.dir=<path to your SDK>`, then:

```
./gradlew assembleRelease assembleDebug
```

APKs appear in `app/build/outputs/apk/`. To support another sender, add its ID in the app; a matching parser must exist on the server (`server/services/smsParsers.js`).
