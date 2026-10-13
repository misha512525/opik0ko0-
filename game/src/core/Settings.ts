import { CONFIG, type QualityLevel } from '../config';

export interface SettingsData {
  sensitivity: number;
  invertY: boolean;
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  quality: QualityLevel;
  showFps: boolean;
}

const DEFAULTS: SettingsData = {
  sensitivity: 1,
  invertY: false,
  masterVolume: CONFIG.audio.masterVolume,
  musicVolume: CONFIG.audio.musicVolume,
  sfxVolume: CONFIG.audio.sfxVolume,
  quality: 'medium',
  showFps: true,
};

/** Пользовательские настройки (хранятся в localStorage отдельно от сохранения). */
export class Settings {
  data: SettingsData;
  private listeners: ((s: SettingsData) => void)[] = [];

  constructor() {
    this.data = { ...DEFAULTS };
    try {
      const raw = localStorage.getItem(CONFIG.save.settingsKey);
      if (raw) Object.assign(this.data, JSON.parse(raw));
    } catch {
      /* повреждённые настройки — используем значения по умолчанию */
    }
    const q = new URLSearchParams(location.search).get('quality');
    if (q === 'low' || q === 'medium' || q === 'high') this.data.quality = q;
  }

  get quality() {
    return CONFIG.quality[this.data.quality];
  }

  set<K extends keyof SettingsData>(key: K, value: SettingsData[K]): void {
    this.data[key] = value;
    try {
      localStorage.setItem(CONFIG.save.settingsKey, JSON.stringify(this.data));
    } catch {
      /* приватный режим — просто не сохраняем */
    }
    for (const l of this.listeners) l(this.data);
  }

  onChange(fn: (s: SettingsData) => void): void {
    this.listeners.push(fn);
  }
}
