import { gsap, prefersReduced } from '@/lib/motion';

/** Интро ≤ 1,2 с, один раз за сессию. Возвращает промис — по нему стартует hero. Пропуск: клик/клавиша. */
export function runPreloader(): Promise<void> {
  const el = document.querySelector<HTMLElement>('[data-preloader]');
  const html = document.documentElement;
  if (
    !el ||
    prefersReduced() ||
    html.classList.contains('intro-seen') ||
    !html.classList.contains('motion-ok')
  ) {
    el?.remove();
    return Promise.resolve();
  }
  try {
    sessionStorage.setItem('ak-intro', '1');
  } catch {
    /* приватный режим */
  }
  return new Promise((resolve) => {
    const tl = gsap.timeline({
      onComplete: () => {
        el.remove();
        resolve();
      },
    });
    tl.to(el.querySelector('[data-pl-line]'), { scaleX: 1, duration: 0.5, ease: 'power2.inOut' })
      // «АК» видно с первого кадра (ранний FCP): лёгкий подъём, затем уходит вверх вместе со шторкой
      .from(
        el.querySelectorAll('[data-pl-letter]'),
        { yPercent: 40, duration: 0.6, ease: 'expo.out', stagger: 0.06 },
        0,
      )
      .to(
        el.querySelectorAll('[data-pl-letter]'),
        { yPercent: -105, duration: 0.45, ease: 'expo.in', stagger: 0.04 },
        0.5,
      )
      .to(el, { clipPath: 'inset(0 0 100% 0)', duration: 0.55, ease: 'expo.inOut' }, 0.68)
      // hero стартует, пока шторка ещё уходит
      .add(() => resolve(), 0.82);
    const skip = () => tl.progress(1);
    window.addEventListener('pointerdown', skip, { once: true });
    window.addEventListener('keydown', skip, { once: true });
  });
}
