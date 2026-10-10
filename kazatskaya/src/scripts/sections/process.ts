import { gsap, MQ, EASE } from '@/lib/motion';

/** Шаги «проявляются» по очереди; чернильная линия прорисовывается по скроллу. */
export function initProcess() {
  const list = document.querySelector<HTMLElement>('[data-steps]');
  if (!list) return;
  const mm = gsap.matchMedia();
  mm.add(`${MQ.desktop}, ${MQ.mobile}`, () => {
    gsap.fromTo(
      list.querySelector('[data-steps-line]'),
      { scaleY: 0 },
      {
        scaleY: 1,
        ease: 'none',
        scrollTrigger: { trigger: list, start: 'top 70%', end: 'bottom 60%', scrub: 0.5 },
      },
    );
    list.querySelectorAll<HTMLElement>('[data-step]').forEach((step) => {
      const tl = gsap.timeline({ scrollTrigger: { trigger: step, start: 'top 78%', once: true } });
      tl.from(step.querySelector('.step__node'), {
        scale: 0.6,
        opacity: 0,
        rotate: -30,
        duration: 0.7,
        ease: 'back.out(2)',
      }).from(step.querySelector('.step__body'), { x: 24, opacity: 0, duration: 0.8, ease: EASE.out }, 0.08);
    });
  });
}
