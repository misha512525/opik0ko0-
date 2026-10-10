// Скриншоты по ходу скролла + проверка горизонтального скролла и ошибок консоли.
// node scripts/shoot.mjs <url> <outDir> [presets=mobile,desktop] [reduced] [maxShots]
import { chromium } from 'playwright-core';
import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const [
  url = 'http://localhost:4321/',
  out = 'screenshots',
  presetArg = 'mobile,desktop',
  flag = '',
  max = '40',
] = process.argv.slice(2);
const reduced = flag === 'reduced';
const PRESETS = {
  small: { width: 360, height: 740, mobile: true },
  mobile: { width: 390, height: 844, mobile: true },
  large: { width: 430, height: 932, mobile: true },
  tablet: { width: 768, height: 1024, mobile: true },
  laptop: { width: 1280, height: 800, mobile: false },
  desktop: { width: 1440, height: 900, mobile: false },
  wide: { width: 1920, height: 1080, mobile: false },
};
const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium'].find(
  existsSync,
);
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: exe });

for (const name of presetArg.split(',')) {
  const p = PRESETS[name];
  const ctx = await browser.newContext({
    viewport: { width: p.width, height: p.height },
    deviceScaleFactor: 1,
    isMobile: p.mobile,
    hasTouch: p.mobile,
    reducedMotion: reduced ? 'reduce' : 'no-preference',
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on(
    'console',
    (m) => ['error', 'warning'].includes(m.type()) && errors.push(`${m.type()}: ${m.text()}`),
  );
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2600);
  let i = 0;
  const step = Math.round(p.height * 0.85);
  for (let y = 0; i < Number(max); y += step) {
    await page.evaluate((yy) => window.scrollTo(0, yy), y);
    await page.waitForTimeout(1100);
    await page.screenshot({
      path: `${out}/${name}${reduced ? '-rm' : ''}-${String(i++).padStart(2, '0')}.jpg`,
      type: 'jpeg',
      quality: 72,
    });
    const h = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
    if (y >= h) break;
  }
  const overflowX = await page.evaluate(() => {
    const w = document.documentElement.clientWidth;
    const bad = [...document.querySelectorAll('body *')]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.right > w + 1 && getComputedStyle(el).position !== 'fixed';
      })
      .slice(0, 5)
      .map((el) => `${el.tagName}.${[...el.classList].join('.')}`);
    return { scrollW: document.documentElement.scrollWidth, w, bad };
  });
  console.log(name, JSON.stringify({ shots: i, overflowX, errors }, null, 0));
  await ctx.close();
}
await browser.close();
