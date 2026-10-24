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
    fun version(): String = BuildConfig.VERSION_NAME

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
        main.post { activity.openExternal(url) }
        return true
    }

    /** Запустить приложение стриминга, по возможности сразу с поиском. */
    @JavascriptInterface
    fun launchApp(slug: String, query: String?): Boolean {
        if (!activity.isTrustedPage) return false
        return ExternalLinks.launch(activity, slug, query)
    }

    @JavascriptInterface
    fun voiceAvailable(): Boolean = activity.voiceAvailable

    /** Начать голосовой ввод; результат придёт событием `umbratv` (type: "voice"). */
    @JavascriptInterface
    fun startVoice(language: String?) {
        if (!activity.isTrustedPage) return
        main.post { activity.startVoice(language) }
    }

    /** Вход через Google-аккаунт телевизора; ответ — событие `umbratv` (type: "google"). */
    @JavascriptInterface
    fun googleSignIn() {
        if (!activity.isTrustedPage) return
        main.post { activity.googleSignIn() }
    }

    @JavascriptInterface
    fun stopVoice() {
        main.post { activity.stopVoice() }
    }
}
