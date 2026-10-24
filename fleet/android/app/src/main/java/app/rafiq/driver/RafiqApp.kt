package app.rafiq.driver

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions

class RafiqApp : Application() {
    override fun onCreate() {
        super.onCreate()
        // Firebase settings come from fleet/firebase-config.json at build time
        if (FirebaseApp.getApps(this).isEmpty()) {
            val options = FirebaseOptions.Builder()
                .setApiKey(BuildConfig.FIREBASE_API_KEY)
                .setProjectId(BuildConfig.FIREBASE_PROJECT_ID)
                .setApplicationId(BuildConfig.FIREBASE_APP_ID)
                .setGcmSenderId(BuildConfig.FIREBASE_SENDER_ID)
                .setStorageBucket(BuildConfig.FIREBASE_STORAGE_BUCKET)
                .build()
            FirebaseApp.initializeApp(this, options)
        }
        createChannels()
    }

    private fun createChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL_SHIFT, getString(R.string.channel_shift), NotificationManager.IMPORTANCE_LOW)
        )
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL_JOBS, getString(R.string.channel_jobs), NotificationManager.IMPORTANCE_HIGH)
        )
    }

    companion object {
        const val CHANNEL_SHIFT = "shift"
        const val CHANNEL_JOBS = "jobs"
    }
}
