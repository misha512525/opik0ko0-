import { counter, drawPath, prepareDraw, prefersReduced, onceVisible } from '@/lib/motion';

export function initNumbers() {
  if (prefersReduced()) return;
  document.querySelectorAll<HTMLElement>('[data-stat]').forEach((stat) => {
    counter(stat.querySelector<HTMLElement>('[data-count]')!);
    const circle = stat.querySelector<SVGElement>('[data-stat-circle]');
    if (circle) {
      prepareDraw(circle.querySelectorAll('path'));
      onceVisible(stat, () => drawPath(circle, { duration: 1.1, delay: 0.6 }));
    }
  });
}
