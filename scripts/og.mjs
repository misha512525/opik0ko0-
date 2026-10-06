// Рендер OG-превью 1200×630 (для Telegram) → public/og.jpg
// Запуск: node scripts/og.mjs (после npm run images)
import { chromium } from 'playwright-core';
import { readFile, writeFile } from 'node:fs/promises';

const b64 = async (p) => (await readFile(p)).toString('base64');
const font = await b64('public/fonts/cormorant-garamond-cyrillic-wght-normal.woff2');
const fontI = await b64('public/fonts/cormorant-garamond-cyrillic-wght-italic.woff2');
const ui = await b64('public/fonts/manrope-cyrillic-wght-normal.woff2');
const img = await b64('public/img/sofia-768.jpg');

const html = `<!doctype html><html><head><style>
@font-face{font-family:C;src:url(data:font/woff2;base64,${font})}
@font-face{font-family:C;font-style:italic;src:url(data:font/woff2;base64,${fontI})}
@font-face{font-family:M;font-weight:200 800;src:url(data:font/woff2;base64,${ui})}
*{margin:0;box-sizing:border-box}
body{width:1200px;height:630px;background:linear-gradient(170deg,#F6EEE3,#E8D9C3);font-family:C;color:#2A1D17;position:relative;overflow:hidden}
.blinds{position:absolute;inset:-30%;background:repeating-linear-gradient(to bottom,rgba(255,250,242,0) 0,rgba(255,250,242,.8) 8px,rgba(255,250,242,.8) 30px,rgba(255,250,242,0) 38px,rgba(255,250,242,0) 64px);transform:rotate(-9deg);opacity:.9;-webkit-mask-image:linear-gradient(to right,transparent 10%,#000 30%,#000 55%,transparent 70%)}
.arch{position:absolute;right:90px;top:70px;width:400px;height:560px;border-radius:400px 400px 0 0;overflow:hidden;background:#F6EEE3;isolation:isolate}
.arch img{width:100%;height:100%;object-fit:cover;object-position:52% 30%;filter:grayscale(1);mix-blend-mode:multiply}
.arch:after{content:'';position:absolute;inset:0;background:#2A1D17;mix-blend-mode:lighten}
.t{position:absolute;left:80px;top:96px}
.e{font-family:M;font-weight:600;font-size:18px;letter-spacing:.2em;text-transform:uppercase;color:#5E473B;display:flex;gap:14px;align-items:center}
.e i{width:40px;height:1px;background:#C9A66B}
h1{margin-top:34px;font-weight:400;font-size:118px;line-height:.9;letter-spacing:-.035em}
h1 em{color:#B8704F}
p{margin-top:40px;font-size:38px}
p em{color:#B8704F}
</style></head><body><div class="blinds"></div>
<div class="arch"><img src="data:image/jpeg;base64,${img}"></div>
<div class="t"><div class="e"><i></i>Психология отношений</div>
<h1>Услышать<br><em>друг друга</em><br>— снова</h1>
<p>София<span style="color:#B8704F">.</span> <em>А</em></p></div>
</body></html>`;

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html, { waitUntil: 'load' });
await page.evaluate(() => document.fonts.ready);
await writeFile('public/og.jpg', await page.screenshot({ type: 'jpeg', quality: 86 }));
await browser.close();
console.log('og: done');
