import Lenis from 'lenis';
import { gsap, ScrollTrigger, prefersReduced } from './gsap';

let lenis: Lenis | null = null;
export const getLenis = () => lenis;

/**
 * Плавный скролл. На тач-устройствах Lenis не перехватывает жесты (syncTouch: false) —
 * нативная инерция iOS/Android ощущается лучше. При reduced motion Lenis не включаем.
 */
export function initSmoothScroll() {
  if (prefersReduced()) return null;
  lenis = new Lenis({ lerp: 0.1, wheelMultiplier: 1, syncTouch: false, autoRaf: false });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenis?.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
  return lenis;
}

const navOffset = () => -(document.querySelector<HTMLElement>('[data-nav]')?.offsetHeight ?? 64) - 16;

/** Плавный переход к якорю: 1.2 с, ease-out expo, с отступом под фикс-навигацию. */
export function scrollToTarget(target: HTMLElement | string, immediate = false) {
  const el = typeof target === 'string' ? document.querySelector<HTMLElement>(target) : target;
  if (!el) return;
  if (lenis) {
    lenis.scrollTo(el, {
      offset: navOffset(),
      duration: 1.25,
      easing: (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
      immediate,
    });
  } else {
    const y = el.getBoundingClientRect().top + window.scrollY + navOffset();
    window.scrollTo({ top: y, behavior: prefersReduced() || immediate ? 'auto' : 'smooth' });
  }
}

export function initAnchorLinks() {
  document.addEventListener('click', (e) => {
    const a = (e.target as Element).closest<HTMLAnchorElement>('a[href^="#"]');
    if (!a) return;
    const hash = a.getAttribute('href')!;
    if (hash === '#') return;
    const el = hash === '#top' ? document.body : document.querySelector<HTMLElement>(hash);
    if (!el) return;
    e.preventDefault();
    if (hash === '#top') {
      if (lenis) {
        lenis.scrollTo(0, { duration: 1.2 });
      } else window.scrollTo({ top: 0, behavior: prefersReduced() ? 'auto' : 'smooth' });
    } else scrollToTarget(el);
    history.replaceState(null, '', hash);
    // Фокус для клавиатуры и скринридеров — без прыжка
    if (el !== document.body) {
      if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
      el.focus({ preventScroll: true });
    }
  });
}
