package com.lytronix.smslistener

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.provider.Settings
import android.text.format.DateUtils
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : AppCompatActivity() {
    private lateinit var prefs: Prefs
    private lateinit var db: SmsDb
    private val ui = Handler(Looper.getMainLooper())
    private val refresher = object : Runnable {
        override fun run() {
            render()
            ui.postDelayed(this, 3000)
        }
    }

    private lateinit var setupGroup: LinearLayout
    private lateinit var pairedGroup: LinearLayout
    private lateinit var pairMessage: TextView
    private lateinit var statusText: TextView
    private lateinit var recentList: TextView
    private lateinit var permButton: Button
    private lateinit var batteryButton: Button
    private lateinit var pairButton: Button

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        // Android 15 draws apps edge-to-edge: keep the content clear of the status/navigation bars.
        ViewCompat.setOnApplyWindowInsetsListener(findViewById(R.id.root)) { v, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.ime())
            v.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            insets
        }
        prefs = Prefs(this)
        db = SmsDb.get(this)

        setupGroup = findViewById(R.id.setupGroup)
        pairedGroup = findViewById(R.id.pairedGroup)
        pairMessage = findViewById(R.id.pairMessage)
        statusText = findViewById(R.id.statusText)
        recentList = findViewById(R.id.recentList)
        permButton = findViewById(R.id.permButton)
        batteryButton = findViewById(R.id.batteryButton)
        pairButton = findViewById(R.id.pairButton)

        findViewById<EditText>(R.id.serverUrl).setText(prefs.serverUrl)
        findViewById<EditText>(R.id.deviceName).setText(if (prefs.deviceName.isNotEmpty()) prefs.deviceName else Build.MODEL)
        findViewById<EditText>(R.id.senders).setText(prefs.senders)

        pairButton.setOnClickListener { pair() }
        findViewById<Button>(R.id.syncNow).setOnClickListener {
            prefs.authFailed = false
            Scheduler.syncNow(this)
            Toast.makeText(this, "Sync queued", Toast.LENGTH_SHORT).show()
        }
        permButton.setOnClickListener {
            ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.RECEIVE_SMS), 1)
        }
        batteryButton.setOnClickListener { requestBatteryExemption() }
        findViewById<Button>(R.id.saveSenders).setOnClickListener {
            val v = findViewById<EditText>(R.id.senders).text.toString().trim()
            prefs.senders = if (v.isEmpty()) "bKash" else v
            Toast.makeText(this, "Saved", Toast.LENGTH_SHORT).show()
            render()
        }
        findViewById<Button>(R.id.unpair).setOnClickListener {
            AlertDialog.Builder(this)
                .setTitle("Unpair this phone?")
                .setMessage("It will stop forwarding SMS. Messages not yet sent stay on the phone.")
                .setPositiveButton("Unpair") { _, _ ->
                    Scheduler.cancelAll(this)
                    prefs.clearPairing()
                    render()
                }
                .setNegativeButton("Cancel", null)
                .show()
        }
    }

    override fun onResume() {
        super.onResume()
        ui.post(refresher)
    }

    override fun onPause() {
        super.onPause()
        ui.removeCallbacks(refresher)
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        render()
    }

    private fun pair() {
        val url = findViewById<EditText>(R.id.serverUrl).text.toString().trim()
        val code = findViewById<EditText>(R.id.pairCode).text.toString().trim()
        val name = findViewById<EditText>(R.id.deviceName).text.toString().trim().ifEmpty { Build.MODEL }
        if (url.isEmpty() || code.isEmpty()) {
            pairMessage.text = "Enter the server address and the pairing code."
            return
        }
        pairButton.isEnabled = false
        pairMessage.text = "Pairing…"
        Thread {
            var message = ""
            try {
                val res = Api.pair(url, code, name)
                prefs.serverUrl = Api.normalizeBase(url)
                prefs.deviceName = name
                prefs.deviceToken = res.deviceToken
                prefs.authFailed = false
                prefs.lastError = ""
                Scheduler.schedulePeriodic(this)
                Scheduler.syncNow(this)
            } catch (e: Api.HttpError) {
                message = e.message ?: "The server refused the code."
            } catch (e: Exception) {
                message = "Could not reach the server. Check the address and your connection."
            }
            runOnUiThread {
                pairButton.isEnabled = true
                pairMessage.text = message
                render()
            }
        }.start()
    }

    private fun hasSmsPermission() =
        ContextCompat.checkSelfPermission(this, Manifest.permission.RECEIVE_SMS) == PackageManager.PERMISSION_GRANTED

    private fun ignoringBattery(): Boolean =
        getSystemService(PowerManager::class.java).isIgnoringBatteryOptimizations(packageName)

    private fun requestBatteryExemption() {
        try {
            startActivity(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:$packageName")))
        } catch (e: Exception) {
            startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
        }
    }

    private fun render() {
        val paired = prefs.isPaired
        setupGroup.visibility = if (paired) View.GONE else View.VISIBLE
        pairedGroup.visibility = if (paired) View.VISIBLE else View.GONE
        if (!paired) return

        val pending = db.unsentCount()
        val sms = hasSmsPermission()
        val battery = ignoringBattery()
        val last = if (prefs.lastSyncAt > 0)
            DateUtils.getRelativeTimeSpanString(prefs.lastSyncAt, System.currentTimeMillis(), DateUtils.MINUTE_IN_MILLIS).toString()
        else "never"

        val lines = ArrayList<String>()
        lines.add("Paired as “${prefs.deviceName}”")
        lines.add("Server: ${prefs.serverUrl}")
        lines.add("SMS permission: ${if (sms) "allowed ✔" else "NOT allowed ✘ — tap the button below"}")
        lines.add("Background: ${if (battery) "unrestricted ✔" else "may be stopped by battery saver — tap the button below"}")
        lines.add("Waiting to send: $pending message(s)")
        lines.add("Last successful sync: $last")
        if (prefs.lastError.isNotEmpty()) lines.add("⚠ ${prefs.lastError}")
        statusText.text = lines.joinToString("\n")

        permButton.visibility = if (sms) View.GONE else View.VISIBLE
        batteryButton.visibility = if (battery) View.GONE else View.VISIBLE

        val recent = db.recent(15)
        recentList.text = if (recent.isEmpty()) "Nothing received yet." else recent.joinToString("\n\n") { m ->
            val when_ = DateUtils.getRelativeTimeSpanString(m.receivedAt, System.currentTimeMillis(), DateUtils.MINUTE_IN_MILLIS)
            val state = if (m.sent) "sent (${m.status})" else "waiting"
            "$when_ · ${m.sender} · $state\n${m.body.take(160)}"
        }
    }
}
