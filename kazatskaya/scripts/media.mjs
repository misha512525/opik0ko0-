// Готовит медиа из media-src/ → src/assets и public/.
// Запуск: npm run media (нужен ffmpeg в PATH).
//  - media-src/anna-hero.jpg     → src/assets/anna-hero.jpg (дальше Astro сам делает AVIF/WebP)
//  - media-src/results-reel.mp4  → public/video/results-reel.{mp4,webm} (≤ 1,5 МБ) + постер
//  - favicon-набор из монограммы «АК»
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const SRC = 'media-src';
const run = (args) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args], { stdio: 'inherit' });
const kb = async (p) => `${Math.round((await stat(p)).size / 1024)} КБ`;

await mkdir('src/assets', { recursive: true });
await mkdir('public/video', { recursive: true });

// --- Фото ---------------------------------------------------------------
await copyFile(`${SRC}/anna-hero.jpg`, 'src/assets/anna-hero.jpg');
// Аватар: квадрат по лицу (для мобильного hero и OG)
await sharp(`${SRC}/anna-hero.jpg`)
  .extract({ left: 318, top: 420, width: 320, height: 320 })
  .jpeg({ quality: 90 })
  .toFile('src/assets/anna-avatar.jpg');
console.log('фото → src/assets/anna-hero.jpg, anna-avatar.jpg');

// --- Видео --------------------------------------------------------------
const reel = `${SRC}/results-reel.mp4`;
// H.264 baseline-friendly: high profile, yuv420p, faststart — играет на iOS без перекодирования
run([
  '-i',
  reel,
  '-c:v',
  'libx264',
  '-preset',
  'slow',
  '-crf',
  '27',
  '-maxrate',
  '1100k',
  '-bufsize',
  '2200k',
  '-profile:v',
  'high',
  '-pix_fmt',
  'yuv420p',
  '-vf',
  'scale=720:-2',
  '-c:a',
  'aac',
  '-b:a',
  '64k',
  '-ac',
  '1',
  '-movflags',
  '+faststart',
  'public/video/results-reel.mp4',
]);
run([
  '-i',
  reel,
  '-c:v',
  'libvpx-vp9',
  '-b:v',
  '950k',
  '-maxrate',
  '1200k',
  '-row-mt',
  '1',
  '-deadline',
  'good',
  '-cpu-used',
  '2',
  '-vf',
  'scale=720:-2',
  '-c:a',
  'libopus',
  '-b:a',
  '48k',
  '-ac',
  '1',
  'public/video/results-reel.webm',
]);
// Постер — первый кадр (Анна, без учеников)
run(['-ss', '0.6', '-i', reel, '-frames:v', '1', '-q:v', '3', `${SRC}/.poster.jpg`]);
const poster = sharp(`${SRC}/.poster.jpg`).resize(540);
await poster.clone().avif({ quality: 52 }).toFile('public/video/results-reel-poster.avif');
await poster.clone().webp({ quality: 72 }).toFile('public/video/results-reel-poster.webp');
await poster.clone().jpeg({ quality: 76, mozjpeg: true }).toFile('public/video/results-reel-poster.jpg');
for (const f of [
  'results-reel.mp4',
  'results-reel.webm',
  'results-reel-poster.avif',
  'results-reel-poster.jpg',
]) {
  console.log(`видео → public/video/${f}: ${await kb(`public/video/${f}`)}`);
}

// --- Шрифты (self-hosted, только кириллица + латиница) -----------------
await mkdir('public/fonts', { recursive: true });
const FONTS = {
  '@fontsource-variable/cormorant-garamond': [
    'cyrillic-wght-normal',
    'cyrillic-wght-italic',
    'latin-wght-normal',
    'latin-wght-italic',
  ],
  '@fontsource-variable/manrope': ['cyrillic-wght-normal', 'latin-wght-normal'],
  '@fontsource/marck-script': ['cyrillic-400-normal', 'latin-400-normal'],
};
for (const [pkg, files] of Object.entries(FONTS)) {
  const base = pkg.split('/')[1];
  for (const f of files)
    await copyFile(`node_modules/${pkg}/files/${base}-${f}.woff2`, `public/fonts/${base}-${f}.woff2`);
}
console.log('шрифты → public/fonts/');

// --- Иконки -------------------------------------------------------------
const svg = await readFile('public/favicon.svg');
await sharp(svg, { density: 600 }).resize(180).png().toFile('public/apple-touch-icon.png');
await sharp(svg, { density: 600 }).resize(512).png().toFile('public/icon-512.png');
await sharp(svg, { density: 600 }).resize(192).png().toFile('public/icon-192.png');
await writeFile(
  'public/site.webmanifest',
  JSON.stringify(
    {
      name: 'Анна Казацкая — русский язык и литература',
      short_name: 'Казацкая',
      icons: [
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      ],
      theme_color: '#F5F9FF',
      background_color: '#F5F9FF',
      display: 'standalone',
    },
    null,
    2,
  ),
);
console.log('иконки → public/');
