'use strict';
// Звук: всё синтезируется Web Audio API — процедурные эффекты, гул трибун и чиптюн-музыка.
(function (PF) {
  const A = { master: 0.8, music: 0.6, sfx: 0.8, ready: false };
  let ctx = null, masterG, musicG, sfxG, noiseBuf = null;
  let crowdSrc = null, crowdG = null, crowdF = null, crowdLevel = 0, crowdTarget = 0;

  A.unlock = () => {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    masterG = ctx.createGain(); masterG.connect(ctx.destination);
    musicG = ctx.createGain(); musicG.connect(masterG);
    sfxG = ctx.createGain(); sfxG.connect(masterG);
    // Буфер белого шума (2 с) — основа для ударов, трибун, барабанов
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    A.ready = true;
    A.applyVolumes();
    if (A._pendingMusic) { A.playMusic(A._pendingMusic); }
  };

  A.setVolumes = (m, mu, s) => { A.master = m; A.music = mu; A.sfx = s; A.applyVolumes(); };
  A.applyVolumes = () => {
    if (!ctx) return;
    masterG.gain.value = A.master;
    musicG.gain.value = A.music * 0.5;
    sfxG.gain.value = A.sfx;
  };

  function env(g, t, a, peak, dec) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
  }
  function osc(type, freq, t, dur, peak, dest, freqEnd) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    env(g, t, 0.004, peak, dur);
    o.connect(g); g.connect(dest || sfxG);
    o.start(t); o.stop(t + dur + 0.05);
    return o;
  }
  function noise(t, dur, peak, ftype, freq, q, dest, attack) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    s.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter(); f.type = ftype; f.frequency.value = freq; f.Q.value = q || 1;
    const g = ctx.createGain();
    env(g, t, attack || 0.003, peak, dur);
    s.connect(f); f.connect(g); g.connect(dest || sfxG);
    s.start(t, Math.random() * 1.5); s.stop(t + dur + (attack || 0) + 0.05);
  }

  // Каталог эффектов
  const SFX = {
    kick(p) { const t = ctx.currentTime, k = 0.5 + p * 0.5; noise(t, 0.07, 0.6 * k, 'lowpass', 1400, 0.8); osc('sine', 150, t, 0.09, 0.7 * k, null, 55); },
    pass() { const t = ctx.currentTime; noise(t, 0.05, 0.35, 'lowpass', 1800, 0.8); osc('sine', 190, t, 0.06, 0.35, null, 80); },
    bounce(p) { const t = ctx.currentTime; osc('sine', 110, t, 0.06, 0.25 * p, null, 60); },
    head() { const t = ctx.currentTime; noise(t, 0.05, 0.4, 'bandpass', 900, 1.5); osc('sine', 220, t, 0.05, 0.3, null, 140); },
    post() { const t = ctx.currentTime; osc('triangle', 1250, t, 0.55, 0.35); osc('triangle', 1870, t, 0.4, 0.2); osc('square', 620, t, 0.12, 0.08); noise(t, 0.05, 0.3, 'highpass', 3000, 1); },
    net() { const t = ctx.currentTime; noise(t, 0.25, 0.35, 'bandpass', 500, 0.7, null, 0.02); },
    whistle(p) {
      const t = ctx.currentTime, blasts = p || 1;
      for (let i = 0; i < blasts; i++) {
        const st = t + i * 0.42, dur = blasts > 1 && i === blasts - 1 ? 0.75 : 0.3;
        for (const f of [2750, 2900]) {
          const o = ctx.createOscillator(), g = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
          o.type = 'sine'; o.frequency.value = f; lfo.frequency.value = 32; lg.gain.value = 110;
          lfo.connect(lg); lg.connect(o.frequency);
          g.gain.setValueAtTime(0.0001, st); g.gain.linearRampToValueAtTime(0.16, st + 0.02);
          g.gain.setValueAtTime(0.16, st + dur - 0.05); g.gain.linearRampToValueAtTime(0.0001, st + dur);
          o.connect(g); g.connect(sfxG); o.start(st); lfo.start(st); o.stop(st + dur + 0.02); lfo.stop(st + dur + 0.02);
        }
      }
    },
    goal() {
      const t = ctx.currentTime;
      noise(t, 3.2, 0.5, 'bandpass', 900, 0.4, null, 0.35);
      noise(t, 2.6, 0.3, 'bandpass', 2200, 0.6, null, 0.4);
      // Фанфара
      const notes = [523, 659, 784, 1047];
      notes.forEach((f, i) => { osc('square', f, t + 0.1 + i * 0.11, 0.25, 0.09); osc('square', f * 1.005, t + 0.1 + i * 0.11, 0.25, 0.05); });
      osc('sawtooth', 523, t + 0.55, 0.9, 0.07); osc('sawtooth', 659, t + 0.55, 0.9, 0.06); osc('sawtooth', 784, t + 0.55, 0.9, 0.05);
    },
    ooh() { const t = ctx.currentTime; noise(t, 1.2, 0.3, 'bandpass', 500, 0.8, null, 0.25); },
    tackle() { const t = ctx.currentTime; noise(t, 0.12, 0.4, 'lowpass', 700, 0.7); osc('sine', 90, t, 0.1, 0.4, null, 50); },
    slide() { const t = ctx.currentTime; noise(t, 0.3, 0.25, 'highpass', 1500, 0.5, null, 0.02); },
    card() { const t = ctx.currentTime; osc('square', 880, t, 0.08, 0.1); osc('square', 660, t + 0.1, 0.15, 0.1); },
    move() { const t = ctx.currentTime; osc('square', 660, t, 0.04, 0.06); },
    select() { const t = ctx.currentTime; osc('square', 880, t, 0.05, 0.08); osc('square', 1320, t + 0.05, 0.08, 0.08); },
    back() { const t = ctx.currentTime; osc('square', 520, t, 0.05, 0.07); osc('square', 390, t + 0.05, 0.08, 0.07); },
    coin() { const t = ctx.currentTime; osc('square', 988, t, 0.06, 0.08); osc('square', 1319, t + 0.06, 0.2, 0.08); },
    pack(r) {
      const t = ctx.currentTime, base = [392, 523, 659, 784][r || 0];
      for (let i = 0; i < 6; i++) osc('square', base * Math.pow(1.122, i), t + i * 0.06, 0.1, 0.07);
      if (r >= 2) { noise(t + 0.4, 0.8, 0.2, 'highpass', 4000, 0.5, null, 0.05); osc('triangle', base * 2, t + 0.4, 0.8, 0.12); }
    },
    swoosh() { const t = ctx.currentTime; noise(t, 0.18, 0.2, 'bandpass', 2500, 2, null, 0.05); },
    save() { const t = ctx.currentTime; noise(t, 0.08, 0.4, 'lowpass', 900, 0.8); osc('sine', 120, t, 0.08, 0.4, null, 70); },
  };

  let lastPlay = {};
  A.play = (name, p) => {
    if (!ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    if (lastPlay[name] && now - lastPlay[name] < 0.03) return; // не дублируем в одном кадре
    lastPlay[name] = now;
    SFX[name] && SFX[name](p);
  };

  // --- Гул трибун: зацикленный фильтрованный шум, громкость следит за «накалом» ---
  A.crowdStart = () => {
    if (!ctx || crowdSrc) return;
    crowdSrc = ctx.createBufferSource(); crowdSrc.buffer = noiseBuf; crowdSrc.loop = true;
    crowdF = ctx.createBiquadFilter(); crowdF.type = 'bandpass'; crowdF.frequency.value = 650; crowdF.Q.value = 0.45;
    crowdG = ctx.createGain(); crowdG.gain.value = 0;
    crowdSrc.connect(crowdF); crowdF.connect(crowdG); crowdG.connect(sfxG);
    crowdSrc.start();
    crowdLevel = 0;
  };
  A.crowdStop = () => { if (crowdSrc) { try { crowdSrc.stop(); } catch (e) { /* уже остановлен */ } crowdSrc = null; } };
  A.crowdExcite = (x) => { crowdTarget = Math.max(crowdTarget, x); };
  A.crowdUpdate = (dt, base) => {
    if (!crowdG) return;
    const tgt = Math.min(1, base + crowdTarget);
    crowdLevel += (tgt - crowdLevel) * Math.min(1, dt * 2.5);
    crowdTarget = Math.max(0, crowdTarget - dt * 0.35);
    crowdG.gain.value = 0.05 + crowdLevel * 0.22;
    crowdF.frequency.value = 550 + crowdLevel * 500;
  };

  // --- Чиптюн-секвенсор: квадратная мелодия, треугольный бас, шумовые барабаны ---
  const SONGS = {
    // ноты в MIDI, 0 = пауза; 16 шагов на такт
    menu: {
      bpm: 128,
      lead: [
        76, 0, 79, 0, 81, 0, 79, 76, 0, 74, 76, 0, 72, 0, 74, 0, 76, 0, 79, 0, 84, 0, 83, 81, 0, 79, 81, 0, 79, 0, 0, 0,
        76, 0, 79, 0, 81, 0, 79, 76, 0, 74, 76, 0, 72, 0, 69, 0, 71, 0, 72, 0, 74, 0, 76, 74, 0, 72, 71, 0, 72, 0, 0, 0,
        81, 0, 0, 81, 79, 0, 76, 0, 77, 0, 0, 77, 76, 0, 72, 0, 74, 0, 76, 0, 77, 0, 79, 0, 81, 0, 79, 0, 76, 0, 0, 0,
        81, 0, 0, 81, 83, 0, 84, 0, 83, 0, 81, 0, 79, 0, 76, 0, 77, 0, 76, 0, 74, 0, 71, 0, 72, 0, 0, 0, 0, 0, 0, 0,
      ],
      bass: [
        48, 0, 48, 0, 55, 0, 48, 0, 43, 0, 43, 0, 50, 0, 43, 0, 45, 0, 45, 0, 52, 0, 45, 0, 41, 0, 41, 0, 48, 0, 41, 0,
        48, 0, 48, 0, 55, 0, 48, 0, 43, 0, 43, 0, 50, 0, 43, 0, 41, 0, 41, 0, 48, 0, 41, 0, 43, 0, 43, 0, 47, 0, 43, 0,
        41, 0, 41, 0, 48, 0, 41, 0, 45, 0, 45, 0, 52, 0, 45, 0, 43, 0, 43, 0, 50, 0, 43, 0, 48, 0, 48, 0, 55, 0, 48, 0,
        41, 0, 41, 0, 48, 0, 41, 0, 43, 0, 43, 0, 50, 0, 43, 0, 43, 0, 43, 0, 47, 0, 50, 0, 48, 0, 48, 0, 43, 0, 36, 0,
      ],
      drums: 'k.h.s.h.k.k.s.hh', // k — бочка, s — малый, h — хэт
      arp: true,
    },
    win: { bpm: 140, lead: [72, 76, 79, 84, 0, 79, 84, 0, 88, 0, 0, 0, 0, 0, 0, 0], bass: [48, 0, 0, 0, 55, 0, 0, 0, 48, 0, 0, 0, 0, 0, 0, 0], drums: 'k...s...k.k.s...', once: true },
  };
  let song = null, step = 0, nextT = 0, timer = null;
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

  function schedule() {
    if (!song || !ctx) return;
    const stepDur = 60 / song.bpm / 4;
    while (nextT < ctx.currentTime + 0.12) {
      const len = song.lead.length;
      const i = step % len;
      const ln = song.lead[i], bn = song.bass[i % song.bass.length];
      if (ln) { osc('square', mtof(ln), nextT, stepDur * 1.6, 0.11, musicG); osc('square', mtof(ln) * 1.004, nextT, stepDur * 1.4, 0.04, musicG); }
      else if (song.arp && bn) { osc('square', mtof(bn + 24 + ((step >> 1) % 3) * 4), nextT, stepDur * 0.6, 0.025, musicG); }
      if (bn) osc('triangle', mtof(bn), nextT, stepDur * 1.8, 0.3, musicG);
      const dch = song.drums[i % song.drums.length];
      if (dch === 'k') osc('sine', 140, nextT, 0.12, 0.45, musicG, 45);
      else if (dch === 's') noise(nextT, 0.12, 0.18, 'highpass', 1800, 0.7, musicG);
      else if (dch === 'h') noise(nextT, 0.03, 0.07, 'highpass', 7000, 0.7, musicG);
      nextT += stepDur;
      step++;
      if (song.once && step >= len) { song = null; return; }
    }
  }

  A.playMusic = (name) => {
    if (!ctx) { A._pendingMusic = name; return; }
    A._pendingMusic = null;
    if (A.current === name && song) return;
    A.current = name;
    song = SONGS[name];
    step = 0; nextT = ctx.currentTime + 0.05;
    if (!timer) timer = setInterval(schedule, 30);
  };
  A.stopMusic = () => { song = null; A.current = null; A._pendingMusic = null; };

  PF.Audio = A;
})(window.PF);
