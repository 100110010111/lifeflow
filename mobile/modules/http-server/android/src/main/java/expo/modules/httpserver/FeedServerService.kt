package expo.modules.httpserver

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.os.PowerManager

class FeedServerService : Service() {

    companion object {
        const val CHANNEL_ID = "lifeflow_server"
        const val NOTIFICATION_ID = 1
    }

    private var wakeLock: PowerManager.WakeLock? = null

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        startForeground(NOTIFICATION_ID, buildNotification("Starting..."))
        acquireWakeLock()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val text = intent?.getStringExtra("statusText") ?: "Serving podcast feeds"
        updateNotification(text)
        return START_STICKY
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        // App swiped from recents — service keeps running via START_STICKY
        super.onTaskRemoved(rootIntent)
    }

    override fun onDestroy() {
        releaseWakeLock()
        // Stop the server when the service is destroyed
        try {
            HttpServerModule.server?.stop()
            HttpServerModule.server = null
        } catch (e: Exception) {
            android.util.Log.w("FeedServerService", "Error stopping server: ${e.message}")
        }
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun acquireWakeLock() {
        val pm = getSystemService(POWER_SERVICE) as PowerManager
        wakeLock = pm.newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK,
            "LifeFlowBridge::FeedServer"
        ).apply {
            acquire()
        }
    }

    private fun releaseWakeLock() {
        try {
            wakeLock?.let {
                if (it.isHeld) it.release()
            }
            wakeLock = null
        } catch (e: Exception) {
            android.util.Log.w("FeedServerService", "Error releasing wake lock: ${e.message}")
        }
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "LifeFlow Feed Server",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Keeps the podcast feed server running"
                setShowBadge(false)
            }
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(channel)
        }
    }

    private fun buildNotification(text: String): Notification {
        return Notification.Builder(this, CHANNEL_ID)
            .setContentTitle("LifeFlow Bridge")
            .setContentText(text)
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setOngoing(true)
            .build()
    }

    private fun updateNotification(text: String) {
        val manager = getSystemService(NotificationManager::class.java)
        manager.notify(NOTIFICATION_ID, buildNotification(text))
    }
}
