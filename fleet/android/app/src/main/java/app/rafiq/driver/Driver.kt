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
