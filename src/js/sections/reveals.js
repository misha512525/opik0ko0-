import { gsap, ScrollTrigger, SplitText, MQ } from '../core/gsap.js';

/** Общие появления: line-reveal заголовков [data-split-lines] и fade-up [data-reveal]. */
export function initReveals() {
  const mm = gsap.matchMedia();

  mm.add(MQ.motion, () => {
    document.querySelectorAll('[data-split-lines]').forEach((el) => {
      ScrollTrigger.create({
        trigger: el,
        start: 'top 86%',
        once: true,
        onEnter() {
          const split = SplitText.create(el, { type: 'lines', mask: 'lines', linesClass: 'split-line', aria: 'none' });
          gsap.from(split.lines, {
            yPercent: 110,
            duration: 1.3,
            stagger: 0.1,
            onComplete: () => split.revert(),
          });
        },
      });
    });

    // Параллакс фото внутри рамок (двигается только img → transform)
    document.querySelectorAll('.card__photo, .window__photo, .channel__photo, .finale__photo').forEach((frame) => {
      const img = frame.querySelector('.photo__img');
      gsap.fromTo(img, { yPercent: -5 }, {
        yPercent: 5,
        ease: 'none',
        scrollTrigger: { trigger: frame, start: 'top bottom', end: 'bottom top', scrub: true },
      });
    });

    ScrollTrigger.batch('[data-reveal]', {
      start: 'top 90%',
      once: true,
      onEnter: (batch) => gsap.to(batch, { opacity: 1, y: 0, duration: 1.2, stagger: 0.1, overwrite: true }),
    });
  });

  // Reduced motion: только мягкое проявление прозрачностью
  mm.add(MQ.reduce, () => {
    ScrollTrigger.batch('[data-reveal], [data-split-lines]', {
      start: 'top 95%',
      once: true,
      onEnter: (batch) => gsap.fromTo(batch, { opacity: 0 }, { opacity: 1, duration: 0.6, ease: 'none' }),
    });
  });
}
