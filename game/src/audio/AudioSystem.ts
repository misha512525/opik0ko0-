import * as THREE from 'three';
import type { GameContext } from '../core/Context';
import { AudioEngine } from './AudioEngine';
import { Radio } from './Radio';

/**
 * Звуковая система: эффекты по событиям игры (выстрелы, взрывы, удары, клаксоны,
 * деньги, миссии), непрерывные звуки (двигатель, шины, сирены, фон города) и радио.
 */
export class AudioSystem {
  readonly engine: AudioEngine;
  readonly radio: Radio;
  private engineOsc: OscillatorNode;
  private engineSub: OscillatorNode;
  private engineGain: GainNode;
  private engineFilter: BiquadFilterNode;
  private tireGain: GainNode;
  private sirenOsc: OscillatorNode;
  private sirenGain: GainNode;
  private sirenPan: StereoPannerNode;
  private ambGain: GainNode;
  private time = 0;
  private lastImpact = 0;
  private tmp = new THREE.Vector3();

  constructor(private readonly ctx: GameContext) {
    const a = (this.engine = new AudioEngine());
    this.radio = new Radio(a);
    const c = a.ctx;

    // Двигатель машины игрока: пила + квадрат на октаву ниже через НЧ-фильтр.
    this.engineOsc = c.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineSub = c.createOscillator();
    this.engineSub.type = 'square';
    this.engineFilter = c.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 600;
    this.engineGain = c.createGain();
    this.engineGain.gain.value = 0;
    const subGain = c.createGain();
    subGain.gain.value = 0.5;
    this.engineOsc.connect(this.engineFilter);
    this.engineSub.connect(subGain).connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain).connect(a.sfx);
    this.engineOsc.start();
    this.engineSub.start();

    // Визг шин.
    const tire = a.noiseSource();
    const tf = c.createBiquadFilter();
    tf.type = 'bandpass';
    tf.frequency.value = 1100;
    tf.Q.value = 6;
    this.tireGain = c.createGain();
    this.tireGain.gain.value = 0;
    tire.connect(tf).connect(this.tireGain).connect(a.sfx);
    tire.start();

    // Сирена ближайшей полицейской машины.
    this.sirenOsc = c.createOscillator();
    this.sirenOsc.type = 'triangle';
    this.sirenGain = c.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenPan = c.createStereoPanner();
    this.sirenOsc.connect(this.sirenGain).connect(this.sirenPan).connect(a.sfx);
    this.sirenOsc.start();

    // Гул города.
    const amb = a.noiseSource();
    const af = c.createBiquadFilter();
    af.type = 'lowpass';
    af.frequency.value = 280;
    this.ambGain = c.createGain();
    this.ambGain.gain.value = 0.05;
    amb.connect(af).connect(this.ambGain).connect(a.sfx);
    amb.start();

