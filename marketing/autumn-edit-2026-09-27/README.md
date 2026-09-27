# STEPPE — осенняя подборка

Готовые Reels, 64 секунды, 1080 × 1920, 30 кадров/с, H.264 + AAC:

- `steppe-autumn-voice.mp4` — русская мужская синтезированная озвучка Microsoft Pavel и тихий оригинальный инструментал.
- `steppe-autumn-music.mp4` — тот же монтаж с инструменталом, без голоса.
- `cover.png` — обложка.
- `subtitles-ru.srt` — полный текст озвучки с таймингами. Краткие подписи уже встроены в видео.

## Монтаж

По мотивам предоставленного видео: светлый фон, крупные подлинные фотографии, короткие фразы, последовательная подборка. Чужая музыка, голос, логотип автора и водяной знак из референса не копировались. Между фотографиями плавные наплывы 0,55 секунды; приближения отдельных карточек нет.

Мужская озвучка создана локально установленным голосом Microsoft Pavel, темп +1. Это синтезированный голос, не запись диктора. Онлайн-голос при проверке не вернул аудио. Музыкальная подложка синтезирована в `render.mjs`, сторонние музыкальные записи не используются.

## Выбранные пары

1. Nike Dunk Low Retro — IM4415-200, Tawny/Flax/Twine/Sesame.
2. Reebok Club C Grounds UK — 100256877, Campus Brown/Campus Brown/Vintage Chalk.
3. Nike Field General Suede — IF0666-100, Light Orewood Brown/Black.
4. Reebok Classic Leather — 100008790, Pure Grey 5/Ftwr White/Gum.

Все четыре артикула проверены через живой API STEPPE перед рендером. Ссылки, доступные на момент проверки размеры, цены и время проверки сохранены в `references/products.json`. Для Classic Leather в момент проверки доступно два размера. Цены не встроены в ролик, чтобы реклама не обещала устаревшую стоимость. Остатки могут меняться.

Это стилистическая подборка для сухой осени, а не обещание водонепроницаемости, утепления или сцепления на льду. Эта формулировка есть в титрах и озвучке.

Официальные источники для характеристик и изображений:

- [Nike Dunk Low Retro](https://www.nike.com/t/dunk-low-retro-mens-shoes-5FQWGR/IM4415-200).
- [Nike Field General Suede](https://www.nike.com/t/field-general-suede-mens-shoes-MMjfAd3J/IF0666-100).
- [Reebok Club C Grounds UK](https://www.reebok.com/products/reebok-club-c-grounds-uk-shoes-campus-brown-campus-brown-vintage-chalk-156468).
- Точный URL Classic Leather и оригиналы всех фотографий — в `references/products.json`.

## Повторный рендер

Нужны зависимости проекта, установленный Chromium для Playwright и `imageio_ffmpeg` для Python либо переменная `FFMPEG_PATH` с путём к FFmpeg.

```powershell
# Перезапись голоса нужна только после изменения story.json.
# Запускать в PowerShell 7 с установленным русским голосом Microsoft Pavel.
& ./marketing/autumn-edit-2026-09-27/voice.ps1

node marketing/autumn-edit-2026-09-27/render.mjs
```

Исходные WAV сохранены, поэтому для обычного рендера Windows TTS не требуется. `--preview` создаёт кадры и обложку без кодирования MP4. Промежуточные кадры и аудиомиксы сохраняются в игнорируемую папку `artifacts/autumn-render`.
