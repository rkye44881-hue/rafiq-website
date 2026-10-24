package app.rafiq.driver

import android.os.Bundle
import android.view.View
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.DocumentSnapshot
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.ListenerRegistration
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

/** The driver's finished trips, newest first. */
class HistoryActivity : AppCompatActivity() {

    private var listener: ListenerRegistration? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_history)
        findViewById<View>(R.id.back).setOnClickListener { finish() }
        val uid = FirebaseAuth.getInstance().currentUser?.uid ?: return finish()
        listener = FirebaseFirestore.getInstance().collection("jobs").whereEqualTo("driverId", uid)
            .addSnapshotListener { snap, _ -> if (snap != null) show(snap.documents) }
    }

    override fun onDestroy() {
        listener?.remove()
        super.onDestroy()
    }

    private fun doneAt(doc: DocumentSnapshot): Date? =
        (doc.getTimestamp("doneAt") ?: doc.getTimestamp("updatedAt"))?.toDate()

    private fun show(docs: List<DocumentSnapshot>) {
        val done = docs.filter { it.getString("status") == JobStatus.DONE }
            .sortedByDescending { doneAt(it)?.time ?: 0L }

        val cal = Calendar.getInstance()
        val dayFmt = SimpleDateFormat("yyyy-MM-dd", Locale.US)
        val today = dayFmt.format(cal.time)
        val weekAgo = cal.clone() as Calendar
        weekAgo.add(Calendar.DAY_OF_YEAR, -6)
        val monthStart = cal.clone() as Calendar
        monthStart.set(Calendar.DAY_OF_MONTH, 1)
        val weekFrom = dayFmt.format(weekAgo.time)
        val monthFrom = dayFmt.format(monthStart.time)
        val days = done.mapNotNull { doneAt(it)?.let { d -> dayFmt.format(d) } }
        findViewById<TextView>(R.id.count_today).text = days.count { it == today }.toString()
        findViewById<TextView>(R.id.count_week).text = days.count { it >= weekFrom }.toString()
        findViewById<TextView>(R.id.count_month).text = days.count { it >= monthFrom }.toString()

        val list = findViewById<LinearLayout>(R.id.list)
        list.removeAllViews()
        findViewById<View>(R.id.empty).visibility = if (done.isEmpty()) View.VISIBLE else View.GONE
        val ar = Locale("ar", "EG")
        for (doc in done.take(200)) {
            val v = layoutInflater.inflate(R.layout.item_history, list, false)
            val at = doneAt(doc)
            if (at != null) {
                v.findViewById<TextView>(R.id.day).text = SimpleDateFormat("d", ar).format(at)
                v.findViewById<TextView>(R.id.month).text = SimpleDateFormat("MMM", ar).format(at)
                v.findViewById<TextView>(R.id.clock).text = SimpleDateFormat("h:mm a", ar).format(at)
            }
            v.findViewById<TextView>(R.id.title).text =
                doc.getString("title")?.takeIf { it.isNotBlank() } ?: getString(R.string.job)
            v.findViewById<TextView>(R.id.route).text =
                listOf(doc.getString("pickup"), doc.getString("dropoff")).filter { !it.isNullOrBlank() }.joinToString("  ←  ")
            val customer = doc.getString("customerName") ?: ""
            v.findViewById<TextView>(R.id.customer).apply {
                text = customer
                visibility = if (customer.isBlank()) View.GONE else View.VISIBLE
            }
            list.addView(v)
        }
    }
}
