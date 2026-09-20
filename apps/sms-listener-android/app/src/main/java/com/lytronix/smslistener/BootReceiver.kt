package com.lytronix.smslistener

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** After a reboot or an app update: re-arm the periodic check and flush anything left over. */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (!Prefs(context).isPaired) return
        Scheduler.schedulePeriodic(context)
        Scheduler.syncNow(context)
    }
}
