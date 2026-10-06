/**
 * Атмосферные фото:
 * 1) плавно проявляются поверх размытого превью, когда загрузились;
 * 2) после загрузки страницы, в простое, догружаются заранее —
 *    к моменту скролла до секции они уже в кэше, а первый экран не тормозит.
 */
export function initPhotos() {
  const imgs = [...document.querySelectorAll('.photo .photo__img')];

  imgs.forEach((img) => {
    const frame = img.closest('.photo');
    const done = () => frame.classList.add('is-loaded');
    if (img.complete && img.naturalWidth) done();
    else {
      img.addEventListener('load', done, { once: true });
      img.addEventListener('error', done, { once: true });
    }
  });

  const prefetch = () => imgs.forEach((img) => { img.loading = 'eager'; });
  const idle = window.requestIdleCallback || ((cb) => setTimeout(cb, 600));
  const schedule = () => idle(prefetch, { timeout: 2500 });

  if (document.readyState === 'complete') schedule();
  else window.addEventListener('load', schedule, { once: true });
}
