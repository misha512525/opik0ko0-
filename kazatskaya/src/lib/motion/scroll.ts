import { prefersReduced } from './gsap';

/**
 * Скролл — нативный: без перехвата колеса и тача (никакого «желе» и рассинхрона на iOS/Android).
 * Отступ под фиксированную навигацию задаёт CSS (scroll-padding-top).
 */
export function scrollToTarget(target: HTMLElement | string) {
  const el = typeof target === 'string' ? document.querySelector<HTMLElement>(target) : target;
  el?.scrollIntoView({ behavior: prefersReduced() ? 'auto' : 'smooth', block: 'start' });
}

export function initAnchorLinks() {
  document.addEventListener('click', (e) => {
    const a = (e.target as Element).closest<HTMLAnchorElement>('a[href^="#"]');
    if (!a) return;
    const hash = a.getAttribute('href')!;
    if (hash === '#') return;
    e.preventDefault();
    if (hash === '#top') {
      window.scrollTo({ top: 0, behavior: prefersReduced() ? 'auto' : 'smooth' });
      history.replaceState(null, '', location.pathname);
      return;
    }
    const el = document.querySelector<HTMLElement>(hash);
    if (!el) return;
    scrollToTarget(el);
    history.replaceState(null, '', hash);
    // Фокус для клавиатуры и скринридеров — без прыжка
    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
    el.focus({ preventScroll: true });
  });
}
