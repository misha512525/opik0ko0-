import { CONFIG, type QualityLevel } from '../config';
import type { GameContext } from '../core/Context';

const CONTROLS = `
<table class="controls">
<tr><td><kbd>W A S D</kbd></td><td>движение / руль</td></tr>
<tr><td><kbd>Shift</kbd></td><td>бег</td></tr>
<tr><td><kbd>Space</kbd></td><td>прыжок / ручник</td></tr>
<tr><td><kbd>F</kbd></td><td>сесть / выйти из машины</td></tr>
<tr><td><kbd>ЛКМ</kbd></td><td>стрельба / удар</td></tr>
<tr><td><kbd>ПКМ</kbd></td><td>прицел</td></tr>
<tr><td><kbd>Колесо</kbd>, <kbd>1</kbd>–<kbd>3</kbd></td><td>смена оружия</td></tr>
<tr><td><kbd>R</kbd></td><td>радио (в машине) / перезарядка</td></tr>
<tr><td><kbd>E</kbd></td><td>магазин / действие</td></tr>
<tr><td><kbd>M</kbd></td><td>карта</td></tr>
<tr><td><kbd>Enter</kbd></td><td>пропустить реплику</td></tr>
<tr><td><kbd>Esc</kbd></td><td>пауза</td></tr>
</table>`;

export interface MenuCallbacks {
  newGame(): void;
  continueGame(): void;
  save(): boolean;
  load(): boolean;
  hasSave(): boolean;
}

/**
 * Главное меню, пауза, настройки и справка по управлению (HTML поверх канваса).
 */
export class Menu {
  private root: HTMLElement;
  private panel: HTMLElement;
  open = true;
  private inGame = false;

  constructor(private readonly ctx: GameContext, private readonly cb: MenuCallbacks) {
    this.root = document.createElement('div');
    this.root.className = 'menu';
    document.body.appendChild(this.root);
    this.panel = document.createElement('div');
    this.panel.className = 'menu-panel';
    this.root.appendChild(this.panel);
    this.showMain();
  }

  private render(html: string): void {
    this.panel.innerHTML = html;
  }

  private button(id: string, text: string, disabled = false): string {
    return `<button data-act="${id}" ${disabled ? 'disabled' : ''}>${text}</button>`;
  }

  private bind(actions: Record<string, () => void>): void {
    this.panel.querySelectorAll<HTMLButtonElement>('button[data-act]').forEach((b) => {
      b.onclick = () => {
        this.ctx.events.emit('uiClick', {});
        actions[b.dataset.act!]?.();
      };
    });
  }

  showMain(): void {
    this.open = true;
    this.inGame = false;
    this.root.classList.remove('hidden', 'pause');
    const has = this.cb.hasSave();
    this.render(`
      <div class="title">${CONFIG.title}</div>
      <div class="subtitle">${CONFIG.cityName} · криминальная песочница</div>
      <div class="buttons">
        ${this.button('continue', 'Продолжить', !has)}
        ${this.button('new', 'Новая игра')}
        ${this.button('settings', 'Настройки')}
        ${this.button('controls', 'Управление')}
      </div>
      <div class="hint">Клик по экрану захватывает мышь. Все модели, текстуры, звуки и музыка сгенерированы процедурно.</div>`);
    this.bind({
      continue: () => this.cb.continueGame(),
      new: () => this.cb.newGame(),
      settings: () => this.showSettings(() => this.showMain()),
      controls: () => this.showControls(() => this.showMain()),
    });
  }

