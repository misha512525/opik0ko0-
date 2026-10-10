import { gsap, MQ, EASE, drawPath, prepareDraw } from '@/lib/motion';

/** КИМы раскрываются веером по скроллу; пункты бесплатного — с рукописными галочками. */
export function initMaterials() {
  const sheets = document.querySelectorAll<HTMLElement>('[data-sheet]');
  const items = document.querySelectorAll<HTMLElement>('[data-free-item]');
  const mm = gsap.matchMedia();
  mm.add(`${MQ.desktop}, ${MQ.mobile}`, () => {
    if (sheets.length) {
      gsap.from(sheets, {
        '--r': '0deg',
        '--tx': '0px',
        y: 40,
        ease: 'none',
        scrollTrigger: { trigger: sheets[0].parentElement, start: 'top 90%', end: 'top 45%', scrub: 0.6 },
      });
    }
    items.forEach((item, i) => {
      const check = item.querySelector('svg');
      if (check) prepareDraw(check.querySelectorAll('path'));
      const tl = gsap.timeline({
        scrollTrigger: { trigger: item, start: 'top 90%', once: true },
        delay: i * 0.05,
      });
      tl.from(item.querySelector('span'), { x: 16, opacity: 0, duration: 0.7, ease: EASE.out }).add(
        drawPath(check, { duration: 0.5 }),
        0.1,
      );
    });
  });
}
