import Lenis from 'lenis';
import { gsap, ScrollTrigger, prefersReduced } from './gsap.js';

let lenis = null;

/** Lenis + синхронизация со ScrollTrigger через gsap.ticker. При reduced-motion — нативный скролл. */
export function initSmoothScroll() {
  if (prefersReduced()) return null;

  lenis = new Lenis({
    lerp: 0.095,
    wheelMultiplier: 0.95,
    smoothWheel: true,
    syncTouch: false, // на тач-устройствах — нативная инерция
  });

  lenis.on('scroll', ScrollTrigger.update);
  const raf = (time) => lenis.raf(time * 1000);
  gsap.ticker.add(raf);
  gsap.ticker.lagSmoothing(0);

  return lenis;
}

export const getLenis = () => lenis;

export function stopScroll() {
  if (lenis) lenis.stop();
  document.documentElement.style.overflow = 'hidden';
}

export function startScroll() {
  if (lenis) lenis.start();
  document.documentElement.style.overflow = '';
}

/** Плавный переход по якорю (с учётом Lenis) + перенос фокуса для доступности */
export function scrollToTarget(target) {
  const el = typeof target === 'string' ? document.querySelector(target) : target;
  if (!el) return;

  const focus = () => {
    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
    el.focus({ preventScroll: true });
  };

  if (lenis) {
    lenis.scrollTo(el, { offset: el.id === 'top' ? -9999 : 0, duration: 1.4, onComplete: focus });
  } else {
    el.scrollIntoView({ behavior: prefersReduced() ? 'auto' : 'smooth', block: 'start' });
    focus();
  }
}

export function initAnchorLinks() {
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[href^="#"]');
    if (!link) return;
    const hash = link.getAttribute('href');
    if (hash.length < 2) return;
    const el = document.querySelector(hash);
    if (!el) return;
    e.preventDefault();
    scrollToTarget(el);
    history.replaceState(null, '', hash === '#top' ? location.pathname : hash);
  });
}
