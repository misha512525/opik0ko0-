// Собирает игру в один самодостаточный HTML-файл (стили и скрипты внутри).
// Запуск: node tools/build-single.mjs [путь-вывода]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(process.argv[2] || join(root, 'dist', 'pixel-league-27.html'));
let html = readFileSync(join(root, 'index.html'), 'utf8');

html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g, (_, f) => `<style>\n${readFileSync(join(root, f), 'utf8')}</style>`);
html = html.replace(/<script src="([^"]+)"><\/script>/g, (_, f) => {
  const js = readFileSync(join(root, f), 'utf8').replace(/<\/script/gi, '<\\/script');
  return `<script>/* ${f} */\n${js}</script>`;
});
if (/<script src=|<link rel="stylesheet"/.test(html)) throw new Error('остались внешние ссылки');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
console.log(`${out} — ${(html.length / 1024).toFixed(0)} КБ`);
