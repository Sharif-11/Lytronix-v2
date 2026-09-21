package com.lytronix.smslistener

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import java.util.UUID

data class Msg(
    val id: Long,
    val clientId: String,
    val sender: String,
    val body: String,
    val receivedAt: Long,
    val sent: Boolean,
    val status: String,
)

/**
 * The persistent outbox. Every forwarded SMS is written here BEFORE anything is
 * sent, so nothing is lost if the phone is offline, the app is killed or the
 * phone restarts. A row stays `sent = 0` until the server acknowledges it.
 */
class SmsDb private constructor(context: Context) : SQLiteOpenHelper(context, "sms.db", null, 1) {

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL(
            """CREATE TABLE messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                client_id TEXT NOT NULL UNIQUE,
                sender TEXT NOT NULL,
                body TEXT NOT NULL,
                received_at INTEGER NOT NULL,
                sent INTEGER NOT NULL DEFAULT 0,
                status TEXT NOT NULL DEFAULT '',
                sent_at INTEGER NOT NULL DEFAULT 0
            )"""
        )
        db.execSQL("CREATE INDEX idx_messages_sent ON messages(sent, id)")
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {}

    @Synchronized
    fun insert(sender: String, body: String, receivedAt: Long): String {
        val clientId = UUID.randomUUID().toString()
        val cv = ContentValues().apply {
            put("client_id", clientId)
            put("sender", sender)
            put("body", body)
            put("received_at", receivedAt)
        }
        writableDatabase.insertOrThrow("messages", null, cv)
        return clientId
    }

    @Synchronized
    fun unsent(limit: Int): List<Msg> = query("sent = 0", "id ASC", limit)

    @Synchronized
    fun recent(limit: Int): List<Msg> = query(null, "id DESC", limit)

    @Synchronized
    fun unsentCount(): Int {
        readableDatabase.rawQuery("SELECT COUNT(*) FROM messages WHERE sent = 0", null).use {
            return if (it.moveToFirst()) it.getInt(0) else 0
        }
    }

    @Synchronized
    fun sentCount(): Int {
        readableDatabase.rawQuery("SELECT COUNT(*) FROM messages WHERE sent = 1", null).use {
            return if (it.moveToFirst()) it.getInt(0) else 0
        }
    }

    @Synchronized
    fun markSent(clientId: String, status: String) {
        val cv = ContentValues().apply {
            put("sent", 1)
            put("status", status)
            put("sent_at", System.currentTimeMillis())
        }
        writableDatabase.update("messages", cv, "client_id = ?", arrayOf(clientId))
    }

    /** Drops old, already-acknowledged rows. Unsent ones are never deleted. */
    @Synchronized
    fun pruneSent(olderThanMs: Long) {
        val cutoff = System.currentTimeMillis() - olderThanMs
        writableDatabase.delete("messages", "sent = 1 AND sent_at < ?", arrayOf(cutoff.toString()))
    }

    private fun query(where: String?, order: String, limit: Int): List<Msg> {
        val out = ArrayList<Msg>()
        readableDatabase.query("messages", null, where, null, null, null, order, limit.toString()).use { c ->
            while (c.moveToNext()) {
                out.add(
                    Msg(
                        id = c.getLong(c.getColumnIndexOrThrow("id")),
                        clientId = c.getString(c.getColumnIndexOrThrow("client_id")),
                        sender = c.getString(c.getColumnIndexOrThrow("sender")),
                        body = c.getString(c.getColumnIndexOrThrow("body")),
                        receivedAt = c.getLong(c.getColumnIndexOrThrow("received_at")),
                        sent = c.getInt(c.getColumnIndexOrThrow("sent")) == 1,
                        status = c.getString(c.getColumnIndexOrThrow("status")),
                    )
                )
            }
        }
        return out
    }

    companion object {
        @Volatile private var instance: SmsDb? = null
        fun get(context: Context): SmsDb =
            instance ?: synchronized(this) {
                instance ?: SmsDb(context.applicationContext).also { instance = it }
            }
    }
}
