// OG-картинка 1200×630 в палитре сайта: рендерим HTML с фирменными шрифтами через Playwright.
// Запуск: npm run og  → public/og.jpg
import { chromium } from 'playwright-core';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const b64 = async (p) => (await readFile(p)).toString('base64');
const font = (f) => `url(data:font/woff2;base64,${f}) format('woff2')`;
const [corN, corI, man, marck, photo] = await Promise.all([
  b64('public/fonts/cormorant-garamond-cyrillic-wght-normal.woff2'),
  b64('public/fonts/cormorant-garamond-cyrillic-wght-italic.woff2'),
  b64('public/fonts/manrope-cyrillic-wght-normal.woff2'),
  b64('public/fonts/marck-script-cyrillic-400-normal.woff2'),
  b64('media-src/anna-hero.jpg'),
]);

const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><style>
@font-face{font-family:C;src:${font(corN)};font-weight:300 700}
@font-face{font-family:C;font-style:italic;src:${font(corI)};font-weight:300 700}
@font-face{font-family:M;src:${font(man)};font-weight:200 800}
@font-face{font-family:H;src:${font(marck)}}
*{margin:0;box-sizing:border-box}
body{width:1200px;height:630px;overflow:hidden;font-family:M;color:#12264A;
background:#F5F9FF;position:relative}
.grid{position:absolute;inset:0;background-image:linear-gradient(rgba(79,142,219,.09) 1px,transparent 1px),linear-gradient(90deg,rgba(79,142,219,.09) 1px,transparent 1px);background-size:28px 28px}
.glow{position:absolute;width:900px;height:900px;right:-300px;top:-420px;border-radius:50%;background:radial-gradient(closest-side,rgba(174,205,244,.85),transparent 70%)}
.margin{position:absolute;left:48px;top:0;bottom:0;width:2px;background:rgba(217,71,63,.3)}
.text{position:absolute;left:96px;top:66px;width:640px}
h1{font-family:C;font-weight:500;font-size:84px;line-height:.95;letter-spacing:-.035em}
h1 em{color:#4F8EDB;font-weight:500}
p{margin-top:26px;font-size:24px;line-height:1.4;color:#51627F;max-width:560px}
.name{margin-top:28px;display:flex;align-items:center;gap:14px;font-weight:600;font-size:22px}
.mono{width:52px;height:52px;border-radius:50%;background:#4F8EDB;color:#F5F9FF;display:grid;place-items:center;font-family:C;font-weight:600;font-size:26px}
.arch{position:absolute;right:72px;top:64px;width:360px;height:500px;border-radius:999px 999px 32px 32px;overflow:hidden;
box-shadow:0 40px 80px -30px rgba(31,74,133,.45)}
.arch img{width:100%;height:100%;object-fit:cover;object-position:54% 36%}
.grade{position:absolute;left:412px;top:150px;width:124px;transform:rotate(-8deg)}
.grade path{fill:none;stroke:#D9473F;stroke-width:4.2;stroke-linecap:round}
.tag{position:absolute;right:104px;bottom:40px;background:rgba(255,255,255,.85);border:1px solid rgba(79,142,219,.2);border-radius:20px;padding:12px 16px;font-weight:600;font-size:18px;box-shadow:0 10px 30px -10px rgba(31,74,133,.3)}
.tag b{font-family:H;font-weight:400;color:#D9473F;font-size:22px;margin-right:6px}
</style></head><body>
<div class="grid"></div><div class="glow"></div><div class="margin"></div>
<div class="text">
<h1>Русский язык<br>на <em>сто</em> —<br>без паники<br>и&nbsp;зубрёжки</h1>
<p>Репетитор по&nbsp;русскому языку и&nbsp;литературе. 11&nbsp;лет готовлю к&nbsp;ЕГЭ и&nbsp;ОГЭ.</p>
<div class="name"><span class="mono">АК</span>Анна Казацкая</div>
</div>
<svg class="grade" viewBox="0 0 170 110"><path d="M38 40 C42 36 47 31 52 26 C51 44 50 62 49 82"/><path d="M84 30 C70 30 64 52 66 66 C68 82 82 86 90 72 C97 58 97 32 84 30"/><path d="M122 30 C108 30 102 52 104 66 C106 82 120 86 128 72 C135 58 135 32 122 30"/><path stroke-width="3.2" d="M30 62 C24 32 66 12 108 12 C146 12 166 34 160 60 C154 88 110 100 74 98 C40 96 18 84 22 62 C24 50 34 40 46 34"/></svg>
<div class="arch"><img src="data:image/jpeg;base64,${photo}"></div>
<div class="tag"><b>100</b>каждый год&nbsp;— минимум один стобалльник</div>
</body></html>`;

const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(existsSync);
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html, { waitUntil: 'load' });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: resolve('public/og.jpg'), type: 'jpeg', quality: 86 });
await browser.close();
console.log('public/og.jpg готов');
