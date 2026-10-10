import { gsap, prefersReduced, EASE, STAGGER } from '@/lib/motion';

/** Segmented control «Ученикам / Учителям»: пилюля переезжает, карточки меняются crossfade + stagger. */
export function initServices() {
  const root = document.querySelector<HTMLElement>('[data-services]');
  if (!root) return;
  const tabs = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-seg-tab]'));
  const panels = Array.from(root.querySelectorAll<HTMLElement>('[data-panel]'));
  const seg = root.querySelector<HTMLElement>('.seg');
  let current = 0;

  const select = (i: number, focus = false) => {
    if (i === current) return;
    const from = panels[current];
    const to = panels[i];
    current = i;
    seg?.style.setProperty('--seg', String(i));
    tabs.forEach((t, k) => {
      t.setAttribute('aria-selected', String(k === i));
      t.tabIndex = k === i ? 0 : -1;
    });
    if (focus) tabs[i].focus();
    from.inert = true;
    to.inert = false;
    if (prefersReduced()) {
      from.classList.remove('is-active');
      to.classList.add('is-active');
      return;
    }
    const fromCards = from.querySelectorAll('[data-svc]');
    const toCards = to.querySelectorAll('[data-svc]');
    gsap.killTweensOf([fromCards, toCards]);
    gsap.to(fromCards, {
      opacity: 0,
      y: -12,
      duration: 0.2,
      ease: 'power2.in',
      stagger: 0.03,
      onComplete: () => {
        from.classList.remove('is-active');
        gsap.set(fromCards, { clearProps: 'opacity,transform' });
      },
    });
    to.classList.add('is-active');
    gsap.fromTo(
      toCards,
      { opacity: 0, y: 24, scale: 0.98 },
      {
        opacity: 1,
        y: 0,
        scale: 1,
        duration: 0.6,
        ease: EASE.out,
        stagger: STAGGER.base,
        delay: 0.12,
        clearProps: 'transform',
      },
    );
  };

  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => select(i));
    tab.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        select((i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length, true);
      }
    });
  });
}
