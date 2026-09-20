package com.lytronix.smslistener

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import java.util.concurrent.TimeUnit

/**
 * Two ways the outbox gets flushed:
 *  - [syncNow]: runs as soon as there is a network (immediately when already online,
 *    otherwise the moment the phone comes online) and retries with back-off if the
 *    server is unreachable.
 *  - [schedulePeriodic]: a safety net every 15 minutes (Android's minimum) that
 *    re-checks for anything still unsent — covers missed retries, app updates, reboots.
 * WorkManager stores both on disk, so they survive the app being killed and restarts.
 */
object Scheduler {
    private const val NOW = "sync-now"
    private const val PERIODIC = "sync-periodic"

    private val needsNetwork = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()

    fun syncNow(context: Context) {
        val req = OneTimeWorkRequestBuilder<SyncWorker>()
            .setConstraints(needsNetwork)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
            .build()
        // APPEND_OR_REPLACE: a message that arrives while a sync is running still gets its own pass.
        WorkManager.getInstance(context.applicationContext)
            .enqueueUniqueWork(NOW, ExistingWorkPolicy.APPEND_OR_REPLACE, req)
    }

    fun schedulePeriodic(context: Context) {
        val req = PeriodicWorkRequestBuilder<SyncWorker>(15, TimeUnit.MINUTES)
            .setConstraints(needsNetwork)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 1, TimeUnit.MINUTES)
            .build()
        WorkManager.getInstance(context.applicationContext)
            .enqueueUniquePeriodicWork(PERIODIC, ExistingPeriodicWorkPolicy.KEEP, req)
    }

    fun cancelAll(context: Context) {
        val wm = WorkManager.getInstance(context.applicationContext)
        wm.cancelUniqueWork(NOW)
        wm.cancelUniqueWork(PERIODIC)
    }
}
