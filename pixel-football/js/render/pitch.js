'use strict';
// Поле, трибуны с анимированной толпой, рекламные щиты и ворота с сеткой.
// Проекция: лёгкая псевдо-перспектива — поле рисуется трапецией (ближняя бровка шире дальней),
// по Y сжатие, высота Z поднимает объект вверх по экрану.
(function (PF) {
  const C = PF.C, U = PF.U;
  const PERSP = 1.1; // смещение (px на метр от центра по Y) у линий ворот
  const HALF_L = C.PITCH_L / 2, MID_Y = C.PITCH_W / 2;

  // --- Проекция мира в «мировые пиксели» (до вычитания камеры) ---
  const Proj = {
    sx: (x, y) => x * C.PPM + (y - MID_Y) * PERSP * (x - HALF_L) / HALF_L,
    sy: (y, z) => y * C.PPM_Y - (z || 0) * C.PPM_Z,
  };
  PF.Proj = Proj;

  // Границы большого канваса поля
  const X0 = -160, X1 = 1000;
  const Y0 = C.WORLD_Y0 * C.PPM_Y - C.STANDS_H, Y1 = C.WORLD_Y1 * C.PPM_Y;
  const GW = X1 - X0, GH = Y1 - Y0;
  const STAND_BOTTOM = -20; // py, где кончаются трибуны (y = -4 м)

  let ground = null, standFrames = [], goalBack = [[], []], goalFront = [];
  const goalOrigin = [];

  const BRANDS = ['ПИКСЕЛАД', 'БАЙТ-КОЛА', '8БИТ БАНК', 'КИБЕРМОБАЙЛ', 'РЕТРО ТВ', 'СПРАЙТЕКС', 'ГИГАПИЦЦА', 'ЛУП АВИА'];
  const BRAND_COL = [['#d02040', '#fff'], ['#202020', '#ffd23c'], ['#1a50c0', '#fff'], ['#20a060', '#fff'], ['#ff8020', '#1a1a1a'], ['#7030c0', '#fff'], ['#f0f0f0', '#d02020'], ['#00a0c0', '#fff']];

  function plotLine(c, x0, y0, x1, y1, col) {
    // Брезенхэм по экранным точкам
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    c.fillStyle = col;
    for (let i = 0; i < 4000; i++) {
      c.fillRect(x0, y0, 1, 1);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  // Линия разметки в мировых координатах
  function wline(c, ax, ay, bx, by, col) {
    plotLine(c, Proj.sx(ax, ay) - X0, Proj.sy(ay) - Y0, Proj.sx(bx, by) - X0, Proj.sy(by) - Y0, col);
  }
  // Дуга окружности на поле (в метрах), a0..a1 — углы
  function warc(c, cx, cy, r, a0, a1, col) {
    const n = Math.ceil(r * 24);
    let px = null, py = null;
    for (let i = 0; i <= n; i++) {
      const a = a0 + (a1 - a0) * (i / n);
      const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      const sx = Proj.sx(x, y) - X0, sy = Proj.sy(y) - Y0;
      if (px !== null) plotLine(c, px, py, sx, sy, col);
      px = sx; py = sy;
    }
  }

  function buildGround(night) {
    ground = U.makeCanvas(GW, GH);
    const c = ground.getContext('2d');
    const g1 = night ? '#2f7a34' : '#3e9a3c', g2 = night ? '#2a6e2f' : '#368a35', track = night ? '#24402a' : '#2f5a35';
    c.fillStyle = '#1b2236'; c.fillRect(0, 0, GW, GH);
    // Трава построчно: полосы покоса — это отрезки по X, которые в перспективе становятся наклонными
    const SW = C.PITCH_L / 18;
    const rng = new U.RNG(77);
    for (let r = STAND_BOTTOM - Y0; r < GH; r++) {
      const y = (r + Y0) / C.PPM_Y;
      const xa = Proj.sx(-12, y) - X0, xb = Proj.sx(117, y) - X0;
      c.fillStyle = track; c.fillRect(0, r, GW, 1);
      for (let s = -3; s < 21; s++) {
        const a = Math.max(-12, s * SW), b = Math.min(117, (s + 1) * SW);
        if (b <= a) continue;
        const sa = Proj.sx(a, y) - X0, sb = Proj.sx(b, y) - X0;
        c.fillStyle = (s & 1) ? g1 : g2;
        c.fillRect(Math.round(sa), r, Math.round(sb) - Math.round(sa), 1);
      }
      if (xa > 0) { c.fillStyle = track; c.fillRect(0, r, Math.round(xa), 1); }
      c.fillStyle = track; c.fillRect(Math.round(xb), r, GW, 1);
    }
    // Текстура травы
    const img = c.getImageData(0, STAND_BOTTOM - Y0, GW, GH - (STAND_BOTTOM - Y0));
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = rng.next();
      if (v < 0.05) { d[i] *= 0.88; d[i + 1] *= 0.9; d[i + 2] *= 0.88; } else if (v > 0.97) { d[i] = Math.min(255, d[i] * 1.12); d[i + 1] = Math.min(255, d[i + 1] * 1.1); }
    }
    c.putImageData(img, 0, STAND_BOTTOM - Y0);

    // Разметка
    const L = 'rgba(240,248,240,0.92)';
    const PL = C.PITCH_L, PW = C.PITCH_W;
    wline(c, 0, 0, PL, 0, L); wline(c, 0, PW, PL, PW, L);
    wline(c, 0, 0, 0, PW, L); wline(c, PL, 0, PL, PW, L);
    wline(c, HALF_L, 0, HALF_L, PW, L);
    warc(c, HALF_L, MID_Y, C.CIRCLE_R, 0, Math.PI * 2, L);
    for (const side of [0, 1]) {
      const gx = side ? PL : 0, dir = side ? -1 : 1;
      const bx = gx + dir * C.BOX_DEPTH, sx6 = gx + dir * C.SIX_DEPTH;
      wline(c, gx, MID_Y - C.BOX_HALF, bx, MID_Y - C.BOX_HALF, L); wline(c, gx, MID_Y + C.BOX_HALF, bx, MID_Y + C.BOX_HALF, L);
      wline(c, bx, MID_Y - C.BOX_HALF, bx, MID_Y + C.BOX_HALF, L);
      wline(c, gx, MID_Y - C.SIX_HALF, sx6, MID_Y - C.SIX_HALF, L); wline(c, gx, MID_Y + C.SIX_HALF, sx6, MID_Y + C.SIX_HALF, L);
      wline(c, sx6, MID_Y - C.SIX_HALF, sx6, MID_Y + C.SIX_HALF, L);
      // дуга у штрафной
      const spot = gx + dir * C.PEN_SPOT;
      const ang = Math.acos((C.BOX_DEPTH - C.PEN_SPOT) / C.CIRCLE_R);
      if (side === 0) warc(c, spot, MID_Y, C.CIRCLE_R, -ang, ang, L); else warc(c, spot, MID_Y, C.CIRCLE_R, Math.PI - ang, Math.PI + ang, L);
      c.fillStyle = L;
      c.fillRect(Math.round(Proj.sx(spot, MID_Y) - X0), Math.round(Proj.sy(MID_Y) - Y0), 2, 1);
      // угловые дуги
      warc(c, gx, 0, 1, side ? Math.PI / 2 : 0, side ? Math.PI : Math.PI / 2, L);
      warc(c, gx, PW, 1, side ? Math.PI : -Math.PI / 2, side ? Math.PI * 1.5 : 0, L);
    }
    c.fillStyle = L;
    c.fillRect(Math.round(Proj.sx(HALF_L, MID_Y) - X0) - 1, Math.round(Proj.sy(MID_Y) - Y0), 3, 1);

    // Угловые флажки
    for (const fx of [0, PL]) for (const fy of [0, PW]) {
      const x = Math.round(Proj.sx(fx, fy) - X0), y = Math.round(Proj.sy(fy) - Y0);
      c.fillStyle = '#f0f0f0'; c.fillRect(x, y - 9, 1, 9);
      c.fillStyle = '#ffd23c'; c.fillRect(x + 1, y - 9, 3, 2);
    }

    // Рекламные щиты: дальние (за бровкой) и ближние
    drawBoards(c, -2.8, 7);
    drawBoards(c, 71.2, 8);
  }

  function drawBoards(c, wy, h) {
    const py = Math.round(Proj.sy(wy) - Y0);
    const xa = Proj.sx(-9, wy) - X0, xb = Proj.sx(114, wy) - X0;
    const panel = 64;
    let i = 0;
    for (let x = Math.round(xa); x < xb; x += panel, i++) {
      const w = Math.min(panel, Math.round(xb) - x);
      const bc = BRAND_COL[i % BRAND_COL.length];
      c.fillStyle = '#140f1c'; c.fillRect(x, py - h - 1, w, h + 2);
      c.fillStyle = bc[0]; c.fillRect(x + 1, py - h, w - 2, h);
      c.fillStyle = 'rgba(255,255,255,0.18)'; c.fillRect(x + 1, py - h, w - 2, 1);
      if (w > 40 && h >= 7) PF.Font.draw(c, BRANDS[i % BRANDS.length], x + w / 2, py - h + (h - 7) / 2, bc[1], 1, 1);
    }
  }

  // --- Трибуны: 2 набора по 4 кадра (спокойно / ликование) ---
  function buildStands(homeKit, awayKit, night) {
    standFrames = [];
    const H = STAND_BOTTOM - Y0; // высота трибун в px
    const rng = new U.RNG(1234);
    const fans = [];
    const neutral = ['#d0d0d8', '#404858', '#806040', '#c03030', '#3050a0', '#e0c040', '#2a2a2a', '#f0f0f0'];
    const skins = ['#f2c69a', '#c98d5e', '#7d5136', '#e8b88a'];
    const ROW_H = 6, TOP = 14, WALL = 8;
    const rows = Math.floor((H - TOP - WALL - 6) / ROW_H);
    for (let r = 0; r < rows; r++) {
      const y = TOP + r * ROW_H;
      for (let x = (r & 1) * 2; x < GW; x += 4) {
        if (rng.chance(0.07)) continue; // пустые места
        const away = x > GW * 0.78;
        const v = rng.next();
        let col;
        if (away) col = v < 0.55 ? awayKit.p : v < 0.75 ? awayKit.s : rng.pick(neutral);
        else col = v < 0.5 ? homeKit.p : v < 0.68 ? homeKit.s : rng.pick(neutral);
        fans.push({ x, y, col, skin: rng.pick(skins), ph: rng.int(0, 3), hair: rng.chance(0.5) ? '#2b1d14' : '#6b4423', arms: rng.chance(0.6) });
      }
    }
    // Флаги болельщиков
    const flags = [];
    for (let i = 0; i < 14; i++) flags.push({ x: rng.int(20, GW - 40), y: TOP + rng.int(1, rows - 3) * ROW_H, kit: rng.chance(0.75) ? homeKit : awayKit, ph: rng.int(0, 3) });
    for (const ex of [0, 1]) for (let f = 0; f < 4; f++) {
      const cv = U.makeCanvas(GW, H);
      const c = cv.getContext('2d');
      // Крыша и прожекторы
      c.fillStyle = night ? '#070910' : '#1a2032'; c.fillRect(0, 0, GW, H);
      c.fillStyle = night ? '#10141f' : '#262d45'; c.fillRect(0, 0, GW, TOP - 3);
      c.fillStyle = '#3a4466'; c.fillRect(0, TOP - 3, GW, 1);
      for (let x = 40; x < GW; x += 180) {
        c.fillStyle = '#5a6488'; c.fillRect(x, 1, 18, 6);
        c.fillStyle = night ? '#fffbe0' : '#e8ecf8'; for (let k = 0; k < 4; k++) c.fillRect(x + 1 + k * 4, 2, 3, 4);
      }
      // Ступени
      for (let r = 0; r < rows; r++) {
        c.fillStyle = r & 1 ? '#262c44' : '#2c3350';
        c.fillRect(0, TOP + r * ROW_H, GW, ROW_H);
        c.fillStyle = '#1c2034'; c.fillRect(0, TOP + r * ROW_H + ROW_H - 1, GW, 1);
      }
      // Болельщики
      for (const p of fans) {
        const jump = ex ? ((p.ph + f) & 1 ? -2 : 0) : ((p.ph + f) % 4 === 0 ? -1 : 0);
        const y = p.y + jump;
        c.fillStyle = p.col; c.fillRect(p.x, y + 3, 3, 3);
        c.fillStyle = p.skin; c.fillRect(p.x + 0.5 | 0, y + 1, 2, 2);
        c.fillStyle = p.hair; c.fillRect(p.x + 0.5 | 0, y + 1, 2, 1);
        if (ex && p.arms && (p.ph + f) & 1) { c.fillStyle = p.skin; c.fillRect(p.x - 1, y, 1, 2); c.fillRect(p.x + 3, y, 1, 2); }
      }
      // Флаги
      for (const fl of flags) {
        const wave = ((fl.ph + f) & 1) && ex ? 1 : (fl.ph + f) % 4 === 0 ? 1 : 0;
        c.fillStyle = '#c0c0c0'; c.fillRect(fl.x, fl.y - 8, 1, 12);
        c.fillStyle = fl.kit.p; c.fillRect(fl.x + 1, fl.y - 8 + wave, 10, 3);
        c.fillStyle = fl.kit.s; c.fillRect(fl.x + 1, fl.y - 5 + wave, 10, 3);
      }
      // Стенка перед трибуной с баннерами
      const wy = H - WALL - 6;
      c.fillStyle = '#3a4466'; c.fillRect(0, wy, GW, WALL);
      c.fillStyle = '#4a5680'; c.fillRect(0, wy, GW, 1);
      const banners = ['ВПЕРЕД!', 'ПИКСЕЛЬ ЛИГА 27', 'МЫ С ВАМИ!', 'ЧЕСТНАЯ ИГРА', '16 БИТ НАВСЕГДА'];
      for (let i = 0; i < 6; i++) {
        const bx = 60 + i * 190;
        const t = banners[i % banners.length], w = PF.Font.width(t) + 6;
        c.fillStyle = i % 2 ? homeKit.p : '#f0f0f0'; c.fillRect(bx, wy, w, WALL);
        PF.Font.draw(c, t, bx + 3, wy + 1, i % 2 ? (U.luma(homeKit.p) > 0.6 ? '#1a1a1a' : '#fff') : '#1a2032');
      }
      // Беговая дорожка между трибуной и полем
      c.fillStyle = night ? '#24402a' : '#2f5a35'; c.fillRect(0, H - 6, GW, 6);
      standFrames.push(cv);
    }
  }

  // --- Ворота: задняя часть (сетка, дальняя штанга) и передняя (ближняя штанга, перекладина) ---
  function buildGoals() {
    for (const side of [0, 1]) {
      const gx = side ? C.PITCH_L : 0, dir = side ? 1 : -1; // dir — куда уходит сетка
      const y1 = MID_Y - C.GOAL_HALF, y2 = MID_Y + C.GOAL_HALF, H = C.GOAL_H, D = C.GOAL_DEPTH, BH = H * 0.8;
      const pts = [];
      const P = (x, y, z) => { const p = [Proj.sx(x, y), Proj.sy(y, z)]; pts.push(p); return p; };
      // габариты
      for (const x of [gx, gx + dir * D]) for (const y of [y1, y2]) for (const z of [0, H]) P(x, y, z);
      let mnx = 1e9, mny = 1e9, mxx = -1e9, mxy = -1e9;
      for (const p of pts) { mnx = Math.min(mnx, p[0]); mny = Math.min(mny, p[1]); mxx = Math.max(mxx, p[0]); mxy = Math.max(mxy, p[1]); }
      mnx = Math.floor(mnx) - 4; mny = Math.floor(mny) - 4;
      const w = Math.ceil(mxx - mnx) + 8, h = Math.ceil(mxy - mny) + 8;
      goalOrigin[side] = [mnx, mny];
      const L = (c, ax, ay, az, bx, by, bz, col) => plotLine(c, Proj.sx(ax, ay) - mnx, Proj.sy(ay, az) - mny, Proj.sx(bx, by) - mnx, Proj.sy(by, bz) - mny, col);
      const NET = 'rgba(235,240,250,0.55)', POST = '#f8f8f8', POSTS = '#9aa0b0';
      for (const bulge of [0, 1]) {
        const cv = U.makeCanvas(w, h), c = cv.getContext('2d');
        const bx = gx + dir * (D + bulge * 0.7); // при голе сетка выгибается назад
        // сетка: задняя стенка
        for (let i = 0; i <= 10; i++) { const y = y1 + (y2 - y1) * i / 10; L(c, bx, y, 0, bx, y, BH, NET); }
        for (let k = 0; k <= 4; k++) { const z = BH * k / 4; L(c, bx, y1, z, bx, y2, z, NET); }
        // крыша сетки
        for (let i = 0; i <= 10; i += 2) { const y = y1 + (y2 - y1) * i / 10; L(c, gx, y, H, bx, y, BH, NET); }
        // дальняя боковая сетка
        for (let k = 0; k <= 4; k++) { const z = H * k / 4; L(c, gx, y1, z, bx, y1, Math.min(z, BH), NET); }
        L(c, gx, y1, 0, bx, y1, 0, NET);
        L(c, bx, y1, 0, bx, y1, BH, POSTS); L(c, bx, y2, 0, bx, y2, BH, POSTS);
        // дальняя штанга
        L(c, gx, y1, 0, gx, y1, H, POSTS);
        L(c, gx + dir * -0.05, y1, 0, gx + dir * -0.05, y1, H, POST);
        goalBack[side][bulge] = cv;
      }
      const cf = U.makeCanvas(w, h), c = cf.getContext('2d');
      // ближняя боковая сетка
      for (let k = 0; k <= 4; k++) { const z = H * k / 4; L(c, gx, y2, z, gx + dir * D, y2, Math.min(z, BH), 'rgba(235,240,250,0.4)'); }
      L(c, gx, y2, 0, gx + dir * D, y2, 0, 'rgba(235,240,250,0.5)');
      // перекладина и ближняя штанга (двойная толщина)
      L(c, gx, y1, H, gx, y2, H, POST);
      plotLine(c, Proj.sx(gx, y1) - mnx, Proj.sy(y1, H) - mny - 1, Proj.sx(gx, y2) - mnx, Proj.sy(y2, H) - mny - 1, POST);
      L(c, gx, y2, 0, gx, y2, H, POST);
      plotLine(c, Proj.sx(gx, y2) - mnx + 1, Proj.sy(y2, 0) - mny, Proj.sx(gx, y2) - mnx + 1, Proj.sy(y2, H) - mny, POSTS);
      goalFront[side] = cf;
    }
  }

  PF.Pitch = {
    X0, Y0, GW, GH,
    build(homeKit, awayKit, night) {
      buildGround(night);
      buildStands(homeKit, awayKit, night);
      buildGoals();
    },
    drawGround(ctx, cam) {
      // фон канваса уже включает трибуны? нет — трибуны рисуются отдельно (анимированы)
      ctx.drawImage(ground, cam.left - X0, cam.top - Y0, cam.vw + 1, cam.vh + 1, 0, 0, cam.vw + 1, cam.vh + 1);
    },
    drawStands(ctx, cam, frame, excited) {
      const sf = standFrames[(excited ? 4 : 0) + (frame & 3)];
      const h = STAND_BOTTOM - Y0;
      const top = Y0 - cam.top;
      if (top + h <= 0) return;
      ctx.drawImage(sf, cam.left - X0, 0, cam.vw + 1, h, 0, top, cam.vw + 1, h);
    },
    standsTop: () => Y0,
    drawGoal(ctx, cam, side, front, bulge) {
      const o = goalOrigin[side];
      const img = front ? goalFront[side] : goalBack[side][bulge ? 1 : 0];
      ctx.drawImage(img, Math.round(o[0] - cam.left), Math.round(o[1] - cam.top));
    },
  };
})(window.PF);
