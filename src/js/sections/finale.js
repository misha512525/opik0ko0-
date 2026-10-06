import { gsap, MQ } from '../core/gsap.js';

/** Финал: секция раскрывается clip-path «окном», полосы света скользят. */
export function initFinale() {
  const section = document.querySelector('.finale');
  if (!section) return;
  const blinds = section.querySelector('.light-blinds');

  const mm = gsap.matchMedia();
  mm.add({ desktop: MQ.desktop, motion: MQ.motion }, (ctx) => {
    const { desktop, motion } = ctx.conditions;
    if (!motion) return;
    const inset = desktop ? '6% 5% 0% 5%' : '4% 3% 0% 3%';

    gsap.fromTo(section,
      { clipPath: `inset(${inset} round 48px 48px 0px 0px)` },
      {
        clipPath: 'inset(0% 0% 0% 0% round 0px 0px 0px 0px)',
        ease: 'none',
        scrollTrigger: { trigger: section, start: 'top bottom', end: 'top 25%', scrub: true },
      });

    gsap.set(blinds, { rotation: -10 });
    gsap.fromTo(blinds, { yPercent: -10 }, {
      yPercent: 10,
      ease: 'none',
      scrollTrigger: { trigger: section, start: 'top bottom', end: 'bottom top', scrub: true },
    });
  });
}
