package app.rafiq.driver

import android.annotation.SuppressLint
import android.app.AlarmManager
import android.app.Notification
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.google.firebase.firestore.DocumentSnapshot
import java.text.SimpleDateFormat
import java.util.Locale

/**
 * A job booked ahead (it has an "at" time) rings on the driver's phone an hour before,
 * even when the app is closed. Called whenever the driver's jobs change.
 */
object Reminders {
    private const val BEFORE_MS = 60 * 60_000L
    private const val PREFS = "reminders"
    private const val KEY_IDS = "ids"

    fun sync(context: Context, docs: List<DocumentSnapshot>) {
        val am = context.getSystemService(AlarmManager::class.java) ?: return
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val now = System.currentTimeMillis()
        val scheduled = HashSet<String>()
        val clock = SimpleDateFormat("h:mm a", Locale("ar", "EG"))
        for (doc in docs) {
            val at = doc.getTimestamp("at")?.toDate()?.time ?: continue
            val status = doc.getString("status")
            val ringAt = at - BEFORE_MS
            if (status == JobStatus.DONE || status == JobStatus.CANCELLED || ringAt <= now) continue
            val text = listOf(clock.format(java.util.Date(at)), doc.getString("pickup"), doc.getString("customerName"))
                .filter { !it.isNullOrBlank() }.joinToString(" • ")
            setAlarm(am, pending(context, doc.id, doc.getString("title") ?: "", text), ringAt)
            scheduled += doc.id
        }
        // Jobs taken away, finished or cancelled: their reminder goes too
        for (id in prefs.getStringSet(KEY_IDS, emptySet()).orEmpty()) {
            if (id !in scheduled) am.cancel(pending(context, id, "", ""))
        }
        prefs.edit().putStringSet(KEY_IDS, scheduled).apply()
    }

    @SuppressLint("MissingPermission")
    private fun setAlarm(am: AlarmManager, pi: PendingIntent, at: Long) {
        // Rings even in battery-saving sleep; Android may move it by a few minutes
        am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
    }

    private fun pending(context: Context, id: String, title: String, text: String): PendingIntent =
        PendingIntent.getBroadcast(
            context, id.hashCode(),
            Intent(context, ReminderReceiver::class.java).putExtra("id", id).putExtra("title", title).putExtra("text", text),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
}

class ReminderReceiver : BroadcastReceiver() {
    @SuppressLint("MissingPermission")
    override fun onReceive(context: Context, intent: Intent) {
        val open = PendingIntent.getActivity(
            context, 0, Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        val n = NotificationCompat.Builder(context, RafiqApp.CHANNEL_JOBS)
            .setSmallIcon(R.drawable.ic_car)
            .setContentTitle(context.getString(R.string.reminder_title))
            .setContentText(intent.getStringExtra("text") ?: "")
            .setStyle(NotificationCompat.BigTextStyle().bigText(intent.getStringExtra("text") ?: ""))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setDefaults(Notification.DEFAULT_ALL)
            .setAutoCancel(true)
            .setContentIntent(open)
            .build()
        try {
            NotificationManagerCompat.from(context).notify(("r" + intent.getStringExtra("id")).hashCode(), n)
        } catch (_: SecurityException) {
            // Notifications turned off: the job is still in the app
        }
    }
}
