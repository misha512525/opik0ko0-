import { gsap, MQ, EASE, splitLines, drawPath, prepareDraw } from '@/lib/motion';

const SUBJECT_DAT: Record<string, string> = { 'русский язык': 'русскому языку', литература: 'литературе' };
const balls = (n: number) => {
  const a = n % 100;
  const b = n % 10;
  if (a > 10 && a < 20) return 'баллов';
  if (b === 1) return 'балл';
  if (b > 1 && b < 5) return 'балла';
  return 'баллов';
};

/** Собирает текст сообщения из выбора и открывает Telegram. Ничего не сохраняется и никуда не отправляется. */
export function buildMessage(who: string, exam: string, subject: string, goal: string) {
  const subj = SUBJECT_DAT[subject] ?? subject;
  const parts = ['Здравствуйте, Анна Андреевна!'];
  if (who === 'родитель') parts.push(`Я родитель, ребёнок готовится к ${exam} по ${subj}.`);
  else if (who === 'учитель')
    parts.push(`Я преподаватель, интересует подготовка к ${exam} по ${subj}: КИМы и методика.`);
  else parts.push(`Готовлюсь к ${exam} по ${subj}.`);
  const g = Number(goal);
  if (goal && g > 0 && g <= 100) parts.push(`Цель — ${g} ${balls(g)}.`);
  parts.push(who === 'учитель' ? 'Хочу узнать подробнее.' : 'Хочу узнать про подготовку.');
  return parts.join(' ');
}

export function initFinale() {
  const form = document.querySelector<HTMLFormElement>('[data-composer]');
  if (form) {
    const preview = form.querySelector<HTMLElement>('[data-preview]')!;
    const send = form.querySelector<HTMLAnchorElement>('[data-send]')!;
    const toast = form.querySelector<HTMLElement>('[data-toast]')!;
    const goalInput = form.querySelector<HTMLInputElement>('input[name="goal"]')!;
    const base = form.dataset.base!;
    let text = '';
    const update = () => {
      const fd = new FormData(form);
      text = buildMessage(
        String(fd.get('who')),
        String(fd.get('exam')),
        String(fd.get('subject')),
        String(fd.get('goal') ?? ''),
      );
      preview.textContent = text;
      send.href = base + encodeURIComponent(text);
    };
    goalInput.addEventListener('input', () => {
      goalInput.value = goalInput.value.replace(/\D/g, '').slice(0, 3);
    });
    form.addEventListener('input', update);
    form.addEventListener('change', update);
    form.addEventListener('submit', (e) => e.preventDefault());
    send.addEventListener('click', () => {
      // Копия текста — на случай, если клиент Telegram не подставит его сам
      navigator.clipboard?.writeText(text).then(
        () => {
          toast.classList.add('is-on');
          window.setTimeout(() => toast.classList.remove('is-on'), 5000);
        },
        () => {},
      );
    });
    update();
  }

  const mm = gsap.matchMedia();
  mm.add(`${MQ.desktop}, ${MQ.mobile}`, () => {
    const title = document.querySelector<HTMLElement>('[data-finale-title]');
    if (title) {
      const { anim } = splitLines(title, { paused: true });
      gsap.timeline({ scrollTrigger: { trigger: title, start: 'top 80%', once: true } }).add(() => {
        anim()?.play();
      });
    }
    const sig = document.querySelector<HTMLElement>('[data-signature]');
    if (sig) {
      const text = sig.querySelector('.signature__text');
      const line = sig.querySelector<SVGElement>('.signature__line');
      if (line) prepareDraw(line.querySelectorAll('path'));
      gsap
        .timeline({ scrollTrigger: { trigger: sig, start: 'top 90%', once: true } })
        // «Перо пишет»: подпись проявляется слева направо, затем росчерк
        .fromTo(
          text,
          { clipPath: 'inset(-20% 100% -20% 0)' },
          { clipPath: 'inset(-20% 0% -20% 0)', duration: 1.4, ease: 'power2.inOut' },
        )
        .add(drawPath(line, { duration: 0.7 }), 1.1);
    }
    const composer = document.querySelector('[data-composer]');
    if (composer) {
      gsap.from(composer, {
        y: 56,
        opacity: 0,
        duration: 1,
        ease: EASE.out,
        scrollTrigger: { trigger: composer, start: 'top 85%', once: true },
      });
    }
  });
}
