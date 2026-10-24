package app.rafiq.driver

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.net.Uri
import android.os.Bundle
import android.util.Base64
import android.view.View
import android.widget.EditText
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.FileProvider
import androidx.exifinterface.media.ExifInterface
import com.google.android.material.chip.ChipGroup
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.ListenerRegistration
import java.io.ByteArrayOutputStream
import java.io.File
import java.text.SimpleDateFormat
import java.util.Locale

/**
 * A new expense (fuel, toll, …) with a photo of the receipt.
 * The photo is shrunk and stored in Firestore next to the expense, so no extra storage service is needed.
 */
class ExpenseActivity : AppCompatActivity() {

    private val db by lazy { FirebaseFirestore.getInstance() }
    private var photoBase64: String? = null
    private var cameraFile: File? = null
    private var listener: ListenerRegistration? = null

    private val takePhoto = registerForActivityResult(ActivityResultContracts.TakePicture()) { ok ->
        val f = cameraFile
        if (ok && f != null) loadPhoto(Uri.fromFile(f))
    }
    private val pickPhoto = registerForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri != null) loadPhoto(uri)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_expense)
        findViewById<View>(R.id.back).setOnClickListener { finish() }
        findViewById<View>(R.id.take_photo).setOnClickListener {
            val dir = File(cacheDir, "receipts").apply { mkdirs() }
            val f = File(dir, "receipt.jpg")
            cameraFile = f
            try {
                takePhoto.launch(FileProvider.getUriForFile(this, "$packageName.files", f))
            } catch (_: Exception) {
                pickPhoto.launch("image/*")
            }
        }
        findViewById<View>(R.id.pick_photo).setOnClickListener { pickPhoto.launch("image/*") }
        findViewById<View>(R.id.save).setOnClickListener { save() }

        val uid = FirebaseAuth.getInstance().currentUser?.uid ?: return finish()
        listener = db.collection("expenses").whereEqualTo("driverId", uid)
            .addSnapshotListener { snap, _ -> if (snap != null) showMine(snap.documents) }
    }

    override fun onDestroy() {
        listener?.remove()
        super.onDestroy()
    }

    private fun showError(text: String?) {
        findViewById<TextView>(R.id.error).apply {
            this.text = text
            visibility = if (text == null) View.GONE else View.VISIBLE
        }
    }

    /** Shrinks the photo to about 1200 px, turns it the right way up and keeps it as JPEG text. */
    private fun loadPhoto(uri: Uri) {
        showError(null)
        Thread {
            val result = try {
                val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
                var sample = 1
                while (maxOf(bounds.outWidth, bounds.outHeight) / (sample * 2) >= 1200) sample *= 2
                var bmp = contentResolver.openInputStream(uri)?.use {
                    BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = sample })
                } ?: throw IllegalStateException("no image")
                val rotation = contentResolver.openInputStream(uri)?.use {
                    when (ExifInterface(it).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)) {
                        ExifInterface.ORIENTATION_ROTATE_90 -> 90f
                        ExifInterface.ORIENTATION_ROTATE_180 -> 180f
                        ExifInterface.ORIENTATION_ROTATE_270 -> 270f
                        else -> 0f
                    }
                } ?: 0f
                if (rotation != 0f) {
                    bmp = Bitmap.createBitmap(bmp, 0, 0, bmp.width, bmp.height, Matrix().apply { postRotate(rotation) }, true)
                }
                // Firestore keeps up to 1 MB per document: lower the quality until the photo fits well under that
                var quality = 70
                var bytes: ByteArray
                do {
                    val out = ByteArrayOutputStream()
                    bmp.compress(Bitmap.CompressFormat.JPEG, quality, out)
                    bytes = out.toByteArray()
                    quality -= 15
                } while (bytes.size > 600_000 && quality > 20)
                Pair(bmp, Base64.encodeToString(bytes, Base64.NO_WRAP))
            } catch (_: Exception) {
                null
            }
            runOnUiThread {
                if (result == null) {
                    showError(getString(R.string.photo_failed))
                } else {
                    photoBase64 = result.second
                    findViewById<ImageView>(R.id.preview).apply {
                        setImageBitmap(result.first)
                        visibility = View.VISIBLE
                    }
                }
            }
        }.start()
    }

    private fun typeKey(): String = when (findViewById<ChipGroup>(R.id.types).checkedChipId) {
        R.id.type_toll -> "toll"
        R.id.type_parking -> "parking"
        R.id.type_wash -> "wash"
        R.id.type_repair -> "repair"
        R.id.type_other -> "other"
        else -> "fuel"
    }

    private fun save() {
        val uid = FirebaseAuth.getInstance().currentUser?.uid ?: return
        val amount = findViewById<EditText>(R.id.amount).text.toString()
            .map { c -> if (c in '٠'..'٩') '0' + (c - '٠') else c }.joinToString("")
            .replace(',', '.').toDoubleOrNull()
        if (amount == null || amount <= 0) {
            showError(getString(R.string.expense_amount_missing))
            return
        }
        val ref = db.collection("expenses").document()
        val photo = photoBase64
        val batch = db.batch()
        batch.set(
            ref, mapOf(
                "driverId" to uid,
                "carId" to intent.getStringExtra("carId"),
                "type" to typeKey(),
                "amount" to amount,
                "note" to findViewById<EditText>(R.id.note).text.toString().trim(),
                "hasPhoto" to (photo != null),
                "date" to Driver.today(),
                "createdAt" to FieldValue.serverTimestamp()
            )
        )
        // The photo sits in its own document, so the control panel can list expenses without loading every photo
        if (photo != null) {
            batch.set(db.collection("expensePhotos").document(ref.id), mapOf("driverId" to uid, "data" to photo))
        }
        // Saved in the background (also without internet): the screen does not wait
        batch.commit()
        Toast.makeText(this, R.string.expense_saved, Toast.LENGTH_SHORT).show()
        finish()
    }

    private fun showMine(docs: List<com.google.firebase.firestore.DocumentSnapshot>) {
        val list = findViewById<LinearLayout>(R.id.list)
        list.removeAllViews()
        val recent = docs.sortedByDescending { it.getTimestamp("createdAt")?.toDate()?.time ?: Long.MAX_VALUE }.take(15)
        if (recent.isEmpty()) {
            list.addView(TextView(this).apply {
                setText(R.string.no_expenses)
                setTextColor(getColor(R.color.muted))
            })
            return
        }
        val fmt = SimpleDateFormat("d MMM", Locale("ar", "EG"))
        for (doc in recent) {
            val label = getString(typeLabel(doc.getString("type")))
            val amount = doc.getDouble("amount") ?: 0.0
            val day = doc.getTimestamp("createdAt")?.toDate()?.let { fmt.format(it) } ?: ""
            list.addView(TextView(this).apply {
                text = "$day   " + getString(R.string.expense_row, label, formatAmount(amount)) + if (doc.getBoolean("hasPhoto") == true) "  📷" else ""
                textSize = 15f
                setTextColor(getColor(R.color.text))
                setBackgroundResource(R.drawable.card_bg)
                setPadding(32, 24, 32, 24)
                layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
                    .apply { bottomMargin = 16 }
            })
        }
    }

    private fun formatAmount(v: Double) = if (v % 1.0 == 0.0) v.toLong().toString() else String.format(Locale.US, "%.2f", v)

    private fun typeLabel(type: String?) = when (type) {
        "toll" -> R.string.type_toll
        "parking" -> R.string.type_parking
        "wash" -> R.string.type_wash
        "repair" -> R.string.type_repair
        "other" -> R.string.type_other
        else -> R.string.type_fuel
    }
}
