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
import android.widget.Toast
import com.google.firebase.messaging.FirebaseMessaging
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import org.json.JSONObject

/**
 * Команды с телефона: «На телевизоре в Lampa». Приходят push-сообщением (FCM)
 * через наш сервер, даже когда Umbra закрыта, а телевизор спит. Сайт на
 * телевизоре регистрирует его на сервере тем, что отдаёт [Remote.info].
 */
object Remote {
    @Volatile
    var token: String? = null
        private set

    /** Вызывается, когда токен получен или сменился (сайт регистрирует телевизор заново). */
    @Volatile
    var onToken: ((String) -> Unit)? = null

    fun start() {
        FirebaseMessaging.getInstance().token.addOnSuccessListener { update(it) }
    }

    fun update(value: String) {
        token = value
        onToken?.invoke(value)
    }

    /** Lampa открывает карточку по адресу TMDB; intent — только ей, не браузеру. */
    fun lampaLink(type: String, id: String) =
        "intent://www.themoviedb.org/$type/$id#Intent;scheme=https;action=android.intent.action.VIEW;package=top.rootu.lampa;end"

    /**
     * Что сайт отправляет серверу: токен, постоянный id телевизора, модель,
     * есть ли Lampa и можно ли открывать её из фона (разрешение «Поверх других приложений»).
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
        // Только тип и номер: чужую ссылку так не передать.
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
 * Будит экран (своё окно с turnScreenOn — wake lock телевизор не будит)
 * и, когда он включился, открывает карточку в Lampa.
 */
class RemoteOpenActivity : Activity() {

    private val main = Handler(Looper.getMainLooper())

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setTurnScreenOn(true)
        setShowWhenLocked(true)
        val type = intent.getStringExtra(EXTRA_TYPE)
        val id = intent.getStringExtra(EXTRA_ID)
        if (type == null || id == null) return finish()
        val power = getSystemService(PowerManager::class.java)
        val started = System.currentTimeMillis()
        fun open() {
            // Экран включается не сразу; Lampa открываем, когда он уже горит.
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

    companion object {
        const val EXTRA_TYPE = "type"
        const val EXTRA_ID = "id"
        private const val WAKE_WAIT = 4000L
    }
}
