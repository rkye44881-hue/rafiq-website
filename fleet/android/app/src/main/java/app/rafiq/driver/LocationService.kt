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
    private var driverListener: ListenerRegistration? = null
    private var carId: String? = null
    private var lastSent: Location? = null
    private var lastSentAt = 0L
    // Route points are collected and saved together every half minute, to keep the number of writes down
    private val pendingPoints = ArrayList<Map<String, Any>>()
    private var pendingKm = 0.0
    private var lastFlushAt = 0L
    private var lastTrackPoint: Location? = null

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
        listenForCar(uid)
        return START_STICKY
    }

    @SuppressLint("MissingPermission")
    private fun startLocation() {
        val request = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, UPDATE_EVERY_MS)
            .setMinUpdateIntervalMillis(UPDATE_EVERY_MS)
            .build()
        fused.removeLocationUpdates(callback)
        fused.requestLocationUpdates(request, callback, Looper.getMainLooper())
    }

    private fun onLocation(loc: Location) {
        val uid = FirebaseAuth.getInstance().currentUser?.uid ?: return
        val now = System.currentTimeMillis()
        val moved = lastSent?.distanceTo(loc)?.let { it >= MIN_MOVE_METERS } ?: true
        // Standing still: only a heartbeat every two minutes, so the panel still shows the driver as online
        if (!moved && now - lastSentAt < HEARTBEAT_MS) return

        db.collection("drivers").document(uid).update(
            mapOf(
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
        lastSentAt = now
        if (moved) lastSent = loc

        // Distance for the reports and oil changes: only from accurate fixes, so GPS jitter does not add kilometres
        if (loc.accuracy <= MAX_ACCURACY_METERS) {
            val prev = lastTrackPoint
            if (prev == null || prev.distanceTo(loc) >= MIN_MOVE_METERS) {
                if (prev != null) pendingKm += prev.distanceTo(loc) / 1000.0
                lastTrackPoint = loc
                pendingPoints += mapOf("lat" to loc.latitude, "lng" to loc.longitude, "t" to Timestamp(Date(now)))
            }
        }
        if (pendingPoints.isNotEmpty() && now - lastFlushAt >= FLUSH_EVERY_MS) flush(uid, now)
    }

    private fun flush(uid: String, now: Long) {
        val day = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date(now))
        val batch = db.batch()
        batch.set(
            db.collection("tracks").document("${uid}_$day"), mapOf(
                "driverId" to uid,
                "date" to day,
                "points" to FieldValue.arrayUnion(*pendingPoints.toTypedArray())
            ), SetOptions.merge()
        )
        if (pendingKm > 0) {
            batch.set(
                db.collection("kmDaily").document("${uid}_$day"), mapOf(
                    "driverId" to uid,
                    "carId" to carId,
                    "date" to day,
                    "km" to FieldValue.increment(pendingKm),
                    "updatedAt" to FieldValue.serverTimestamp()
                ), SetOptions.merge()
            )
        }
        batch.commit()
        pendingPoints.clear()
        pendingKm = 0.0
        lastFlushAt = now
    }

    private fun listenForCar(uid: String) {
        if (driverListener != null) return
        driverListener = db.collection("drivers").document(uid).addSnapshotListener { doc, _ ->
            if (doc != null && doc.exists()) carId = doc.getString("carId")
        }
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
        if (pendingPoints.isNotEmpty()) flush(uid, System.currentTimeMillis())
        db.collection("drivers").document(uid)
            .update(mapOf("online" to false, "updatedAt" to FieldValue.serverTimestamp()))
    }

    override fun onDestroy() {
        fused.removeLocationUpdates(callback)
        jobsListener?.remove()
        jobsListener = null
        driverListener?.remove()
        driverListener = null
        super.onDestroy()
    }

    companion object {
        const val ACTION_STOP = "app.rafiq.driver.STOP"
        private const val NOTIFICATION_SHIFT = 1
        // While moving the car shows on the map every 5 seconds
        private const val UPDATE_EVERY_MS = 5_000L
        private const val MIN_MOVE_METERS = 15f
        private const val MAX_ACCURACY_METERS = 40f
        private const val HEARTBEAT_MS = 2 * 60_000L
        private const val FLUSH_EVERY_MS = 30_000L

        fun start(context: Context) {
            Driver.setOnShift(context, true)
            androidx.core.content.ContextCompat.startForegroundService(context, Intent(context, LocationService::class.java))
        }

        fun stop(context: Context) {
            context.startService(Intent(context, LocationService::class.java).setAction(ACTION_STOP))
        }
    }
}
