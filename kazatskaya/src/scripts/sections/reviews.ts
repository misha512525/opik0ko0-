/** Лента отзывов (когда появятся): нативный свайп со scroll-snap и полоской-индикатором. */
export function initReviews() {
  const track = document.querySelector<HTMLElement>('[data-reel-track]');
  const bar = document.querySelector<HTMLElement>('[data-reel-progress]');
  if (!track || !bar) return;
  track.addEventListener(
    'scroll',
    () => {
      const max = track.scrollWidth - track.clientWidth;
      if (max > 0) bar.style.transform = `scaleX(${0.15 + (track.scrollLeft / max) * 0.85})`;
    },
    { passive: true },
  );
}
