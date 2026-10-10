/** Яндекс.Метрика: цели. Если PUBLIC_YM_ID не задан — всё молча ничего не делает. */
const sent = new Set<string>();

export function goal(name: string, once = true) {
  if (once && sent.has(name)) return;
  sent.add(name);
  const id = (window as unknown as { __ymId?: number }).__ymId;
  if (id && window.ym) window.ym(id, 'reachGoal', name);
}

export function initAnalytics() {
  document.addEventListener('click', (e) => {
    const el = (e.target as Element).closest<HTMLElement>('[data-goal], a[href*="t.me/"]');
    if (!el) return;
    goal(el.dataset.goal ?? 'tg_click', false);
    if (el.matches('a[href*="t.me/"]')) goal('tg_click', false);
  });
  const onScroll = () => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    if (max > 0 && window.scrollY / max >= 0.75) {
      goal('scroll_75');
      window.removeEventListener('scroll', onScroll);
    }
  };
  window.addEventListener('scroll', onScroll, { passive: true });
}
