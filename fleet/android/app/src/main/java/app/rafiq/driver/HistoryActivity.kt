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

/** The driver's hours on shift by date, and finished trips, newest first. */
class HistoryActivity : AppCompatActivity() {

    private var listener: ListenerRegistration? = null
    private var shiftsListener: ListenerRegistration? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_history)
        findViewById<View>(R.id.back).setOnClickListener { finish() }
        val uid = FirebaseAuth.getInstance().currentUser?.uid ?: return finish()
        listener = FirebaseFirestore.getInstance().collection("jobs").whereEqualTo("driverId", uid)
            .addSnapshotListener { snap, _ -> if (snap != null) show(snap.documents) }
        shiftsListener = FirebaseFirestore.getInstance().collection("shifts").whereEqualTo("driverId", uid)
            .addSnapshotListener { snap, _ -> if (snap != null) showHours(snap.documents) }
    }

    override fun onDestroy() {
        listener?.remove()
        shiftsListener?.remove()
        super.onDestroy()
    }

    private fun hours(ms: Long): String {
        val m = (ms / 60_000).toInt()
        return getString(R.string.hours_value, m / 60, m % 60)
    }

    /**
     * Hours per date: from "start shift" to "end shift". The shift open on this phone counts until now;
     * an older shift that was never ended (phone switched off) is left out, as its end is unknown.
     */
    private fun showHours(docs: List<DocumentSnapshot>) {
        val now = System.currentTimeMillis()
        val openId = Driver.shiftId(this)
        data class Shift(val day: String, val start: Date, val end: Date, val open: Boolean)
        val shifts = docs.mapNotNull { d ->
            val start = d.getTimestamp("startAt")?.toDate() ?: return@mapNotNull null
            val endAt = d.getTimestamp("endAt")?.toDate()
            val open = endAt == null && d.id == openId && Driver.isOnShift(this)
            val end = endAt ?: if (open) Date(now) else return@mapNotNull null
            if (end.time <= start.time) return@mapNotNull null
            Shift(d.getString("date") ?: SimpleDateFormat("yyyy-MM-dd", Locale.US).format(start), start, end, open)
        }

        val cal = Calendar.getInstance()
        val dayFmt = SimpleDateFormat("yyyy-MM-dd", Locale.US)
        val today = dayFmt.format(cal.time)
        val weekAgo = (cal.clone() as Calendar).apply { add(Calendar.DAY_OF_YEAR, -6) }
        val monthStart = (cal.clone() as Calendar).apply { set(Calendar.DAY_OF_MONTH, 1) }
        val weekFrom = dayFmt.format(weekAgo.time)
        val monthFrom = dayFmt.format(monthStart.time)
        fun total(filter: (String) -> Boolean) = shifts.filter { filter(it.day) }.sumOf { minOf(it.end.time - it.start.time, 24 * 3600_000L) }
        findViewById<TextView>(R.id.hours_today).text = hours(total { it == today })
        findViewById<TextView>(R.id.hours_week).text = hours(total { it >= weekFrom })
        findViewById<TextView>(R.id.hours_month).text = hours(total { it >= monthFrom })

        val list = findViewById<LinearLayout>(R.id.days)
        list.removeAllViews()
        val ar = Locale("ar", "EG")
        val dateFmt = SimpleDateFormat("EEEE d MMMM", ar)
        val clockFmt = SimpleDateFormat("h:mm a", ar)
        val byDay = shifts.groupBy { it.day }.toSortedMap(compareByDescending { it })
        if (byDay.isEmpty()) {
            list.addView(TextView(this).apply {
                setText(R.string.no_shifts)
                setTextColor(getColor(R.color.muted))
                setPadding(16, 8, 16, 8)
            })
            return
        }
        for ((_, day) in byDay.entries.take(31)) {
            val v = layoutInflater.inflate(R.layout.item_day, list, false)
            val first = day.minByOrNull { it.start }!!
            val last = day.maxByOrNull { it.end }!!
            v.findViewById<TextView>(R.id.date).text = dateFmt.format(first.start)
            v.findViewById<TextView>(R.id.span).text =
                (if (last.open) getString(R.string.day_span_open, clockFmt.format(first.start))
                else getString(R.string.day_span, clockFmt.format(first.start), clockFmt.format(last.end))) +
                    (if (day.size > 1) "  •  " + getString(R.string.shifts_count, day.size) else "")
            v.findViewById<TextView>(R.id.hours).text = hours(day.sumOf { minOf(it.end.time - it.start.time, 24 * 3600_000L) })
            list.addView(v)
        }
    }

    private fun doneAt(doc: DocumentSnapshot): Date? =
        (doc.getTimestamp("doneAt") ?: doc.getTimestamp("updatedAt"))?.toDate()

    private fun show(docs: List<DocumentSnapshot>) {
        val done = docs.filter { it.getString("status") == JobStatus.DONE }
            .sortedByDescending { doneAt(it)?.time ?: 0L }

        val cal = Calendar.getInstance()
        val dayFmt = SimpleDateFormat("yyyy-MM-dd", Locale.US)
        val today = dayFmt.format(cal.time)
        val weekAgo = (cal.clone() as Calendar).apply { add(Calendar.DAY_OF_YEAR, -6) }
        val monthStart = (cal.clone() as Calendar).apply { set(Calendar.DAY_OF_MONTH, 1) }
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
