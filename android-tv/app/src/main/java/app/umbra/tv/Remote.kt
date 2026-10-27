package app.umbra.tv

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.provider.Settings
import android.view.WindowManager
import android.widget.Toast
import com.google.firebase.messaging.FirebaseMessaging
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import org.json.JSONObject

/**
 * Команди з телефона: «На телевізорі в Lampa». Надходять push-повідомленням (FCM)
 * через наш сервер, навіть коли Umbra закрита, а телевізор спить. Сайт на
 * телевізорі реєструє його на сервері тим, що віддає [Remote.info].
 */
object Remote {
    @Volatile
    var token: String? = null
        private set

    /** Викликається, коли токен отримано або змінено (сайт реєструє телевізор заново). */
    @Volatile
    var onToken: ((String) -> Unit)? = null

    fun start() {
        FirebaseMessaging.getInstance().token.addOnSuccessListener { update(it) }
    }

    fun update(value: String) {
        token = value
        onToken?.invoke(value)
    }

    /** Lampa відкриває картку за адресою TMDB; intent — тільки їй, не браузеру. */
    fun lampaLink(type: String, id: String) =
        "intent://www.themoviedb.org/$type/$id#Intent;scheme=https;action=android.intent.action.VIEW;package=top.rootu.lampa;end"

    /**
     * Що сайт надсилає серверу: токен, постійний id телевізора, модель,
     * чи є Lampa та чи можна відкривати її з фону (дозвіл «Поверх інших застосунків»).
     */
    fun info(context: Context): String {
        val lampa = ExternalLinks.APPS.first { it.slug == "lampa" }
        return JSONObject()
            .put("token", token ?: "")
            .put("id", Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID) ?: "")
            .put("device", Build.MODEL ?: "")
            .put("lampa", ExternalLinks.installedPackage(context, lampa) != null)
            .put("background", Settings.canDrawOverlays(context))
            .toString()
    }
}

class PushService : FirebaseMessagingService() {

    override fun onNewToken(token: String) = Remote.update(token)

    override fun onMessageReceived(message: RemoteMessage) {
        val data = message.data
        if (data["action"] != "lampa") return
        // Тільки тип і номер: чуже посилання так не передати.
        val type = data["type"]?.takeIf { it == "movie" || it == "tv" } ?: return
        val id = data["id"]?.takeIf { ID.matches(it) } ?: return
        startActivity(
            Intent(this, RemoteOpenActivity::class.java)
                .putExtra(RemoteOpenActivity.EXTRA_TYPE, type)
                .putExtra(RemoteOpenActivity.EXTRA_ID, id)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        )
    }

    private companion object {
        val ID = Regex("\\d{1,10}")
    }
}

/**
 * Будить екран (своє вікно з turnScreenOn — wake lock телевізор не будить)
 * і, коли він увімкнувся, відкриває картку в Lampa.
 */
class RemoteOpenActivity : Activity() {

    private val main = Handler(Looper.getMainLooper())

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setTurnScreenOn(true)
            setShowWhenLocked(true)
        } else {
            @Suppress("DEPRECATION")
            window.addFlags(
                WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
                    WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED,
            )
        }
        val type = intent.getStringExtra(EXTRA_TYPE)
        val id = intent.getStringExtra(EXTRA_ID)
        if (type == null || id == null) return finish()
        val power = getSystemService(PowerManager::class.java)
        val started = System.currentTimeMillis()
        fun open() {
            // Екран вмикається не одразу; Lampa відкриваємо, коли він уже горить.
            if (!power.isInteractive && System.currentTimeMillis() - started < WAKE_WAIT) {
                main.postDelayed(::open, 200)
                return
            }
            if (!ExternalLinks.open(this, Remote.lampaLink(type, id)))
                Toast.makeText(this, R.string.no_lampa, Toast.LENGTH_LONG).show()
            finish()
        }
        main.postDelayed(::open, if (power.isInteractive) 0 else 600)
    }

    override fun onDestroy() {
        main.removeCallbacksAndMessages(null)
        super.onDestroy()
    }

    companion object {
        const val EXTRA_TYPE = "type"
        const val EXTRA_ID = "id"
        private const val WAKE_WAIT = 4000L
    }
}
