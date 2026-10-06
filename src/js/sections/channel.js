import { gsap, MQ } from '../core/gsap.js';

/** Канал: «шторка» из ламелей при входе, параллакс и 3D-наклон карточки Telegram. */
export function initChannel() {
  const section = document.querySelector('.channel');
  if (!section) return;
  const curtain = section.querySelector('.channel__curtain');
  const card = section.querySelector('.tg-card');
  const cardBlinds = card?.querySelector('.tg-card__blinds');

  curtain.innerHTML = '<span></span>'.repeat(7);
  const slats = curtain.children;

  const mm = gsap.matchMedia();
  mm.add({ desktop: MQ.desktop, motion: MQ.motion }, (ctx) => {
    const { desktop, motion } = ctx.conditions;
    if (!motion) return;

    // ламели песочного цвета схлопываются, открывая свет секции
    gsap.fromTo(slats, { scaleY: 1 }, {
      scaleY: 0,
      transformOrigin: 'top',
      stagger: 0.08,
      ease: 'none',
      scrollTrigger: { trigger: section, start: 'top 90%', end: 'top 10%', scrub: true },
    });

    if (!card) return;
    gsap.fromTo(card, { yPercent: desktop ? 16 : 6 }, {
      yPercent: desktop ? -6 : 0,
      ease: 'none',
      scrollTrigger: { trigger: section, start: 'top bottom', end: 'bottom top', scrub: true },
    });
    gsap.to(cardBlinds, {
      yPercent: 20,
      ease: 'none',
      scrollTrigger: { trigger: section, start: 'top bottom', end: 'bottom top', scrub: true },
    });

    if (desktop && window.matchMedia(MQ.finePointer).matches) {
      const rx = gsap.quickTo(card, 'rotationX', { duration: 0.8, ease: 'power3' });
      const ry = gsap.quickTo(card, 'rotationY', { duration: 0.8, ease: 'power3' });
      gsap.set(card, { transformPerspective: 1100 });
      const move = (e) => {
        const r = card.getBoundingClientRect();
        const nx = (e.clientX - r.left) / r.width - 0.5;
        const ny = (e.clientY - r.top) / r.height - 0.5;
        rx(ny * -7); ry(nx * 9);
      };
      const leave = () => { rx(0); ry(0); };
      card.addEventListener('pointermove', move);
      card.addEventListener('pointerleave', leave);
      return () => {
        card.removeEventListener('pointermove', move);
        card.removeEventListener('pointerleave', leave);
      };
    }
  });
}
