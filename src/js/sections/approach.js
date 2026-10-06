import { gsap, ScrollTrigger, MQ } from '../core/gsap.js';

/** Подход: зачёркивания «таблеток/уйди/стерпи» + стек карточек, предыдущая уходит вглубь. */
export function initApproach() {
  const section = document.querySelector('.approach');
  if (!section) return;
  const quote = section.querySelector('.approach__quote');
  const items = [...section.querySelectorAll('.stack__item')];
  const mm = gsap.matchMedia();

  mm.add({ desktop: MQ.desktop, mobile: MQ.mobile, motion: MQ.motion }, (ctx) => {
    const { desktop, motion } = ctx.conditions;
    if (!motion) return;

    const strike = ScrollTrigger.create({
      trigger: quote,
      start: 'top 62%',
      once: true,
      onEnter: () => gsap.delayedCall(0.7, () => quote.classList.add('is-struck')),
    });

    const cards = items.map((li) => li.querySelector('.card'));
    cards.forEach((card, i) => {
      // появление карточки
      gsap.from(card, {
        yPercent: 12,
        rotation: desktop ? 2.5 * (i % 2 ? -1 : 1) : 0,
        ease: 'power2.out',
        scrollTrigger: { trigger: items[i], start: 'top bottom', end: 'top 55%', scrub: true },
      });
      // параллакс полос света внутри карточки
      gsap.to(card.querySelector('.card__blinds'), {
        yPercent: -18,
        ease: 'none',
        scrollTrigger: { trigger: items[i], start: 'top bottom', end: 'bottom top', scrub: true },
      });
      // предыдущая карточка «уходит вглубь» под следующую
      const next = items[i + 1];
      if (!next) return;
      const shade = card.appendChild(Object.assign(document.createElement('span'), { className: 'card__shade' }));
      gsap.to(shade, {
        opacity: 0.35,
        ease: 'none',
        scrollTrigger: {
          trigger: next,
          start: 'top bottom',
          end: () => `top ${parseFloat(getComputedStyle(next).top) || 100}px`,
          scrub: true,
          invalidateOnRefresh: true,
        },
      });
      gsap.to(card, {
        scale: desktop ? 0.9 : 0.94,
        ease: 'none',
        scrollTrigger: {
          trigger: next,
          start: 'top bottom',
          end: () => `top ${parseFloat(getComputedStyle(next).top) || 100}px`,
          scrub: true,
          invalidateOnRefresh: true,
        },
      });
    });

    return () => {
      strike.kill();
      section.querySelectorAll('.card__shade').forEach((el) => el.remove());
    };
  });
}
