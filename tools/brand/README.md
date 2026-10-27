# Логотип Umbra

Затемнення малюється програмно (`corona.mjs`): чорний місяць, світло «діамантового кільця» над верхнім краєм, м'яке золоте сяйво з гаусовим згасанням — без різких країв на будь-якому фоні.

```sh
node tools/brand/corona.mjs /tmp/brand          # іконки, шари адаптивної іконки, ТВ-банери, іконки сайту, прев'ю
node tools/brand/og.mjs public /tmp/brand       # затемнення на og-image/og-invite та brand-mark.webp
```

Куди класти результат:

| Файл | Призначення |
|---|---|
| `ic_launcher_{96,144,192}.png` | `android-tv/…/res/mipmap-{xhdpi,xxhdpi,xxxhdpi}/ic_launcher.png` |
| `fg_{216,324,432}.png` | `…/mipmap-*/ic_launcher_foreground.png` (адаптивна іконка) |
| `banner_640.png`, `banner_960.png` | `…/drawable-xhdpi/banner.png`, `…/drawable-xxhdpi/banner.png` |
| `icon_512`, `icon_192`, `apple_180`, `favicon_32`, `maskable_512` | `public/icon-512.png`, `icon-192.png`, `apple-touch-icon.png`, `favicon-32.png`, `icon-maskable-512.png` |
| `brand-mark.webp`, `og-image.png`, `og-invite.png` | `public/` |
