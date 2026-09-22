package com.lytronix.smslistener

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.provider.Settings
import android.text.format.DateUtils
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import com.google.android.material.button.MaterialButton
import com.google.android.material.card.MaterialCardView
import com.google.android.material.chip.Chip
import com.google.android.material.chip.ChipGroup
import com.google.android.material.textfield.TextInputEditText
import com.journeyapps.barcodescanner.ScanContract
import com.journeyapps.barcodescanner.ScanOptions

class MainActivity : AppCompatActivity() {
    private companion object {
        const val CAMERA_PERMISSION_REQUEST = 2
    }

    private lateinit var prefs: Prefs
    private lateinit var db: SmsDb
    private val ui = Handler(Looper.getMainLooper())
    private val refresher = object : Runnable {
        override fun run() {
            render()
            ui.postDelayed(this, 3000)
        }
    }

    // What was last drawn, so the 3-second refresh only rebuilds a section when it really changed
    // (and never disturbs a field the user is typing in).
    private val drawn = HashMap<String, String>()

    private enum class Tone { OK, WARN, ERROR }

    private lateinit var setupGroup: View
    private lateinit var pairedGroup: View
    private lateinit var pairMessage: TextView
    private lateinit var pairButton: MaterialButton
    private lateinit var heroCard: MaterialCardView
    private lateinit var heroIcon: ImageView
    private lateinit var heroTitle: TextView
    private lateinit var heroSubtitle: TextView
    private lateinit var heroAction: MaterialButton
    private lateinit var healthContainer: LinearLayout
    private lateinit var recentContainer: LinearLayout
    private lateinit var sendersChips: ChipGroup

    // The admin panel's QR encodes "LYTXPAIR|<server address>|<pairing code>" — scanning it does
    // the same thing as typing both fields by hand, then submits immediately.
    private val qrScanner = registerForActivityResult(ScanContract()) { result ->
        val raw = result.contents ?: return@registerForActivityResult
        val parts = raw.split("|")
        if (parts.size != 3 || parts[0] != "LYTXPAIR") {
            pairMessage.text = "That QR code isn't a Lytronix pairing code."
            return@registerForActivityResult
        }
        findViewById<TextInputEditText>(R.id.serverUrl).setText(parts[1])
        findViewById<TextInputEditText>(R.id.pairCode).setText(parts[2])
        pair()
    }

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
        pairButton = findViewById(R.id.pairButton)
        heroCard = findViewById(R.id.heroCard)
        heroIcon = findViewById(R.id.heroIcon)
        heroTitle = findViewById(R.id.heroTitle)
        heroSubtitle = findViewById(R.id.heroSubtitle)
        heroAction = findViewById(R.id.heroAction)
        healthContainer = findViewById(R.id.healthContainer)
        recentContainer = findViewById(R.id.recentContainer)
        sendersChips = findViewById(R.id.sendersChips)

        findViewById<TextInputEditText>(R.id.serverUrl).setText(prefs.serverUrl)
        findViewById<TextInputEditText>(R.id.deviceName).setText(if (prefs.deviceName.isNotEmpty()) prefs.deviceName else Build.MODEL)
        findViewById<TextView>(R.id.versionText).text = "Version ${BuildConfigVersion.NAME}"

        pairButton.setOnClickListener { pair() }
        findViewById<MaterialButton>(R.id.scanQrButton).setOnClickListener { scanQr() }

        findViewById<MaterialButton>(R.id.addSender).setOnClickListener { addSenderFromField() }
        findViewById<TextInputEditText>(R.id.newSender).setOnEditorActionListener { _, _, _ ->
            addSenderFromField()
            true
        }
        findViewById<MaterialButton>(R.id.ignoredAdd).setOnClickListener {
            prefs.addSender(prefs.lastIgnoredSender)
            render()
        }
        findViewById<MaterialButton>(R.id.testButton).setOnClickListener {
            prefs.testUntil = if (prefs.isTestMode) 0L else System.currentTimeMillis() + 15 * 60 * 1000L
            render()
        }
        findViewById<MaterialButton>(R.id.unpair).setOnClickListener {
            AlertDialog.Builder(this)
                .setTitle("Unpair this phone?")
                .setMessage("It will stop forwarding SMS. Messages not yet sent stay on the phone.")
                .setPositiveButton("Unpair") { _, _ -> unpair() }
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
        if (requestCode == CAMERA_PERMISSION_REQUEST) {
            if (grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED) scanQr()
            return
        }
        render()
    }

