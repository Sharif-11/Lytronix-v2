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

    fun allowedSenders(): List<String> =
        senders.split(',').map { it.trim().lowercase() }.filter { it.isNotEmpty() }

    fun isAllowedSender(sender: String?): Boolean =
        sender != null && allowedSenders().contains(sender.trim().lowercase())

    fun clearPairing() {
        sp.edit().remove("deviceToken").remove("lastSyncAt").putBoolean("authFailed", false).putString("lastError", "").apply()
    }
}
