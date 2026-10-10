import { gsap, ScrollTrigger, isFinePointer, prefersReduced } from '@/lib/motion';

/**
 * Карточки [data-card]:
 *  — мышь: 3D-наклон до 4° и световое пятно под курсором;
 *  — тач: подсветка границы, когда карточка в центре экрана (scroll-linked), и ripple-свечение от точки касания.
 */
export function initCards(root: ParentNode = document) {
  const cards = Array.from(root.querySelectorAll<HTMLElement>('[data-card]'));
  if (!cards.length || prefersReduced()) return;

  if (isFinePointer()) {
    cards.forEach((card) => {
      const rx = gsap.quickTo(card, 'rotationX', { duration: 0.6, ease: 'power3.out' });
      const ry = gsap.quickTo(card, 'rotationY', { duration: 0.6, ease: 'power3.out' });
      gsap.set(card, { transformPerspective: 900 });
      card.addEventListener('pointermove', (e) => {
        if (e.pointerType !== 'mouse') return;
        const r = card.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width;
        const py = (e.clientY - r.top) / r.height;
        card.style.setProperty('--mx', `${px * 100}%`);
        card.style.setProperty('--my', `${py * 100}%`);
        if (card.dataset.card !== 'flat') {
          rx((0.5 - py) * 6);
          ry((px - 0.5) * 8);
        }
      });
      card.addEventListener('pointerleave', () => {
        rx(0);
        ry(0);
      });
    });
    return;
  }

  cards.forEach((card) => {
    ScrollTrigger.create({
      trigger: card,
      start: 'top 62%',
      end: 'bottom 38%',
      toggleClass: { targets: card, className: 'is-center' },
    });
    card.addEventListener('pointerdown', (e) => {
      const r = card.getBoundingClientRect();
      const dot = document.createElement('span');
      dot.className = 'ripple';
      dot.style.left = `${e.clientX - r.left}px`;
      dot.style.top = `${e.clientY - r.top}px`;
      card.appendChild(dot);
      gsap.fromTo(
        dot,
        { scale: 0.2, opacity: 0.55 },
        { scale: 1, opacity: 0, duration: 0.7, ease: 'power2.out', onComplete: () => dot.remove() },
      );
    });
  });
}
