import { gsap, drawPath, prepareDraw, prefersReduced, EASE, STAGGER } from '@/lib/motion';
import { goal } from '../ui/analytics';

/**
 * Тренажёр «Проверь себя за 30 секунд».
 * Верно — зелёная галочка «ручкой». Ошибка — мягкая тряска, красное зачёркивание, правильный вариант
 * отмечается галочкой, под ним — правило. В финале — счёт, задания для повторения и CTA.
 */
export function initTrainer() {
  const root = document.querySelector<HTMLElement>('[data-trainer]');
  if (!root) return;
  const qs = Array.from(root.querySelectorAll<HTMLFieldSetElement>('[data-q]'));
  const dots = Array.from(root.querySelectorAll<HTMLElement>('[data-dot]'));
  const stepEl = root.querySelector<HTMLElement>('[data-tr-step]')!;
  const live = root.querySelector<HTMLElement>('[data-live]')!;
  const next = root.querySelector<HTMLButtonElement>('[data-next]')!;
  const nextLabel = root.querySelector<HTMLElement>('[data-next-label]')!;
  const final = root.querySelector<HTMLElement>('[data-final]')!;
  const reduce = prefersReduced();
  let index = 0;
  let score = 0;
  const missed: string[] = [];

  const resetQ = (q: HTMLFieldSetElement) => {
    q.querySelectorAll<HTMLButtonElement>('[data-opt]').forEach((b) => {
      b.disabled = false;
      b.classList.remove('is-right', 'is-wrong', 'is-shake');
      b.removeAttribute('aria-label');
      prepareDraw(b.querySelectorAll('path'));
    });
    q.querySelector<HTMLElement>('[data-rule]')!.hidden = true;
  };

  const markDots = () => {
    dots.forEach((d, i) =>
      d.classList.toggle(
        'is-current',
        i === index && !d.classList.contains('is-right') && !d.classList.contains('is-wrong'),
      ),
    );
    stepEl.textContent = String(Math.min(index + 1, qs.length));
  };

  const swap = (from: HTMLElement, to: HTMLElement) => {
    to.hidden = false;
    to.classList.add('is-active');
    if (reduce) {
      from.classList.remove('is-active');
      if (from === final) from.hidden = true;
      return;
    }
    gsap.to(from, {
      x: -40,
      opacity: 0,
      duration: 0.22,
      ease: 'power2.in',
      onComplete: () => {
        from.classList.remove('is-active');
        if (from === final) from.hidden = true;
        gsap.set(from, { clearProps: 'all' });
      },
    });
    gsap.fromTo(
      to,
      { x: 40, opacity: 0 },
      { x: 0, opacity: 1, duration: 0.5, ease: EASE.out, delay: 0.12, clearProps: 'transform,opacity' },
    );
  };

  const answer = (q: HTMLFieldSetElement, chosen: number) => {
    const correct = Number(q.dataset.correct);
    const opts = Array.from(q.querySelectorAll<HTMLButtonElement>('[data-opt]'));
    opts.forEach((b) => (b.disabled = true));
    const ok = chosen === correct;
    const right = opts[correct];
    right.classList.add('is-right');
    right.setAttribute('aria-label', `${right.textContent?.trim()} — верно`);
    drawPath(right.querySelector('.opt__check'), { duration: 0.45 });
    if (ok) {
      score++;
      live.textContent = 'Верно!';
      live.style.color = 'var(--color-pen-green-ink)';
      dots[index].classList.add('is-right');
    } else {
      const wrong = opts[chosen];
      wrong.classList.add('is-wrong', 'is-shake');
      wrong.setAttribute('aria-label', `${wrong.textContent?.trim()} — неверно`);
      drawPath(wrong.querySelector('.opt__strike'), { duration: 0.4 });
      live.textContent = 'Почти. Смотри правило:';
      live.style.color = 'var(--color-pen-red-ink)';
      dots[index].classList.add('is-wrong');
      missed.push(q.dataset.task ?? '');
    }
    dots[index].classList.remove('is-current');
    const rule = q.querySelector<HTMLElement>('[data-rule]')!;
    rule.hidden = false;
    if (!reduce) gsap.from(rule, { y: 10, opacity: 0, duration: 0.45, ease: EASE.out });
    nextLabel.textContent = index === qs.length - 1 ? 'Результат' : 'Дальше';
    next.hidden = false;
    if (!reduce) gsap.from(next, { scale: 0.96, opacity: 0, duration: 0.3, ease: EASE.out });
    next.focus({ preventScroll: true });
  };

  const showFinal = () => {
    const total = qs.length;
    const scoreEl = final.querySelector<HTMLElement>('[data-final-score]')!;
    const msg = final.querySelector<HTMLElement>('[data-final-msg]')!;
    const tasks = final.querySelector<HTMLElement>('[data-final-tasks]')!;
    msg.textContent =
      score === total
        ? root.dataset.msgPerfect!
        : score >= total - 2
          ? root.dataset.msgGood!
          : root.dataset.msgWeak!;
    tasks.innerHTML = '';
    missed.forEach((t) => {
      const li = document.createElement('li');
      li.textContent = t.replace(' ', ' ');
      tasks.appendChild(li);
    });
    const cta = final.querySelector<HTMLAnchorElement>('[data-final-cta]');
    if (cta)
      cta.href =
        root.dataset.ctaBase + encodeURIComponent(root.dataset.ctaMessage!.replace('{score}', String(score)));
    swap(qs[qs.length - 1], final);
    next.hidden = true;
    live.textContent = '';
    stepEl.textContent = String(total);
    goal('trainer_done');
    if (reduce) {
      scoreEl.textContent = String(score);
      return;
    }
    const st = { v: 0 };
    gsap.to(st, {
      v: score,
      duration: 0.9,
      ease: 'expo.out',
      delay: 0.2,
      onUpdate: () => (scoreEl.textContent = String(Math.round(st.v))),
    });
    gsap.from(final.querySelectorAll('.final__msg, .final__tasks li, .final__actions'), {
      y: 16,
      opacity: 0,
      duration: 0.6,
      ease: EASE.out,
      stagger: STAGGER.base,
      delay: 0.3,
    });
  };

  qs.forEach((q) => {
    resetQ(q);
    q.querySelectorAll<HTMLButtonElement>('[data-opt]').forEach((b) =>
      b.addEventListener('click', () => answer(q, Number(b.dataset.opt))),
    );
    q.querySelectorAll<HTMLElement>('.opt').forEach((b) =>
      b.addEventListener('animationend', () => b.classList.remove('is-shake')),
    );
  });

  next.addEventListener('click', () => {
    next.hidden = true;
    live.textContent = '';
    if (index === qs.length - 1) {
      showFinal();
      return;
    }
    swap(qs[index], qs[index + 1]);
    index++;
    markDots();
    qs[index].querySelector<HTMLButtonElement>('[data-opt]')?.focus({ preventScroll: true });
  });

  // Клавиши 1/2 — выбор варианта, когда тренажёр в фокусе
  root.addEventListener('keydown', (e) => {
    if (e.key !== '1' && e.key !== '2') return;
    const q = qs[index];
    if (!q.classList.contains('is-active') || final.classList.contains('is-active')) return;
    const b = q.querySelector<HTMLButtonElement>(`[data-opt="${Number(e.key) - 1}"]`);
    if (b && !b.disabled) b.click();
  });

  root.querySelector('[data-restart]')?.addEventListener('click', () => {
    score = 0;
    missed.length = 0;
    qs.forEach(resetQ);
    dots.forEach((d) => d.classList.remove('is-right', 'is-wrong'));
    swap(final, qs[0]);
    index = 0;
    markDots();
    qs[0].querySelector<HTMLButtonElement>('[data-opt]')?.focus({ preventScroll: true });
  });

  markDots();
}
