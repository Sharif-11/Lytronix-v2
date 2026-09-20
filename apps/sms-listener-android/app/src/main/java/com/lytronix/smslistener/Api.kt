package com.lytronix.smslistener

import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

/** Minimal HTTP client for the two server endpoints this app uses. */
object Api {
    class HttpError(val code: Int, message: String) : IOException(message)

    data class PairResult(val deviceToken: String, val deviceId: String)

    fun normalizeBase(input: String): String {
        var s = input.trim().trimEnd('/')
        if (s.isNotEmpty() && !s.startsWith("http://") && !s.startsWith("https://")) s = "https://$s"
        return s
    }

    /** Exchange the one-time pairing code for this phone's secret token. */
    fun pair(base: String, code: String, deviceName: String): PairResult {
        val body = JSONObject()
            .put("code", code)
            .put("deviceName", deviceName)
            .put("appVersion", BuildConfigVersion.NAME)
        val res = JSONObject(post("${normalizeBase(base)}/sms-listener/pair", null, body))
        return PairResult(res.getString("deviceToken"), res.optString("deviceId"))
    }

    /** Sends a batch. Returns clientId -> server status for every message the server answered for. */
    fun send(base: String, token: String, msgs: List<Msg>): Map<String, String> {
        val arr = JSONArray()
        for (m in msgs) {
            arr.put(
                JSONObject()
                    .put("clientId", m.clientId)
                    .put("sender", m.sender)
                    .put("body", m.body)
                    .put("receivedAt", m.receivedAt)
            )
        }
        val res = JSONObject(post("${normalizeBase(base)}/sms-listener/messages", token, JSONObject().put("messages", arr)))
        val results = res.optJSONArray("results") ?: JSONArray()
        val out = HashMap<String, String>()
        for (i in 0 until results.length()) {
            val r = results.getJSONObject(i)
            out[r.optString("clientId")] = r.optString("status")
        }
        return out
    }

    private fun post(url: String, token: String?, body: JSONObject): String {
        val conn = URL(url).openConnection() as HttpURLConnection
        try {
            conn.requestMethod = "POST"
            conn.connectTimeout = 20_000
            conn.readTimeout = 30_000
            conn.doOutput = true
            conn.setRequestProperty("Content-Type", "application/json")
            if (token != null) conn.setRequestProperty("Authorization", "Bearer $token")
            conn.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }

            val code = conn.responseCode
            val stream = if (code in 200..299) conn.inputStream else conn.errorStream
            val text = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() } ?: ""
            if (code !in 200..299) {
                val msg = try { JSONObject(text).optString("message", "HTTP $code") } catch (e: Exception) { "HTTP $code" }
                throw HttpError(code, msg)
            }
            return text
        } finally {
            conn.disconnect()
        }
    }
}

object BuildConfigVersion {
    const val NAME = "1.0"
}
