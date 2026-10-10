/**
 * Появление [data-reveal] при входе во вьюпорт.
 * IntersectionObserver + CSS-переход (не скролл-триггеры): работает сразу с загрузки,
 * не оставляет пустых мест при быстром скролле, не зависит от пересчёта позиций.
 * Соседние элементы, вошедшие одновременно, получают задержку по очереди (стаггер 70 мс).
 */
export function initReveals(root: ParentNode = document) {
  const items = Array.from(root.querySelectorAll<HTMLElement>('[data-reveal]:not(.is-in)'));
  if (!items.length) return;
  const io = new IntersectionObserver(
    (entries) => {
      const entering = entries.filter((e) => e.isIntersecting).map((e) => e.target as HTMLElement);
      entering.forEach((el, i) => {
        el.style.transitionDelay = `${Math.min(i, 4) * 70}ms`;
        el.classList.add('is-in');
        io.unobserve(el);
      });
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.01 },
  );
  items.forEach((el) => io.observe(el));
}

/** Вызвать колбэк один раз, когда элемент войдёт во вьюпорт. */
export function onceVisible(el: Element | null, cb: () => void, rootMargin = '0px 0px -12% 0px') {
  if (!el) return;
  const io = new IntersectionObserver(
    ([entry]) => {
      if (!entry.isIntersecting) return;
      io.disconnect();
      cb();
    },
    { rootMargin },
  );
  io.observe(el);
}
