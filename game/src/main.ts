import './ui/style.css';
import { Game } from './Game';

const loading = document.getElementById('loading')!;
const loadingText = document.getElementById('loading-text')!;

async function boot() {
  const game = await Game.create(document.getElementById('app')!, (t) => (loadingText.textContent = t));
  loading.classList.add('hidden');
  game.start();
  const ctx = game.ctx;
  // Клик по канвасу во время игры возвращает захват мыши.
  ctx.renderer.domElement.addEventListener('click', () => {
    if (game.state === 'playing') ctx.input.lockPointer();
  });
  if (new URLSearchParams(location.search).has('autotest')) ctx.input.freeLook = true;
  (window as unknown as { __game: Game }).__game = game;
}

boot().catch((e) => {
  console.error(e);
  loadingText.textContent = 'Ошибка запуска: ' + (e as Error).message;
});
