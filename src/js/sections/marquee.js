import { gsap, ScrollTrigger, MQ } from '../core/gsap.js';

/** Бегущая строка: базовая скорость + ускорение/разворот от скорости скролла. */
export function initMarquee() {
  const track = document.querySelector('.marquee__track');
  if (!track) return;
  const row = track.querySelector('.marquee__row');
  track.appendChild(row.cloneNode(true)); // бесшовный цикл

  const mm = gsap.matchMedia();
  mm.add(MQ.motion, () => {
    const loop = gsap.to(track, { xPercent: -50, duration: 38, ease: 'none', repeat: -1 });
    let dir = 1;
    const st = ScrollTrigger.create({
      trigger: '.marquee',
      start: 'top bottom',
      end: 'bottom top',
      onToggle: (self) => (self.isActive ? loop.play() : loop.pause()),
      onUpdate(self) {
        const v = self.getVelocity();
        if (Math.abs(v) < 5) return;
        dir = v > 0 ? 1 : -1;
        const boost = 1 + Math.min(Math.abs(v) / 260, 7);
        gsap.to(loop, {
          timeScale: dir * boost,
          duration: 0.25,
          overwrite: true,
          onComplete: () => gsap.to(loop, { timeScale: dir, duration: 1.2, ease: 'power2.out' }),
        });
      },
    });
    return () => st.kill();
  });
}
