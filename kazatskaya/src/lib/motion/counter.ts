import { gsap } from './gsap';
import { onceVisible } from './reveal';

/** Счётчик: от 0 до значения, один раз при входе во вьюпорт. Ширина фиксирована (tabular-nums + min-width в ch). */
export function counter(el: HTMLElement, opts: { duration?: number } = {}) {
  const to = Number(el.dataset.count ?? el.textContent ?? 0);
  el.style.minWidth = `${String(to).length}ch`;
  const state = { v: 0 };
  el.textContent = '0';
  onceVisible(el, () =>
    gsap.to(state, {
      v: to,
      duration: opts.duration ?? Math.min(1.8, 0.8 + to / 100),
      ease: 'expo.out',
      onUpdate: () => {
        el.textContent = String(Math.round(state.v));
      },
    }),
  );
}
