package app.umbra.tv

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.KeyEvent
import android.view.View
import android.view.ViewGroup
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.Toast
import org.json.JSONObject

/**
 * Umbra для Android TV: сайт в TV-режиме (?tv=1) внутри WebView.
 * Пульт: стрелки и OK обрабатывает сайт (пространственная навигация),
 * «Назад» — сначала сайту (закрыть клавиатуру/окно), затем назад по истории, на первом экране — выход.
 */
class MainActivity : Activity() {

    private lateinit var web: WebView
    private lateinit var root: FrameLayout
    private lateinit var site: Uri
    private var voice: Voice? = null
    private var pendingVoiceLanguage: String? = null
    private var fullscreenView: View? = null
    private var fullscreenCallback: WebChromeClient.CustomViewCallback? = null

    /** Открыта страница нашего сайта — только ей доступен JS-мост. */
    @Volatile
    var isTrustedPage = false
        private set

    val voiceAvailable: Boolean get() = voice?.available == true

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Отладка WebView через chrome://inspect — только в debug-сборке.
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)

        // Debug-сборку можно направить на dev-сервер: adb shell am start -n app.umbra.tv/.MainActivity -e url http://…
        val override = if (BuildConfig.DEBUG) intent.getStringExtra(EXTRA_URL) else null
        site = Uri.parse(override ?: BuildConfig.SITE_URL)

        root = FrameLayout(this)
        web = WebView(this)
        root.addView(web, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        setContentView(root)

        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true // localStorage и IndexedDB (кэш Firestore)
            @Suppress("DEPRECATION")
            databaseEnabled = true
            mediaPlaybackRequiresUserGesture = false // трейлеры запускаются кнопкой пульта
            cacheMode = WebSettings.LOAD_DEFAULT
            setSupportMultipleWindows(false) // target=_blank → обычная навигация → наш перехват
            textZoom = 100
            userAgentString = "$userAgentString UmbraTV/${BuildConfig.VERSION_NAME}"
        }
        web.setBackgroundColor(0xFF000000.toInt())
        web.isFocusable = true
        web.isFocusableInTouchMode = true
        web.addJavascriptInterface(TvBridge(this), "UmbraTV")
        web.webViewClient = Client()
        web.webChromeClient = Chrome()
        voice = Voice(this) { state, text -> emit("voice", JSONObject().put("state", state).put("text", text)) }

        if (savedInstanceState == null || web.restoreState(savedInstanceState) == null) web.loadUrl(site.toString())
        web.requestFocus()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        web.saveState(outState)
    }

    override fun onResume() {
        super.onResume()
        web.onResume()
    }

    override fun onPause() {
        stopVoice()
        web.onPause()
        super.onPause()
    }

    override fun onDestroy() {
        voice?.stop()
        web.destroy()
        super.onDestroy()
    }

    override fun onKeyDown(keyCode: Int, event: KeyEvent): Boolean {
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            onRemoteBack()
            return true
        }
        return super.onKeyDown(keyCode, event)
    }

    /** «Назад»: полноэкранное видео → сайт (window.umbraTvBack) → история → выход. */
    private fun onRemoteBack() {
        if (fullscreenView != null) {
            fullscreenCallback?.onCustomViewHidden()
            return
        }
        // Историю спрашиваем у страницы (Navigation API): у WebView она расходится
        // с историей HashRouter, и web.canGoBack() бывает false там, где назад есть куда.
        web.evaluateJavascript(BACK_SCRIPT) { result ->
            when (result?.trim('"')) {
                "site", "history" -> Unit
                else -> if (web.canGoBack()) web.goBack() else finish()
            }
        }
    }

    // ---- Внешние ссылки и мост ----

    fun openExternal(url: String) {
        if (!ExternalLinks.open(this, url)) Toast.makeText(this, R.string.no_app, Toast.LENGTH_SHORT).show()
    }

    fun startVoice(language: String?) {
        if (Build.VERSION.SDK_INT >= 23 && checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            pendingVoiceLanguage = language ?: ""
            requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), REQUEST_MIC)
            return
        }
        if (voice?.available != true) {
            emit("voice", JSONObject().put("state", "error").put("text", "unavailable"))
            emit("voice", JSONObject().put("state", "end").put("text", ""))
            return
        }
        voice?.start(language)
    }

    fun stopVoice() = voice?.stop()

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode != REQUEST_MIC) return
        val language = pendingVoiceLanguage
        pendingVoiceLanguage = null
        if (grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED) {
            startVoice(language)
        } else {
            emit("voice", JSONObject().put("state", "error").put("text", "permission"))
            emit("voice", JSONObject().put("state", "end").put("text", ""))
        }
    }

    /** Событие для сайта: window.addEventListener("umbratv", e => e.detail). */
    private fun emit(type: String, payload: JSONObject) {
        if (!isTrustedPage) return
        val detail = payload.put("type", type).toString()
        web.evaluateJavascript("window.dispatchEvent(new CustomEvent('umbratv',{detail:$detail}))", null)
    }

    private fun isInternal(uri: Uri): Boolean {
        val host = uri.host ?: return false
        return host == site.host || host in INTERNAL_HOSTS
    }

    private inner class Client : WebViewClient() {
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
            val uri = request.url
            if (uri.scheme in setOf("http", "https") && isInternal(uri)) return false
            openExternal(uri.toString())
            return true
        }

        override fun onPageStarted(view: WebView, url: String, favicon: Bitmap?) {
            isTrustedPage = Uri.parse(url).host == site.host
        }

        override fun doUpdateVisitedHistory(view: WebView, url: String, isReload: Boolean) {
            isTrustedPage = Uri.parse(url).host == site.host
        }

        override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
            if (!request.isForMainFrame) return
            // Нет сети: простая страница, OK — повторить.
            val html = """
                <html><body style="background:#000;color:#fcfcfc;font-family:sans-serif;display:flex;
                  flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0">
                <p style="color:#ff9e64;letter-spacing:.3em;font-size:14px">UMBRA</p>
                <h1 style="font-weight:500">${getString(R.string.offline_title)}</h1>
                <p style="color:#9e9e9e">${getString(R.string.offline_text)}</p>
                <script>addEventListener('keydown',e=>{if(e.key==='Enter')location.replace(${JSONObject.quote(site.toString())})})</script>
                </body></html>
            """.trimIndent()
            view.loadDataWithBaseURL(site.toString(), html, "text/html", "utf-8", null)
        }
    }

    /** Полноэкранное видео (встроенный плеер YouTube и т. п.). */
    private inner class Chrome : WebChromeClient() {
        override fun onShowCustomView(view: View, callback: CustomViewCallback) {
            fullscreenView = view
            fullscreenCallback = callback
            root.addView(view, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
            web.visibility = View.GONE
        }

        override fun onHideCustomView() {
            fullscreenView?.let(root::removeView)
            fullscreenView = null
            fullscreenCallback = null
            web.visibility = View.VISIBLE
            web.requestFocus()
        }
    }

    private companion object {
        const val EXTRA_URL = "url"

        /** site — сайт сам обработал «Назад» (закрыл окно/клавиатуру), history — шаг назад, none — некуда. */
        const val BACK_SCRIPT = """(function(){try{
            if (window.umbraTvBack && window.umbraTvBack()) return 'site';
            if (window.navigation && navigation.canGoBack) { history.back(); return 'history'; }
        }catch(e){} return 'none';})()"""
        const val REQUEST_MIC = 1

        /** Остаются внутри приложения: страницы входа Firebase. */
        val INTERNAL_HOSTS = setOf("umbra-18ba8.firebaseapp.com", "umbra-18ba8.web.app")
    }
}
