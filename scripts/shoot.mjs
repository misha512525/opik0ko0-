// Скриншоты по ходу скролла + сбор ошибок консоли.
// Использование: node scripts/shoot.mjs <url> <outDir> [preset=desktop|mobile|all] [reduced]
import { chromium } from 'playwright-core';
import { mkdir } from 'node:fs/promises';

const [url = 'http://localhost:4173/', out = 'screenshots', preset = 'all', reducedArg] = process.argv.slice(2);
const reduced = reducedArg === 'reduced';
const PRESETS = {
  desktop: { width: 1440, height: 900, mobile: false },
  mobile: { width: 390, height: 844, mobile: true },
};
const list = preset === 'all' ? Object.keys(PRESETS) : [preset];
await mkdir(out, { recursive: true });

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }).catch(() =>
  chromium.launch());

for (const name of list) {
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
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) errors.push(`${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3800);
  const total = await page.evaluate(() => document.documentElement.scrollHeight);
  const overflowX = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  const step = Math.round(p.height * 0.8);
  let i = 0;
  for (let y = 0; y <= total; y += step) {
    // колесо мыши (Lenis) или нативный скролл
    await page.evaluate((yy) => window.scrollTo(0, yy), y);
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${out}/${name}${reduced ? '-rm' : ''}-${String(i++).padStart(2, '0')}.jpg`, type: 'jpeg', quality: 70 });
    const h = await page.evaluate(() => document.documentElement.scrollHeight);
    if (y > h) break;
  }
  console.log(name, { total, shots: i, overflowX, errors });
  await ctx.close();
}
await browser.close();
