import { gsap, prefersReduced } from '../core/gsap.js';
import { stopScroll, startScroll } from '../core/smooth-scroll.js';

/**
 * Интро: тёмные ламели «жалюзи» → имя → ламели раскрываются,
 * и сквозь щели проступает hero (полосы света).
 * Резолвится, когда пора запускать интро hero.
 */
export function runPreloader() {
  const root = document.documentElement;
  const el = document.querySelector('.preloader');

  const skip = prefersReduced() || root.classList.contains('intro-seen') || !el;
  if (skip) {
    el?.remove();
    return Promise.resolve();
  }

  el.classList.add('is-running');
  stopScroll();

  const slats = el.querySelectorAll('.preloader__slats span');
  const words = el.querySelectorAll('.preloader__word');
  const line = el.querySelector('.preloader__line');

  return new Promise((resolve) => {
    const tl = gsap.timeline({
      defaults: { ease: 'expo.out' },
      onComplete() {
        el.remove();
        startScroll();
        try { sessionStorage.setItem('sofia-intro-seen', '1'); } catch (e) { /* приватный режим */ }
      },
    });

    tl.to(line, { scaleX: 1, duration: 0.7, ease: 'expo.inOut' })
      .to(words, { y: 0, duration: 0.9, stagger: 0.1 }, '-=0.45')
      .to(words, { y: '-110%', duration: 0.7, stagger: 0.06, ease: 'expo.in' }, '+=0.1')
      .to(line, { scaleX: 0, transformOrigin: 'right', duration: 0.6, ease: 'expo.in' }, '<')
      // ламели раскрываются — свет пробивается полосами
      .to(slats, {
        scaleY: 0,
        duration: 1,
        ease: 'expo.inOut',
        stagger: { each: 0.045, from: 'start' },
        transformOrigin: (i) => (i % 2 ? 'top' : 'bottom'),
      }, '-=0.15')
      .add(resolve, '-=0.85');
  });
}
