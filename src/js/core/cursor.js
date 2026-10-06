import { gsap, MQ, prefersReduced } from './gsap.js';

/** Кастомный курсор: кольцо с инерцией, увеличивается на ссылках, подпись из data-cursor. Только fine pointer. */
export function initCursor() {
  if (!window.matchMedia(MQ.finePointer).matches) return;
  const cursor = document.querySelector('.cursor');
  if (!cursor) return;

  const ring = cursor.querySelector('.cursor__ring');
  const dot = cursor.querySelector('.cursor__dot');
  const label = cursor.querySelector('.cursor__label');
  const reduce = prefersReduced();

  document.documentElement.classList.add('has-cursor');
  gsap.set([ring, dot], { x: -100, y: -100 });

  const ringX = gsap.quickTo(ring, 'x', { duration: reduce ? 0 : 0.45, ease: 'power3' });
  const ringY = gsap.quickTo(ring, 'y', { duration: reduce ? 0 : 0.45, ease: 'power3' });
  const dotX = gsap.quickTo(dot, 'x', { duration: 0.08, ease: 'none' });
  const dotY = gsap.quickTo(dot, 'y', { duration: 0.08, ease: 'none' });

  let lastTarget = null;
  window.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    ringX(e.clientX); ringY(e.clientY);
    dotX(e.clientX); dotY(e.clientY);
    cursor.classList.remove('is-hidden');

    if (e.target === lastTarget) return;
    lastTarget = e.target;
    const labeled = e.target.closest?.('[data-cursor]');
    const link = e.target.closest?.('a, button, [role="button"]');
    cursor.classList.toggle('is-hover', !!labeled);
    cursor.classList.toggle('is-link', !labeled && !!link);
    if (labeled) label.textContent = labeled.dataset.cursor || 'смотреть';
    cursor.classList.toggle('is-dark', !!e.target.closest?.('[data-theme="dark"], .menu, .card--espresso, .tg-card, .rate--dark'));
  }, { passive: true });

  document.addEventListener('pointerleave', () => cursor.classList.add('is-hidden'));
  window.addEventListener('blur', () => cursor.classList.add('is-hidden'));
}
