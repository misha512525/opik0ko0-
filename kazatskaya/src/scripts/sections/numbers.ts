import { gsap, counter, drawPath, prepareDraw } from '@/lib/motion';

export function initNumbers() {
  const stats = document.querySelectorAll<HTMLElement>('[data-stat]');
  if (!stats.length) return;
  const mm = gsap.matchMedia();
  mm.add({ motion: '(prefers-reduced-motion: no-preference)' }, () => {
    stats.forEach((stat, i) => {
      const num = stat.querySelector<HTMLElement>('[data-count]')!;
      counter(num);
      const rule = stat.querySelector('[data-stat-rule]');
      const label = stat.querySelector('.stat__label');
      const tl = gsap.timeline({ scrollTrigger: { trigger: stat, start: 'top 86%', once: true } });
      tl.fromTo(rule, { scaleX: 0 }, { scaleX: 1, duration: 1.1, ease: 'expo.inOut', delay: i * 0.06 })
        .fromTo(
          num,
          { yPercent: 30, opacity: 0 },
          { yPercent: 0, opacity: 1, duration: 0.9, ease: 'expo.out' },
          0.1,
        )
        .fromTo(label, { y: 16, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7, ease: 'expo.out' }, 0.25);
      const circle = stat.querySelector('[data-stat-circle]');
      if (circle) {
        prepareDraw(circle.querySelectorAll('path'));
        tl.add(drawPath(circle, { duration: 1.3 }), 0.9);
      }
    });
  });
}
