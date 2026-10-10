# Анна Казацкая — сайт репетитора по русскому языку и литературе

Одностраничный сайт-визитка и «витрина результатов». Цель — за 30–60 секунд вызвать доверие и привести
к одному действию: написать Анне в Telegram.

**Стек:** Astro 7 (статическая сборка) · TypeScript · Tailwind CSS v4 (токены) · GSAP 3 + ScrollTrigger + SplitText ·
Lenis. Почему Astro, а не Next.js, и остальные решения — в [DESIGN.md](DESIGN.md).

## Запуск

```bash
cd kazatskaya
npm install
npm run dev        # http://localhost:4321
npm run build      # astro check + сборка в dist/
npm run preview    # просмотр сборки
npm run lint       # ESLint
npm run format     # Prettier
```

Режим редактуры — все неподтверждённые места с красной обводкой «TODO: …»:

```bash
PUBLIC_SHOW_TODO=1 npm run dev
```

## Где что менять

| Что                                                              | Где                                                  |
| ---------------------------------------------------------------- | ---------------------------------------------------- |
| **Все тексты, ссылки, числа, результаты, отзывы, FAQ, тренажёр** | `src/content/content.ts`                             |
| Флаг согласия на фото учеников                                   | `SHOW_STUDENT_PHOTOS` в `src/content/content.ts`     |
| Стаж (11/10 лет)                                                 | `YEARS` там же                                       |
| Ссылки Telegram / MAX / бот                                      | `LINKS` там же (плейсхолдер `{{…}}` → кнопка скрыта) |
| Цвета, шрифты, радиусы, кривые                                   | `src/styles/global.css` (`@theme`)                   |
| Анимации (токены и утилиты)                                      | `src/lib/motion/`                                    |
| Сценарии секций                                                  | `src/scripts/sections/`                              |
| Разметка секций                                                  | `src/components/sections/`                           |

В строках `content.ts` работает мини-разметка: `*курсив*`, `==маркер==`. Неразрывные пробелы после
предлогов и перед тире ставятся автоматически (`src/lib/typo.ts`).

## Фото и видео

Исходники лежат в `media-src/`:

- `anna-hero.jpg` — вертикальное фото (≈ 888×1280 и больше). Лицо — примерно по центру верхней половины.
- `results-reel.mp4` — вертикальное видео 720×1280.

После замены выполните (нужен `ffmpeg`):

```bash
npm run media   # фото → src/assets, видео → public/video (mp4 H.264 + webm VP9 ≤ 1,5 МБ, постер), шрифты, иконки
bash scripts/subset-fonts.sh   # урезать латиницу в шрифтах (нужен fonttools: pip install fonttools brotli)
npm run og      # OG-картинка 1200×630 → public/og.jpg
```

Если лицо на аватаре съехало — поправьте `extract({ left, top, … })` в `scripts/media.mjs`.

## Деплой

- **Netlify:** New site → репозиторий → _Base directory_ `kazatskaya` (остальное в `kazatskaya/netlify.toml`).
- **Vercel:** Root Directory `kazatskaya`, фреймворк Astro определится сам.
- **GitHub Pages:** `npm run build`, опубликовать `dist/` (если сайт не в корне домена — добавить `base` в `astro.config.mjs`).

Переменные окружения (см. `.env.example`): `SITE_URL` — боевой домен, `PUBLIC_YM_ID` — Яндекс.Метрика
(цели: `tg_click`, `results_view`, `trainer_done`, `scroll_75` и др.), `PUBLIC_SHOW_TODO`.

## Проверка

```bash
npm run shoot -- http://localhost:4321/ screenshots small,mobile,tablet,laptop,desktop,wide
npm run shoot -- http://localhost:4321/ screenshots mobile reduced   # prefers-reduced-motion
```

Скрипт делает скриншоты по ходу скролла и печатает горизонтальный вылет и ошибки консоли.

Последний прогон (production-сборка): нет горизонтального скролла на 360–1920 px, консоль чистая;
Lighthouse mobile — Performance 91–94, Accessibility 100, Best Practices 100, SEO 100, CLS ≈ 0,005.

## Что осталось уточнить

См. [TODO.md](TODO.md).