    // ------------------------------------------------------------------ actions

    private fun pair() {
        val url = findViewById<TextInputEditText>(R.id.serverUrl).text.toString().trim()
        val code = findViewById<TextInputEditText>(R.id.pairCode).text.toString().trim()
        val name = findViewById<TextInputEditText>(R.id.deviceName).text.toString().trim().ifEmpty { Build.MODEL }
        if (url.isEmpty() || code.isEmpty()) {
            pairMessage.text = "Enter the server address and the pairing code."
            return
        }
        pairButton.isEnabled = false
        pairButton.text = "Connecting…"
        pairMessage.text = ""
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
                pairButton.text = "Connect"
                pairMessage.text = message
                render()
            }
        }.start()
    }

    private fun scanQr() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.CAMERA), CAMERA_PERMISSION_REQUEST)
            return
        }
        qrScanner.launch(
            ScanOptions()
                .setDesiredBarcodeFormats(ScanOptions.QR_CODE)
                .setBeepEnabled(false)
                .setOrientationLocked(false)
                .setPrompt("Scan the QR code shown in the admin panel")
        )
    }

    private fun unpair() {
        Scheduler.cancelAll(this)
        prefs.clearPairing()
        render()
    }

    private fun addSenderFromField() {
        val field = findViewById<TextInputEditText>(R.id.newSender)
        val name = field.text.toString().trim()
        if (name.isEmpty()) return
        prefs.addSender(name)
        field.setText("")
        render()
    }

    private fun askSmsPermission() =
        ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.RECEIVE_SMS), 1)

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

    private fun syncNow() {
        prefs.authFailed = false
        Scheduler.syncNow(this)
        Toast.makeText(this, "Sending stored messages…", Toast.LENGTH_SHORT).show()
    }

    // ------------------------------------------------------------------ drawing

    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()

    private fun ago(t: Long): String =
        if (t <= 0L) "never"
        else if (System.currentTimeMillis() - t < 45_000) "just now"
        else DateUtils.getRelativeTimeSpanString(t, System.currentTimeMillis(), DateUtils.MINUTE_IN_MILLIS).toString()

    private fun tint(view: View, color: Int) {
        (view.background.mutate() as GradientDrawable).setColor(color)
    }

    private fun render() {
        val paired = prefs.isPaired
        setupGroup.visibility = if (paired) View.GONE else View.VISIBLE
        pairedGroup.visibility = if (paired) View.VISIBLE else View.GONE
        if (!paired) return

        val pending = db.unsentCount()
        val sms = hasSmsPermission()
        val battery = ignoringBattery()

        renderHero(pending, sms, battery)
        findViewById<TextView>(R.id.statWaiting).text = pending.toString()
        findViewById<TextView>(R.id.statSent).text = db.sentCount().toString()
        findViewById<TextView>(R.id.statSync).text = ago(prefs.lastSyncAt)
        renderHealth(sms, battery)
        renderIgnored()
        renderSenders()
        renderTest()
        renderRecent()
    }

    private fun renderHero(pending: Int, sms: Boolean, battery: Boolean) {
        val tone: Tone
        val title: String
        val sub: String
        var action: String? = null
        var onAction: () -> Unit = {}

        when {
            prefs.authFailed -> {
                tone = Tone.ERROR
                title = "Phone disconnected"
                sub = "The server no longer accepts this phone. Pair it again."
                action = "Pair again"
                onAction = { unpair() }
            }
            !sms -> {
                tone = Tone.WARN
                title = "SMS access needed"
                sub = "Allow reading SMS so payment messages can be forwarded."
                action = "Allow SMS access"
                onAction = { askSmsPermission() }
            }
            pending > 0 && prefs.lastError.isNotEmpty() -> {
                tone = Tone.WARN
                title = "Waiting for a connection"
                sub = "$pending message${if (pending == 1) "" else "s"} stored safely — they will be sent automatically."
                action = "Try now"
                onAction = { syncNow() }
            }
            !battery -> {
                tone = Tone.WARN
                title = "Allow background use"
                sub = "Battery saver may stop this app. Set it to unrestricted so no payment is missed."
                action = "Fix"
                onAction = { requestBatteryExemption() }
            }
            prefs.isTestMode -> {
                tone = Tone.OK
                title = "Test mode is on"
                val mins = ((prefs.testUntil - System.currentTimeMillis()) / 60_000L + 1).coerceAtLeast(1)
                sub = "Forwarding every SMS for about $mins more minute${if (mins == 1L) "" else "s"}."
            }
            else -> {
                tone = Tone.OK
                title = "Listening for payment SMS"
                sub = "Messages from ${prefs.sendersList().joinToString(", ")} are forwarded automatically."
            }
        }

        val key = "$tone|$title|$sub|$action"
        if (drawn["hero"] == key) return
        drawn["hero"] = key

        heroCard.setCardBackgroundColor(
            ContextCompat.getColor(
                this,
                when (tone) { Tone.OK -> R.color.brand; Tone.WARN -> R.color.warn; Tone.ERROR -> R.color.danger }
            )
        )
        heroIcon.setImageResource(if (tone == Tone.OK) R.drawable.ic_check else R.drawable.ic_alert)
        heroTitle.text = title
        heroSubtitle.text = sub
        if (action != null) {
            heroAction.visibility = View.VISIBLE
            heroAction.text = action
            heroAction.setOnClickListener { onAction() }
        } else {
            heroAction.visibility = View.GONE
        }
    }

    private fun renderHealth(sms: Boolean, battery: Boolean) {
        val server: Triple<Boolean, String, String?> = when {
            prefs.authFailed -> Triple(false, "Rejected by the server", "Pair again")
            prefs.lastError.isNotEmpty() -> Triple(false, prefs.lastError, "Retry")
            prefs.lastSyncAt > 0 -> Triple(true, "Last sync ${ago(prefs.lastSyncAt)}", null)
            else -> Triple(true, "Waiting for the first message", null)
        }
        val key = "$sms|$battery|${server.first}|${server.second}|${server.third}"
        if (drawn["health"] == key) return
        drawn["health"] = key

        healthContainer.removeAllViews()
        addCheckRow(
            healthContainer, sms, "SMS access",
            if (sms) "Allowed" else "Not allowed — payments can't be read",
            if (sms) null else "Allow"
        ) { askSmsPermission() }
        addCheckRow(
            healthContainer, battery, "Runs in the background",
            if (battery) "Unrestricted" else "May be paused by battery saver",
            if (battery) null else "Fix"
        ) { requestBatteryExemption() }
        addCheckRow(
            healthContainer, server.first, "Server connection", server.second, server.third
        ) { if (prefs.authFailed) unpair() else syncNow() }
    }

    private fun addCheckRow(parent: LinearLayout, ok: Boolean, title: String, sub: String, action: String?, onAction: () -> Unit) {
        val row = LayoutInflater.from(this).inflate(R.layout.row_check, parent, false)
        tint(row.findViewById<FrameLayout>(R.id.rowIconBg), ContextCompat.getColor(this, if (ok) R.color.success else R.color.warn))
        row.findViewById<ImageView>(R.id.rowIcon).setImageResource(if (ok) R.drawable.ic_check else R.drawable.ic_alert)
        row.findViewById<TextView>(R.id.rowTitle).text = title
        row.findViewById<TextView>(R.id.rowSub).text = sub
        val btn = row.findViewById<MaterialButton>(R.id.rowAction)
        if (action != null) {
            btn.visibility = View.VISIBLE
            btn.text = action
            btn.setOnClickListener { onAction() }
        }
        parent.addView(row)
        if (parent.childCount > 0) {
            // thin divider between rows
            val prev = parent.childCount
            if (prev > 1) {
                val line = View(this).apply {
                    setBackgroundColor(ContextCompat.getColor(this@MainActivity, R.color.line))
                    layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(1))
                }
                parent.addView(line, parent.childCount - 1)
            }
        }
    }

    private fun renderIgnored() {
        val card = findViewById<View>(R.id.ignoredCard)
        val addBtn = findViewById<MaterialButton>(R.id.ignoredAdd)
        val sender = prefs.lastIgnoredSender
        if (sender.isEmpty() || prefs.isTestMode) {
            card.visibility = View.GONE
            return
        }
        card.visibility = View.VISIBLE
        val n = prefs.ignoredCount
        if (prefs.lastIgnoredReason == "format") {
            // Sender was allowed, but the text wasn't a payment receipt — normal (an OTP, a "you
            // sent" notice, a promo). Nothing to fix, so no action button.
            findViewById<TextView>(R.id.ignoredText).text =
                "Skipped $n message${if (n == 1) "" else "s"} that didn't look like a payment. The latest was from “$sender” but wasn't a payment receipt — e.g. an OTP — so it was never sent anywhere."
            addBtn.visibility = View.GONE
        } else {
            findViewById<TextView>(R.id.ignoredText).text =
                "Ignored $n message${if (n == 1) "" else "s"}. The latest came from “$sender”, which isn't in your sender list. If that is a payment sender, add it."
            addBtn.visibility = View.VISIBLE
            addBtn.text = "Forward messages from $sender"
        }
    }

    private fun renderSenders() {
        val list = prefs.sendersList()
        val key = list.joinToString("|")
        if (drawn["senders"] == key) return
        drawn["senders"] = key
        sendersChips.removeAllViews()
        for (s in list) {
            val chip = Chip(this).apply {
                text = s
                isCloseIconVisible = list.size > 1
                setChipBackgroundColorResource(R.color.brand_soft)
                setTextColor(ContextCompat.getColor(this@MainActivity, R.color.brand))
                setOnCloseIconClickListener {
                    prefs.removeSender(s)
                    render()
                }
            }
            sendersChips.addView(chip)
        }
    }

    private fun renderTest() {
        val on = prefs.isTestMode
        val mins = ((prefs.testUntil - System.currentTimeMillis()) / 60_000L + 1).coerceAtLeast(1)
        val key = "$on|${if (on) mins else 0}"
        if (drawn["test"] == key) return
        drawn["test"] = key
        findViewById<TextView>(R.id.testText).text = if (on)
            "Forwarding every SMS for about $mins more minute${if (mins == 1L) "" else "s"}. The server keeps only messages that look like a bKash receipt and never uses them to verify a payment. Also switch on Test mode in the admin panel."
        else
            "To try the setup with a message from your SMS gateway (not from bKash), start a 15-minute test. All incoming SMS are forwarded for that time; the server discards anything that isn't a bKash-style receipt."
        findViewById<MaterialButton>(R.id.testButton).text = if (on) "Stop test mode" else "Start 15-minute test"
    }

    private fun renderRecent() {
        val recent = db.recent(12)
        val key = recent.joinToString(";") { "${it.id}:${it.sent}:${it.status}" } + "|" + (System.currentTimeMillis() / 60_000L)
        if (drawn["recent"] == key) return
        drawn["recent"] = key

        recentContainer.removeAllViews()
        if (recent.isEmpty()) {
            recentContainer.addView(TextView(this).apply {
                text = "Nothing received yet. Payment messages will appear here."
                setTextColor(ContextCompat.getColor(this@MainActivity, R.color.muted))
                textSize = 13.5f
                setPadding(0, dp(14), 0, dp(14))
            })
            return
        }
        val amount = Regex("""Tk\s*([\d,]+(?:\.\d+)?)""")
        val from = Regex("""from\s+(\+?\d{10,14})""")
        recent.forEachIndexed { i, m ->
            val row = LayoutInflater.from(this).inflate(R.layout.item_message, recentContainer, false)
            val amt = amount.find(m.body)?.groupValues?.get(1)
            val who = from.find(m.body)?.groupValues?.get(1)
            row.findViewById<TextView>(R.id.msgAvatar).text = (m.sender.firstOrNull() ?: '?').uppercaseChar().toString()
            row.findViewById<TextView>(R.id.msgTitle).text =
                if (amt != null) "Tk $amt${if (who != null) " · from $who" else ""}" else m.body.take(48)
            row.findViewById<TextView>(R.id.msgSub).text = "${m.sender} · ${ago(m.receivedAt)}"
            val pill = row.findViewById<TextView>(R.id.msgPill)
            if (m.sent) {
                pill.text = "Sent"
                pill.setTextColor(ContextCompat.getColor(this, R.color.success))
                tint(pill, ContextCompat.getColor(this, R.color.success_soft))
            } else {
                pill.text = "Waiting"
                pill.setTextColor(ContextCompat.getColor(this, R.color.warn))
                tint(pill, ContextCompat.getColor(this, R.color.warn_soft))
            }
            recentContainer.addView(row)
            if (i < recent.size - 1) {
                recentContainer.addView(View(this).apply {
                    setBackgroundColor(ContextCompat.getColor(this@MainActivity, R.color.line))
                    layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(1))
                })
            }
        }
    }
}
