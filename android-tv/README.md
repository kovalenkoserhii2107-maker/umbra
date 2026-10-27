# Umbra для Android TV

Обгортка над сайтом Umbra в TV-режимі (`?tv=1`): одна Activity з WebView, без AndroidX. Плитка та банер на головному екрані телевізора (LEANBACK_LAUNCHER), minSdk 23.

- Пульт: стрілки та OK обробляє сайт; «Назад» — спочатку сайту (`window.umbraTvBack()`), потім назад по історії, на першому екрані — вихід.
- Посилання на YouTube, Netflix, Prime Video, Apple TV, Disney+, Max та MEGOGO відкриваються в застосунках телевізора (надається перевага ТВ-версіям), решта зовнішніх посилань — будь-яким застосунком, що їх відкриє.
- JS-міст `window.UmbraTV` доступний лише сторінкам сайту:

| Метод | Що робить |
| --- | --- |
| `version()` | версія застосунку |
| `installedApps()` | JSON `{youtube: true, netflix: false, …}` |
| `openExternal(url)` | відкрити посилання в застосунку телевізора |
| `launchApp(slug, query)` | відкрити стрімінг (із пошуком, якщо вміє) |
| `voiceAvailable()`, `startVoice(lang)`, `stopVoice()` | голосове введення через SpeechRecognizer |
| `googleSignIn()` | вхід через Google-акаунт телевізора (Credential Manager) |

Відповіді надходять подією `window.addEventListener("umbratv", e => e.detail)`:

- голос: `{type: "voice", state: "listening" | "partial" | "result" | "error" | "end", text}`;
- Google: `{type: "google", state: "token", text: <ID-токен Google>}` або `{type: "google", state: "error", text: "cancelled" | "no_account" | "failed"}`.

## Вхід на телевізорі

Два способи, обидва на екрані входу сайту в TV-режимі (`src/components/TvLogin.tsx`):

1. **Google-акаунт телевізора.** Системний вибір акаунта → ID-токен Google для вебклієнта проєкту Firebase (`GOOGLE_WEB_CLIENT_ID` у `app/build.gradle.kts`) → сайт входить через `signInWithCredential`. Працює лише для APK, чий SHA-1 додано у Firebase Console → Project settings → застосунок Android `app.umbra.tv` (релізний ключ та debug-ключ розробника).
2. **QR з телефона.** Телевізор отримує у воркера код (`POST /tv/code`), показує QR із посиланням `#/tv-link?code=…`; на телефоні, де виконано вхід, — «Підтвердити» або «Відхилити» (`POST /tv/confirm`); телевізор забирає одноразовий custom token (`POST /tv/token`). Коди живуть 10 хвилин у Durable Object `TvPairing`, токен підписується секретом воркера `FIREBASE_SERVICE_ACCOUNT` (`worker/src/tvLogin.ts`, `worker/src/customToken.ts`).

## Збірка

Потрібні Android SDK (`local.properties` із `sdk.dir` або `ANDROID_HOME`) та JDK 17–21.

```sh
cd android-tv
./gradlew assembleDebug      # app/build/outputs/apk/debug/app-debug.apk
./gradlew assembleRelease    # підпис — див. нижче
```

Адресу сайту можна перевизначити: `./gradlew assembleDebug -PsiteUrl=http://192.168.1.10:5187/umbra/?tv=1`.

Release підписується постійним ключем (зараз він зберігається у власника в `~/Developer/umbra-tv-signing/`) зі змінних оточення `UMBRA_TV_KEYSTORE` (шлях до .jks), `UMBRA_TV_KEYSTORE_PASSWORD`, `UMBRA_TV_KEY_ALIAS`, `UMBRA_TV_KEY_PASSWORD`; без них — debug-ключем. Ключ має бути завжди один і той самий, інакше оновлення не встановиться поверх поточної версії.

Банер та іконки генеруються з `public/brand-mark.webp` (macOS): `swift android-tv/tools/make-art.swift` з кореня репозиторію.

## Команди з телефона: «На телевізорі в Lampa»

На сторінці фільму або серіалу на телефоні є кнопка «На телевізорі в Lampa». Вона відкриває цей фільм у Lampa на телевізорі того ж акаунта, навіть якщо Umbra закрита, а телевізор спить.

1. Застосунок отримує push-токен Firebase (FCM, `Remote.kt`). Сайт на телевізорі після входу надсилає його воркеру (`POST /tv/device`), і воркер зберігає телевізори акаунта в Durable Object `TvRemote` (`worker/src/tvRemote.ts`).
2. Телефон викликає `POST /tv/open {type, id}`. Воркер надсилає телевізорам акаунта, де є Lampa, push `{action: "lampa", type, id}`. Нічого іншого так передати не можна.
3. `PushService` отримує push і запускає `RemoteOpenActivity`. Вона будить екран (`setTurnScreenOn`) і відкриває картку в Lampa за адресою themoviedb.org.

Android 10+ дозволяє застосунку у фоні відкривати вікна лише з дозволом «Поверх інших застосунків». На телевізорі його надають один раз у налаштуваннях або через adb:

```sh
adb shell appops set app.umbra.tv SYSTEM_ALERT_WINDOW allow
```

Налаштування Firebase-проєкту лежать в `app/src/main/res/values/firebase.xml`; плагін google-services не потрібен. Push надсилає воркер від імені сервісного акаунта `FIREBASE_SERVICE_ACCOUNT`.

## Релізи

`.github/workflows/android-tv.yml` збирає APK на кожен PR зі змінами в `android-tv/` (файл — в артефактах запуску). Під час злиття в `main` випускає реліз `tv-1.0.<номер запуску>` з файлом `umbra-tv.apk`. Постійне посилання на свіжу версію:

```
https://github.com/kovalenkoserhii2107-maker/umbra/releases/latest/download/umbra-tv.apk
```

Встановлення на телевізорі: Downloader → вставити посилання → «Встановити». Оновлення — так само, поверх встановленої версії.

Підпис — секрети репозиторію (Settings → Secrets and variables → Actions):

- `UMBRA_TV_KEYSTORE_BASE64` — файл ключа `umbra-tv.jks` у base64 (`base64 -i umbra-tv.jks`);
- `UMBRA_TV_KEYSTORE_PASSWORD` — його пароль (він же пароль ключа, аліас `umbra-tv`).

Без них APK підписується тимчасовим ключем і реліз не випускається: така версія не встановилася б поверх встановленої.

## Перевірка на телевізорі

```sh
adb connect 192.168.1.175:5555
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n app.umbra.tv.dev/app.umbra.tv.MainActivity
```

Debug-збірка — окремий застосунок «Umbra Dev» (`app.umbra.tv.dev`): встановлюється поруч із релізом, не чіпаючи його. Вона відкриває іншу адресу за `-e url` (наприклад, локальний dev-сервер) та дозволяє налагодження WebView:

```sh
adb shell am start -n app.umbra.tv.dev/app.umbra.tv.MainActivity -e url "http://192.168.1.10:5187/umbra/?tv=1"
node tools/tv-eval.mjs "location.href"
```

`tv-eval.mjs` виконує вираз у WebView через DevTools-протокол — зручно дивитися стан сторінки без екрана.
