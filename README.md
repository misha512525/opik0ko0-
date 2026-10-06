# София. А — Психология отношений

Одностраничный сайт психолога по отношениям Софии Ахлестиной.
Vite + чистый HTML/CSS/JS, GSAP (ScrollTrigger, SplitText), Lenis.

## Запуск

```bash
npm install
npm run dev       # разработка: http://localhost:5173
npm run build     # продакшн-сборка в dist/
npm run preview   # просмотр сборки: http://localhost:4173
```

Изображения и OG-превью уже сгенерированы в `public/`. Если вы заменили `assets/sofia.jpg`:

```bash
npm run images    # AVIF/WebP/JPG 480/768/1024, аватар, иконки и public/og.jpg
```

Скриншоты по ходу скролла (нужен запущенный `npm run preview`):

```bash
npm run shoot -- http://localhost:4173/ screenshots all            # desktop + mobile
npm run shoot -- http://localhost:4173/ screenshots mobile reduced  # с prefers-reduced-motion
```

## Структура

```
index.html                 разметка всех секций
src/main.js                порядок инициализации
src/styles/                tokens · base · components · sections
src/js/core/               gsap, smooth-scroll (Lenis), header, menu, cursor, magnetic
src/js/sections/           preloader, hero, marquee, manifesto, approach, topics, channel, finale, reveals
public/                    шрифты, изображения, favicon, og.jpg, manifest
scripts/                   генерация изображений и OG, скриншоты
```

## TODO

- `index.html`: указать боевой домен — `og:image` и `og:url` должны быть абсолютными URL.
- `index.html`, секция «Реклама»: расшифровка форматов 1/24 и 1/48 — уточнить у Софии.
- `public/robots.txt`: добавить Sitemap после выбора домена.
