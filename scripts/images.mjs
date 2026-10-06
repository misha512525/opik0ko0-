// Генерация адаптивных изображений из assets/sofia.jpg → public/img
// Запуск: npm run images
import sharp from 'sharp';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

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

// Атмосферные кадры (assets/photos) — приглушаем «янтарь», чтобы серия сидела в палитре
const PHOTOS = {
  manifesto: { widths: [800, 1448], saturation: 0.8, hue: -4 },
  finale: { widths: [800, 1448], saturation: 0.82, hue: -4 },
  'card-support': { widths: [600, 1000], saturation: 0.86, hue: -3 },
  'card-dialog': { widths: [600, 1000], saturation: 0.88, hue: -2 },
  'card-warmth': { widths: [600, 1000], saturation: 0.85, hue: -3 },
  topics: { widths: [480, 800], saturation: 0.8, hue: -4 },
  channel: { widths: [600, 1000], saturation: 0.78, hue: -5 },
};
for (const [name, o] of Object.entries(PHOTOS)) {
  for (const w of o.widths) {
    const base = sharp(`assets/photos/${name}.jpg`)
      .resize({ width: w, withoutEnlargement: true })
      .modulate({ saturation: o.saturation, hue: o.hue });
    await base.clone().avif({ quality: 50, effort: 6 }).toFile(`${OUT}/${name}-${w}.avif`);
    await base.clone().webp({ quality: 72 }).toFile(`${OUT}/${name}-${w}.webp`);
    await base.clone().jpeg({ quality: 76, mozjpeg: true }).toFile(`${OUT}/${name}-${w}.jpg`);
  }
}

// LQIP: крошечные размытые превью (~0.5 КБ) — показываются, пока грузится фото
let lqipCss = '/* Сгенерировано scripts/images.mjs — не редактировать вручную */\n';
for (const [name, o] of Object.entries(PHOTOS)) {
  const buf = await sharp(`assets/photos/${name}.jpg`)
    .resize({ width: 24 })
    .modulate({ saturation: o.saturation, hue: o.hue })
    .webp({ quality: 40 })
    .toBuffer();
  lqipCss += `[data-photo='${name}'] { --lqip: url(data:image/webp;base64,${buf.toString('base64')}); }\n`;
}
await writeFile('src/styles/lqip.css', lqipCss);

// PNG-иконки из SVG-фавикона
const svg = await readFile('public/favicon.svg');
await sharp(svg, { density: 600 }).resize(180, 180).flatten({ background: '#F6EEE3' }).png().toFile('public/apple-touch-icon.png');
await sharp(svg, { density: 600 }).resize(512, 512).png().toFile('public/icon-512.png');

console.log('images: done');
