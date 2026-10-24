package app.rafiq.driver

import android.Manifest
import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.PackageManager
import android.net.ConnectivityManager
import android.net.Network
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.text.InputType
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import com.google.firebase.Timestamp
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.DocumentSnapshot
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.ListenerRegistration

class MainActivity : AppCompatActivity() {

    private val db by lazy { FirebaseFirestore.getInstance() }
    private val listeners = mutableListOf<ListenerRegistration>()
    private var carListener: ListenerRegistration? = null
    private var carId: String? = null
    private var carOdometer: Long? = null
    private var carShown = false
    private var networkCallback: ConnectivityManager.NetworkCallback? = null

    private lateinit var shiftButton: Button
    private lateinit var shiftState: TextView
    private lateinit var jobsList: LinearLayout
    private lateinit var emptyText: TextView

    private val permissionRequest = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { result ->
        if (result[Manifest.permission.ACCESS_FINE_LOCATION] == true ||
            result[Manifest.permission.ACCESS_COARSE_LOCATION] == true
        ) {
            startShift()
        } else {
            AlertDialog.Builder(this)
                .setMessage(R.string.location_needed)
                .setPositiveButton(R.string.open_settings) { _, _ ->
                    startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName")))
                }
                .setNegativeButton(R.string.cancel, null)
                .show()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val user = FirebaseAuth.getInstance().currentUser
        if (user == null) {
            startActivity(Intent(this, LoginActivity::class.java))
            finish()
            return
        }
        setContentView(R.layout.activity_main)

        shiftButton = findViewById(R.id.shift_button)
        shiftState = findViewById(R.id.shift_state)
        jobsList = findViewById(R.id.jobs)
        emptyText = findViewById(R.id.empty)

        shiftButton.setOnClickListener {
            if (Driver.isOnShift(this)) endShift() else askPermissionsAndStart()
        }
        findViewById<TextView>(R.id.logout).setOnClickListener { confirmLogout() }
        watchNetwork()

        // Keep tracking alive if Android restarted the app while on shift
        if (Driver.isOnShift(this) && hasLocationPermission()) LocationService.start(this)
        showShift()

        listeners += db.collection("drivers").document(user.uid).addSnapshotListener { doc, _ ->
            if (doc != null && doc.exists()) showDriver(doc)
        }
        listeners += db.collection("jobs").whereEqualTo("driverId", user.uid).addSnapshotListener { snap, _ ->
            if (snap != null) showJobs(snap.documents)
        }
    }

    override fun onResume() {
        super.onResume()
        if (::shiftButton.isInitialized) showShift()
    }

    override fun onDestroy() {
        listeners.forEach { it.remove() }
        carListener?.remove()
        networkCallback?.let { getSystemService(ConnectivityManager::class.java).unregisterNetworkCallback(it) }
        super.onDestroy()
    }

    private fun showDriver(doc: DocumentSnapshot) {
        findViewById<TextView>(R.id.driver_name).text = doc.getString("name") ?: ""
        val newCar = doc.getString("carId")
        // The first time through also shows "no car" when none is assigned
        if (carShown && newCar == carId) return
        carShown = true
        carId = newCar
        carOdometer = null
        carListener?.remove()
        val carView = findViewById<TextView>(R.id.car)
        if (newCar.isNullOrBlank()) {
            carView.setText(R.string.no_car)
            return
        }
        carListener = db.collection("cars").document(newCar).addSnapshotListener { car, _ ->
            if (car != null && car.exists()) {
                carView.text = listOf(car.getString("model"), car.getString("plate"))
                    .filter { !it.isNullOrBlank() }.joinToString(" • ")
                carOdometer = (car.get("odometer") as? Number)?.toLong()
            }
        }
    }

    private fun showShift() {
        val on = Driver.isOnShift(this)
        shiftButton.setText(if (on) R.string.end_shift else R.string.start_shift)
        shiftButton.backgroundTintList = ContextCompat.getColorStateList(this, if (on) R.color.red else R.color.green)
        shiftState.setText(if (on) R.string.state_on else R.string.state_off)
        shiftState.setTextColor(ContextCompat.getColor(this, if (on) R.color.green else R.color.muted))
    }

    private fun hasLocationPermission() =
        ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
            ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED

    private fun askPermissionsAndStart() {
        val wanted = mutableListOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)
        if (Build.VERSION.SDK_INT >= 33) wanted += Manifest.permission.POST_NOTIFICATIONS
        val missing = wanted.filter { ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED }
        if (missing.isEmpty()) startShift() else permissionRequest.launch(missing.toTypedArray())
    }

