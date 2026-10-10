import { gsap } from './gsap';
import { DUR } from './tokens';

/** Готовит SVG-path к «рисованию пером»: прячет штрих через stroke-dashoffset. */
export function prepareDraw(paths: Iterable<SVGGeometryElement>) {
  for (const p of paths) {
    const len = Math.ceil(p.getTotalLength()) + 2;
    p.style.strokeDasharray = `${len}`;
    p.style.strokeDashoffset = `${len}`;
  }
}

/** Рисует пути по очереди — как рука ведёт ручку. */
export function drawPath(
  target: Element | null,
  vars: gsap.TweenVars & { each?: number } = {},
): gsap.core.Timeline {
  const tl = gsap.timeline();
  if (!target) return tl;
  const paths = Array.from(
    target.querySelectorAll<SVGGeometryElement>('path, circle, ellipse, line, polyline'),
  );
  prepareDraw(paths);
  const { each = 0.12, duration = DUR.draw, ...rest } = vars;
  paths.forEach((p, i) => {
    const len = Number(p.style.strokeDasharray);
    tl.to(
      p,
      {
        strokeDashoffset: 0,
        duration: (duration as number) * Math.min(1, 0.35 + len / 400),
        ease: 'power2.inOut',
        ...rest,
      },
      i * each,
    );
  });
  return tl;
}
