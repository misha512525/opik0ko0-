import { gsap, prefersReduced, onceVisible } from '@/lib/motion';

/** Три листа КИМов раскладываются веером один раз, когда карточка видна. */
export function initMaterials() {
  const sheets = document.querySelectorAll<HTMLElement>('[data-sheet]');
  if (!sheets.length || prefersReduced()) return;
  // from() сразу собирает листы в стопку, play() раскладывает их к значениям из CSS
  const fan = gsap.from(sheets, {
    '--r': '0deg',
    '--tx': '0px',
    duration: 0.9,
    ease: 'power3.out',
    stagger: 0.06,
    paused: true,
  });
  onceVisible(sheets[0].parentElement, () => fan.play());
}
