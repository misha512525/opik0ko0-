import { gsap, ScrollTrigger, getLenis, prefersReduced, EASE, DUR, STAGGER } from '@/lib/motion';

/** Пилюля-навигация: тень после скролла, прогресс страницы, индикатор активной секции. */
export function initNav() {
  const nav = document.querySelector<HTMLElement>('[data-nav]');
  if (!nav) return;

  ScrollTrigger.create({
    start: 24,
    end: 'max',
    onToggle: (self) => nav.classList.toggle('is-scrolled', self.isActive),
  });

  const bar = document.querySelector<HTMLElement>('[data-progress]');
  if (bar) {
    const setX = gsap.quickSetter(bar, 'scaleX');
    ScrollTrigger.create({ start: 0, end: 'max', onUpdate: (s) => setX(s.progress) });
  }

  const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('[data-nav-link]'));
  const indicator = document.querySelector<HTMLElement>('[data-nav-indicator]');
  const navList = indicator?.parentElement;
  const moveTo = (a: HTMLAnchorElement | null) => {
    links.forEach((l) => l.classList.toggle('is-active', l === a));
    links.forEach((l) =>
      l === a ? l.setAttribute('aria-current', 'true') : l.removeAttribute('aria-current'),
    );
    if (!indicator || !navList) return;
    if (!a) {
      indicator.style.setProperty('--o', '0');
      return;
    }
    const lr = a.getBoundingClientRect();
    const pr = navList.getBoundingClientRect();
    indicator.style.setProperty('--x', `${lr.left - pr.left + 14}px`);
    indicator.style.setProperty('--s', String((lr.width - 28) / 100));
    indicator.style.setProperty('--o', '1');
  };
  links.forEach((a) => {
    const section = document.querySelector(a.getAttribute('href')!);
    if (!section) return;
    ScrollTrigger.create({
      trigger: section,
      start: 'top 50%',
      end: 'bottom 50%',
      onToggle: (self) => {
        if (self.isActive) moveTo(a);
        else if (links.every((l) => l === a || !l.classList.contains('is-active'))) moveTo(null);
      },
    });
  });
}

/** Полноэкранное меню-шторка: stagger пунктов, blur-фон, закрытие тапом, свайпом вверх и Esc. */
export function initMenu() {
  const toggle = document.querySelector<HTMLButtonElement>('[data-menu-toggle]');
  const menu = document.querySelector<HTMLElement>('[data-menu]');
  if (!toggle || !menu) return;
  const sheet = menu.querySelector<HTMLElement>('.menu__sheet')!;
  const backdrop = menu.querySelector<HTMLElement>('.menu__backdrop')!;
  const items = menu.querySelectorAll<HTMLElement>('.menu__item');
  const main = document.getElementById('main');
  const footer = document.querySelector('footer');
  let open = false;
  let tl: gsap.core.Timeline | null = null;
  const reduce = prefersReduced();

  const setOpen = (next: boolean, focusBack = true) => {
    if (next === open) return;
    open = next;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
    tl?.kill();
    if (open) {
      menu.hidden = false;
      getLenis()?.stop();
      document.documentElement.style.overflow = 'hidden';
      main?.setAttribute('inert', '');
      footer?.setAttribute('inert', '');
      tl = gsap.timeline();
      if (reduce) {
        tl.fromTo([backdrop, sheet], { opacity: 0 }, { opacity: 1, duration: 0.2 });
      } else {
        tl.fromTo(backdrop, { opacity: 0 }, { opacity: 1, duration: DUR.uiSlow, ease: 'power2.out' })
          .fromTo(sheet, { yPercent: -100 }, { yPercent: 0, duration: 0.6, ease: EASE.out }, 0)
          .fromTo(
            items,
            { y: -24, opacity: 0 },
            { y: 0, opacity: 1, duration: 0.6, ease: EASE.out, stagger: STAGGER.base },
            0.12,
          );
      }
      menu.querySelector<HTMLElement>('[data-menu-link]')?.focus({ preventScroll: true });
    } else {
      tl = gsap.timeline({
        onComplete: () => {
          menu.hidden = true;
          gsap.set([sheet, backdrop, items], { clearProps: 'all' });
        },
      });
      tl.to(sheet, { yPercent: -100, duration: reduce ? 0.01 : 0.42, ease: 'power3.in' }).to(
        backdrop,
        { opacity: 0, duration: 0.3 },
        0.1,
      );
      getLenis()?.start();
      document.documentElement.style.overflow = '';
      main?.removeAttribute('inert');
      footer?.removeAttribute('inert');
      if (focusBack) toggle.focus({ preventScroll: true });
    }
  };

  toggle.addEventListener('click', () => setOpen(!open));
  backdrop.addEventListener('click', () => setOpen(false));
  menu
    .querySelectorAll('[data-menu-link], .menu__foot a')
    .forEach((a) => a.addEventListener('click', () => setOpen(false, false)));
  document.addEventListener('keydown', (e) => {
    if (!open) return;
    if (e.key === 'Escape') setOpen(false);
    if (e.key === 'Tab') {
      // Фокус не уходит за пределы меню (кнопка-бургер + шторка)
      const focusables = [toggle, ...sheet.querySelectorAll<HTMLElement>('a, button')];
      const i = focusables.indexOf(document.activeElement as HTMLElement);
      const nextI = e.shiftKey ? (i <= 0 ? focusables.length - 1 : i - 1) : (i + 1) % focusables.length;
      e.preventDefault();
      focusables[nextI].focus();
    }
  });
  // Свайп вверх по шторке — закрыть (шторка следует за пальцем)
  let startY = 0;
  let dy = 0;
  let tracking = false;
  sheet.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;
    startY = e.clientY;
    dy = 0;
    tracking = sheet.scrollTop <= 0;
  });
  sheet.addEventListener('pointermove', (e) => {
    if (!tracking) return;
    dy = Math.min(0, e.clientY - startY);
    gsap.set(sheet, { y: dy * 0.9 });
  });
  const end = () => {
    if (!tracking) return;
    tracking = false;
    if (dy < -70) {
      gsap.set(sheet, { y: 0, yPercent: dy / (sheet.offsetHeight / 100) });
      setOpen(false, false);
    } else gsap.to(sheet, { y: 0, duration: DUR.uiSlow, ease: EASE.outSoft });
  };
  sheet.addEventListener('pointerup', end);
  sheet.addEventListener('pointercancel', end);
  window
    .matchMedia('(min-width: 1024px)')
    .addEventListener('change', (m) => m.matches && setOpen(false, false));
}
