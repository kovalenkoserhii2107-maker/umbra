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
| `googleSignIn()` | вход через Google-аккаунт телевизора (Credential Manager) |

Ответы приходят событием `window.addEventListener("umbratv", e => e.detail)`:

- голос: `{type: "voice", state: "listening" | "partial" | "result" | "error" | "end", text}`;
- Google: `{type: "google", state: "token", text: <ID-токен Google>}` или `{type: "google", state: "error", text: "cancelled" | "no_account" | "failed"}`.

## Вход на телевизоре

Два способа, оба на экране входа сайта в TV-режиме (`src/components/TvLogin.tsx`):

1. **Google-аккаунт телевизора.** Системный выбор аккаунта → ID-токен Google для веб-клиента проекта Firebase (`GOOGLE_WEB_CLIENT_ID` в `app/build.gradle.kts`) → сайт входит через `signInWithCredential`. Работает только для APK, чей SHA-1 добавлен в Firebase Console → Project settings → приложение Android `app.umbra.tv` (релизный ключ и debug-ключ разработчика).
2. **QR с телефона.** Телевизор получает у воркера код (`POST /tv/code`), показывает QR со ссылкой `#/tv-link?code=…`; на телефоне, где выполнен вход, — «Подтвердить» или «Отказать» (`POST /tv/confirm`); телевизор забирает одноразовый custom token (`POST /tv/token`). Коды живут 10 минут в Durable Object `TvPairing`, токен подписывается секретом воркера `FIREBASE_SERVICE_ACCOUNT` (`worker/src/tvLogin.ts`, `worker/src/customToken.ts`).

## Сборка

Нужны Android SDK (`local.properties` с `sdk.dir` или `ANDROID_HOME`) и JDK 17–21.

```sh
cd android-tv
./gradlew assembleDebug      # app/build/outputs/apk/debug/app-debug.apk
./gradlew assembleRelease    # подпись — см. ниже
```

Адрес сайта можно переопределить: `./gradlew assembleDebug -PsiteUrl=http://192.168.1.10:5187/umbra/?tv=1`.

Release подписывается постоянным ключом (сейчас он хранится у владельца в `~/Developer/umbra-tv-signing/`) из переменных окружения `UMBRA_TV_KEYSTORE` (путь к .jks), `UMBRA_TV_KEYSTORE_PASSWORD`, `UMBRA_TV_KEY_ALIAS`, `UMBRA_TV_KEY_PASSWORD`; без них — debug-ключом. Ключ должен быть всегда один и тот же, иначе обновление не встанет поверх установленной версии.

Баннер и иконки генерируются из `public/brand-mark.webp` (macOS): `swift android-tv/tools/make-art.swift` из корня репозитория.

## Релизы

`.github/workflows/android-tv.yml` собирает APK на каждый PR с изменениями в `android-tv/` (файл — в артефактах запуска). При слиянии в `main` выпускает релиз `tv-1.0.<номер запуска>` с файлом `umbra-tv.apk`. Постоянная ссылка на свежую версию:

```
https://github.com/kovalenkoserhii2107-maker/umbra/releases/latest/download/umbra-tv.apk
```

Установка на телевизоре: Downloader → вставить ссылку → «Установить». Обновление — так же, поверх установленной версии.

Подпись — секреты репозитория (Settings → Secrets and variables → Actions):

- `UMBRA_TV_KEYSTORE_BASE64` — файл ключа `umbra-tv.jks` в base64 (`base64 -i umbra-tv.jks`);
- `UMBRA_TV_KEYSTORE_PASSWORD` — его пароль (он же пароль ключа, алиас `umbra-tv`).

Без них APK подписывается временным ключом и релиз не выпускается: такая версия не встала бы поверх установленной.

## Проверка на телевизоре

```sh
adb connect 192.168.1.175:5555
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n app.umbra.tv.dev/app.umbra.tv.MainActivity
```

Debug-сборка — отдельное приложение «Umbra Dev» (`app.umbra.tv.dev`): ставится рядом с релизом, не трогая его. Она открывает другой адрес по `-e url` (например, локальный dev-сервер) и разрешает отладку WebView:

```sh
adb shell am start -n app.umbra.tv.dev/app.umbra.tv.MainActivity -e url "http://192.168.1.10:5187/umbra/?tv=1"
node tools/tv-eval.mjs "location.href"
```

`tv-eval.mjs` выполняет выражение в WebView через DevTools-протокол — удобно смотреть состояние страницы без экрана.
