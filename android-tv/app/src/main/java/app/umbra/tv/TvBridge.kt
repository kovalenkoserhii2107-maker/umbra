package app.umbra.tv

import android.os.Handler
import android.os.Looper
import android.webkit.JavascriptInterface
import org.json.JSONObject

/**
 * JS-міст `window.UmbraTV` для сайту в TV-режимі.
 * Викликається з WebView у фоновому потоці — роботу переносимо в головний.
 * Відповідає тільки нашому сайту: інші адреси у WebView не відкриваються зовсім.
 */
class TvBridge(private val activity: MainActivity) {

    private val main = Handler(Looper.getMainLooper())

    @JavascriptInterface
    fun version(): String = if (activity.isTrustedPage) BuildConfig.VERSION_NAME else ""

    /** Які стрімінги встановлені: {"youtube":true,"netflix":false,…}. */
    @JavascriptInterface
    fun installedApps(): String {
        if (!activity.isTrustedPage) return "{}"
        val result = JSONObject()
        ExternalLinks.APPS.forEach { result.put(it.slug, ExternalLinks.installedPackage(activity, it) != null) }
        return result.toString()
    }

    /** Відкрити посилання в застосунку телевізора (YouTube, Netflix…). */
    @JavascriptInterface
    fun openExternal(url: String): Boolean {
        if (!activity.isTrustedPage) return false
        main.post { if (activity.isTrustedPage) activity.openExternal(url) }
        return true
    }

    /** Запустити застосунок стрімінгу, за можливості одразу з пошуком. */
    @JavascriptInterface
    fun launchApp(slug: String, query: String?): Boolean {
        if (!activity.isTrustedPage) return false
        val app = ExternalLinks.APPS.firstOrNull { it.slug == slug } ?: return false
        if (ExternalLinks.installedPackage(activity, app) == null) return false
        main.post { if (activity.isTrustedPage) ExternalLinks.launch(activity, slug, query) }
        return true
    }

    /** Для команд із телефона: токен push, id та модель телевізора, Lampa, запуск із фону. */
    @JavascriptInterface
    fun remoteInfo(): String {
        if (!activity.isTrustedPage) return "{}"
        return Remote.info(activity)
    }

    @JavascriptInterface
    fun voiceAvailable(): Boolean = activity.isTrustedPage && activity.voiceAvailable

    /** Почати голосове введення; результат надійде подією `umbratv` (type: "voice"). */
    @JavascriptInterface
    fun startVoice(language: String?) {
        if (!activity.isTrustedPage) return
        main.post { if (activity.isTrustedPage) activity.startVoice(language) }
    }

    /** Вхід через Google-акаунт телевізора; відповідь — подія `umbratv` (type: "google"). */
    @JavascriptInterface
    fun googleSignIn() {
        if (!activity.isTrustedPage) return
        main.post { if (activity.isTrustedPage) activity.googleSignIn() }
    }

    /** Закрити застосунок: сайт вирішує коли («Назад» двічі на «Стрічці»). */
    @JavascriptInterface
    fun exitApp() {
        if (!activity.isTrustedPage) return
        main.post { if (activity.isTrustedPage) activity.finish() }
    }

    @JavascriptInterface
    fun stopVoice() {
        if (!activity.isTrustedPage) return
        main.post { activity.stopVoice() }
    }
}
