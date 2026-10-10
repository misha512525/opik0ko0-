import { gsap, isFinePointer, prefersReduced } from '@/lib/motion';

/** Курсор-свечение: только мышь. Над [data-cursor] показывает подпись («Смотреть», «Написать»). */
export function initCursor() {
  const el = document.querySelector<HTMLElement>('[data-cursor-el]');
  if (!el || !isFinePointer() || prefersReduced()) return;
  const label = el.querySelector<HTMLElement>('[data-cursor-label]')!;
  const xTo = gsap.quickTo(el, 'x', { duration: 0.35, ease: 'power3.out' });
  const yTo = gsap.quickTo(el, 'y', { duration: 0.35, ease: 'power3.out' });
  el.classList.add('is-hidden');
  window.addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerType !== 'mouse') return;
      el.classList.remove('is-hidden');
      xTo(e.clientX);
      yTo(e.clientY);
      const target = e.target as Element;
      const withLabel = target.closest<HTMLElement>('[data-cursor]');
      if (withLabel?.dataset.cursor) {
        label.textContent = withLabel.dataset.cursor;
        el.classList.add('is-label');
        el.classList.remove('is-hover');
      } else {
        el.classList.remove('is-label');
        el.classList.toggle('is-hover', !!target.closest('a, button, [role="button"], label'));
      }
    },
    { passive: true },
  );
  document.documentElement.addEventListener('pointerleave', () => el.classList.add('is-hidden'));
}
