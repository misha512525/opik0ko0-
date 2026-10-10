import { initAnchorLinks, initReveals, prefersReduced } from '@/lib/motion';
import { initNav, initMenu } from './ui/nav';
import { initVideos } from './ui/video';
import { initAnalytics } from './ui/analytics';
import { heroPrepare, heroIntro } from './sections/hero';
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

const fontsReady = (timeout = 1200) =>
  Promise.race([document.fonts?.ready ?? Promise.resolve(), new Promise((r) => setTimeout(r, timeout))]);

async function boot() {
  const hero = prefersReduced() ? null : heroPrepare();

  // Скролл нативный; появление блоков — сразу, через IntersectionObserver (без пустых мест при быстром скролле)
  initReveals();
  initAnchorLinks();
  initNav();
  initMenu();
  initAnalytics();
  initVideos();
  initServices();
  initTrainer();
  initFaq();
  initNumbers();
  initResults();
  initAbout();
  initProcess();
  initMaterials();
  initReviews();
  initFinale();

  await fontsReady();
  if (hero) heroIntro(hero);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();
