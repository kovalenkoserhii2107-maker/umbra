package app.umbra.tv

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri

/**
 * Ссылки, которые уходят из Umbra в приложения телевизора: трейлеры — в YouTube,
 * «Смотреть» — в Netflix, Prime Video, Apple TV, MEGOGO и т. п., карточка фильма — в Lampa.
 * Предпочитаем ТВ-версии приложений; если их нет — любое, что откроет ссылку.
 */
object ExternalLinks {

    /** Стриминги: короткое имя (как на сайте) → домены и ТВ-пакеты по убыванию предпочтения. */
    class App(val slug: String, val hosts: List<String>, val packages: List<String>, val searchUrl: String?)

    val APPS = listOf(
        App(
            "youtube", listOf("youtube.com", "youtu.be"),
            listOf("com.google.android.youtube.tv", "com.google.android.youtube"),
            "https://www.youtube.com/results?search_query=",
        ),
        App("netflix", listOf("netflix.com"), listOf("com.netflix.ninja"), "https://www.netflix.com/search?q="),
        App(
            "prime", listOf("primevideo.com", "amazon.com", "amazon.de", "amazon.co.uk"),
            listOf("com.amazon.amazonvideo.livingroom"), null,
        ),
        App(
            "apple", listOf("tv.apple.com"),
            listOf("com.apple.atve.sony.appletv", "com.apple.atve.androidtv.appletv"), null,
        ),
        App("disney", listOf("disneyplus.com"), listOf("com.disney.disneyplus"), null),
        App("max", listOf("max.com", "hbomax.com"), listOf("com.wbd.stream"), null),
        App("megogo", listOf("megogo.net"), listOf("com.megogo.application", "net.megogo.tv"), null),
        // Lampa открывает карточку по ссылке themoviedb.org (intent: с её пакетом, см. сайт).
        App("lampa", emptyList(), listOf("top.rootu.lampa"), null),
    )

    fun appForHost(host: String?): App? {
        val h = host?.lowercase()?.removePrefix("www.")?.removePrefix("m.") ?: return null
        return APPS.firstOrNull { app -> app.hosts.any { h == it || h.endsWith(".$it") } }
    }

    fun isInstalled(context: Context, pkg: String): Boolean =
        runCatching { context.packageManager.getPackageInfo(pkg, 0) }.isSuccess

    /** Первый установленный пакет приложения или null. */
    fun installedPackage(context: Context, app: App): String? = app.packages.firstOrNull { isInstalled(context, it) }

    /** Открыть ссылку во внешнем приложении. false — открыть нечем. */
    fun open(context: Context, url: String): Boolean {
        val uri = normalize(Uri.parse(url))
        val intents = mutableListOf<Intent>()
        if (uri.scheme == "intent") {
            runCatching {
                Intent.parseUri(url, Intent.URI_INTENT_SCHEME).apply {
                    component = null
                    selector = null
                }
            }.getOrNull()?.let(intents::add)
        } else {
            val app = appForHost(uri.host)
            app?.let { installedPackage(context, it) }?.let { pkg ->
                val intent = Intent(Intent.ACTION_VIEW, uri).setPackage(pkg)
                // A video in YouTube for TV: its standalone player, where one Back
                // (or the end of the video) returns to Umbra.
                if (app.slug == "youtube" && uri.getQueryParameter("v") != null) {
                    intent.putExtra("force_fullscreen", true).putExtra("finish_on_ended", true)
                }
                intents += intent
            }
            intents += Intent(Intent.ACTION_VIEW, uri)
        }
        for (intent in intents) {
            try {
                context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                return true
            } catch (e: ActivityNotFoundException) {
                // пробуем следующий вариант
            } catch (e: SecurityException) {
                // пробуем следующий вариант
            }
        }
        return false
    }

    /** Открыть приложение стриминга: с поиском, если оно его умеет, иначе просто запустить. */
    fun launch(context: Context, slug: String, query: String?): Boolean {
        val app = APPS.firstOrNull { it.slug == slug } ?: return false
        val pkg = installedPackage(context, app) ?: return false
        if (!query.isNullOrBlank() && app.searchUrl != null) {
            val search = Intent(Intent.ACTION_VIEW, Uri.parse(app.searchUrl + Uri.encode(query))).setPackage(pkg)
            if (tryStart(context, search)) return true
        }
        val pm = context.packageManager
        val launch = pm.getLeanbackLaunchIntentForPackage(pkg) ?: pm.getLaunchIntentForPackage(pkg) ?: return false
        return tryStart(context, launch)
    }

    private fun tryStart(context: Context, intent: Intent): Boolean = try {
        context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        true
    } catch (e: RuntimeException) {
        false
    }

    /** youtu.be/ID и /embed/ID → watch?v=ID: так ссылку понимает YouTube для ТВ. */
    private fun normalize(uri: Uri): Uri {
        val host = uri.host?.lowercase() ?: return uri
        val id = when {
            host == "youtu.be" -> uri.lastPathSegment
            host.endsWith("youtube.com") && uri.path?.startsWith("/embed/") == true -> uri.lastPathSegment
            else -> null
        } ?: return uri
        return Uri.parse("https://www.youtube.com/watch?v=$id")
    }
}
