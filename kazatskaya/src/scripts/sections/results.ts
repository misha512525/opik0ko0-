import { gsap, ScrollTrigger, MQ, scrubWords, drawPath, prepareDraw, EASE, STAGGER } from '@/lib/motion';

export function initResults() {
  const root = document.querySelector<HTMLElement>('#results');
  if (!root) return;
  const manifesto = root.querySelector<HTMLElement>('[data-manifesto]');
  const phone = root.querySelector<HTMLElement>('[data-phone]');
  const list = root.querySelector<HTMLElement>('[data-results-list]');
  const cards = Array.from(root.querySelectorAll<HTMLElement>('[data-rcard]'));
  const marks = cards.map((c) => c.querySelector<SVGElement>('.rcard__mark'));
  const mm = gsap.matchMedia();

  mm.add({ desktop: MQ.desktop, mobile: MQ.mobile }, (ctx) => {
    const desktop = !!ctx.conditions?.desktop;
    if (manifesto) scrubWords(manifesto, { from: '#7f95ba', to: '#f5f9ff' });
    marks.forEach((m) => m && prepareDraw(m.querySelectorAll('path')));

    // Телефон появляется с лёгким «вдохом»
    gsap.from(phone, {
      y: desktop ? 80 : 40,
      rotate: desktop ? -4 : -2,
      opacity: 0,
      duration: 1.2,
      ease: EASE.out,
      scrollTrigger: { trigger: phone, start: 'top 85%', once: true },
    });

    if (desktop) {
      // Карточки скроллятся справа, видео закреплено; при входе каждой — рамка «дышит»
      cards.forEach((card, i) => {
        gsap.from(card, {
          y: 64,
          opacity: 0,
          scale: 0.96,
          duration: 0.9,
          ease: EASE.out,
          delay: (i % 2) * 0.08,
          scrollTrigger: { trigger: card, start: 'top 88%', once: true },
        });
        ScrollTrigger.create({
          trigger: card,
          start: 'top 60%',
          onEnter: () => {
            gsap.fromTo(
              phone,
              { scale: 1 },
              { scale: 1.018, duration: 0.25, ease: 'power2.out', yoyo: true, repeat: 1 },
            );
            if (marks[i]) drawPath(marks[i]!, { duration: 0.9 });
          },
        });
      });
    } else if (list) {
      // Мобила: snap-карусель, центральная карточка подсвечена (scroll-linked), прогресс снизу
      const bar = root.querySelector<HTMLElement>('[data-results-progress]');
      const drawn = new Set<number>();
      gsap.from(cards, {
        x: 48,
        opacity: 0,
        duration: 0.8,
        ease: EASE.out,
        stagger: STAGGER.base,
        scrollTrigger: { trigger: list, start: 'top 88%', once: true },
      });
      let raf = 0;
      const update = () => {
        raf = 0;
        const lr = list.getBoundingClientRect();
        const center = lr.left + lr.width / 2;
        cards.forEach((card, i) => {
          const r = card.getBoundingClientRect();
          const d = Math.min(1, Math.abs(r.left + r.width / 2 - center) / r.width);
          card.style.scale = String(1 - d * 0.08);
          card.style.opacity = String(1 - d * 0.4);
          if (d < 0.3 && !drawn.has(i) && marks[i]) {
            drawn.add(i);
            drawPath(marks[i]!, { duration: 0.8 });
          }
        });
        const max = list.scrollWidth - list.clientWidth;
        if (bar && max > 0) bar.style.transform = `scaleX(${0.12 + (list.scrollLeft / max) * 0.88})`;
      };
      const onScroll = () => {
        if (!raf) raf = requestAnimationFrame(update);
      };
      list.addEventListener('scroll', onScroll, { passive: true });
      ScrollTrigger.create({ trigger: list, start: 'top bottom', once: true, onEnter: update });
      return () => {
        list.removeEventListener('scroll', onScroll);
        cards.forEach((c) => {
          c.style.scale = '';
          c.style.opacity = '';
        });
      };
    }
  });

  // Рекорд: пять «100» выстраиваются (stagger + лёгкий spring)
  const record = root.querySelector<HTMLElement>('[data-record]');
  if (record) {
    mm.add(MQ.desktop + ', ' + MQ.mobile, () => {
      const tl = gsap.timeline({ scrollTrigger: { trigger: record, start: 'top 78%', once: true } });
      tl.from(record.querySelector('.record__year'), {
        yPercent: 30,
        opacity: 0,
        duration: 1.1,
        ease: EASE.out,
      })
        .from(
          record.querySelectorAll('[data-hundred]'),
          { y: 40, x: -24, opacity: 0, scale: 0.94, duration: 0.8, ease: 'back.out(2)', stagger: 0.09 },
          0.15,
        )
        .from(
          record.querySelectorAll('.record__title, .record__text, .record__cta'),
          {
            y: 24,
            opacity: 0,
            duration: 0.8,
            ease: EASE.out,
            stagger: STAGGER.base,
          },
          0.45,
        );
    });
  }
}
