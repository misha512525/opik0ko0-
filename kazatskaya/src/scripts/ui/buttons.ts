import { isFinePointer, magnetic, prefersReduced } from '@/lib/motion';

/** Магнит (мышь), блик раз в ~6 с (тач), «перелёт» стрелки при нажатии. */
export function initButtons() {
  const reduce = prefersReduced();
  if (isFinePointer() && !reduce) {
    document.querySelectorAll<HTMLElement>('[data-magnetic]').forEach((el) => magnetic(el));
  }

  document.addEventListener('pointerdown', (e) => {
    const btn = (e.target as Element).closest<HTMLElement>('.btn');
    if (!btn || reduce) return;
    btn.classList.add('is-launch');
    window.setTimeout(() => btn.classList.remove('is-launch'), 520);
  });

  if (!isFinePointer() && !reduce) {
    const shines = Array.from(document.querySelectorAll<HTMLElement>('.js-shine'));
    const io = new IntersectionObserver((entries) =>
      entries.forEach((en) => en.target.toggleAttribute('data-visible', en.isIntersecting)),
    );
    shines.forEach((b) => io.observe(b));
    window.setInterval(() => {
      shines
        .filter((b) => b.hasAttribute('data-visible'))
        .forEach((b) => {
          b.classList.add('is-shine');
          window.setTimeout(() => b.classList.remove('is-shine'), 950);
        });
    }, 6000);
  }
}