    a.applySettings(ctx.settings.data);
    ctx.settings.onChange((s) => a.applySettings(s));
    this.bindEvents();
  }

  resume(): void {
    this.engine.resume();
  }

  private bindEvents(): void {
    const { events } = this.ctx;
    const a = this.engine;
    events.on('gunshot', ({ position, weapon, byPlayer }) => {
      const out = a.spatial(position, 18, 320);
      if (!out) return;
      const t = a.now;
      const rifle = weapon === 'rifle';
      a.noiseBurst(out, t, rifle ? 0.12 : 0.2, byPlayer ? 0.9 : 0.7, 'lowpass', rifle ? 5000 : 3500, 0.7, 300);
      a.noiseBurst(out, t, 0.05, 0.6, 'highpass', 2500);
      a.tone(out, 'sine', rifle ? 110 : 90, t, 0.12, 0.8, 40);
    });
    events.on('explosion', ({ position }) => {
      const out = a.spatial(position, 40, 600);
      if (!out) return;
      const t = a.now;
      a.noiseBurst(out, t, 1.8, 1, 'lowpass', 3000, 0.5, 60);
      a.tone(out, 'sine', 70, t, 1.2, 1, 25);
      a.noiseBurst(out, t + 0.05, 0.6, 0.5, 'bandpass', 900, 0.6, 200);
    });
    events.on('punch', ({ position }) => {
      const out = a.spatial(position, 6);
      if (!out) return;
      a.noiseBurst(out, a.now, 0.08, 0.6, 'lowpass', 900);
      a.tone(out, 'sine', 120, a.now, 0.08, 0.6, 60);
    });
    events.on('vehicleImpact', ({ vehicle, strength }) => {
      if (this.time - this.lastImpact < 0.15) return;
      this.lastImpact = this.time;
      const out = a.spatial(vehicle.position, 15, 160);
      if (!out) return;
      const v = Math.min(1, strength / 15);
      a.noiseBurst(out, a.now, 0.35, v, 'bandpass', 600, 1.5, 150);
      a.noiseBurst(out, a.now, 0.2, v * 0.5, 'bandpass', 2400, 4);
    });
    events.on('horn', ({ position }) => {
      const out = a.spatial(position, 15, 150);
      if (!out) return;
      a.tone(out, 'square', 392, a.now, 0.45, 0.18);
      a.tone(out, 'square', 494, a.now, 0.45, 0.14);
    });
    events.on('pickup', () => this.chime([880, 1175, 1568], 0.07));
    events.on('moneyChanged', ({ delta }) => {
      if (delta > 0) this.chime([1319, 1760], 0.05);
    });
    events.on('checkpoint', () => this.chime([988, 1319], 0.08));
    events.on('uiClick', () => a.tone(a.sfx, 'triangle', 660, a.now, 0.05, 0.15));
    events.on('dryFire', () => a.noiseBurst(a.sfx, a.now, 0.03, 0.3, 'highpass', 4000));
    events.on('reload', () => {
      a.noiseBurst(a.sfx, a.now + 0.1, 0.03, 0.3, 'bandpass', 2500, 3);
      a.noiseBurst(a.sfx, a.now + 0.9, 0.04, 0.35, 'bandpass', 1800, 3);
    });
    events.on('playerHurt', () => a.tone(a.sfx, 'sine', 160, a.now, 0.12, 0.25, 90));
    events.on('missionCompleted', () => this.fanfare(true));
    events.on('missionFailed', () => this.fanfare(false));
    events.on('wantedChanged', ({ stars }) => {
      if (stars > 0) this.chime([523, 415], 0.08);
    });
    events.on('respray', () => {
      a.noiseBurst(a.sfx, a.now, 1.2, 0.3, 'highpass', 3000);
      this.chime([784, 988, 1175], 0.06);
    });
    events.on('playerEnteredVehicle', () => {
      this.radio.setOn(true);
      this.ctx.hud.showRadio(this.radio.stationName);
    });
    events.on('playerExitedVehicle', () => this.radio.setOn(false));
    events.on('playerDied', () => this.radio.setOn(false));
  }

  private chime(freqs: number[], vol: number): void {
    const a = this.engine;
    freqs.forEach((f, i) => a.tone(a.sfx, 'triangle', f, a.now + i * 0.07, 0.25, vol));
  }

  private fanfare(good: boolean): void {
    const a = this.engine;
    const notes = good ? [523, 659, 784, 1047] : [392, 349, 311, 262];
    notes.forEach((f, i) => {
      a.tone(a.sfx, 'sawtooth', f, a.now + i * 0.14, good && i === 3 ? 0.8 : 0.3, 0.08);
      a.tone(a.sfx, 'square', f / 2, a.now + i * 0.14, 0.3, 0.05);
    });
  }

  cycleRadio(): void {
    const name = this.radio.cycle();
    this.ctx.hud.showRadio(name);
  }

  setPaused(p: boolean): void {
    this.radio.muffle(p);
    const t = this.engine.now;
    this.engineGain.gain.setTargetAtTime(0, t, 0.05);
    this.tireGain.gain.setTargetAtTime(0, t, 0.05);
    if (p) this.sirenGain.gain.setTargetAtTime(0, t, 0.05);
  }

  update(dt: number): void {
    this.time += dt;
    const a = this.engine;
    const { player, vehicles, camera, dayNight } = this.ctx;
    a.setListener(camera);
    const t = a.now;
    const v = player.mode === 'vehicle' ? vehicles.playerVehicle : null;
    if (v && !v.destroyed) {
      // «Коробка передач»: обороты растут внутри передачи и падают при переключении.
      const sp = Math.abs(v.forwardSpeed);
      const gearSize = v.spec.maxSpeed / 5;
      const gear = Math.min(4, Math.floor(sp / gearSize));
      const rpm = 0.25 + ((sp - gear * gearSize) / gearSize) * 0.75;
      const throttle = Math.abs(v.controls.throttle);
      const base = v.spec.id === 'van' ? 38 : v.spec.id === 'sports' ? 55 : 45;
      const f = base + rpm * base * 2.2 + gear * 6;
      this.engineOsc.frequency.setTargetAtTime(f, t, 0.05);
      this.engineSub.frequency.setTargetAtTime(f / 2, t, 0.05);
      this.engineFilter.frequency.setTargetAtTime(400 + throttle * 1400 + rpm * 600, t, 0.05);
      this.engineGain.gain.setTargetAtTime(0.06 + throttle * 0.1, t, 0.05);
      const slip = Math.abs(v.lateralSpeed);
      this.tireGain.gain.setTargetAtTime(slip > 3.5 ? Math.min(0.35, (slip - 3.5) * 0.05) : 0, t, 0.05);
    } else {
      this.engineGain.gain.setTargetAtTime(0, t, 0.1);
      this.tireGain.gain.setTargetAtTime(0, t, 0.1);
    }
    // Ближайшая сирена.
    let nearest = Infinity;
    let pos: THREE.Vector3 | null = null;
    for (const u of vehicles.list) {
      if (!u.sirenOn || u.destroyed) continue;
      const d = u.position.distanceTo(camera.position);
      if (d < nearest) {
        nearest = d;
        pos = u.position;
      }
    }
    if (pos && nearest < 250) {
      const wail = 900 + Math.sin(this.time * Math.PI * 1.1) * 350;
      this.sirenOsc.frequency.setTargetAtTime(wail, t, 0.03);
      this.sirenGain.gain.setTargetAtTime(0.12 * Math.min(1, 25 / Math.max(25, nearest)), t, 0.1);
      this.tmp.subVectors(pos, camera.position).normalize();
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
      this.sirenPan.pan.setTargetAtTime(Math.max(-1, Math.min(1, this.tmp.dot(right))) * 0.7, t, 0.1);
    } else this.sirenGain.gain.setTargetAtTime(0, t, 0.2);
    this.ambGain.gain.setTargetAtTime(0.03 + (1 - dayNight.night) * 0.04, t, 0.5);
    this.radio.update();
  }
}