  showPause(): void {
    this.open = true;
    this.inGame = true;
    this.root.classList.remove('hidden');
    this.root.classList.add('pause');
    this.render(`
      <div class="title small">ПАУЗА</div>
      <div class="buttons">
        ${this.button('resume', 'Продолжить')}
        ${this.button('save', 'Сохранить')}
        ${this.button('load', 'Загрузить', !this.cb.hasSave())}
        ${this.button('settings', 'Настройки')}
        ${this.button('controls', 'Управление')}
        ${this.button('main', 'Главное меню')}
      </div>
      <div class="status" id="menu-status"></div>`);
    const status = (t: string) => {
      const s = this.panel.querySelector('#menu-status');
      if (s) s.textContent = t;
    };
    this.bind({
      resume: () => this.close(),
      save: () => status(this.cb.save() ? 'Игра сохранена' : 'Сохранять можно только вне миссии'),
      load: () => {
        if (this.cb.load()) this.close();
      },
      settings: () => this.showSettings(() => this.showPause()),
      controls: () => this.showControls(() => this.showPause()),
      main: () => this.showMain(),
    });
  }

  showControls(back: () => void): void {
    this.render(`<div class="title small">Управление</div>${CONTROLS}<div class="buttons">${this.button('back', 'Назад')}</div>`);
    this.bind({ back });
  }

  showSettings(back: () => void): void {
    const s = this.ctx.settings.data;
    const q = (v: QualityLevel, t: string) => `<option value="${v}" ${s.quality === v ? 'selected' : ''}>${t}</option>`;
    this.render(`
      <div class="title small">Настройки</div>
      <div class="settings">
        <label>Чувствительность мыши <input type="range" id="s-sens" min="0.2" max="3" step="0.05" value="${s.sensitivity}"><span id="v-sens"></span></label>
        <label>Инверсия оси Y <input type="checkbox" id="s-inv" ${s.invertY ? 'checked' : ''}></label>
        <label>Общая громкость <input type="range" id="s-master" min="0" max="1" step="0.01" value="${s.masterVolume}"></label>
        <label>Музыка (радио) <input type="range" id="s-music" min="0" max="1" step="0.01" value="${s.musicVolume}"></label>
        <label>Эффекты <input type="range" id="s-sfx" min="0" max="1" step="0.01" value="${s.sfxVolume}"></label>
        <label>Качество графики <select id="s-quality">${q('low', 'Низкое')}${q('medium', 'Среднее')}${q('high', 'Высокое')}</select></label>
        <label>Показывать FPS <input type="checkbox" id="s-fps" ${s.showFps ? 'checked' : ''}></label>
        <div class="note-small">Сглаживание (MSAA) применяется после перезапуска страницы.</div>
      </div>
      <div class="buttons">${this.button('back', 'Назад')}</div>`);
    const $ = <T extends HTMLElement>(id: string) => this.panel.querySelector<T>('#' + id)!;
    const sens = $<HTMLInputElement>('s-sens');
    const showSens = () => ($('v-sens').textContent = Number(sens.value).toFixed(2));
    showSens();
    sens.oninput = () => {
      this.ctx.settings.set('sensitivity', Number(sens.value));
      showSens();
    };
    $<HTMLInputElement>('s-inv').onchange = (e) => this.ctx.settings.set('invertY', (e.target as HTMLInputElement).checked);
    $<HTMLInputElement>('s-master').oninput = (e) => this.ctx.settings.set('masterVolume', Number((e.target as HTMLInputElement).value));
    $<HTMLInputElement>('s-music').oninput = (e) => this.ctx.settings.set('musicVolume', Number((e.target as HTMLInputElement).value));
    $<HTMLInputElement>('s-sfx').oninput = (e) => this.ctx.settings.set('sfxVolume', Number((e.target as HTMLInputElement).value));
    $<HTMLSelectElement>('s-quality').onchange = (e) => this.ctx.settings.set('quality', (e.target as HTMLSelectElement).value as QualityLevel);
    $<HTMLInputElement>('s-fps').onchange = (e) => {
      this.ctx.settings.set('showFps', (e.target as HTMLInputElement).checked);
      const d = document.getElementById('debug');
      if (d) d.style.display = (e.target as HTMLInputElement).checked ? '' : 'none';
    };
    this.bind({ back });
  }

  close(): void {
    this.open = false;
    this.root.classList.add('hidden');
    this.ctx.input.lockPointer();
  }

  get isPauseMenu(): boolean {
    return this.open && this.inGame;
  }
}
