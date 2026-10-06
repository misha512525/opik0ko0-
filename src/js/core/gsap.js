// Единая точка подключения GSAP и плагинов
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';

gsap.registerPlugin(ScrollTrigger, SplitText);

gsap.defaults({ ease: 'expo.out', duration: 1.1 });
ScrollTrigger.config({ ignoreMobileResize: true });

export const MQ = {
  desktop: '(min-width: 1024px)',
  mobile: '(max-width: 1023px)',
  reduce: '(prefers-reduced-motion: reduce)',
  motion: '(prefers-reduced-motion: no-preference)',
  finePointer: '(hover: hover) and (pointer: fine)',
};

export const prefersReduced = () => window.matchMedia(MQ.reduce).matches;

export { gsap, ScrollTrigger, SplitText };
