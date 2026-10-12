'use strict';
// Повтор: кольцевой буфер снимков (позиции, позы мяча и игроков) в Float32Array — без аллокаций.
(function (PF) {
  const C = PF.C;
  const PS = 6; // на сущность: x, y, z, pose, dir, видим
  class Replay {
    constructor(nEnt) {
      this.n = nEnt;
      this.stride = 5 + nEnt * PS;
      this.buf = new Float32Array(C.REPLAY_CAP * this.stride);
      this.count = 0; this.head = 0; this.tick = 0;
      this.playing = false; this.pos = 0; this.start = 0; this.len = 0;
    }
    clear() { this.count = 0; this.head = 0; this.tick = 0; }
    record(ball, ents) {
      if ((this.tick++ % C.REPLAY_STRIDE) !== 0) return;
      const o = this.head * this.stride, b = this.buf;
      b[o] = ball.x; b[o + 1] = ball.y; b[o + 2] = ball.z; b[o + 3] = ball.frame; b[o + 4] = 0;
      for (let i = 0; i < this.n; i++) {
        const p = ents[i], k = o + 5 + i * PS;
        if (!p) { b[k + 5] = 0; continue; }
        b[k] = p.x; b[k + 1] = p.y; b[k + 2] = p.z; b[k + 3] = p.pose; b[k + 4] = p.dir; b[k + 5] = p.off ? 0 : 1;
      }
      this.head = (this.head + 1) % C.REPLAY_CAP;
      if (this.count < C.REPLAY_CAP) this.count++;
    }
    // Начать воспроизведение последних sec секунд (до момента endAgo секунд назад)
    play(sec, endAgo) {
      const fps = 60 / C.REPLAY_STRIDE;
      const end = Math.max(1, this.count - Math.round((endAgo || 0) * fps));
      this.len = Math.min(end, Math.round(sec * fps));
      this.start = end - this.len;
      this.pos = 0; this.playing = this.len > 2;
      return this.playing;
    }
    // Возвращает true, когда повтор закончился. Последние 1.4 с — замедление.
    update(dt) {
      if (!this.playing) return true;
      const fps = 60 / C.REPLAY_STRIDE;
      const slow = this.pos > this.len - 1.4 * fps ? 0.4 : 1;
      this.pos += dt * fps * slow;
      if (this.pos >= this.len - 1) { this.pos = this.len - 1; this.playing = false; return true; }
      return false;
    }
    slowmo() { return this.pos > this.len - 1.4 * (60 / C.REPLAY_STRIDE); }
    frameIdx(i) { return ((this.head - this.count + this.start + i) % C.REPLAY_CAP + C.REPLAY_CAP) % C.REPLAY_CAP; }
    // Записывает в r*-поля сущностей интерполированное состояние
    apply(ball, ents) {
      const i0 = Math.floor(this.pos), i1 = Math.min(this.len - 1, i0 + 1), t = this.pos - i0;
      const a = this.frameIdx(i0) * this.stride, c = this.frameIdx(i1) * this.stride, b = this.buf;
      ball.rx = b[a] + (b[c] - b[a]) * t; ball.ry = b[a + 1] + (b[c + 1] - b[a + 1]) * t; ball.rz = b[a + 2] + (b[c + 2] - b[a + 2]) * t;
      ball.rframe = b[a + 3];
      for (let i = 0; i < this.n; i++) {
        const p = ents[i];
        if (!p) continue;
        const k = a + 5 + i * PS, k2 = c + 5 + i * PS;
        p.rx = b[k] + (b[k2] - b[k]) * t; p.ry = b[k + 1] + (b[k2 + 1] - b[k + 1]) * t; p.rz = b[k + 2] + (b[k2 + 2] - b[k + 2]) * t;
        p.rpose = b[k + 3]; p.rdir = b[k + 4]; p.rvis = b[k + 5] > 0;
      }
    }
  }
  PF.Replay = Replay;
})(window.PF);
