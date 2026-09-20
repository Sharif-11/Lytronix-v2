package com.lytronix.smslistener

import android.app.Application

class App : Application() {
    override fun onCreate() {
        super.onCreate()
        // Every process start (SMS arrival, boot, opening the app) makes sure the
        // periodic safety-net check exists. KEEP policy makes this a no-op if it does.
        if (Prefs(this).isPaired) Scheduler.schedulePeriodic(this)
    }
}
