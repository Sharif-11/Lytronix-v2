package com.lytronix.smslistener

import android.content.Context
import androidx.work.Worker
import androidx.work.WorkerParameters
import java.io.IOException
import java.util.concurrent.TimeUnit

/** Sends every unsent message in the outbox to the server, oldest first. */
class SyncWorker(context: Context, params: WorkerParameters) : Worker(context, params) {

    override fun doWork(): Result {
        val prefs = Prefs(applicationContext)
        if (!prefs.isPaired || prefs.authFailed) return Result.success()
        val db = SmsDb.get(applicationContext)

        try {
            while (true) {
                val batch = db.unsent(50)
                if (batch.isEmpty()) break

                val results = Api.send(prefs.serverUrl, prefs.deviceToken, batch)
                var progressed = false
                for (m in batch) {
                    val status = results[m.clientId]
                    // "retry" = the server hit a problem storing it: keep it and try again later.
                    if (status != null && status != "retry") {
                        db.markSent(m.clientId, status)
                        progressed = true
                    }
                }
                if (!progressed) {
                    prefs.lastError = "Server could not process the messages yet — will retry."
                    return Result.retry()
                }
            }
            prefs.lastSyncAt = System.currentTimeMillis()
            prefs.lastError = ""
            db.pruneSent(TimeUnit.DAYS.toMillis(7))
            return Result.success()
        } catch (e: Api.HttpError) {
            if (e.code == 401) {
                // Revoked or wrong token: retrying can never work until the phone is paired again.
                prefs.authFailed = true
                prefs.lastError = "The server no longer accepts this phone. Unpair and pair again."
                return Result.failure()
            }
            prefs.lastError = "Server error: ${e.message}"
            return Result.retry()
        } catch (e: IOException) {
            prefs.lastError = "Offline or server unreachable — messages are stored and will be sent later."
            return Result.retry()
        }
    }
}
