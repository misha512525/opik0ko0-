import { ScrollTrigger } from './gsap.js';

/** Прячется при скролле вниз, появляется вверх; меняет цвет над тёмными секциями; подсвечивает активный пункт. */
export function initHeader() {
  const header = document.querySelector('[data-header]');
  if (!header) return;

  let hidden = false;
  ScrollTrigger.create({
    start: 0,
    end: 'max',
    onUpdate(self) {
      const y = self.scroll();
      header.classList.toggle('is-scrolled', y > 24);
      if (document.documentElement.classList.contains('menu-open')) return;
      const shouldHide = self.direction === 1 && y > window.innerHeight * 0.4;
      if (shouldHide !== hidden) {
        hidden = shouldHide;
        header.classList.toggle('is-hidden', hidden);
      }
    },
  });

  // Тёмные секции
  const active = new Set();
  const offset = () => header.offsetHeight / 2;
  document.querySelectorAll('[data-theme="dark"]').forEach((section) => {
    ScrollTrigger.create({
      trigger: section,
      start: () => `top top+=${offset()}`,
      end: () => `bottom top+=${offset()}`,
      onToggle(self) {
        self.isActive ? active.add(section) : active.delete(section);
        header.classList.toggle('is-dark', active.size > 0);
      },
    });
  });

  // Активный пункт навигации
  const links = [...document.querySelectorAll('.nav__link')];
  links.forEach((link) => {
    const section = document.querySelector(link.getAttribute('href'));
    if (!section) return;
    ScrollTrigger.create({
      trigger: section,
      start: 'top 50%',
      end: 'bottom 50%',
      onToggle(self) {
        link.classList.toggle('is-active', self.isActive);
        if (self.isActive) link.setAttribute('aria-current', 'true');
        else link.removeAttribute('aria-current');
      },
    });
  });
}
