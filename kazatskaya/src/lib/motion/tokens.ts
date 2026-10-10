/**
 * Токены движения. Все секции берут кривые и длительности отсюда.
 * UI-переходы — 180–320 мс, входные reveal — 600–1000 мс, стаггер — 40–90 мс.
 * Ничего не появляется из scale(0): старт с 0.94–0.97 + opacity.
 */
export const EASE = {
  out: 'expo.out', // ≈ cubic-bezier(0.16, 1, 0.3, 1)
  outSoft: 'power3.out', // ≈ cubic-bezier(0.22, 1, 0.36, 1)
  inOut: 'power2.inOut',
  spring: 'back.out(1.6)',
} as const;

export const DUR = {
  press: 0.12,
  ui: 0.24,
  uiSlow: 0.32,
  reveal: 0.9,
  revealShort: 0.7,
  draw: 1.1,
} as const;

export const STAGGER = { tight: 0.04, base: 0.07, loose: 0.09 } as const;

/** Расстояние смещения: на мобиле тише, но не ноль */
export const distance = () => (window.matchMedia('(min-width: 1024px)').matches ? 64 : 32);
