import { gsap, MQ, splitLines, drawPath, prepareDraw, EASE, DUR, STAGGER } from '@/lib/motion';

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
  const fades = root.querySelectorAll<HTMLElement>('[data-hero-fade], .hero__avatar');
  const arch = root.querySelector<HTMLElement>('[data-hero-arch]');
  const photo = root.querySelector<HTMLElement>('[data-hero-photo]');
  const stickers = root.querySelectorAll<HTMLElement>('.sticker, .hero__task');
  gsap.set(fades, { opacity: 0, y: 24 });
  // фото видно с первого кадра (LCP), арка «распахивается» из суженного окна
  gsap.set(arch, { clipPath: 'inset(12% 14% 0% 14% round 999px 999px 32px 32px)' });
  gsap.set(photo, { scale: 1.12 });
  gsap.set(stickers, { opacity: 0, y: 16, scale: 0.96 });
  title.style.visibility = 'visible';
  return { root, title, lines, grade, fades, arch, photo, stickers };
}

export function heroIntro(p: NonNullable<ReturnType<typeof heroPrepare>>) {
  const tl = gsap.timeline({ defaults: { ease: EASE.out } });
  tl.add(() => {
    p.lines.anim()?.play();
  }, 0)
    .to(
      p.arch,
      { clipPath: 'inset(0% 0% 0% 0% round 999px 999px 32px 32px)', duration: 1.2, ease: 'expo.inOut' },
      0.05,
    )
    .to(p.photo, { scale: 1, duration: 1.6, ease: EASE.out }, 0.15)
    .to(p.fades, { opacity: 1, y: 0, duration: DUR.revealShort, stagger: STAGGER.loose }, 0.35)
    .to(p.stickers, { opacity: 1, y: 0, scale: 1, duration: 0.7, ease: EASE.spring, stagger: 0.12 }, 0.8)
    .add(drawPath(p.grade, { duration: 0.9, each: 0.22 }), 0.75);
  return tl;
}

/** Параллакс фото, стикеров, букв и aurora-блобов по скроллу (разные скорости). */
export function heroScroll() {
  const root = document.querySelector<HTMLElement>('[data-hero]');
  if (!root) return;
  const mm = gsap.matchMedia();
  mm.add({ desktop: MQ.desktop, mobile: MQ.mobile }, (ctx) => {
    const k = ctx.conditions?.desktop ? 1 : 0.5;
    const st = { trigger: root, start: 'top top', end: 'bottom top', scrub: true };
    gsap.to(root.querySelector('[data-hero-photo]'), { yPercent: 8 * k, ease: 'none', scrollTrigger: st });
    root.querySelectorAll<HTMLElement>('[data-speed]').forEach((el) => {
      gsap.to(el, {
        y: () => Number(el.dataset.speed) * window.innerHeight * 0.01 * k * 2,
        ease: 'none',
        scrollTrigger: st,
      });
    });
    gsap.to(root.querySelector('.hero__text'), { y: -40 * k, ease: 'none', scrollTrigger: st });
  });
}
