# CREDITS

## Ассеты

Сторонних ассетов (моделей, текстур, звуков, музыки, шрифтов) в игре **нет**.

- **Геометрия** — процедурная, из примитивов three.js (`BoxGeometry`,
  `CylinderGeometry` и т. п.), собирается кодом в `src/world`, `src/vehicles`,
  `src/player`.
- **Текстуры** (асфальт, тротуар, трава, вода, частицы, пятна света фонарей) —
  рисуются в `<canvas>` при запуске (`src/world/Textures.ts`); окна зданий рисуются
  в шейдере (`src/world/BuildingMaterial.ts`).
- **Звуки и музыка** — синтезируются в реальном времени через Web Audio API
  (`src/audio`).
- **Шрифты** — системные (`system-ui`, `Segoe UI`, моноширинный по умолчанию).
- **Иконка** — inline SVG в `index.html`.

Название игры, город, персонажи, тексты и миссии — оригинальные и вымышленные.

## Библиотеки (npm)

| Пакет | Лицензия | Назначение |
|---|---|---|
| [three](https://github.com/mrdoob/three.js) | MIT | 3D-рендеринг |
| [@dimforge/rapier3d-compat](https://github.com/dimforge/rapier.js) | Apache-2.0 | физика |
| [vite](https://github.com/vitejs/vite) | MIT | сборка и dev-сервер |
| [typescript](https://github.com/microsoft/TypeScript) | Apache-2.0 | язык |
| [playwright-core](https://github.com/microsoft/playwright) | Apache-2.0 | автотесты (dev) |
