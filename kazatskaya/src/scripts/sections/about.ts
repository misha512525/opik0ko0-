import { gsap, ScrollTrigger, MQ, EASE } from '@/lib/motion';

/**
 * «Об Анне».
 * Десктоп: pin + scrub — маршрут рисуется по карте, точки подсвечиваются, панели-остановки сменяются.
 * Мобила: без пина (он страдает от адресной строки) — sticky-стопка карточек, предыдущая
 * карточка уходит назад (scale/opacity) по скроллу. Та же драматургия, нативная плавность.
 */
export function initAbout() {
  const root = document.querySelector<HTMLElement>('#about');
  if (!root) return;
  const stops = Array.from(root.querySelectorAll<HTMLElement>('[data-stop]'));
  const route = root.querySelector<SVGPathElement>('[data-route]');
  const points = Array.from(root.querySelectorAll<SVGGElement>('[data-point]'));
  const pin = root.querySelector<HTMLElement>('[data-about-pin]');
  const mm = gsap.matchMedia();

  mm.add(MQ.desktop, () => {
    if (!route || !pin) return;
    const total = route.getTotalLength();
    // Длина маршрута до каждой точки — ищем ближайшую точку пути
    const at = points.slice(0, 4).map((g) => {
      const c = g.querySelector('circle')!;
      const cx = Number(c.getAttribute('cx'));
      const cy = Number(c.getAttribute('cy'));
      let best = 0;
      let bestD = Infinity;
      for (let l = 0; l <= total; l += total / 400) {
        const p = route.getPointAtLength(l);
        const d = (p.x - cx) ** 2 + (p.y - cy) ** 2;
        if (d < bestD) {
          bestD = d;
          best = l;
        }
      }
      return best;
    });
    const L = [...at, total];
    route.style.strokeDasharray = `${total}`;
    route.style.strokeDashoffset = `${total - L[0]}`;
    let active = -1;

    const show = (i: number) => {
      if (i === active) return;
      const prev = stops[active];
      const dir = i > active ? 1 : -1;
      active = i;
      points.forEach((p, k) => p.classList.toggle('is-on', k <= i));
      if (prev)
        gsap.to(prev, { autoAlpha: 0, y: -24 * dir, duration: 0.35, ease: 'power2.in', overwrite: true });
      gsap.fromTo(
        stops[i],
        { autoAlpha: 0, y: 32 * dir },
        { autoAlpha: 1, y: 0, duration: 0.7, ease: EASE.out, delay: prev ? 0.12 : 0, overwrite: true },
      );
    };
    show(0);

    const st = ScrollTrigger.create({
      trigger: pin,
      start: 'top top',
      end: () => `+=${window.innerHeight * 3}`,
      pin: true,
      scrub: true,
      anticipatePin: 1,
      onUpdate: (self) => {
        const s = self.progress * (stops.length - 1);
        const k = Math.min(Math.floor(s), stops.length - 2);
        const f = gsap.parseEase('power1.inOut')(s - k);
        const len = L[k] + (L[k + 1] - L[k]) * f;
        route.style.strokeDashoffset = `${total - len}`;
        show(Math.min(stops.length - 1, Math.round(s)));
      },
    });
    return () => {
      st.kill();
      route.style.strokeDasharray = '';
      route.style.strokeDashoffset = '';
      gsap.set(stops, { clearProps: 'all' });
      points.forEach((p) => p.classList.remove('is-on'));
    };
  });

  mm.add(MQ.mobile, () => {
    stops.forEach((card, i) => {
      gsap.from(card, {
        y: 40,
        opacity: 0,
        duration: 0.8,
        ease: EASE.out,
        scrollTrigger: { trigger: card, start: 'top 90%', once: true },
      });
      const next = stops[i + 1];
      if (!next) return;
      gsap.to(card, {
        scale: 0.94,
        opacity: 0.55,
        ease: 'none',
        scrollTrigger: { trigger: next, start: 'top 85%', end: 'top 30%', scrub: true },
      });
    });
  });

  mm.add(MQ.reduce, () => {
    points.forEach((p) => p.classList.add('is-on'));
  });

  // 70 / 30: полоса заполняется слева направо
  const fills = root.querySelectorAll<HTMLElement>('[data-life-fill]');
  const labels = root.querySelectorAll<HTMLElement>('.life__value, .life__label');
  mm.add(`${MQ.desktop}, ${MQ.mobile}`, () => {
    const tl = gsap.timeline({
      scrollTrigger: { trigger: root.querySelector('[data-life]'), start: 'top 75%', once: true },
    });
    tl.from(root.querySelector('.life__quote'), { y: 32, opacity: 0, duration: 0.9, ease: EASE.out })
      .from(fills, { scaleX: 0, duration: 1.1, ease: 'expo.inOut', stagger: 0.14 }, 0.2)
      .from(labels, { y: 10, opacity: 0, duration: 0.6, ease: EASE.out, stagger: 0.05 }, 0.6);
  });
}
