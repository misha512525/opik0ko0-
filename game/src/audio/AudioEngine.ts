import * as THREE from 'three';
import type { SettingsData } from '../core/Settings';

/**
 * Ядро звука на Web Audio API: шины master/music/sfx, общий буфер шума,
 * позиционирование источников относительно камеры (громкость + панорама).
 * Никаких аудиофайлов — всё синтезируется.
 */
export class AudioEngine {
  readonly ctx: AudioContext;
  readonly master: GainNode;
  readonly music: GainNode;
  readonly sfx: GainNode;
  readonly noise: AudioBuffer;
  private listenerPos = new THREE.Vector3();
  private listenerRight = new THREE.Vector3(1, 0, 0);
  private tmp = new THREE.Vector3();

  constructor() {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctor({ latencyHint: 'interactive' });
    this.master = this.ctx.createGain();
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(this.ctx.destination);
    this.music = this.ctx.createGain();
    this.sfx = this.ctx.createGain();
    this.music.connect(this.master);
    this.sfx.connect(this.master);
    // 2 секунды белого шума — источник для выстрелов, взрывов, шин, хай-хэтов.
    const len = this.ctx.sampleRate * 2;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  get now(): number {
    return this.ctx.currentTime;
  }

  resume(): void {
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  applySettings(s: SettingsData): void {
    const t = this.now;
    this.master.gain.setTargetAtTime(s.masterVolume, t, 0.05);
    this.music.gain.setTargetAtTime(s.musicVolume, t, 0.05);
    this.sfx.gain.setTargetAtTime(s.sfxVolume, t, 0.05);
  }

  setListener(camera: THREE.Camera): void {
    this.listenerPos.copy(camera.position);
    this.listenerRight.set(1, 0, 0).applyQuaternion(camera.quaternion);
  }

  /** Узел-«вход» для звука в точке мира: громкость по расстоянию и панорама. */
  spatial(pos: THREE.Vector3 | null, refDist = 12, maxDist = 220): AudioNode | null {
    if (!pos) return this.sfx;
    const d = this.listenerPos.distanceTo(pos);
    if (d > maxDist) return null;
    const g = this.ctx.createGain();
    g.gain.value = Math.min(1, refDist / Math.max(refDist, d)) * (1 - d / maxDist);
    const p = this.ctx.createStereoPanner();
    this.tmp.subVectors(pos, this.listenerPos).normalize();
    p.pan.value = Math.max(-1, Math.min(1, this.tmp.dot(this.listenerRight))) * 0.8;
    g.connect(p).connect(this.sfx);
    return g;
  }

  noiseSource(): AudioBufferSourceNode {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    s.loopStart = Math.random();
    return s;
  }

  /** Короткий тон с огибающей. */
  tone(out: AudioNode, type: OscillatorType, freq: number, t: number, dur: number, vol: number, freqEnd?: number): void {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  /** Короткий фильтрованный шум с огибающей. */
  noiseBurst(out: AudioNode, t: number, dur: number, vol: number, filter: BiquadFilterType, freq: number, q = 1, freqEnd?: number): void {
    const s = this.noiseSource();
    const f = this.ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.setValueAtTime(freq, t);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(out);
    s.start(t, Math.random() * 1.5);
    s.stop(t + dur + 0.05);
  }
}
