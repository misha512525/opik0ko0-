import { gsap, MQ, EASE } from '@/lib/motion';

/**
 * Лента отзывов: на десктопе — горизонтальный scrub с пином (если карточек больше, чем помещается),
 * на мобиле — нативный свайп со scroll-snap и полоской-индикатором.
 */
export function initReviews() {
  const reel = document.querySelector<HTMLElement>('[data-reel]');
  const channel = document.querySelector<HTMLElement>('.channel');
  const mm = gsap.matchMedia();

  if (channel) {
    mm.add(`${MQ.desktop}, ${MQ.mobile}`, () => {
      const tl = gsap.timeline({ scrollTrigger: { trigger: channel, start: 'top 80%', once: true } });
      tl.from(channel, { y: 48, scale: 0.97, opacity: 0, duration: 1, ease: EASE.out }).from(
        channel.querySelectorAll('.bubble'),
        {
          x: (i: number) => (i % 3 === 1 || i === 4 ? 24 : -24),
          opacity: 0,
          duration: 0.6,
          ease: EASE.out,
          stagger: 0.08,
        },
        0.3,
      );
    });
  }

  if (!reel) return;
  const track = reel.querySelector<HTMLElement>('[data-reel-track]')!;
  const bar = reel.querySelector<HTMLElement>('[data-reel-progress]');

  mm.add(MQ.desktop, () => {
    const distance = () => track.scrollWidth - track.clientWidth;
    if (distance() < 80) return;
    track.style.overflow = 'visible';
    const tween = gsap.to(track, {
      x: () => -distance(),
      ease: 'none',
      scrollTrigger: {
        trigger: reel,
        start: 'center center',
        end: () => `+=${distance()}`,
        pin: true,
        scrub: 0.6,
        invalidateOnRefresh: true,
        onUpdate: (s) => bar && (bar.style.transform = `scaleX(${0.15 + s.progress * 0.85})`),
      },
    });
    return () => {
      tween.scrollTrigger?.kill();
      tween.kill();
      track.style.overflow = '';
      gsap.set(track, { clearProps: 'transform' });
    };
  });

  const onScroll = () => {
    const max = track.scrollWidth - track.clientWidth;
    if (bar && max > 0) bar.style.transform = `scaleX(${0.15 + (track.scrollLeft / max) * 0.85})`;
  };
  track.addEventListener('scroll', onScroll, { passive: true });
}
