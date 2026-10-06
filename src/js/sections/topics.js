import { gsap, ScrollTrigger, MQ, prefersReduced } from '../core/gsap.js';

/** Темы: активная строка по скроллу (и hover на десктопе), смена фона секции и «окна» со светом. */
export function initTopics() {
  const section = document.querySelector('.topics');
  if (!section) return;
  const list = section.querySelector('.topics__list');
  const topics = [...section.querySelectorAll('.topic')];
  const windowArch = section.querySelector('.window__arch');
  const windowBlinds = section.querySelector('.window__light .light-blinds');
  const num = section.querySelector('[data-window-num]');
  const caption = section.querySelector('[data-window-caption]');
  let current = -1;

  const setActive = (i) => {
    if (i === current) return;
    const dir = i > current ? 1 : -1;
    current = i;
    const t = topics[i];
    const reduce = prefersReduced();
    topics.forEach((el, k) => el.classList.toggle('is-active', k === i));
    list.classList.add('has-active');

    gsap.to(section, { backgroundColor: t.dataset.bg, duration: reduce ? 0.2 : 0.9, ease: 'power2.out', overwrite: 'auto' });
    if (!windowArch) return;
    gsap.to(windowArch, { backgroundColor: t.dataset.tint, duration: reduce ? 0.2 : 0.9, ease: 'power2.out', overwrite: 'auto' });
    if (windowBlinds) gsap.to(windowBlinds, { rotation: Number(t.dataset.angle), yPercent: i * 3, duration: reduce ? 0 : 1.2, ease: 'expo.out', overwrite: 'auto' });

    const label = t.querySelector('.topic__name').textContent.trim();
    if (reduce) {
      num.textContent = String(i + 1).padStart(2, '0');
      caption.textContent = label;
      return;
    }
    gsap.timeline({ overwrite: true })
      .to([num, caption], { yPercent: -40 * dir, opacity: 0, duration: 0.25, ease: 'power2.in' })
      .add(() => {
        num.textContent = String(i + 1).padStart(2, '0');
        caption.textContent = label;
      })
      .fromTo([num, caption], { yPercent: 40 * dir }, { yPercent: 0, opacity: 1, duration: 0.6, ease: 'expo.out' });
  };

  topics.forEach((t, i) => {
    ScrollTrigger.create({
      trigger: t,
      start: 'top 58%',
      end: 'bottom 58%',
      onToggle: (self) => self.isActive && setActive(i),
    });
  });

  if (window.matchMedia(MQ.finePointer).matches) {
    topics.forEach((t, i) => t.addEventListener('pointerenter', () => setActive(i)));
  }

  // Появление строк
  const mm = gsap.matchMedia();
  mm.add(MQ.motion, () => {
    topics.forEach((t) => {
      gsap.from(t.querySelector('.topic__name'), {
        yPercent: 40, opacity: 0, duration: 1.2,
        scrollTrigger: { trigger: t, start: 'top 88%', once: true },
      });
    });
    const sticky = section.querySelector('.window');
    if (sticky) {
      gsap.from(sticky, {
        clipPath: 'inset(100% 0% 0% 0%)', duration: 1.6, ease: 'expo.inOut',
        scrollTrigger: { trigger: sticky, start: 'top 85%', once: true },
      });
    }
  });
}
