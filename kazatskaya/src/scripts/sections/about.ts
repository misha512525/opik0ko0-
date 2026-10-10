import { gsap, prefersReduced, onceVisible } from '@/lib/motion';

/**
 * «Об Анне»: обычный скролл, без пина. На десктопе карта закреплена сбоку;
 * когда остановка доходит до середины экрана, маршрут дорисовывается до её точки (CSS-переход),
 * точки загораются. На мобиле остановки просто появляются по мере чтения.
 */
export function initAbout() {
  const root = document.querySelector<HTMLElement>('#about');
  if (!root) return;
  const stops = Array.from(root.querySelectorAll<HTMLElement>('[data-stop]'));
  const route = root.querySelector<SVGPathElement>('[data-route]');
  const points = Array.from(root.querySelectorAll<SVGGElement>('[data-point]'));

  if (route) {
    const total = route.getTotalLength();
    if (prefersReduced()) {
      points.forEach((p) => p.classList.add('is-on'));
    } else {
      // Длина маршрута до каждой точки — ближайшая точка пути
      const at = points.slice(0, 4).map((g) => {
        const c = g.querySelector('circle')!;
        const cx = Number(c.getAttribute('cx'));
        const cy = Number(c.getAttribute('cy'));
        let best = 0;
        let bestD = Infinity;
        for (let l = 0; l <= total; l += total / 300) {
          const p = route.getPointAtLength(l);
          const d = (p.x - cx) ** 2 + (p.y - cy) ** 2;
          if (d < bestD) [bestD, best] = [d, l];
        }
        return best;
      });
      const L = [...at, total];
      route.style.strokeDasharray = `${total}`;
      route.style.strokeDashoffset = `${total}`;
      const show = (i: number) => {
        route.style.strokeDashoffset = `${total - L[i]}`;
        points.forEach((p, k) => p.classList.toggle('is-on', k <= i));
        stops.forEach((s, k) => s.classList.toggle('is-active', k === i));
      };
      const io = new IntersectionObserver(
        (entries) =>
          entries.forEach((e) => {
            if (e.isIntersecting) show(stops.indexOf(e.target as HTMLElement));
          }),
        { rootMargin: '-45% 0px -45% 0px' },
      );
      stops.forEach((s) => io.observe(s));
      onceVisible(route, () => show(0));
    }
  }

  // 70 / 30: полоса заполняется один раз
  if (!prefersReduced()) {
    const fills = root.querySelectorAll<HTMLElement>('[data-life-fill]');
    gsap.set(fills, { scaleX: 0 });
    onceVisible(root.querySelector('[data-life]'), () =>
      gsap.to(fills, { scaleX: 1, duration: 1.1, ease: 'expo.inOut', stagger: 0.12 }),
    );
  }
}
