import { ScrollTrigger } from '@/lib/motion';

/** Аккордеон: aria-expanded, высота анимируется через grid-template-rows (без дёрганий и замеров). */
export function initFaq() {
  document.querySelectorAll<HTMLButtonElement>('[data-qa-btn]').forEach((btn) => {
    const panel = document.getElementById(btn.getAttribute('aria-controls')!);
    if (!panel) return;
    panel.inert = true;
    btn.addEventListener('click', () => {
      const open = btn.getAttribute('aria-expanded') !== 'true';
      btn.setAttribute('aria-expanded', String(open));
      panel.classList.toggle('is-open', open);
      panel.inert = !open;
    });
    // Высота страницы изменилась — пересчитываем триггеры ниже
    panel.addEventListener('transitionend', (e) => {
      if (e.propertyName === 'grid-template-rows') ScrollTrigger.refresh();
    });
  });
}
