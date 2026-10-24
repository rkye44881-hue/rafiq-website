package app.rafiq.driver

import android.annotation.SuppressLint
import android.app.Notification
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.location.Location
import android.os.BatteryManager
import android.os.Build
import android.os.IBinder
import android.os.Looper
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.ServiceCompat
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.firebase.Timestamp
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.ListenerRegistration
import com.google.firebase.firestore.SetOptions
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Runs while the driver is on shift: sends the location to the control panel
 * (also with the screen off) and shows a notification when a new job is assigned.
 */
class LocationService : Service() {

    private lateinit var fused: FusedLocationProviderClient
    private val db by lazy { FirebaseFirestore.getInstance() }
    private var jobsListener: ListenerRegistration? = null
    private val knownJobs = HashSet<String>()
    private var firstJobsSnapshot = true
    private var lastSent: Location? = null
    private var lastSentAt = 0L

    private val callback = object : LocationCallback() {
        override fun onLocationResult(result: LocationResult) {
            result.lastLocation?.let { onLocation(it) }
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        fused = LocationServices.getFusedLocationProviderClient(this)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            Driver.setOnShift(this, false)
            setOffline()
            ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
            stopSelf()
            return START_NOT_STICKY
        }
        val uid = FirebaseAuth.getInstance().currentUser?.uid
        if (uid == null) {
            stopSelf()
            return START_NOT_STICKY
        }
        val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION else 0
        try {
            ServiceCompat.startForeground(this, NOTIFICATION_SHIFT, shiftNotification(), type)
        } catch (e: Exception) {
            // Location permission was taken away: nothing can be tracked
            Driver.setOnShift(this, false)
            stopSelf()
            return START_NOT_STICKY
        }
        startLocation()
        listenForJobs(uid)
        return START_STICKY
    }

    @SuppressLint("MissingPermission")
    private fun startLocation() {
        val request = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, UPDATE_EVERY_MS)
            .setMinUpdateIntervalMillis(UPDATE_EVERY_MS / 2)
            .build()
        fused.removeLocationUpdates(callback)
        fused.requestLocationUpdates(request, callback, Looper.getMainLooper())
    }

    private fun onLocation(loc: Location) {
        val uid = FirebaseAuth.getInstance().currentUser?.uid ?: return
        val now = System.currentTimeMillis()
        val moved = lastSent?.distanceTo(loc)?.let { it >= MIN_MOVE_METERS } ?: true
        // Standing still: only a heartbeat every few minutes, so the panel still shows the driver as online
        if (!moved && now - lastSentAt < HEARTBEAT_MS) return

        val batch = db.batch()
        batch.update(
            db.collection("drivers").document(uid), mapOf(
                "lat" to loc.latitude,
                "lng" to loc.longitude,
                "speed" to (if (loc.hasSpeed()) loc.speed * 3.6 else 0.0),
                "heading" to (if (loc.hasBearing()) loc.bearing.toDouble() else 0.0),
                "accuracy" to loc.accuracy.toDouble(),
                "battery" to batteryLevel(),
                "online" to true,
                "updatedAt" to FieldValue.serverTimestamp()
            )
        )
        if (moved) {
            val day = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date(now))
            batch.set(
                db.collection("tracks").document("${uid}_$day"), mapOf(
                    "driverId" to uid,
                    "date" to day,
                    "points" to FieldValue.arrayUnion(
                        mapOf("lat" to loc.latitude, "lng" to loc.longitude, "t" to Timestamp(Date(now)))
                    )
                ), SetOptions.merge()
            )
            lastSent = loc
        }
        batch.commit()
        lastSentAt = now
    }

    private fun listenForJobs(uid: String) {
        if (jobsListener != null) return
        jobsListener = db.collection("jobs").whereEqualTo("driverId", uid)
            .addSnapshotListener { snap, _ ->
                if (snap == null) return@addSnapshotListener
                for (doc in snap.documents) {
                    val isNew = knownJobs.add(doc.id)
                    if (isNew && !firstJobsSnapshot && doc.getString("status") == JobStatus.NEW) {
                        notifyNewJob(doc.id, doc.getString("title") ?: "", doc.getString("pickup") ?: "")
                    }
                }
                firstJobsSnapshot = false
            }
    }

    @SuppressLint("MissingPermission")
    private fun notifyNewJob(id: String, title: String, pickup: String) {
        val open = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        val n = NotificationCompat.Builder(this, RafiqApp.CHANNEL_JOBS)
            .setSmallIcon(R.drawable.ic_car)
            .setContentTitle(getString(R.string.new_job))
            .setContentText(listOf(title, pickup).filter { it.isNotBlank() }.joinToString(" • "))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setDefaults(Notification.DEFAULT_ALL)
            .setAutoCancel(true)
            .setContentIntent(open)
            .build()
        try {
            NotificationManagerCompat.from(this).notify(id.hashCode(), n)
        } catch (_: SecurityException) {
            // Notifications not allowed: the job still shows in the app
        }
    }

    private fun shiftNotification(): Notification {
        val open = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        return NotificationCompat.Builder(this, RafiqApp.CHANNEL_SHIFT)
            .setSmallIcon(R.drawable.ic_car)
            .setContentTitle(getString(R.string.on_shift_title))
            .setContentText(getString(R.string.on_shift_text))
            .setOngoing(true)
            .setContentIntent(open)
            .build()
    }

    private fun batteryLevel(): Int {
        val bm = getSystemService(Context.BATTERY_SERVICE) as BatteryManager
        return bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
    }

    private fun setOffline() {
        val uid = FirebaseAuth.getInstance().currentUser?.uid ?: return
        db.collection("drivers").document(uid)
            .update(mapOf("online" to false, "updatedAt" to FieldValue.serverTimestamp()))
    }

    override fun onDestroy() {
        fused.removeLocationUpdates(callback)
        jobsListener?.remove()
        jobsListener = null
        super.onDestroy()
    }

    companion object {
        const val ACTION_STOP = "app.rafiq.driver.STOP"
        private const val NOTIFICATION_SHIFT = 1
        private const val UPDATE_EVERY_MS = 20_000L
        private const val MIN_MOVE_METERS = 25f
        private const val HEARTBEAT_MS = 5 * 60_000L

        fun start(context: Context) {
            Driver.setOnShift(context, true)
            androidx.core.content.ContextCompat.startForegroundService(context, Intent(context, LocationService::class.java))
        }

        fun stop(context: Context) {
            context.startService(Intent(context, LocationService::class.java).setAction(ACTION_STOP))
        }
    }
}
