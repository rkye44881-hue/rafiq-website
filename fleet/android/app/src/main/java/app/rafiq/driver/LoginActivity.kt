package app.rafiq.driver

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.ProgressBar
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import com.google.firebase.auth.FirebaseAuth

class LoginActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (FirebaseAuth.getInstance().currentUser != null) {
            openMain()
            return
        }
        setContentView(R.layout.activity_login)

        val phone = findViewById<EditText>(R.id.phone)
        val password = findViewById<EditText>(R.id.password)
        val button = findViewById<Button>(R.id.login)
        val error = findViewById<TextView>(R.id.error)
        val progress = findViewById<ProgressBar>(R.id.progress)

        button.setOnClickListener {
            val p = phone.text.toString().trim()
            val pw = password.text.toString()
            if (p.isEmpty() || pw.isEmpty()) {
                error.setText(R.string.login_empty)
                error.visibility = View.VISIBLE
                return@setOnClickListener
            }
            error.visibility = View.GONE
            progress.visibility = View.VISIBLE
            button.isEnabled = false
            FirebaseAuth.getInstance().signInWithEmailAndPassword(Driver.emailFromPhone(p), pw)
                .addOnSuccessListener { openMain() }
                .addOnFailureListener {
                    progress.visibility = View.GONE
                    button.isEnabled = true
                    error.setText(R.string.login_failed)
                    error.visibility = View.VISIBLE
                }
        }
    }

    private fun openMain() {
        startActivity(Intent(this, MainActivity::class.java))
        finish()
    }
}
