package com.lytronix.smslistener

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony

/**
 * Called by Android for every incoming SMS, even when the app is not running.
 * It only does the fast part — write to the local outbox and ask the scheduler
 * to send — so it can never lose a message to a slow or missing network.
 */
class SmsReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return
        val prefs = Prefs(context)
        if (!prefs.isPaired) return

        val parts = Telephony.Sms.Intents.getMessagesFromIntent(intent) ?: return
        val first = parts.firstOrNull() ?: return
        val sender = first.originatingAddress ?: return
        if (!prefs.isAllowedSender(sender)) {
            // Not stored and not sent — only the sender name is remembered, locally, for the "ignored" hint.
            prefs.recordIgnored(sender)
            return
        }

        // A long SMS arrives in several parts; join them back into one message.
        val body = parts.joinToString("") { it.messageBody ?: "" }
        if (body.isBlank()) return
        val receivedAt = if (first.timestampMillis > 0) first.timestampMillis else System.currentTimeMillis()

        SmsDb.get(context).insert(sender, body, receivedAt)
        Scheduler.syncNow(context)
    }
}
