import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';

gsap.registerPlugin(ScrollTrigger, SplitText);

// Адресная строка мобильных браузеров не должна пересчитывать триггеры
ScrollTrigger.config({ ignoreMobileResize: true });
gsap.config({ nullTargetWarn: false });

export { gsap, ScrollTrigger, SplitText };
if (import.meta.env.DEV) Object.assign(window, { ScrollTrigger, gsap });

export const MQ = {
  desktop: '(min-width: 1024px) and (prefers-reduced-motion: no-preference)',
  mobile: '(max-width: 1023px) and (prefers-reduced-motion: no-preference)',
  reduce: '(prefers-reduced-motion: reduce)',
  fine: '(hover: hover) and (pointer: fine)',
} as const;

export const prefersReduced = () => window.matchMedia(MQ.reduce).matches;
export const isFinePointer = () => window.matchMedia(MQ.fine).matches;
export const isDesktop = () => window.matchMedia('(min-width: 1024px)').matches;
