import { gsap } from './gsap';

/** Параллакс по скроллу: только transform. amount — в процентах высоты вьюпорта (±). */
export function parallax(el: Element, amount = 10, trigger: Element = el.closest('section') ?? el) {
  return gsap.fromTo(
    el,
    { yPercent: 0, y: () => (window.innerHeight * amount) / 100 },
    {
      y: () => (-window.innerHeight * amount) / 100,
      ease: 'none',
      scrollTrigger: {
        trigger,
        start: 'top bottom',
        end: 'bottom top',
        scrub: true,
        invalidateOnRefresh: true,
      },
    },
  );
}