    /** With a car assigned, the shift starts with the odometer reading. */
    private fun startShift() {
        val car = carId
        if (car.isNullOrBlank()) {
            beginShift(null, null)
            return
        }
        val input = EditText(this).apply {
            inputType = InputType.TYPE_CLASS_NUMBER
            hint = getString(R.string.odometer_hint)
            textSize = 22f
        }
        val box = LinearLayout(this).apply {
            setPadding(48, 24, 48, 0)
            addView(input, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))
        }
        val dialog = AlertDialog.Builder(this)
            .setTitle(R.string.odometer_title)
            .setView(box)
            .setPositiveButton(R.string.start_shift, null)
            .setNegativeButton(R.string.cancel, null)
            .create()
        dialog.setOnShowListener {
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
                val km = input.text.toString().trim().toLongOrNull()
                val last = carOdometer
                when {
                    km == null -> input.error = getString(R.string.odometer_empty)
                    last != null && km < last -> input.error = getString(R.string.odometer_low, last)
                    else -> {
                        dialog.dismiss()
                        beginShift(car, km)
                    }
                }
            }
        }
        dialog.show()
    }

    private fun beginShift(car: String?, km: Long?) {
        val uid = FirebaseAuth.getInstance().currentUser?.uid ?: return
        val shift = db.collection("shifts").document()
        val batch = db.batch()
        batch.set(
            shift, mapOf(
                "driverId" to uid,
                "carId" to car,
                "startKm" to km,
                "date" to java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.US).format(java.util.Date()),
                "startAt" to FieldValue.serverTimestamp()
            )
        )
        if (car != null && km != null) {
            batch.update(
                db.collection("cars").document(car),
                mapOf("odometer" to km, "odometerAt" to FieldValue.serverTimestamp(), "odometerBy" to uid)
            )
        }
        // Saved in the background (also offline); the shift does not wait for it
        batch.commit()
        Driver.setShiftId(this, shift.id)
        LocationService.start(this)
        showShift()
        askBatteryExemption()
    }

    private fun closeShift() {
        val id = Driver.shiftId(this) ?: return
        db.collection("shifts").document(id).update("endAt", FieldValue.serverTimestamp())
        Driver.setShiftId(this, null)
    }

    /** A bar at the top when the phone has no internet; locations are kept and sent once it is back. */
    private fun watchNetwork() {
        val bar = findViewById<TextView>(R.id.offline)
        val cm = getSystemService(ConnectivityManager::class.java)
        bar.visibility = if (cm.activeNetwork == null) View.VISIBLE else View.GONE
        val cb = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                runOnUiThread { bar.visibility = View.GONE }
            }

            override fun onLost(network: Network) {
                runOnUiThread { bar.visibility = if (cm.activeNetwork == null) View.VISIBLE else View.GONE }
            }
        }
        cm.registerDefaultNetworkCallback(cb)
        networkCallback = cb
    }

    private fun endShift() {
        AlertDialog.Builder(this)
            .setMessage(R.string.end_shift_confirm)
            .setPositiveButton(R.string.end_shift) { _, _ ->
                closeShift()
                LocationService.stop(this)
                Driver.setOnShift(this, false)
                showShift()
            }
            .setNegativeButton(R.string.cancel, null)
            .show()
    }

    /** Some phones stop apps in the background to save battery; ask once to leave this one running. */
    @SuppressLint("BatteryLife")
    private fun askBatteryExemption() {
        val pm = getSystemService(PowerManager::class.java)
        if (pm.isIgnoringBatteryOptimizations(packageName)) return
        try {
            startActivity(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:$packageName")))
        } catch (_: Exception) {
        }
    }

    private fun confirmLogout() {
        AlertDialog.Builder(this)
            .setMessage(R.string.logout_confirm)
            .setPositiveButton(R.string.logout) { _, _ ->
                if (Driver.isOnShift(this)) {
                    closeShift()
                    LocationService.stop(this)
                }
                Driver.setOnShift(this, false)
                FirebaseAuth.getInstance().signOut()
                startActivity(Intent(this, LoginActivity::class.java))
                finish()
            }
            .setNegativeButton(R.string.cancel, null)
            .show()
    }

    private fun showJobs(docs: List<DocumentSnapshot>) {
        val active = docs
            .filter { it.getString("status") != JobStatus.DONE && it.getString("status") != JobStatus.CANCELLED }
            .sortedBy { it.getTimestamp("createdAt") ?: Timestamp.now() }
        jobsList.removeAllViews()
        emptyText.visibility = if (active.isEmpty()) View.VISIBLE else View.GONE
        for (doc in active) jobsList.addView(jobCard(doc))
    }

    private fun jobCard(doc: DocumentSnapshot): View {
        val v = layoutInflater.inflate(R.layout.item_job, jobsList, false)
        val status = doc.getString("status") ?: JobStatus.NEW
        val pickup = doc.getString("pickup") ?: ""
        val dropoff = doc.getString("dropoff") ?: ""
        val phone = doc.getString("customerPhone") ?: ""

        v.findViewById<TextView>(R.id.title).text = doc.getString("title")?.takeIf { it.isNotBlank() } ?: getString(R.string.job)
        v.findViewById<TextView>(R.id.status).text = getString(statusLabel(status))
        setLine(v.findViewById(R.id.time), doc.getString("pickupTime"), R.string.label_time)
        setLine(v.findViewById(R.id.pickup), pickup, R.string.label_pickup)
        setLine(v.findViewById(R.id.dropoff), dropoff, R.string.label_dropoff)
        setLine(v.findViewById(R.id.customer), listOf(doc.getString("customerName"), phone).filter { !it.isNullOrBlank() }.joinToString(" • "), R.string.label_customer)
        setLine(v.findViewById(R.id.notes), doc.getString("notes"), R.string.label_notes)

        val call = v.findViewById<Button>(R.id.call)
        call.visibility = if (phone.isBlank()) View.GONE else View.VISIBLE
        call.setOnClickListener { startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:$phone"))) }

        val navPickup = v.findViewById<Button>(R.id.nav_pickup)
        navPickup.visibility = if (pickup.isBlank()) View.GONE else View.VISIBLE
        navPickup.setOnClickListener { navigate(pickup) }
        val navDropoff = v.findViewById<Button>(R.id.nav_dropoff)
        navDropoff.visibility = if (dropoff.isBlank()) View.GONE else View.VISIBLE
        navDropoff.setOnClickListener { navigate(dropoff) }

        val next = JobStatus.next(status)
        val action = v.findViewById<Button>(R.id.action)
        if (next == null) {
            action.visibility = View.GONE
        } else {
            action.setText(actionLabel(status))
            action.setOnClickListener {
                action.isEnabled = false
                db.collection("jobs").document(doc.id).update(
                    mapOf("status" to next, "${next}At" to FieldValue.serverTimestamp(), "updatedAt" to FieldValue.serverTimestamp())
                ).addOnFailureListener { action.isEnabled = true }
            }
        }
        return v
    }

    private fun setLine(view: TextView, value: String?, label: Int) {
        if (value.isNullOrBlank()) {
            view.visibility = View.GONE
        } else {
            view.text = getString(label, value)
            view.visibility = View.VISIBLE
        }
    }

    private fun navigate(place: String) {
        // Coordinates or a Google Maps link work as-is; otherwise search for the address
        val uri = if (place.startsWith("http")) Uri.parse(place) else Uri.parse("google.navigation:q=" + Uri.encode(place))
        try {
            startActivity(Intent(Intent.ACTION_VIEW, uri))
        } catch (_: Exception) {
            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("geo:0,0?q=" + Uri.encode(place))))
        }
    }

    private fun statusLabel(s: String) = when (s) {
        JobStatus.NEW -> R.string.status_new
        JobStatus.ACCEPTED -> R.string.status_accepted
        JobStatus.ON_WAY -> R.string.status_onway
        JobStatus.ARRIVED -> R.string.status_arrived
        JobStatus.DONE -> R.string.status_done
        else -> R.string.status_cancelled
    }

    private fun actionLabel(s: String) = when (s) {
        JobStatus.NEW -> R.string.action_accept
        JobStatus.ACCEPTED -> R.string.action_onway
        JobStatus.ON_WAY -> R.string.action_arrived
        else -> R.string.action_done
    }
}
