package com.lytronix.smslistener

import android.content.Context

/** Small settings store (private to this app). */
class Prefs(context: Context) {
    private val sp = context.applicationContext.getSharedPreferences("smslistener", Context.MODE_PRIVATE)

    var serverUrl: String
        get() = sp.getString("serverUrl", "") ?: ""
        set(v) = sp.edit().putString("serverUrl", v).apply()

    /** Secret issued by the server at pairing. Empty = not paired. */
    var deviceToken: String
        get() = sp.getString("deviceToken", "") ?: ""
        set(v) = sp.edit().putString("deviceToken", v).apply()

    var deviceName: String
        get() = sp.getString("deviceName", "") ?: ""
        set(v) = sp.edit().putString("deviceName", v).apply()

    /** Comma separated sender IDs to forward. Extend it to forward other providers. */
    var senders: String
        get() = sp.getString("senders", "bKash") ?: "bKash"
        set(v) = sp.edit().putString("senders", v).apply()

    var lastSyncAt: Long
        get() = sp.getLong("lastSyncAt", 0L)
        set(v) = sp.edit().putLong("lastSyncAt", v).apply()

    var lastError: String
        get() = sp.getString("lastError", "") ?: ""
        set(v) = sp.edit().putString("lastError", v).apply()

    /** True after the server answered 401 (device revoked or token wrong). */
    var authFailed: Boolean
        get() = sp.getBoolean("authFailed", false)
        set(v) = sp.edit().putBoolean("authFailed", v).apply()

    val isPaired: Boolean get() = deviceToken.isNotEmpty()

    /** Until when every SMS is forwarded (a short, explicit test for messages from an SMS gateway). */
    var testUntil: Long
        get() = sp.getLong("testUntil", 0L)
        set(v) = sp.edit().putLong("testUntil", v).apply()

    val isTestMode: Boolean get() = testUntil > System.currentTimeMillis()

    /** Last sender that was NOT forwarded — shown so a wrong sender name is easy to spot and fix. */
    var lastIgnoredSender: String
        get() = sp.getString("lastIgnoredSender", "") ?: ""
        set(v) = sp.edit().putString("lastIgnoredSender", v).apply()

    var ignoredCount: Int
        get() = sp.getInt("ignoredCount", 0)
        set(v) = sp.edit().putInt("ignoredCount", v).apply()

    fun sendersList(): List<String> = senders.split(',').map { it.trim() }.filter { it.isNotEmpty() }

    fun allowedSenders(): List<String> = sendersList().map { it.lowercase() }

    fun isAllowedSender(sender: String?): Boolean =
        isTestMode || (sender != null && allowedSenders().contains(sender.trim().lowercase()))

    fun addSender(name: String) {
        val n = name.trim()
        if (n.isEmpty() || allowedSenders().contains(n.lowercase())) return
        senders = (sendersList() + n).joinToString(",")
        if (lastIgnoredSender.equals(n, ignoreCase = true)) {
            lastIgnoredSender = ""
            ignoredCount = 0
        }
    }

    fun removeSender(name: String) {
        val left = sendersList().filterNot { it.equals(name, ignoreCase = true) }
        senders = if (left.isEmpty()) "bKash" else left.joinToString(",")
    }

    fun recordIgnored(sender: String) {
        lastIgnoredSender = sender
        ignoredCount = ignoredCount + 1
    }

    fun clearPairing() {
        sp.edit().remove("deviceToken").remove("lastSyncAt").remove("testUntil").remove("lastIgnoredSender").remove("ignoredCount")
            .putBoolean("authFailed", false).putString("lastError", "").apply()
    }
}
