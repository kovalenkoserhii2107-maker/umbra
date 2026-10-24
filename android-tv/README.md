# Umbra для Android TV

Обёртка над сайтом Umbra в TV-режиме (`?tv=1`): одна Activity с WebView, без AndroidX. Плитка и баннер на главном экране телевизора (LEANBACK_LAUNCHER), minSdk 23.

- Пульт: стрелки и OK обрабатывает сайт; «Назад» — сначала сайту (`window.umbraTvBack()`), затем назад по истории, на первом экране — выход.
- Ссылки на YouTube, Netflix, Prime Video, Apple TV, Disney+, Max и MEGOGO открываются в приложениях телевизора (предпочитаются ТВ-версии), остальные внешние ссылки — любым приложением, которое их откроет.
- JS-мост `window.UmbraTV` доступен только страницам сайта:

| Метод | Что делает |
| --- | --- |
| `version()` | версия приложения |
| `installedApps()` | JSON `{youtube: true, netflix: false, …}` |
| `openExternal(url)` | открыть ссылку в приложении телевизора |
| `launchApp(slug, query)` | открыть стриминг (с поиском, если умеет) |
| `voiceAvailable()`, `startVoice(lang)`, `stopVoice()` | голосовой ввод через SpeechRecognizer |

Результаты голоса приходят событием `window.addEventListener("umbratv", e => e.detail)`: `{type: "voice", state: "listening" | "partial" | "result" | "error" | "end", text}`.

## Сборка

Нужны Android SDK (`local.properties` с `sdk.dir` или `ANDROID_HOME`) и JDK 17–21.

```sh
cd android-tv
./gradlew assembleDebug      # app/build/outputs/apk/debug/app-debug.apk
./gradlew assembleRelease    # подпись — см. ниже
```

Адрес сайта можно переопределить: `./gradlew assembleDebug -PsiteUrl=http://192.168.1.10:5187/umbra/?tv=1`.

Release подписывается ключом из переменных окружения `UMBRA_TV_KEYSTORE` (путь к .jks), `UMBRA_TV_KEYSTORE_PASSWORD`, `UMBRA_TV_KEY_ALIAS`, `UMBRA_TV_KEY_PASSWORD`; без них — debug-ключом. Ключ должен быть всегда один и тот же, иначе обновление не встанет поверх установленной версии.

Баннер и иконки генерируются из `public/brand-mark.webp` (macOS): `swift android-tv/tools/make-art.swift` из корня репозитория.

## Проверка на телевизоре

```sh
adb connect 192.168.1.175:5555
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n app.umbra.tv/.MainActivity
```

Debug-сборка открывает другой адрес по `-e url` (например, локальный dev-сервер) и разрешает отладку WebView:

```sh
adb shell am start -n app.umbra.tv/.MainActivity -e url "http://192.168.1.10:5187/umbra/?tv=1"
node tools/tv-eval.mjs "location.href"
```

`tv-eval.mjs` выполняет выражение в WebView через DevTools-протокол — удобно смотреть состояние страницы без экрана.
