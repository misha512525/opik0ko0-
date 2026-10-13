import { Rng } from '../core/Rng';
import type { AudioEngine } from './AudioEngine';

/**
 * Радио в машине: три «станции» с процедурной музыкой. Каждая станция —
 * генератор песен (аккорды, бас, арпеджио, барабаны) на своём seed; песня
 * меняется каждые 16 тактов. Планировщик ставит ноты с упреждением 0.15 с.
 */

interface Song {
  bpm: number;
  root: number;
  prog: number[][];
  arp: number[];
  kick: number[];
  snare: number[];
  hat: number[];
  bass: number[];
  swing: number;
}

interface StationDef {
  name: string;
  build(rng: Rng): Song;
  play(r: Radio, song: Song, step: number, t: number, chord: number[]): void;
}

const MINOR_PROGS = [
  [[0, 3, 7], [8, 12, 15], [3, 7, 10], [10, 14, 17]],
  [[0, 3, 7], [5, 8, 12], [8, 12, 15], [7, 11, 14]],
  [[0, 3, 7], [10, 14, 17], [8, 12, 15], [10, 14, 17]],
  [[0, 3, 7, 10], [5, 8, 12, 15], [10, 14, 17, 21], [3, 7, 10, 14]],
];
const JAZZ_PROGS = [
  [[2, 5, 9, 12], [7, 11, 14, 17], [0, 4, 7, 11], [9, 12, 16, 19]],
  [[0, 4, 7, 11], [9, 12, 16, 19], [2, 5, 9, 12], [7, 11, 14, 17]],
  [[5, 9, 12, 16], [4, 7, 11, 14], [2, 5, 9, 12], [0, 4, 7, 11]],
];

const pattern = (rng: Rng, n: number, base: number[], p: number) =>
  Array.from({ length: n }, (_, i) => (base.includes(i) ? 1 : rng.chance(p) ? 1 : 0));

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

export const STATIONS: StationDef[] = [
  {
    name: 'Velmont Wave 101.3 — синтвейв',
    build: (rng) => ({
      bpm: rng.int(92, 108),
      root: rng.pick([45, 47, 48, 50, 52]),
      prog: rng.pick(MINOR_PROGS),
      arp: Array.from({ length: 16 }, () => rng.int(0, 3)),
      kick: pattern(rng, 16, [0, 8], 0.05),
      snare: pattern(rng, 16, [4, 12], 0),
      hat: pattern(rng, 16, [2, 6, 10, 14], 0.4),
      bass: pattern(rng, 16, [0, 3, 6, 8, 11, 14], 0.2),
      swing: 0,
    }),
    play(r, s, step, t, chord) {
      const k = step % 16;
      if (s.kick[k]) r.kick(t, 0.9);
      if (s.snare[k]) r.snare(t, 0.5, true);
      if (s.hat[k]) r.hat(t, 0.12);
      if (s.bass[k]) r.bass(t, midi(s.root - 12 + chord[0]), 0.22, 0.35);
      const n = chord[s.arp[k] % chord.length] + 12 * (k % 8 < 4 ? 1 : 2);
      r.lead(t, midi(s.root + n), 0.14, 0.09, 'sawtooth');
      if (k === 0) r.pad(t, chord.map((c) => midi(s.root + 12 + c)), (60 / s.bpm) * 4, 0.07);
    },
  },
  {
    name: 'Ржавый Бит FM — лоу-фай хип-хоп',
    build: (rng) => ({
      bpm: rng.int(78, 90),
      root: rng.pick([48, 50, 51, 53]),
      prog: rng.pick(JAZZ_PROGS),
      arp: Array.from({ length: 16 }, () => rng.int(0, 3)),
      kick: pattern(rng, 16, [0, 10], 0.1),
      snare: pattern(rng, 16, [4, 12], 0),
      hat: pattern(rng, 16, [0, 2, 4, 6, 8, 10, 12, 14], 0.15),
      bass: pattern(rng, 16, [0, 10], 0.15),
      swing: 0.18,
    }),
    play(r, s, step, t, chord) {
      const k = step % 16;
      if (s.kick[k]) r.kick(t, 0.85, 0.35);
      if (s.snare[k]) r.snare(t, 0.35, false);
      if (s.hat[k]) r.hat(t, k % 4 === 2 ? 0.08 : 0.05);
      if (s.bass[k]) r.bass(t, midi(s.root - 12 + chord[0]), 0.5, 0.3, 300);
      if (k === 0 || k === 7) r.keys(t, chord.map((c) => midi(s.root + 12 + c)), 1.2, 0.08);
      if (s.arp[k] === 3 && k % 2 === 0) r.lead(t, midi(s.root + 24 + chord[s.arp[(k + 3) % 16] % chord.length]), 0.25, 0.05, 'triangle');
      if (k % 4 === 0) r.crackle(t);
    },
  },
  {
    name: 'Неон 88 — хаус',
    build: (rng) => ({
      bpm: rng.int(120, 128),
      root: rng.pick([45, 46, 48, 49]),
      prog: rng.pick(MINOR_PROGS),
      arp: Array.from({ length: 16 }, () => rng.int(0, 3)),
      kick: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
      snare: pattern(rng, 16, [4, 12], 0.05),
      hat: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0],
      bass: pattern(rng, 16, [2, 6, 10, 14], 0.15),
      swing: 0.05,
    }),
    play(r, s, step, t, chord) {
      const k = step % 16;
      if (s.kick[k]) r.kick(t, 1);
      if (s.snare[k]) r.clap(t, 0.35);
      if (s.hat[k]) r.hat(t, 0.16, true);
      else if (k % 2 === 1) r.hat(t, 0.04);
      if (s.bass[k]) r.bass(t, midi(s.root - 12 + chord[0] + (k % 8 === 6 ? 12 : 0)), 0.18, 0.4, 700);
      if (k === 2 || k === 7 || k === 10) r.stab(t, chord.map((c) => midi(s.root + 12 + c)), 0.12);
    },
  },
];

