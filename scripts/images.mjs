// Генерация адаптивных изображений из assets/sofia.jpg → public/img
// Запуск: npm run images
import sharp from 'sharp';
import { mkdir, readFile } from 'node:fs/promises';

const SRC = 'assets/sofia.jpg';
const OUT = 'public/img';
const WIDTHS = [480, 768, 1024];

await mkdir(OUT, { recursive: true });

// Портрет: монохром на входе — тёплый дуотон накладывается в CSS
for (const w of WIDTHS) {
  const base = sharp(SRC).grayscale().resize({ width: w });
  await base.clone().avif({ quality: 52, effort: 6 }).toFile(`${OUT}/sofia-${w}.avif`);
  await base.clone().webp({ quality: 74 }).toFile(`${OUT}/sofia-${w}.webp`);
  await base.clone().jpeg({ quality: 78, mozjpeg: true }).toFile(`${OUT}/sofia-${w}.jpg`);
}

// Аватар для превью Telegram-канала (кроп лица)
const avatar = sharp(SRC).grayscale().extract({ left: 300, top: 120, width: 400, height: 400 }).resize(160, 160);
await avatar.clone().webp({ quality: 78 }).toFile(`${OUT}/sofia-avatar.webp`);
await avatar.clone().jpeg({ quality: 80, mozjpeg: true }).toFile(`${OUT}/sofia-avatar.jpg`);

// PNG-иконки из SVG-фавикона
const svg = await readFile('public/favicon.svg');
await sharp(svg, { density: 600 }).resize(180, 180).flatten({ background: '#F6EEE3' }).png().toFile('public/apple-touch-icon.png');
await sharp(svg, { density: 600 }).resize(512, 512).png().toFile('public/icon-512.png');

console.log('images: done');
