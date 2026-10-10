import { gsap, splitLines, drawPath, prepareDraw, EASE, DUR, STAGGER } from '@/lib/motion';

/** «Оценка на полях» встаёт справа от строки со словом «сто» — на любой ширине и после пересборки строк. */
function placeGrade(title: HTMLElement, grade: SVGElement | null) {
  // SplitText может клонировать <em> по строкам — берём видимый
  const em = Array.from(title.querySelectorAll('em')).find((e) => e.getBoundingClientRect().width > 0);
  if (!grade || !em) return;
  const wrap = title.parentElement!.getBoundingClientRect();
  const line = em.closest<HTMLElement>('.split-line');
  // Реальная ширина текста строки (блок строки растянут на всю ширину)
  const range = document.createRange();
  range.selectNodeContents(line ?? em);
  const r = range.getBoundingClientRect();
  // если строку ещё прячет маска (yPercent), компенсируем сдвиг
  const shift = line ? ((gsap.getProperty(line, 'yPercent') as number) / 100) * line.offsetHeight : 0;
  grade.style.setProperty('--gx', `${r.right - wrap.left}px`);
  grade.style.setProperty('--gy', `${r.top - wrap.top - shift + r.height / 2}px`);
}

/** Подготовка состояний до интро (чтобы не было вспышки контента). */
export function heroPrepare() {
  const root = document.querySelector<HTMLElement>('[data-hero]');
  if (!root) return null;
  const title = root.querySelector<HTMLElement>('[data-hero-title]')!;
  const grade = root.querySelector<SVGElement>('[data-hero-grade]');
  if (grade) prepareDraw(grade.querySelectorAll('path'));
  const lines = splitLines(title, { paused: true });
  placeGrade(title, grade);
  new ResizeObserver(() => placeGrade(title, grade)).observe(title);
  document.fonts?.ready.then(() => requestAnimationFrame(() => placeGrade(title, grade)));
  const fades = root.querySelectorAll<HTMLElement>('[data-hero-fade], .hero__avatar, .hero__caption');
  const photo = root.querySelector<HTMLElement>('[data-hero-photo]');
  gsap.set(fades, { opacity: 0, y: 16 });
  // фото видно с первого кадра (LCP) — только мягко «садится» из лёгкого увеличения
  gsap.set(photo, { scale: 1.06 });
  title.style.visibility = 'visible';
  return { root, title, lines, grade, fades, photo };
}

/** Одно спокойное интро: строки заголовка, текст, фото, затем ручка обводит «100». */
export function heroIntro(p: NonNullable<ReturnType<typeof heroPrepare>>) {
  const tl = gsap.timeline({ defaults: { ease: EASE.out } });
  tl.add(() => {
    p.lines.anim()?.play();
  }, 0)
    .to(p.photo, { scale: 1, duration: 1.4, ease: 'power3.out' }, 0)
    .to(p.fades, { opacity: 1, y: 0, duration: DUR.revealShort, stagger: STAGGER.base }, 0.3)
    .add(drawPath(p.grade, { duration: 0.8, each: 0.2 }), 0.7);
  return tl;
}
