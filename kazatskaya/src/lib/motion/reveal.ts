import { gsap, ScrollTrigger } from './gsap';
import { DUR, EASE, STAGGER, distance } from './tokens';

/**
 * Пакетное появление [data-reveal] при входе во вьюпорт.
 * data-reveal="scale" — вместо сдвига лёгкий scale 0.96 → 1.
 */
export function initReveals(root: ParentNode = document) {
  const items = Array.from(root.querySelectorAll<HTMLElement>('[data-reveal]:not([data-reveal-manual])'));
  if (!items.length) return;
  ScrollTrigger.batch(items, {
    start: 'top 88%',
    once: true,
    onEnter: (batch) => {
      // помечаем сразу: после clearProps CSS-правило скрытия больше не применяется
      batch.forEach((el) => el.setAttribute('data-revealed', ''));
      gsap.fromTo(
        batch,
        { opacity: 0, y: (_i: number, el: HTMLElement) => (el.dataset.reveal === 'scale' ? 0 : distance()) },
        {
          opacity: 1,
          y: 0,
          scale: 1,
          duration: DUR.reveal,
          ease: EASE.out,
          stagger: STAGGER.loose,
          overwrite: true,
          clearProps: 'transform,opacity,willChange',
        },
      );
    },
  });
  gsap.set(
    items.filter((el) => el.dataset.reveal === 'scale'),
    { scale: 0.96 },
  );
}

/** Ручной reveal группы элементов (стаггер), например карточек секции. */
export function reveal(targets: HTMLElement[], trigger: Element, vars: gsap.TweenVars = {}) {
  return gsap.fromTo(
    targets,
    { opacity: 0, y: distance() },
    {
      opacity: 1,
      y: 0,
      scale: 1,
      duration: DUR.reveal,
      ease: EASE.out,
      stagger: STAGGER.base,
      clearProps: 'transform,opacity',
      scrollTrigger: { trigger, start: 'top 82%', once: true },
      onStart: () => targets.forEach((el) => el.setAttribute('data-revealed', '')),
      ...vars,
    },
  );
}
