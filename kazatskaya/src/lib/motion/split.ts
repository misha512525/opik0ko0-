import { gsap, SplitText } from './gsap';
import { DUR, EASE, STAGGER } from './tokens';

/**
 * Построчное mask-раскрытие: каждая строка выезжает из-под маски снизу.
 * autoSplit пересобирает строки при ресайзе и загрузке шрифтов; анимация, которую возвращает onSplit,
 * синхронизируется по прогрессу — поэтому всегда берём актуальную через anim().
 */
export function splitLines(el: HTMLElement, vars: gsap.TweenVars = {}) {
  let current: gsap.core.Tween | undefined;
  const split = SplitText.create(el, {
    type: 'lines',
    mask: 'lines',
    linesClass: 'split-line',
    autoSplit: true,
    aria: 'auto',
    onSplit(self) {
      current = gsap.fromTo(
        self.lines,
        { yPercent: 110 },
        { yPercent: 0, duration: DUR.reveal, ease: EASE.out, stagger: 0.08, ...vars },
      );
      return current;
    },
  });
  return { split, anim: () => current };
}

/**
 * Подсветка слов по скроллу: слово за словом от приглушённого цвета к основному (scrub).
 * Анимируем цвет, а не прозрачность: стартовый цвет сохраняет контраст ≥ 4.5:1.
 */
export function scrubWords(
  el: HTMLElement,
  colors: { from: string; to: string },
  trigger: gsap.DOMTarget = el,
  vars: ScrollTrigger.Vars = {},
) {
  return SplitText.create(el, {
    type: 'words',
    wordsClass: 'split-word',
    autoSplit: true,
    // aria-label на <p> запрещён — оставляем текст как есть, слова читаются подряд
    aria: 'none',
    onSplit(self) {
      return gsap.fromTo(
        self.words,
        { color: colors.from },
        {
          color: colors.to,
          ease: 'none',
          stagger: STAGGER.base,
          scrollTrigger: { trigger, start: 'top 78%', end: 'bottom 50%', scrub: 0.6, ...vars },
        },
      );
    },
  });
}
