package app.rafiq.driver

import android.content.Context

/** Driver logins are phone numbers; Firebase needs an email, so the phone is turned into one. */
object Driver {
    const val EMAIL_DOMAIN = "drivers.rafiq.app"

    fun emailFromPhone(phone: String): String {
        val digits = phone.filter { it.isDigit() }
        return "$digits@$EMAIL_DOMAIN"
    }

    private const val PREFS = "rafiq"
    private const val KEY_ON_SHIFT = "on_shift"

    fun isOnShift(context: Context): Boolean =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(KEY_ON_SHIFT, false)

    fun setOnShift(context: Context, on: Boolean) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean(KEY_ON_SHIFT, on).apply()
    }

    private const val KEY_SHIFT_ID = "shift_id"

    fun shiftId(context: Context): String? =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_SHIFT_ID, null)

    fun setShiftId(context: Context, id: String?) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY_SHIFT_ID, id).apply()
    }

    private const val KEY_SHIFT_START = "shift_start"

    /** When the current shift started (ms), or 0 when off shift. */
    fun shiftStart(context: Context): Long =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getLong(KEY_SHIFT_START, 0L)

    fun setShiftStart(context: Context, at: Long) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putLong(KEY_SHIFT_START, at).apply()
    }

    /** Kilometres driven today, kept on the phone for the driver's own summary. */
    fun kmToday(context: Context): Double =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getFloat("km_" + today(), 0f).toDouble()

    fun addKm(context: Context, day: String, km: Double) {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        prefs.edit().putFloat("km_$day", prefs.getFloat("km_$day", 0f) + km.toFloat()).apply()
    }

    fun today(): String = java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.US).format(java.util.Date())

    /** An Egyptian mobile number in the international form WhatsApp links need. */
    fun whatsappNumber(phone: String): String {
        val d = phone.filter { it.isDigit() }
        return when {
            d.startsWith("00") -> d.substring(2)
            d.startsWith("0") && d.length == 11 -> "20" + d.substring(1)
            else -> d
        }
    }
}

/** Job statuses, in the order a driver moves through them. */
object JobStatus {
    const val NEW = "new"
    const val ACCEPTED = "accepted"
    const val ON_WAY = "onway"
    const val ARRIVED = "arrived"
    const val DONE = "done"
    const val CANCELLED = "cancelled"

    fun next(status: String): String? = when (status) {
        NEW -> ACCEPTED
        ACCEPTED -> ON_WAY
        ON_WAY -> ARRIVED
        ARRIVED -> DONE
        else -> null
    }
}
