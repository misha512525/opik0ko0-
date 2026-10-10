import { gsap, prefersReduced, onceVisible } from '@/lib/motion';

/** Чернильная линия прорисовывается один раз, когда список шагов появляется на экране. */
export function initProcess() {
  const list = document.querySelector<HTMLElement>('[data-steps]');
  const line = list?.querySelector('[data-steps-line]');
  if (!list || !line || prefersReduced()) return;
  gsap.set(line, { scaleY: 0 });
  onceVisible(list, () => gsap.to(line, { scaleY: 1, duration: 1.6, ease: 'power2.inOut' }));
}
