package app.umbra.tv

import android.os.Handler
import android.os.Looper
import android.webkit.JavascriptInterface
import org.json.JSONObject

/**
 * JS-мост `window.UmbraTV` для сайта в TV-режиме.
 * Вызывается из WebView в фоновом потоке — работу переносим в главный.
 * Отвечает только нашему сайту: остальные адреса в WebView не открываются вовсе.
 */
class TvBridge(private val activity: MainActivity) {

    private val main = Handler(Looper.getMainLooper())

    @JavascriptInterface
    fun version(): String = if (activity.isTrustedPage) BuildConfig.VERSION_NAME else ""

    /** Какие стриминги установлены: {"youtube":true,"netflix":false,…}. */
    @JavascriptInterface
    fun installedApps(): String {
        if (!activity.isTrustedPage) return "{}"
        val result = JSONObject()
        ExternalLinks.APPS.forEach { result.put(it.slug, ExternalLinks.installedPackage(activity, it) != null) }
        return result.toString()
    }

    /** Открыть ссылку в приложении телевизора (YouTube, Netflix…). */
    @JavascriptInterface
    fun openExternal(url: String): Boolean {
        if (!activity.isTrustedPage) return false
        main.post { if (activity.isTrustedPage) activity.openExternal(url) }
        return true
    }

    /** Запустить приложение стриминга, по возможности сразу с поиском. */
    @JavascriptInterface
    fun launchApp(slug: String, query: String?): Boolean {
        if (!activity.isTrustedPage) return false
        val app = ExternalLinks.APPS.firstOrNull { it.slug == slug } ?: return false
        if (ExternalLinks.installedPackage(activity, app) == null) return false
        main.post { if (activity.isTrustedPage) ExternalLinks.launch(activity, slug, query) }
        return true
    }

    /** Для команд с телефона: токен push, id и модель телевизора, Lampa, запуск из фона. */
    @JavascriptInterface
    fun remoteInfo(): String {
        if (!activity.isTrustedPage) return "{}"
        return Remote.info(activity)
    }

    @JavascriptInterface
    fun voiceAvailable(): Boolean = activity.isTrustedPage && activity.voiceAvailable

    /** Начать голосовой ввод; результат придёт событием `umbratv` (type: "voice"). */
    @JavascriptInterface
    fun startVoice(language: String?) {
        if (!activity.isTrustedPage) return
        main.post { if (activity.isTrustedPage) activity.startVoice(language) }
    }

    /** Вход через Google-аккаунт телевизора; ответ — событие `umbratv` (type: "google"). */
    @JavascriptInterface
    fun googleSignIn() {
        if (!activity.isTrustedPage) return
        main.post { if (activity.isTrustedPage) activity.googleSignIn() }
    }

    @JavascriptInterface
    fun stopVoice() {
        if (!activity.isTrustedPage) return
        main.post { activity.stopVoice() }
    }
}
