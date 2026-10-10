import { gsap, ScrollTrigger } from './gsap';

/** Счётчик: от 0 до значения, один раз при входе во вьюпорт. Ширина фиксирована (tabular-nums + min-width в ch). */
export function counter(el: HTMLElement, opts: { duration?: number; start?: string } = {}) {
  const to = Number(el.dataset.count ?? el.textContent ?? 0);
  el.style.minWidth = `${String(to).length}ch`;
  const state = { v: 0 };
  el.textContent = '0';
  return ScrollTrigger.create({
    trigger: el,
    start: opts.start ?? 'top 85%',
    once: true,
    onEnter: () =>
      gsap.to(state, {
        v: to,
        duration: opts.duration ?? Math.min(2.2, 0.9 + to / 80),
        ease: 'expo.out',
        onUpdate: () => {
          el.textContent = String(Math.round(state.v));
        },
      }),
  });
}
