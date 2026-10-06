import { gsap, SplitText, MQ } from '../core/gsap.js';

/**
 * «Перезагрузка»: pin + текст проявляется по словам (0.15 → 1, scrub),
 * ключевые слова подсвечиваются; затем слово «Перезагрузка» собирается и «включается», как свет.
 */
export function initManifesto() {
  const section = document.querySelector('.manifesto');
  if (!section) return;
  const pin = section.querySelector('.manifesto__pin');
  const text = section.querySelector('[data-manifesto-text]');
  const rebootWrap = section.querySelector('.manifesto__reboot');
  const reboot = section.querySelector('[data-reboot]');
  const label = section.querySelector('.manifesto__reboot-label');
  const blinds = section.querySelector('.light-blinds');
  const photo = section.querySelector('.manifesto__photo .photo__img');
  const shade = section.querySelector('.manifesto__shade');

  const mm = gsap.matchMedia();
  mm.add({ desktop: MQ.desktop, mobile: MQ.mobile, motion: MQ.motion }, (ctx) => {
    const { desktop, motion } = ctx.conditions;
    if (!motion) return;

    const words = SplitText.create(text, { type: 'words', wordsClass: 'mw', aria: 'none' });
    const chars = SplitText.create(reboot, { type: 'chars', charsClass: 'char', aria: 'none' });

    // «включающийся свет» — золотой слой поверх букв
    const glow = document.createElement('span');
    glow.className = 'reboot__glow';
    glow.setAttribute('aria-hidden', 'true');
    glow.textContent = reboot.textContent;
    reboot.appendChild(glow);

    const kwWords = words.words.filter((w) => w.closest('.kw'));

    gsap.set(words.words, { opacity: 0.15 });
    gsap.set(kwWords, { color: '#F6EEE3' });
    gsap.set(rebootWrap, { opacity: 1 });
    gsap.set(chars.chars, { opacity: 0, yPercent: 70, rotationX: -80, transformOrigin: '50% 100% -20px' });
    gsap.set(label, { opacity: 0 });
    gsap.set(glow, { opacity: 0 });
    gsap.set(blinds, { rotation: -14 });

    const tl = gsap.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: {
        trigger: section,
        start: 'top top',
        end: desktop ? '+=260%' : '+=200%',
        pin,
        scrub: 0.8,
        anticipatePin: 1,
        invalidateOnRefresh: true,
      },
    });

    const STEP = 0.12;
    tl.to(words.words, { opacity: 1, stagger: STEP, duration: 0.5 });
    // ключевое слово вспыхивает акцентом ровно в момент своего проявления
    kwWords.forEach((w) => {
      tl.to(w, { color: '#D8A99A', duration: 0.5 }, words.words.indexOf(w) * STEP + 0.2);
    });
    tl.to(blinds, { yPercent: 8, duration: tl.duration() }, 0)
      .to({}, { duration: 0.6 }) // пауза — дать дочитать
      .to(text, { opacity: 0, y: -60, duration: 0.8, ease: 'power2.in' })
      .to(label, { opacity: 1, duration: 0.4 }, '<0.4')
      .to(chars.chars, {
        opacity: 1, yPercent: 0, rotationX: 0,
        duration: 1, ease: 'power3.out',
        stagger: { each: 0.06, from: 'center' },
      }, '<')
      // свет мигает и включается
      .to(glow, { opacity: 0.9, duration: 0.08 })
      .to(glow, { opacity: 0.15, duration: 0.08 })
      .to(glow, { opacity: 1, duration: 0.12 })
      .to(glow, { opacity: 0.35, duration: 0.1 })
      .to(glow, { opacity: 1, duration: 0.3 })
      .to(blinds, { yPercent: 22, duration: 1.1 }, '<-0.6')
      // свет в комнате «возвращается» вместе со словом
      .to(shade, { opacity: 0.55, duration: 1.2, ease: 'power1.inOut' }, '<')
      .to({}, { duration: 0.4 });
    // медленный наезд камеры на комнату на всём протяжении pin
    tl.fromTo(photo, { scale: 1.16 }, { scale: 1, duration: tl.duration(), ease: 'none' }, 0);

    return () => {
      glow.remove();
      words.revert();
      chars.revert();
    };
  });
}
