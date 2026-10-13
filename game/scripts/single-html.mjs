// Собирает игру в один самодостаточный HTML-файл: JS, CSS и WASM (Rapier) внутри.
// Использование: npm run build:html  →  velmont-heat.html
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

execSync('npx vite build --config vite.single.config.ts', { stdio: 'inherit' });
const dir = 'dist-single';
let html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
const read = (href) => fs.readFileSync(path.join(dir, href.replace(/^\.?\//, '')), 'utf8');

html = html.replace(/<link rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g, (_, href) => `<style>${read(href)}</style>`);
const scripts = [];
html = html.replace(/<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/g, (_, src) => {
  // «</script» внутри кода закрыл бы тег — экранируем.
  scripts.push(read(src).replace(/<\/script/gi, '<\\/script'));
  return '';
});
if (!scripts.length) throw new Error('script tag not found in dist-single/index.html');
// Модуль — в конец body, чтобы DOM уже был готов.
// Функция-замена: в коде встречаются «$'» и «$&», которые строковая замена исказила бы.
html = html.replace('</body>', () => `<script type="module">${scripts.join('\n')}</script>\n</body>`);
fs.writeFileSync('velmont-heat.html', html);
console.log(`velmont-heat.html: ${(fs.statSync('velmont-heat.html').size / 1e6).toFixed(2)} MB`);
