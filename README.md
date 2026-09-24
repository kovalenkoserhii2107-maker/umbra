# Umbra

Персональный PWA-каталог фильмов и сериалов в тёмной эстетике Grok.

Живая версия (после включения Pages):
https://kovalenkoserhii2107-maker.github.io/umbra/

## Что внутри

- Лента: тренды, прокат, эфир, скоро
- Платформы: Netflix, Disney+, Prime Video, Max, Apple TV+, YouTube
- Карточка тайтла: описание, рейтинг TMDB, трейлер, актёры, где смотреть
- Полка: хочу / смотрю / видел / бросил, оценка и заметка
- Поиск
- PWA: установка на телефон, кэш постеров и ответов TMDB
- Всё личное лежит в `localStorage` этого устройства (экспорт/импорт JSON)

Данные: [TMDB](https://www.themoviedb.org/). Доступность платформ приходит из watch providers TMDB (источник JustWatch).

## Как запустить локально

1. Получи бесплатный API-ключ: [themoviedb.org/settings/api](https://www.themoviedb.org/settings/api)
2. Установи зависимости и подними dev-сервер:

```bash
npm install
npm run dev
```

3. В приложении открой **Настройки** и вставь ключ. Он не уходит в git.

## GitHub Pages

1. Репозиторий → **Settings → Pages**
2. Source: **GitHub Actions**
3. После пуша в `main` откроется `https://kovalenkoserhii2107-maker.github.io/umbra/`

This product uses the TMDB API but is not endorsed or certified by TMDB.
