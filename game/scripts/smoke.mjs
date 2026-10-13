// Дымовой тест: открывает игру в Chromium (Playwright), выполняет сценарий,
// делает скриншоты, собирает ошибки консоли и FPS.
// Использование: node scripts/smoke.mjs [url] [scenario]
//   url по умолчанию http://localhost:4180/  (npm run preview)
//   scenario: walk | drive | traffic | combat | missions | full
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const url = process.argv[2] ?? 'http://localhost:4180/';
const scenario = process.argv[3] ?? 'walk';
const outDir = 'screenshots';
fs.mkdirSync(outDir, { recursive: true });

const exe = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium';
const browser = await chromium.launch({
  executablePath: exe,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`);
});
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));

const sep = url.includes('?') ? '&' : '?';
await page.goto(`${url}${sep}autotest=1`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__game !== undefined, null, { timeout: 120000 });
await page.waitForTimeout(1500);

const g = (fn, arg) => page.evaluate(fn, arg);
const hold = async (code, ms) => {
  await g((c) => window.__game.ctx.input.simulate(c, true), code);
  await page.waitForTimeout(ms);
  await g((c) => window.__game.ctx.input.simulate(c, false), code);
};
const shot = async (name) => {
  await page.screenshot({ path: `${outDir}/${scenario}-${name}.png` });
  console.log(`screenshot: ${outDir}/${scenario}-${name}.png`);
};
const stats = async (label) => {
  const s = await g(() => {
    const game = window.__game;
    const c = game.ctx;
    const p = c.player.position;
    return {
      fps: Math.round(game.loop.fps),
      frameMs: +game.loop.frameMs.toFixed(1),
      calls: c.renderer.info.render.calls,
      tris: c.renderer.info.render.triangles,
      player: [+p.x.toFixed(1), +p.y.toFixed(2), +p.z.toFixed(1)],
      mode: c.player.mode,
      extra: typeof game.debugStats === 'function' ? game.debugStats() : undefined,
    };
  });
  console.log(label, JSON.stringify(s));
  return s;
};

// Закрыть стартовое меню, если оно есть.
await g(() => window.__game.autotestStart?.());
await page.waitForTimeout(500);
await stats('start');
await shot('00-start');

if (scenario === 'walk' || scenario === 'full') {
  const before = await stats('before-walk');
  await hold('KeyW', 2500);
  await g(() => { window.__game.ctx.cameraRig.yaw += 1.2; });
  await hold('ShiftLeft', 10).catch(() => {});
  await g((c) => window.__game.ctx.input.simulate(c, true), 'ShiftLeft');
  await hold('KeyW', 2000);
  await g((c) => window.__game.ctx.input.simulate(c, false), 'ShiftLeft');
  await hold('Space', 100);
  await page.waitForTimeout(300);
  const after = await stats('after-walk');
  const moved = Math.hypot(after.player[0] - before.player[0], after.player[2] - before.player[2]);
  console.log('walked distance', moved.toFixed(1));
  if (moved < 3) errors.push('[test] player did not move');
  await shot('01-walk');
  await g(() => { const c = window.__game.ctx; c.dayNight.hour = 22.5; });
  await page.waitForTimeout(800);
  await shot('02-night');
  await g(() => { const c = window.__game.ctx; c.dayNight.hour = 12; });
  await page.waitForTimeout(600);
  await g(() => { const c = window.__game.ctx; c.cameraRig.pitch = 0.5; });
  await page.waitForTimeout(400);
  await shot('03-day-skyline');
}

if (typeof globalThis.__extraScenario === 'function') await globalThis.__extraScenario({ page, g, hold, shot, stats, errors });
const extraPath = `scripts/scenario-${scenario}.mjs`;
if (fs.existsSync(extraPath)) {
  const mod = await import(`./scenario-${scenario}.mjs`);
  await mod.default({ page, g, hold, shot, stats, errors });
}

await stats('end');
await browser.close();
const relevant = errors.filter((e) => !/GPU stall|swiftshader|WebGL-|AudioContext was not allowed|Automatic fallback to software/i.test(e));
if (relevant.length) {
  console.log('ERRORS:\n' + relevant.join('\n'));
  process.exit(1);
}
console.log('OK: no console errors');
