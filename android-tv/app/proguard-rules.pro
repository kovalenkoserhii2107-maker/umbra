# Методы JS-моста вызываются из WebView по имени.
-keepclassmembers class app.umbra.tv.TvBridge {
    @android.webkit.JavascriptInterface <methods>;
}
