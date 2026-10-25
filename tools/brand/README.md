# Логотип Umbra

Затмение рисуется программно (`corona.mjs`): чёрная луна, свет «бриллиантового кольца» над верхним краем, мягкое золотое сияние с гауссовым затуханием — без резких краёв на любом фоне.

```sh
node tools/brand/corona.mjs /tmp/brand          # иконки, слои адаптивной иконки, ТВ-баннеры, иконки сайта, превью
node tools/brand/og.mjs public /tmp/brand       # затмение на og-image/og-invite и brand-mark.webp
```

Куда класть результат:

| Файл | Назначение |
|---|---|
| `ic_launcher_{96,144,192}.png` | `android-tv/…/res/mipmap-{xhdpi,xxhdpi,xxxhdpi}/ic_launcher.png` |
| `fg_{216,324,432}.png` | `…/mipmap-*/ic_launcher_foreground.png` (адаптивная иконка) |
| `banner_640.png`, `banner_960.png` | `…/drawable-xhdpi/banner.png`, `…/drawable-xxhdpi/banner.png` |
| `icon_512`, `icon_192`, `apple_180`, `favicon_32`, `maskable_512` | `public/icon-512.png`, `icon-192.png`, `apple-touch-icon.png`, `favicon-32.png`, `icon-maskable-512.png` |
| `brand-mark.webp`, `og-image.png`, `og-invite.png` | `public/` |
