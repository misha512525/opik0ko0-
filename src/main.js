import { gsap, ScrollTrigger, prefersReduced } from './js/core/gsap.js';
import { initSmoothScroll, initAnchorLinks } from './js/core/smooth-scroll.js';
import { initHeader } from './js/core/header.js';
import { initMenu } from './js/core/menu.js';
import { initCursor } from './js/core/cursor.js';
import { initMagnetic } from './js/core/magnetic.js';
import { initPhotos } from './js/core/photos.js';
import { runPreloader } from './js/sections/preloader.js';
import { heroIntro, heroScroll } from './js/sections/hero.js';
import { initMarquee } from './js/sections/marquee.js';
import { initManifesto } from './js/sections/manifesto.js';
import { initApproach } from './js/sections/approach.js';
import { initTopics } from './js/sections/topics.js';
import { initChannel } from './js/sections/channel.js';
import { initFinale } from './js/sections/finale.js';
import { initReveals } from './js/sections/reveals.js';

window.__sofiaReady = true;
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

/** Ждём шрифты (для корректной разбивки строк), но не дольше timeout */
const fontsReady = (timeout = 1500) =>
  Promise.race([document.fonts?.ready ?? Promise.resolve(), new Promise((r) => setTimeout(r, timeout))]);

const yieldToMain = () =>
  globalThis.scheduler?.yield ? globalThis.scheduler.yield() : new Promise((r) => setTimeout(r, 0));

async function boot() {
  initSmoothScroll();
  initAnchorLinks();
  initHeader();
  initMenu();
  initCursor();
  initMagnetic();
  initMarquee();
  initPhotos();

  document.querySelectorAll('[data-year]').forEach((el) => { el.textContent = new Date().getFullYear(); });

  const intro = runPreloader();
  await fontsReady();

  // Секции (порядок важен: pin-секции создаются сверху вниз).
  // Между инициализациями отдаём поток браузеру — меньше длинных задач (TBT).
  for (const init of [heroScroll, initManifesto, initApproach, initTopics, initChannel, initFinale, initReveals]) {
    init();
    await yieldToMain();
  }

  await intro;
  if (prefersReduced()) {
    gsap.set('[data-hero-fade], [data-hero-title]', { opacity: 1 });
  } else {
    heroIntro();
  }

  ScrollTrigger.refresh();
}

boot();

// Пересчёт позиций после загрузки картинок и шрифтов
window.addEventListener('load', () => ScrollTrigger.refresh());
document.fonts?.addEventListener?.('loadingdone', () => ScrollTrigger.refresh());

// Смена настройки reduced-motion на лету — проще всего перезагрузить сценарии
window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', () => location.reload());
