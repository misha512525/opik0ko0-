import { goal } from './analytics';

/**
 * Видео результатов: muted loop playsinline, источники грузятся лениво (IntersectionObserver),
 * пауза вне вьюпорта, экономия трафика при saveData (без автозапуска), кнопка звука.
 */
export function initVideos() {
  document.querySelectorAll<HTMLElement>('[data-video]').forEach((wrap) => {
    const video = wrap.querySelector<HTMLVideoElement>('video');
    if (!video) return;
    const soundBtn = wrap.querySelector<HTMLButtonElement>('[data-video-sound]');
    const playBtn = wrap.querySelector<HTMLButtonElement>('[data-video-play]');
    const saveData =
      (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let loaded = false;
    let visible = false;
    let userPaused = false;

    const load = () => {
      if (loaded) return;
      loaded = true;
      video.querySelectorAll<HTMLSourceElement>('source[data-src]').forEach((s) => (s.src = s.dataset.src!));
      video.load();
    };
    const tryPlay = () => {
      if (!visible || userPaused) return;
      video.play().then(
        () => wrap.classList.add('is-playing'),
        () => wrap.classList.remove('is-playing'),
      );
    };

    if (saveData) {
      userPaused = true;
      wrap.classList.add('is-manual');
    }

    // Постер — тоже лениво: он ниже первого экрана и не должен конкурировать с LCP
    const posterIo = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        posterIo.disconnect();
        if (video.dataset.poster) video.poster = video.dataset.poster;
      },
      { rootMargin: '100% 0px' },
    );
    posterIo.observe(wrap);

    const io = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        if (visible) {
          if (!saveData) load();
          tryPlay();
          goal('results_view');
        } else if (!video.paused) {
          video.pause();
          wrap.classList.remove('is-playing');
        }
      },
      { rootMargin: '200px 0px', threshold: 0.15 },
    );
    io.observe(wrap);

    playBtn?.addEventListener('click', () => {
      load();
      if (video.paused) {
        userPaused = false;
        tryPlay();
      } else {
        userPaused = true;
        video.pause();
        wrap.classList.remove('is-playing');
      }
    });

    soundBtn?.addEventListener('click', () => {
      load();
      video.muted = !video.muted;
      soundBtn.setAttribute('aria-pressed', String(!video.muted));
      soundBtn.setAttribute('aria-label', video.muted ? 'Включить звук' : 'Выключить звук');
      wrap.classList.toggle('is-sound', !video.muted);
      if (!video.muted) {
        userPaused = false;
        tryPlay();
      }
    });
  });
}
