import { gsap, prefersReduced } from './gsap.js';
import { stopScroll, startScroll, scrollToTarget } from './smooth-scroll.js';

const SLATS = 8;

/** Полноэкранное мобильное меню: жалюзи закрываются, ссылки поднимаются. */
export function initMenu() {
  const burger = document.querySelector('.burger');
  const menu = document.getElementById('menu');
  if (!burger || !menu) return;

  const slatsWrap = menu.querySelector('.menu__slats');
  slatsWrap.innerHTML = '<span></span>'.repeat(SLATS);
  const slats = slatsWrap.children;
  const texts = menu.querySelectorAll('.menu__text');
  const nums = menu.querySelectorAll('.menu__num');
  const foot = menu.querySelector('.menu__foot');
  const eyebrow = menu.querySelector('.eyebrow');
  const root = document.documentElement;

  let open = false;
  let tl = null;

  const build = () => {
    const reduce = prefersReduced();
    tl = gsap.timeline({ paused: true, defaults: { ease: 'expo.out' } });
    if (reduce) {
      tl.fromTo(menu, { opacity: 0 }, { opacity: 1, duration: 0.2 });
      gsap.set(slats, { scaleY: 1 });
      return;
    }
    tl.set(menu, { opacity: 1 })
      .fromTo(slats, { scaleY: 0 }, { scaleY: 1, duration: 0.7, stagger: 0.045, ease: 'power3.inOut', transformOrigin: 'top' })
      .fromTo(eyebrow, { opacity: 0 }, { opacity: 1, duration: 0.5 }, '-=0.2')
      .fromTo(texts, { yPercent: 110 }, { yPercent: 0, duration: 0.9, stagger: 0.06 }, '<')
      .fromTo(nums, { opacity: 0 }, { opacity: 1, duration: 0.6, stagger: 0.06 }, '<0.1')
      .fromTo(foot, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.8 }, '<0.2');
  };

  const onKey = (e) => {
    if (e.key === 'Escape') toggle(false);
    if (e.key === 'Tab') {
      // Фокус-ловушка: бургер + элементы меню
      const items = [burger, ...menu.querySelectorAll('a')];
      const i = items.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); items[items.length - 1].focus(); }
      else if (!e.shiftKey && i === items.length - 1) { e.preventDefault(); items[0].focus(); }
    }
  };

  function toggle(state = !open, then) {
    if (state === open) return then?.();
    open = state;
    if (!tl) build();
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');

    if (open) {
      menu.hidden = false;
      root.classList.add('menu-open');
      document.querySelector('[data-header]')?.classList.remove('is-hidden');
      stopScroll();
      tl.timeScale(1).play();
      document.addEventListener('keydown', onKey);
      setTimeout(() => menu.querySelector('.menu__link')?.focus({ preventScroll: true }), 300);
    } else {
      document.removeEventListener('keydown', onKey);
      tl.timeScale(1.6).reverse();
      tl.eventCallback('onReverseComplete', () => {
        menu.hidden = true;
        root.classList.remove('menu-open');
        startScroll();
        then?.();
      });
      if (!then) burger.focus({ preventScroll: true });
    }
  }

  burger.addEventListener('click', () => toggle());

  menu.querySelectorAll('a[href^="#"]').forEach((a) => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const hash = a.getAttribute('href');
      toggle(false, () => scrollToTarget(hash));
    });
  });

  // Закрываем меню при переходе на десктоп
  window.matchMedia('(min-width: 1024px)').addEventListener('change', (e) => {
    if (e.matches && open) toggle(false);
  });
}
