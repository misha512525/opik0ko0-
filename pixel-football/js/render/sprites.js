'use strict';
// Процедурные пиксельные спрайты.
// Фигура игрока задаётся «скелетом» (голова, корпус, руки, ноги) для каждой позы и направления,
// растеризуется в индексный буфер, получает автоматическую светотень и контур, а затем
// перекрашивается в цвета формы. Готовые листы кэшируются в offscreen-канвасах.
(function (PF) {
  const U = PF.U, P = PF.POSE;
  const CELL = 24;
  const AX = 12, AY = 23; // точка «ступней» внутри клетки

  // Индексы палитры
  const T = 0, OL = 1, SK = 2, SKS = 3, HR = 4, JR = 5, JRS = 6, TR = 7, SH = 8, SHS = 9, SO = 10, BO = 11, EY = 12, GL = 13, WH = 14, TRS = 15, SOS = 16, HRS = 17;
  const SHADE = new Uint8Array(32);
  for (let i = 0; i < 32; i++) SHADE[i] = i;
  SHADE[SK] = SKS; SHADE[JR] = JRS; SHADE[TR] = TRS; SHADE[SH] = SHS; SHADE[SO] = SOS; SHADE[HR] = HRS;

  const SKINS = [['#f2c69a', '#c98f63'], ['#c98d5e', '#9a6640'], ['#7d5136', '#573623']];
  const HAIRS = ['#2b1d14', '#6b4423', '#e2bc5c', '#141414', '#a3512b'];

  // ---------- Растеризация примитивов в индексный буфер ----------
  let buf = new Uint8Array(CELL * CELL);
  function put(x, y, c) { if (x >= 0 && y >= 0 && x < CELL && y < CELL && c) buf[y * CELL + x] = c; }

  // Капсула (конечность): все пиксели в пределах r от отрезка; цвет зависит от t вдоль отрезка
  function seg(x0, y0, x1, y1, r, colorFn) {
    const minx = Math.floor(Math.min(x0, x1) - r - 1), maxx = Math.ceil(Math.max(x0, x1) + r + 1);
    const miny = Math.floor(Math.min(y0, y1) - r - 1), maxy = Math.ceil(Math.max(y0, y1) + r + 1);
    for (let y = miny; y <= maxy; y++) for (let x = minx; x <= maxx; x++) {
      const s = U.segDist(x + 0.5, y + 0.5, x0, y0, x1, y1);
      if (s.d <= r) put(x, y, colorFn(s.t, x, y));
    }
  }
  // Ориентированный прямоугольник (корпус): t в [0,1] вдоль оси, |перпендикуляр| <= hw
  function box(x0, y0, x1, y1, hw, colorFn) {
    const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
    const minx = Math.floor(Math.min(x0, x1) - hw - 1), maxx = Math.ceil(Math.max(x0, x1) + hw + 1);
    const miny = Math.floor(Math.min(y0, y1) - hw - 1), maxy = Math.ceil(Math.max(y0, y1) + hw + 1);
    for (let y = miny; y <= maxy; y++) for (let x = minx; x <= maxx; x++) {
      const px = x + 0.5 - x0, py = y + 0.5 - y0;
      const along = px * ux + py * uy, perp = -px * uy + py * ux;
      if (along < 0 || along > L || Math.abs(perp) > hw) continue;
      const t = along / L;
      // скруглённые «плечи»
      if (t < 0.12 && Math.abs(perp) > hw - 1) continue;
      put(x, y, colorFn(t, x, y, perp));
    }
  }
  function disk(cx, cy, r, colorFn) {
    for (let y = Math.floor(cy - r - 1); y <= cy + r + 1; y++) for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      if (dx * dx + dy * dy <= r * r) put(x, y, colorFn(x, y, dx, dy));
    }
  }

  // ---------- Описание поз ----------
  // view: F — лицом, B — спиной, S — боком (вправо). Координаты в пикселях клетки 24x24.
  // legs: [бедро x,y, колено x,y, стопа x,y]; arms: [плечо x,y, кисть x,y]. В S-виде первый элемент — дальний.
  const std = {
    F: () => ({ view: 'F', head: [12, 6], neck: [12, 9], hip: [12, 16], tw: 4,
      legs: [[10, 16, 10, 19, 10, 22], [14, 16, 14, 19, 14, 22]], arms: [[7, 9.8, 7, 14.5], [17, 9.8, 17, 14.5]] }),
    S: () => ({ view: 'S', head: [12, 6], neck: [12, 9], hip: [12, 16], tw: 3,
      legs: [[11.5, 16, 11, 19, 11, 22], [12.5, 16, 13, 19, 13, 22]], arms: [[12, 10, 13, 14.5], [12, 10, 11.5, 14.5]] }),
  };
  function shiftY(p, d) {
    p.head[1] += d; p.neck[1] += d; p.hip[1] += d;
    for (const a of p.arms) { a[1] += d; a[3] += d; }
    for (const l of p.legs) { l[1] += d; l[3] += d * 0.5; }
    return p;
  }
  function front(view, f) { const p = std.F(); p.view = view; return f ? f(p) || p : p; }
  function side(f) { const p = std.S(); return f ? f(p) || p : p; }

  // Позы: функция (dir) -> скелет. dir: 0 — к камере, 1 — от камеры, 2 — вправо
  const POSES = [];
  POSES[P.IDLE] = (d) => (d === 2 ? side() : front(d ? 'B' : 'F'));
  const RUN_F = [
    (p) => { p.legs[0] = [10, 16, 10, 18, 10, 20.5]; p.arms[1] = [17, 9.8, 16.5, 13]; },
    (p) => { shiftY(p, -1); },
    (p) => { p.legs[1] = [14, 16, 14, 18, 14, 20.5]; p.arms[0] = [7, 9.8, 7.5, 13]; },
    (p) => { shiftY(p, -1); },
  ];
  const RUN_S = [
    (p) => { p.head[0] += 0.5; p.legs[1] = [12.5, 16, 14.5, 18.5, 16, 21.5]; p.legs[0] = [11.5, 16, 10, 19, 7.5, 20.5]; p.arms[1] = [12, 10, 9.5, 13.5]; p.arms[0] = [12, 10, 15, 12.5]; },
    (p) => { shiftY(p, -1); p.head[0] += 0.5; p.legs[1] = [12.5, 15, 12.5, 18, 12, 21.5]; p.legs[0] = [11.5, 15, 13.5, 17.5, 11, 19.5]; },
    (p) => { p.head[0] += 0.5; p.legs[0] = [11.5, 16, 14, 18.5, 15.5, 21.5]; p.legs[1] = [12.5, 16, 10.5, 19, 8, 20.5]; p.arms[1] = [12, 10, 15, 12.5]; p.arms[0] = [12, 10, 9.5, 13.5]; },
    (p) => { shiftY(p, -1); p.head[0] += 0.5; p.legs[0] = [11.5, 15, 12, 18, 11.5, 21.5]; p.legs[1] = [12.5, 15, 14, 17.5, 11.5, 19.5]; },
  ];
  for (let i = 0; i < 4; i++) POSES[P.RUN0 + i] = (d) => (d === 2 ? side(RUN_S[i]) : front(d ? 'B' : 'F', RUN_F[i]));
  POSES[P.KICK0] = (d) => (d === 2
    ? side((p) => { p.legs[1] = [12.5, 16, 10, 18.5, 7, 19]; p.arms[1] = [12, 10, 15, 11]; p.arms[0] = [12, 10, 9, 12]; })
    : front(d ? 'B' : 'F', (p) => { p.legs[1] = [14, 16, 14.5, 18.5, 15, 20]; p.arms[0] = [7, 9.8, 5, 12.5]; }));
  POSES[P.KICK1] = (d) => (d === 2
    ? side((p) => { p.neck[0] = 11.5; p.head[0] = 11.5; p.legs[1] = [12.5, 16, 15.5, 17, 19, 16.5]; p.arms[1] = [11.5, 10, 8.5, 12]; p.arms[0] = [11.5, 10, 15, 11]; })
    : front(d ? 'B' : 'F', (p) => { p.legs[1] = [14, 16, 15, 18, 15.5, 19.5]; p.arms[0] = [7, 9.8, 4.5, 12]; p.arms[1] = [17, 9.8, 19.5, 12]; }));
  POSES[P.TACKLE] = (d) => (d === 2
    ? side((p) => { p.head = [14, 8]; p.neck = [13.5, 10.5]; p.hip = [11.5, 17]; p.legs[1] = [12, 17, 15, 19.5, 18.5, 21.5]; p.legs[0] = [11, 17, 9.5, 19.5, 7, 22]; p.arms[1] = [13, 11, 10.5, 15]; p.arms[0] = [13, 11, 16, 13]; })
    : front(d ? 'B' : 'F', (p) => { shiftY(p, 1); p.legs[0] = [10, 17, 9, 19.5, 8, 22]; p.legs[1] = [14, 17, 15.5, 19, 16.5, 21]; p.arms[0] = [7, 10.8, 5, 14]; p.arms[1] = [17, 10.8, 19, 14]; }));
  POSES[P.SLIDE] = (d) => (d === 2
    ? side((p) => { p.head = [5, 12.5]; p.neck = [7, 15.5]; p.hip = [10, 20]; p.tw = 2.6; p.legs[1] = [10, 20, 14.5, 21, 19, 21.5]; p.legs[0] = [10, 20, 13, 18.5, 15, 21.5]; p.arms[1] = [7.5, 16, 4.5, 20]; p.arms[0] = [7, 16, 4, 13]; })
    : front(d ? 'B' : 'F', (p) => { p.head = [12, 11]; p.neck = [12, 14]; p.hip = [12, 19]; p.legs[0] = [10, 19, 8, 21, 7, 22.5]; p.legs[1] = [14, 19, 16, 21, 17, 22.5]; p.arms[0] = [7.5, 14.5, 5.5, 18.5]; p.arms[1] = [16.5, 14.5, 18.5, 18.5]; }));
  const FALLEN = () => side((p) => { p.head = [4.5, 19.5]; p.neck = [7.5, 20]; p.hip = [14, 20]; p.tw = 2; p.legs[0] = [14, 19.5, 17.5, 19, 21, 20.5]; p.legs[1] = [14, 21, 17.5, 21.5, 21, 22]; p.arms[0] = [8, 18.5, 9.5, 16]; p.arms[1] = [8, 21.5, 10.5, 22.5]; });
  POSES[P.FALLEN] = FALLEN;
  POSES[P.CELEB0] = (d) => front(d === 1 ? 'B' : 'F', (p) => { p.arms[0] = [7, 9.8, 5, 4.5]; p.arms[1] = [17, 9.8, 19, 4.5]; });
  POSES[P.CELEB1] = (d) => front(d === 1 ? 'B' : 'F', (p) => { shiftY(p, -2); p.arms[0] = [7, 7.8, 5.5, 2.5]; p.arms[1] = [17, 7.8, 18.5, 2.5]; p.legs[0] = [10, 14, 9, 16.5, 10, 19.5]; p.legs[1] = [14, 14, 15, 16.5, 14, 19.5]; });
  POSES[P.THROW] = (d) => (d === 2
    ? side((p) => { p.arms[1] = [12, 10, 11, 3.5]; p.arms[0] = [12, 10, 12, 3.5]; })
    : front(d ? 'B' : 'F', (p) => { p.arms[0] = [7, 9.8, 9.5, 3.5]; p.arms[1] = [17, 9.8, 14.5, 3.5]; }));
  POSES[P.HEADER] = (d) => (d === 2
    ? side((p) => { p.head = [14, 6.5]; p.neck = [13, 9.5]; p.hip = [11.5, 16]; p.legs[0] = [11.5, 16, 10, 18.5, 9, 21]; p.legs[1] = [11.5, 16, 12.5, 19, 12, 22]; p.arms[1] = [12.5, 10, 9, 12]; p.arms[0] = [12.5, 10, 10, 13]; })
    : front(d ? 'B' : 'F', (p) => { p.arms[0] = [7, 9.8, 4.5, 11]; p.arms[1] = [17, 9.8, 19.5, 11]; }));
  POSES[P.DIVE_UP] = () => side((p) => { p.head = [14, 7]; p.neck = [13, 10]; p.hip = [10.5, 15.5]; p.tw = 2.8; p.arms[0] = [13, 10, 16.5, 3]; p.arms[1] = [12.5, 10.5, 15.5, 3.5]; p.legs[0] = [10.5, 15.5, 9, 18.5, 7.5, 21.5]; p.legs[1] = [10.5, 15.5, 10.5, 18.5, 10, 21.5]; });
  POSES[P.DIVE_DOWN] = () => side((p) => { p.head = [15.5, 16.5]; p.neck = [13, 17.5]; p.hip = [7.5, 18.5]; p.tw = 2.2; p.arms[0] = [13.5, 16.5, 19.5, 18.5]; p.arms[1] = [13, 18.5, 19.5, 21]; p.legs[0] = [7.5, 18, 5, 19, 2.5, 20.5]; p.legs[1] = [7.5, 19.5, 5, 21, 2.5, 22]; });
  POSES[P.HOLD] = (d) => (d === 2
    ? side((p) => { p.arms[1] = [12, 10, 15, 12]; p.arms[0] = [12, 10, 15.5, 12.5]; })
    : front(d ? 'B' : 'F', (p) => { p.arms[0] = [7, 9.8, 10.5, 13]; p.arms[1] = [17, 9.8, 13.5, 13]; }));
  // Позы, у которых нет вида спереди/сзади, используют боковой
  const SIDE_ONLY = new Set([P.FALLEN, P.DIVE_UP, P.DIVE_DOWN]);

  // ---------- Растеризация скелета ----------
  function legColor(far) {
    return (t) => (t < 0.1 ? SH : t < 0.36 ? (far ? SKS : SK) : t < 0.8 ? (far ? SOS : SO) : BO);
  }
  function rasterPose(p, pat, isGK) {
    buf = new Uint8Array(CELL * CELL);
    const cx = p.neck[0];
    const sleeve = pat === 'sleeves' ? TR : JR;
    const armColor = (far) => (t) => (t < 0.32 ? (far ? SHADE[sleeve] : sleeve) : t > 0.82 ? (isGK ? GL : far ? SKS : SK) : far ? SKS : SK);
    const torsoColor = (t, x, y) => {
      if (t >= 0.7) return SH;
      if (p.view === 'F' && t < 0.12 && Math.abs(x + 0.5 - cx) < 1.6) return TR; // воротник
      switch (pat) {
        case 'stripes': return ((x - 8) >> 1) & 1 ? TR : JR;
        case 'hoops': return ((y - 9) >> 1) & 1 ? TR : JR;
        case 'halves': return x < 12 ? JR : TR;
        case 'sash': return Math.abs((x - 8) - (y - 9)) < 1.5 ? TR : JR;
        default: return JR;
      }
    };
    const drawLeg = (l, far) => {
      seg(l[0], l[1], l[2], l[3], 0.85, (t) => legColor(far)(t * 0.5));
      seg(l[2], l[3], l[4], l[5], 0.85, (t) => legColor(far)(0.5 + t * 0.5));
      if (p.view === 'S') seg(l[4], l[5], l[4] + 1.6, l[5], 0.7, () => BO); // носок бутсы
    };
    const drawArm = (a, far) => seg(a[0], a[1], a[2], a[3], 0.85, armColor(far));
    const drawTorso = () => box(p.neck[0], p.neck[1], p.hip[0], p.hip[1] + 1.6, p.tw, torsoColor);
    const hx = p.head[0], hy = p.head[1];
    const drawHead = () => disk(hx, hy, 3.2, (x, y, dx, dy) => {
      if (p.view === 'B') return dy > 1.6 ? SK : HR;
      if (p.view === 'S') return (dy < -1.2 || dx < -0.6) && !(dy > 1.4) ? HR : SK;
      return dy < -1.2 || (dy < 0 && Math.abs(dx) > 2) ? HR : SK;
    });
    if (p.view === 'S') {
      drawArm(p.arms[0], true); drawLeg(p.legs[0], true); drawTorso(); drawLeg(p.legs[1], false); drawHead(); drawArm(p.arms[1], false);
      // глаз и нос
      put(Math.floor(hx + 1.2), Math.floor(hy), EY);
      put(Math.floor(hx + 3.1), Math.floor(hy + 0.4), SK);
    } else {
      drawLeg(p.legs[0], false); drawLeg(p.legs[1], false);
      if (p.view === 'B') { drawArm(p.arms[0], false); drawArm(p.arms[1], false); drawTorso(); }
      else { drawTorso(); drawArm(p.arms[0], false); drawArm(p.arms[1], false); }
      drawHead();
      if (p.view === 'F') { put(Math.floor(hx - 1.5), Math.floor(hy + 0.3), EY); put(Math.floor(hx + 0.5), Math.floor(hy + 0.3), EY); }
    }
    // Светотень: правый и нижний край каждой зоны темнее (свет сверху-слева)
    const out = new Uint8Array(buf);
    for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) {
      const c = buf[y * CELL + x];
      if (!c || SHADE[c] === c) continue;
      const r = x + 1 < CELL ? buf[y * CELL + x + 1] : 0, b = y + 1 < CELL ? buf[(y + 1) * CELL + x] : 0;
      if (!r || !b) out[y * CELL + x] = SHADE[c];
    }
    // Контур: прозрачный пиксель рядом с непрозрачным
    const res = new Uint8Array(out);
    for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) {
      if (out[y * CELL + x]) continue;
      if ((x > 0 && out[y * CELL + x - 1]) || (x < CELL - 1 && out[y * CELL + x + 1]) || (y > 0 && out[(y - 1) * CELL + x]) || (y < CELL - 1 && out[(y + 1) * CELL + x])) res[y * CELL + x] = OL;
    }
    return res;
  }
  function mirror(b) {
    const m = new Uint8Array(CELL * CELL);
    for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) m[y * CELL + (CELL - 1 - x)] = b[y * CELL + x];
    return m;
  }

  // Буферы поз кэшируются по узору формы (геометрия не зависит от цвета)
  const poseCache = new Map();
  const META = []; // [pose*4+dir] -> {numX, numY} для номера на спине
  function poseBuffers(pat, isGK) {
    const key = pat + (isGK ? 'g' : '');
    if (poseCache.has(key)) return poseCache.get(key);
    const arr = [];
    for (let pose = 0; pose < P.COUNT; pose++) {
      for (let dir = 0; dir < 4; dir++) {
        let b;
        const sideOnly = SIDE_ONLY.has(pose);
        if (dir === 3) { b = mirror(arr[pose * 4 + 2]); }
        else {
          const d = sideOnly ? 2 : dir;
          const p = POSES[pose](d);
          b = rasterPose(p, pat, isGK);
          if (!META[pose * 4 + dir]) META[pose * 4 + dir] = p.view === 'B' ? { numX: p.neck[0], numY: Math.round(p.neck[1]) + 1 } : null;
        }
        if (dir === 3 && !META[pose * 4 + 3]) META[pose * 4 + 3] = null;
        arr[pose * 4 + dir] = b;
      }
    }
    poseCache.set(key, arr);
    return arr;
  }

  // ---------- Листы спрайтов ----------
  const sheets = new Map();
  function kitPalette(kit, skin, hair) {
    const sk = SKINS[skin], hr = HAIRS[hair];
    const pal = [];
    pal[OL] = '#140f1c'; pal[SK] = sk[0]; pal[SKS] = sk[1]; pal[HR] = hr; pal[HRS] = U.shade(hr, -0.3);
    pal[JR] = kit.p; pal[JRS] = U.shade(kit.p, -0.28); pal[TR] = kit.s; pal[TRS] = U.shade(kit.s, -0.28);
    pal[SH] = kit.shorts; pal[SHS] = U.shade(kit.shorts, -0.3); pal[SO] = kit.socks; pal[SOS] = U.shade(kit.socks, -0.25);
    pal[BO] = kit.boots || '#1c1c24'; pal[EY] = '#1a1020'; pal[GL] = kit.gk ? '#f4f4f4' : sk[0]; pal[WH] = '#ffffff';
    return pal.map((c) => (c ? U.hex2rgb(c) : null));
  }
  function sheetFor(kit, skin, hair) {
    const key = kit.p + kit.s + kit.pat + kit.shorts + kit.socks + (kit.gk ? 'g' : '') + skin + hair;
    let s = sheets.get(key);
    if (s) return s;
    const bufs = poseBuffers(kit.pat, kit.gk);
    const pal = kitPalette(kit, skin, hair);
    const W = P.COUNT * CELL, H = 4 * CELL;
    const c = U.makeCanvas(W, H);
    const cx = c.getContext('2d');
    const img = cx.createImageData(W, H);
    const d = img.data;
    for (let pose = 0; pose < P.COUNT; pose++) for (let dir = 0; dir < 4; dir++) {
      const b = bufs[pose * 4 + dir];
      for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) {
        const v = b[y * CELL + x];
        if (!v) continue;
        const col = pal[v];
        const o = ((dir * CELL + y) * W + pose * CELL + x) * 4;
        d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = 255;
      }
    }
    cx.putImageData(img, 0, 0);
    s = { canvas: c, numColor: U.colorDist(kit.s, kit.p) > 120 && kit.pat === 'plain' ? kit.s : (U.luma(kit.p) > 0.55 ? '#1a1a1a' : '#ffffff') };
    sheets.set(key, s);
    return s;
  }

  // Рисует игрока: (sx, sy) — экранная точка ступней
  function drawPlayer(ctx, sheet, pose, dir, sx, sy, num) {
    ctx.drawImage(sheet.canvas, pose * CELL, dir * CELL, CELL, CELL, sx - AX, sy - AY, CELL, CELL);
    if (num != null) {
      const m = META[pose * 4 + dir];
      if (m) PF.Font.drawSmall(ctx, String(num), sx - AX + m.numX, sy - AY + m.numY, sheet.numColor, 1);
    }
  }

  // ---------- Мяч и тени ----------
  let ballSheet = null, shadowP = null, shadowB = null;
  function buildMisc() {
    // 4 кадра вращения + увеличенная версия для высоких мячей
    ballSheet = U.makeCanvas(6 * 8, 6);
    const c = ballSheet.getContext('2d');
    const pats = [[[1, 1], [3, 2], [2, 3]], [[2, 1], [1, 3], [3, 3]], [[3, 1], [2, 2], [1, 2]], [[1, 2], [3, 1], [2, 3]]];
    for (let f = 0; f < 8; f++) {
      const big = f >= 4, ox = f * 6, n = big ? 6 : 5;
      c.fillStyle = '#140f1c';
      if (big) { c.fillRect(ox + 1, 0, 4, 6); c.fillRect(ox, 1, 6, 4); } else { c.fillRect(ox + 1, 0, 3, 5); c.fillRect(ox, 1, 5, 3); }
      c.fillStyle = '#f4f4f4';
      if (big) { c.fillRect(ox + 1, 1, 4, 4); } else { c.fillRect(ox + 1, 1, 3, 3); }
      c.fillStyle = '#c8c8d8';
      if (big) { c.fillRect(ox + 4, 2, 1, 3); c.fillRect(ox + 2, 4, 2, 1); } else { c.fillRect(ox + 3, 2, 1, 2); c.fillRect(ox + 2, 3, 1, 1); }
      c.fillStyle = '#2a2a3a';
      const pp = pats[f % 4];
      const sc = big ? 1.3 : 1;
      c.fillRect(ox + Math.min(n - 2, Math.round(pp[0][0] * sc)), Math.min(n - 2, Math.round(pp[0][1] * sc)), 1, 1);
      c.fillStyle = '#ffffff';
      c.fillRect(ox + 1, 1, 1, 1);
    }
    shadowP = U.makeCanvas(12, 4);
    const s = shadowP.getContext('2d');
    s.fillStyle = 'rgba(0,20,0,0.38)';
    s.fillRect(2, 0, 8, 4); s.fillRect(0, 1, 12, 2);
    shadowB = U.makeCanvas(6, 3);
    const sb = shadowB.getContext('2d');
    sb.fillStyle = 'rgba(0,20,0,0.42)';
    sb.fillRect(1, 0, 4, 3); sb.fillRect(0, 1, 6, 1);
  }
  function drawBall(ctx, sx, sy, frame, big) {
    const f = (frame & 3) + (big ? 4 : 0), n = big ? 6 : 5;
    ctx.drawImage(ballSheet, f * 6, 0, n, n, Math.round(sx - n / 2), Math.round(sy - n), n, n);
  }
  function drawShadow(ctx, sx, sy, isBall, scale) {
    if (isBall) {
      const w = Math.max(3, Math.round(6 * (scale || 1)));
      ctx.drawImage(shadowB, 0, 0, 6, 3, Math.round(sx - w / 2), Math.round(sy - 2), w, 3);
    } else ctx.drawImage(shadowP, Math.round(sx - 6), Math.round(sy - 2));
  }

  // ---------- Эмблемы клубов ----------
  const crests = new Map();
  function crest(team, size) {
    const key = team.id + ':' + size;
    if (crests.has(key)) return crests.get(key);
    const w = 14, h = 16;
    const c = U.makeCanvas(w * size, h * size);
    const x = c.getContext('2d');
    x.scale(size, size);
    const k = team.kit.home;
    const p = k.p, s = U.colorDist(k.s, k.p) < 60 ? U.shade(k.p, -0.5) : k.s;
    // форма щита по маске
    const shapes = [
      (yy) => (yy < 10 ? [0, 14] : [yy - 9, 14 - (yy - 9)]),
      (yy) => (yy < 2 ? [2, 12] : yy < 11 ? [0, 14] : [Math.round((yy - 10) * 1.3), 14 - Math.round((yy - 10) * 1.3)]),
      (yy) => { const r = Math.sqrt(Math.max(0, 49 - (yy - 8) * (yy - 8))); return [Math.round(7 - r), Math.round(7 + r)]; },
      (yy) => (yy < 12 ? [1, 13] : [1 + (yy - 11) * 2, 13 - (yy - 11) * 2]),
    ];
    const sh = shapes[team.crest.shape];
    for (let yy = 0; yy < h; yy++) {
      const [a, b] = sh(yy);
      if (b <= a) continue;
      x.fillStyle = '#140f1c'; x.fillRect(a, yy, b - a, 1);
      if (b - a > 2) {
        for (let xx = a + 1; xx < b - 1; xx++) {
          let col = p;
          const band = team.crest.band;
          if (band === 1 && ((xx >> 1) & 1)) col = s;
          if (band === 2 && yy > 5 && yy < 9) col = s;
          if (band === 3 && xx > 7) col = s;
          x.fillStyle = col; x.fillRect(xx, yy, 1, 1);
        }
      }
    }
    // первая буква клуба
    x.fillStyle = 'rgba(0,0,0,0.5)'; x.fillRect(4, 4, 7, 9);
    PF.Font.draw(x, team.short[0], 5, 5, U.luma(p) > 0.6 && team.crest.band !== 3 ? '#1a1a1a' : '#ffffff');
    crests.set(key, c);
    return c;
  }

  // Крупный портрет игрока для карточек (голова и плечи из спрайта, x2)
  const portraits = new Map();
  function portrait(def, kit) {
    const key = def.id + kit.p;
    if (portraits.has(key)) return portraits.get(key);
    const sh = sheetFor(kit, def.skin, def.hair);
    const c = U.makeCanvas(32, 30);
    const x = c.getContext('2d');
    x.drawImage(sh.canvas, P.IDLE * CELL + 2, 1, 20, 15, 0, 0, 40, 30);
    portraits.set(key, c);
    return c;
  }

  PF.Sprites = {
    CELL, AX, AY,
    init: buildMisc,
    sheetFor, drawPlayer, drawBall, drawShadow, crest, portrait,
    clearSheets: () => { if (sheets.size > 80) sheets.clear(); },
    refereeKit: { p: '#1c1c22', s: '#f0d020', pat: 'plain', shorts: '#1c1c22', socks: '#1c1c22' },
  };
})(window.PF);
