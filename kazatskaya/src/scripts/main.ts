import { ScrollTrigger, initSmoothScroll, initAnchorLinks, initReveals, prefersReduced } from '@/lib/motion';
import { initNav, initMenu } from './ui/nav';
import { initCursor } from './ui/cursor';
import { initButtons } from './ui/buttons';
import { initCards } from './ui/cards';
import { initVideos } from './ui/video';
import { initAnalytics } from './ui/analytics';
import { runPreloader } from './sections/preloader';
import { heroPrepare, heroIntro, heroScroll } from './sections/hero';
import { initNumbers } from './sections/numbers';
import { initResults } from './sections/results';
import { initAbout } from './sections/about';
import { initServices } from './sections/services';
import { initProcess } from './sections/process';
import { initMaterials } from './sections/materials';
import { initTrainer } from './sections/trainer';
import { initReviews } from './sections/reviews';
import { initFaq } from './sections/faq';
import { initFinale } from './sections/finale';

window.__akReady = true;
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

const yieldToMain = () => new Promise<void>((r) => setTimeout(r, 0));
const idle = () =>
  new Promise<void>((r) =>
    'requestIdleCallback' in window ? requestIdleCallback(() => r(), { timeout: 600 }) : setTimeout(r, 120),
  );
const fontsReady = (timeout = 1500) =>
  Promise.race([document.fonts?.ready ?? Promise.resolve(), new Promise((r) => setTimeout(r, timeout))]);

/** Секции ниже первого экрана без пинов инициализируются лениво — когда до них остаётся ~1,5 экрана. */
function lazyInit(selector: string, init: () => void) {
  const el = document.querySelector(selector);
  if (!el) return;
  const io = new IntersectionObserver(
    ([entry]) => {
      if (!entry.isIntersecting) return;
      io.disconnect();
      init();
      ScrollTrigger.sort();
      ScrollTrigger.refresh();
    },
    { rootMargin: '150% 0px' },
  );
  io.observe(el);
}

async function boot() {
  const reduce = prefersReduced();
  const hero = reduce ? null : heroPrepare();

  initSmoothScroll();
  initAnchorLinks();
  initNav();
  initMenu();
  initCursor();
  initButtons();
  initAnalytics();
  initVideos();
  initServices();
  initTrainer();
  initFaq();

  const intro = runPreloader();
  await fontsReady();
  heroScroll();
  await intro;
  if (hero) heroIntro(hero);

  // Ниже первого экрана — в простое, по одной секции за раз (меньше длинных задач, лучше TBT/INP).
  // Секции с пинами создаются сверху вниз — порядок важен.
  for (const init of [initNumbers, initResults, initAbout, initReviews, initReveals, initCards]) {
    await idle();
    init();
    await yieldToMain();
  }
  lazyInit('#process', initProcess);
  lazyInit('#materials', initMaterials);
  lazyInit('#contact', initFinale);
  ScrollTrigger.refresh();

  window.addEventListener('load', () => ScrollTrigger.refresh());

  // Открыли по якорю — переходим без анимации
  if (location.hash.length > 1) {
    const target = document.querySelector<HTMLElement>(location.hash);
    if (target) setTimeout(() => target.scrollIntoView(), 60);
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();