export class Radio {
  station = -1;
  private songs: Song[] = [];
  private seeds = [101, 202, 303];
  private step = 0;
  private nextTime = 0;
  private bar = 0;
  private out: GainNode;
  private filter: BiquadFilterNode;
  private on = false;

  constructor(private readonly a: AudioEngine) {
    this.filter = a.ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 18000;
    this.out = a.ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(this.filter).connect(a.music);
    for (let i = 0; i < STATIONS.length; i++) this.songs.push(STATIONS[i].build(new Rng(this.seeds[i])));
  }

  get stationName(): string {
    return this.station < 0 ? 'Радио выключено' : STATIONS[this.station].name;
  }

  /** Следующая станция (по кругу, включая «выкл»). */
  cycle(): string {
    this.station = this.station + 1 >= STATIONS.length ? -1 : this.station + 1;
    this.restart();
    return this.stationName;
  }

  setOn(on: boolean): void {
    if (on === this.on) return;
    this.on = on;
    if (on && this.station < 0) this.station = Math.floor(Math.random() * STATIONS.length);
    this.restart();
  }

  /** Приглушить (меню паузы). */
  muffle(m: boolean): void {
    this.filter.frequency.setTargetAtTime(m ? 600 : 18000, this.a.now, 0.1);
  }

  private restart(): void {
    const t = this.a.now;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setTargetAtTime(this.on && this.station >= 0 ? 0.9 : 0, t, 0.08);
    this.nextTime = t + 0.1;
    this.step = 0;
    this.bar = 0;
  }

  update(): void {
    if (!this.on || this.station < 0) return;
    const def = STATIONS[this.station];
    let song = this.songs[this.station];
    const ahead = this.a.now + 0.15;
    if (this.nextTime < this.a.now - 0.5) this.nextTime = this.a.now + 0.05;
    while (this.nextTime < ahead) {
      const sixteenth = 60 / song.bpm / 4;
      const swing = this.step % 2 === 1 ? song.swing * sixteenth : 0;
      const chord = song.prog[Math.floor(this.bar / 2) % song.prog.length];
      def.play(this, song, this.step, this.nextTime + swing, chord);
      this.nextTime += sixteenth;
      this.step++;
      if (this.step % 16 === 0) {
        this.bar++;
        // Новая «песня» каждые 16 тактов.
        if (this.bar % 16 === 0) {
          this.seeds[this.station] += 7;
          song = this.songs[this.station] = def.build(new Rng(this.seeds[this.station]));
        }
      }
    }
  }

  // ------------------------------------------------------------ инструменты

  kick(t: number, vol: number, decay = 0.3): void {
    this.a.tone(this.out, 'sine', 150, t, decay, vol, 42);
  }

  snare(t: number, vol: number, gated: boolean): void {
    this.a.noiseBurst(this.out, t, gated ? 0.22 : 0.14, vol * 0.6, 'bandpass', 1800, 0.8);
    this.a.tone(this.out, 'triangle', 190, t, 0.1, vol * 0.4, 140);
  }

  clap(t: number, vol: number): void {
    for (let i = 0; i < 3; i++) this.a.noiseBurst(this.out, t + i * 0.012, 0.08, vol * 0.5, 'bandpass', 1400, 1.2);
  }

  hat(t: number, vol: number, open = false): void {
    this.a.noiseBurst(this.out, t, open ? 0.18 : 0.04, vol, 'highpass', 7500, 0.7);
  }

  crackle(t: number): void {
    this.a.noiseBurst(this.out, t + Math.random() * 0.2, 0.01, 0.05, 'highpass', 3000);
  }

  bass(t: number, f: number, dur: number, vol: number, cutoff = 450): void {
    const c = this.a.ctx;
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = f;
    const flt = c.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.setValueAtTime(cutoff * 2.2, t);
    flt.frequency.exponentialRampToValueAtTime(cutoff * 0.5, t + dur);
    flt.Q.value = 4;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(flt).connect(g).connect(this.out);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  lead(t: number, f: number, dur: number, vol: number, type: OscillatorType): void {
    const c = this.a.ctx;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.value = f;
    const flt = c.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.value = 2600;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(flt).connect(g).connect(this.out);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  pad(t: number, freqs: number[], dur: number, vol: number): void {
    const c = this.a.ctx;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const flt = c.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.value = 1300;
    flt.connect(g).connect(this.out);
    for (const f of freqs) {
      for (const det of [-7, 7]) {
        const o = c.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = f;
        o.detune.value = det;
        o.connect(flt);
        o.start(t);
        o.stop(t + dur + 0.05);
      }
    }
  }

  keys(t: number, freqs: number[], dur: number, vol: number): void {
    for (const f of freqs) {
      this.a.tone(this.out, 'sine', f, t, dur, vol);
      this.a.tone(this.out, 'triangle', f * 2, t, dur * 0.3, vol * 0.25);
    }
  }

  stab(t: number, freqs: number[], vol: number): void {
    for (const f of freqs) this.lead(t, f, 0.16, vol, 'square');
  }
}
