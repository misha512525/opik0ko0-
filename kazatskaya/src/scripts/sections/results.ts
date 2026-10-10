import { gsap, scrubWords, drawPath, prepareDraw, prefersReduced, onceVisible } from '@/lib/motion';

export function initResults() {
  const root = document.querySelector<HTMLElement>('#results');
  if (!root) return;
  const reduce = prefersReduced();

  // Манифест: слова проявляются по мере чтения (единственный scrub-эффект на странице)
  const manifesto = root.querySelector<HTMLElement>('[data-manifesto]');
  if (manifesto && !reduce) scrubWords(manifesto, { from: '#7f95ba', to: '#f5f9ff' });

  // «100» в карточках обводится ручкой, когда карточка видна
  root.querySelectorAll<HTMLElement>('[data-rcard]').forEach((card) => {
    const mark = card.querySelector<SVGElement>('.rcard__mark');
    if (!mark || reduce) return;
    prepareDraw(mark.querySelectorAll('path'));
    onceVisible(card, () => drawPath(mark, { duration: 0.8, delay: 0.25 }), '0px -10% -15% -10%');
  });

  // Мобильная карусель: только полоска прогресса, без анимаций на скролл
  const list = root.querySelector<HTMLElement>('[data-results-list]');
  const bar = root.querySelector<HTMLElement>('[data-results-progress]');
  if (list && bar) {
    let raf = 0;
    list.addEventListener(
      'scroll',
      () => {
        if (raf) return;
        raf = requestAnimationFrame(() => {
          raf = 0;
          const max = list.scrollWidth - list.clientWidth;
          if (max > 0) bar.style.transform = `scaleX(${0.12 + (list.scrollLeft / max) * 0.88})`;
        });
      },
      { passive: true },
    );
  }

  // Рекорд: пять «100» выстраиваются один раз
  const hundreds = root.querySelectorAll('[data-hundred]');
  if (hundreds.length && !reduce) {
    gsap.set(hundreds, { opacity: 0, y: 24 });
    onceVisible(root.querySelector('[data-record]'), () =>
      gsap.to(hundreds, { opacity: 1, y: 0, duration: 0.7, ease: 'back.out(1.8)', stagger: 0.08 }),
    );
  }
}
