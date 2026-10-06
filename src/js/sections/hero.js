import { gsap, SplitText, MQ } from '../core/gsap.js';

/** Интро hero: line-reveal заголовка, проявление фото, затем скролл-параллакс и свет за мышью. */
export function heroIntro() {
  const title = document.querySelector('[data-hero-title]');
  const fades = document.querySelectorAll('[data-hero-fade]');
  const img = document.querySelector('.hero__img');
  const arch = document.querySelector('[data-hero-arch]');

  const split = SplitText.create(title, { type: 'lines', mask: 'lines', linesClass: 'split-line', aria: 'none' });

  const tl = gsap.timeline({ defaults: { ease: 'expo.out' } });
  tl.set(title, { opacity: 1 })
    .from(split.lines, { yPercent: 108, duration: 1.4, stagger: 0.11 })
    .fromTo(img, { scale: 1.28 }, { scale: 1, duration: 2.2, ease: 'expo.out' }, 0)
    .fromTo(arch, { y: 40 }, { y: 0, duration: 1.8 }, 0)
    .to(fades, { opacity: 1, duration: 1.2, stagger: 0.08, ease: 'power2.out' }, 0.45)
    .from(fades, { y: 18, duration: 1.2, stagger: 0.08 }, 0.45)
    .add(() => split.revert()); // чистый DOM после анимации — корректная вёрстка при ресайзе
  return tl;
}

export function heroScroll() {
  const hero = document.querySelector('.hero');
  const img = hero.querySelector('.hero__img');
  const arch = hero.querySelector('[data-hero-arch]');
  const copy = hero.querySelector('.hero__copy');
  const blinds = hero.querySelector('.hero__light .light-blinds');
  const mm = gsap.matchMedia();

  mm.add({ desktop: MQ.desktop, mobile: MQ.mobile, motion: MQ.motion }, (ctx) => {
    const { desktop, motion } = ctx.conditions;
    if (!motion) return;
    const k = desktop ? 1 : 0.5;

    gsap.set(blinds, { rotation: -9 });

    const st = { trigger: hero, start: 'top top', end: 'bottom top', scrub: true };
    // фото: лёгкий зум + параллакс внутри арки
    gsap.to(img, { scale: 1.14, yPercent: 6 * k, ease: 'none', scrollTrigger: st });
    gsap.to(arch, { yPercent: -10 * k, ease: 'none', scrollTrigger: st });
    gsap.to(copy, { yPercent: 14 * k, ease: 'none', scrollTrigger: st });
    // полосы света медленно скользят по стене
    gsap.to(blinds, { yPercent: 12, xPercent: -3, ease: 'none', scrollTrigger: st });

    if (desktop && window.matchMedia(MQ.finePointer).matches) {
      const xTo = gsap.quickTo(blinds, 'x', { duration: 1.6, ease: 'power3' });
      const yTo = gsap.quickTo(blinds, 'y', { duration: 1.6, ease: 'power3' });
      const onMove = (e) => {
        const nx = e.clientX / window.innerWidth - 0.5;
        const ny = e.clientY / window.innerHeight - 0.5;
        xTo(nx * -46); yTo(ny * -28);
      };
      hero.addEventListener('pointermove', onMove);
      return () => hero.removeEventListener('pointermove', onMove);
    }
  });
}
