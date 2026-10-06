import { gsap, MQ, prefersReduced } from './gsap.js';

/** Магнитные кнопки: кнопка и подпись тянутся к курсору с разной силой. */
export function initMagnetic() {
  if (!window.matchMedia(MQ.finePointer).matches || prefersReduced()) return;

  document.querySelectorAll('[data-magnetic]').forEach((el) => {
    const label = el.querySelector('.btn__label');
    const strength = 0.32;
    const xTo = gsap.quickTo(el, 'x', { duration: 0.6, ease: 'power3' });
    const yTo = gsap.quickTo(el, 'y', { duration: 0.6, ease: 'power3' });
    const lxTo = label && gsap.quickTo(label, 'x', { duration: 0.6, ease: 'power3' });
    const lyTo = label && gsap.quickTo(label, 'y', { duration: 0.6, ease: 'power3' });
    let rect = null;

    el.addEventListener('pointerenter', () => { rect = el.getBoundingClientRect(); });
    el.addEventListener('pointermove', (e) => {
      if (!rect) rect = el.getBoundingClientRect();
      const dx = e.clientX - (rect.left + rect.width / 2);
      const dy = e.clientY - (rect.top + rect.height / 2);
      xTo(dx * strength); yTo(dy * strength);
      lxTo?.(dx * strength * 0.35); lyTo?.(dy * strength * 0.35);
    });
    el.addEventListener('pointerleave', () => {
      rect = null;
      gsap.to(el, { x: 0, y: 0, duration: 1, ease: 'elastic.out(1, 0.4)' });
      if (label) gsap.to(label, { x: 0, y: 0, duration: 1, ease: 'elastic.out(1, 0.4)' });
    });
  });
}
