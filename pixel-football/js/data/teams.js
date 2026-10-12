'use strict';
// Вымышленные лиги и клубы. Составы генерируются детерминированно из сида клуба,
// поэтому одни и те же игроки появляются при каждом запуске.
(function (PF) {
  const U = PF.U;

  // [название, аббревиатура, основной цвет, второй цвет, узор, шорты, рейтинг]
  const LEAGUES = [
    { id: 'pp', name: 'ПИКСЕЛЬ ПРЕМЬЕР', style: 'en', teams: [
      ['АЙРОНПОРТ ЮНАЙТЕД', 'АЙР', '#d42a2a', '#ffffff', 'plain', '#ffffff', 86],
      ['СИЛЬВЕРТОН СИТИ', 'СИЛ', '#6cb4ee', '#ffffff', 'plain', '#ffffff', 85],
      ['НОРТ ХАРБОР', 'НХБ', '#1d3a8a', '#ffffff', 'plain', '#ffffff', 80],
      ['БЛЭКМУР АТЛЕТИК', 'БЛМ', '#7a1f3d', '#8ac6f0', 'sleeves', '#ffffff', 77],
      ['КИНГСБРИДЖ', 'КНГ', '#f0f0f0', '#1d2a5a', 'plain', '#1d2a5a', 75],
      ['УЭСТФИЛД АЛЬБИОН', 'УФА', '#2a5ad0', '#ffffff', 'stripes', '#ffffff', 72],
      ['ФЕРН ВЭЛЛИ', 'ФРН', '#2a8a3a', '#ffd23c', 'plain', '#ffffff', 70],
      ['ГЛЕНМОР РОВЕРС', 'ГЛР', '#f07a1a', '#1a1a1a', 'plain', '#1a1a1a', 67],
    ] },
    { id: 'ls', name: 'ЛИГА СОЛЬ', style: 'es', teams: [
      ['АТЛЕТИКО СОЛ', 'АТС', '#d42a2a', '#ffffff', 'stripes', '#1d3a8a', 85],
      ['ДЕПОРТИВО БРАВА', 'ДБР', '#2050c0', '#ffffff', 'halves', '#ffffff', 82],
      ['СПОРТИНГ МАРИНО', 'СПМ', '#1a9a4a', '#ffffff', 'hoops', '#1a1a1a', 79],
      ['УНИОН ВАЛЬЕ', 'УНВ', '#f4f4f4', '#7a3ab0', 'sash', '#7a3ab0', 76],
      ['РАСИНГ ПУЭРТО', 'РАП', '#f0d020', '#1d3a8a', 'plain', '#1d3a8a', 73],
      ['БРИСА НОРТЕ', 'БРН', '#8ac6f0', '#ffffff', 'stripes', '#1a1a1a', 71],
      ['МОНТАНЬЯ КФ', 'МНТ', '#7a1f2a', '#e0b030', 'plain', '#e0b030', 68],
      ['АРЕНАС АЛЬТОС', 'АРА', '#1a1a1a', '#f07a1a', 'plain', '#1a1a1a', 65],
    ] },
    { id: 'sp', name: 'СЕРИЯ ПИКСЕЛЬ', style: 'it', teams: [
      ['АКВИЛА БЬЯНКА', 'АКВ', '#f4f4f4', '#1a1a1a', 'plain', '#1a1a1a', 84],
      ['ПОРТА НУОВА', 'ПНВ', '#1a3ad0', '#1a1a1a', 'stripes', '#1a1a1a', 83],
      ['СТЕЛЛА АЦЦУРРА', 'СТА', '#3a8ae0', '#ffffff', 'plain', '#ffffff', 78],
      ['ЛУПИ ДИ МОНТЕ', 'ЛДМ', '#8a1a2a', '#f0c020', 'plain', '#8a1a2a', 76],
      ['ТОРРЕ РОССА', 'ТРР', '#c81e1e', '#1a1a1a', 'stripes', '#1a1a1a', 74],
      ['ВЕНТО ДЕЛЬ НОРД', 'ВДН', '#6a2aa0', '#ffffff', 'plain', '#ffffff', 71],
      ['ФОРТЕЦЦА', 'ФРТ', '#f0c820', '#c81e1e', 'halves', '#c81e1e', 68],
      ['ГОЛЬФО БЛУ', 'ГЛБ', '#14245a', '#8ac6f0', 'hoops', '#14245a', 66],
    ] },
    { id: 'nl', name: 'НОРД ЛИГА', style: 'de', teams: [
      ['АЙЗЕНБУРГ 04', 'АЙЗ', '#1a1a1a', '#ffffff', 'stripes', '#1a1a1a', 84],
      ['ШТАЛЬШТАДТ', 'ШТЛ', '#d02020', '#ffffff', 'plain', '#ffffff', 81],
      ['РОТВАЛЬД', 'РТВ', '#2a8a3a', '#ffffff', 'plain', '#ffffff', 77],
      ['ФАЛЬКЕНБЕРГ', 'ФЛК', '#f4f4f4', '#d02020', 'sash', '#f4f4f4', 75],
      ['ГРОССХАФЕН', 'ГРХ', '#1a50b0', '#ffffff', 'plain', '#ffffff', 73],
      ['ВИНДМЮЛЕ', 'ВНД', '#f08020', '#1a3ad0', 'plain', '#1a3ad0', 70],
      ['ВАЙСФЕЛЬС', 'ВСФ', '#f4f4f4', '#1a8a3a', 'hoops', '#1a8a3a', 67],
      ['КЁНИГСТАЛЬ', 'КНТ', '#5a2a90', '#f0c020', 'plain', '#5a2a90', 64],
    ] },
    { id: 'vl', name: 'ВОСТОЧНАЯ ЛИГА', style: 'ru', teams: [
      ['СЕВЕРНАЯ ЗВЕЗДА', 'СЗВ', '#1a50c0', '#ffffff', 'plain', '#ffffff', 80],
      ['БУРЕВЕСТНИК', 'БУР', '#f4f4f4', '#1a50c0', 'hoops', '#1a50c0', 78],
      ['РАКЕТА', 'РКТ', '#d02020', '#ffffff', 'plain', '#d02020', 76],
      ['МЕТЕОР', 'МТР', '#f07020', '#1a1a1a', 'halves', '#1a1a1a', 73],
      ['СОКОЛ', 'СКЛ', '#1a8a3a', '#ffffff', 'stripes', '#ffffff', 71],
      ['БАЙКАЛ СТРЕЛА', 'БКС', '#6ab0e8', '#14245a', 'plain', '#14245a', 69],
      ['ПОЛЯРНЫЙ ЭКСПРЕСС', 'ПЛЭ', '#f4f4f4', '#d02020', 'sleeves', '#d02020', 66],
      ['ТАЙГА', 'ТГА', '#0f5a2a', '#f0d020', 'plain', '#0f5a2a', 63],
    ] },
  ];

  // Веса статов в общем рейтинге OVR по амплуа
  const OVR_W = {
    GK: { gk: 0.78, phy: 0.08, pas: 0.06, spd: 0.08 },
    DEF: { def: 0.45, phy: 0.22, spd: 0.15, pas: 0.13, dri: 0.05 },
    MID: { pas: 0.34, dri: 0.24, def: 0.12, sho: 0.12, spd: 0.12, phy: 0.06 },
    FWD: { sho: 0.4, dri: 0.22, spd: 0.24, phy: 0.08, pas: 0.06 },
  };
  // Профили статов относительно базового уровня
  const ARCH = {
    GK: { spd: -22, sho: -35, pas: -14, dri: -28, def: -18, phy: -2, gk: 4 },
    DEF: { spd: -4, sho: -24, pas: -8, dri: -14, def: 5, phy: 4, gk: -58 },
    MID: { spd: -2, sho: -7, pas: 4, dri: 2, def: -12, phy: -6, gk: -58 },
    FWD: { spd: 3, sho: 5, pas: -8, dri: 2, def: -36, phy: -2, gk: -58 },
  };
  const STATS = ['spd', 'sho', 'pas', 'dri', 'def', 'phy', 'gk'];
  const STAT_NAMES = { spd: 'СКР', sho: 'УДР', pas: 'ПАС', dri: 'ДРБ', def: 'ЗАЩ', phy: 'ФИЗ', gk: 'ВРТ' };

  function calcOVR(role, st) {
    const w = OVR_W[role];
    let s = 0;
    for (const k in w) s += st[k] * w[k];
    return Math.round(U.clamp(s, 30, 99));
  }

  // Шаблон состава из 18 человек: 11 основных (под 4-4-2) + 7 запасных
  const SQUAD = [
    ['ВР', 'GK'], ['ЛЗ', 'DEF'], ['ЦЗ', 'DEF'], ['ЦЗ', 'DEF'], ['ПЗ', 'DEF'], ['ЛП', 'MID'], ['ЦП', 'MID'], ['ЦП', 'MID'], ['ПП', 'MID'], ['НАП', 'FWD'], ['НАП', 'FWD'],
    ['ВР', 'GK'], ['ЦЗ', 'DEF'], ['ПЗ', 'DEF'], ['ЦП', 'MID'], ['ОП', 'MID'], ['ПП', 'MID'], ['НАП', 'FWD'],
  ];
  const NUMS = [1, 3, 4, 5, 2, 11, 8, 6, 7, 9, 10, 12, 15, 22, 14, 16, 17, 19];

  function makePlayer(rng, style, pos, role, target, num, id) {
    const n = PF.Names.gen(rng, style);
    const a = ARCH[role];
    const st = {};
    for (const k of STATS) st[k] = target + a[k] + rng.range(-8, 8);
    // специализация: у каждого 1-2 «коронных» стата
    st[rng.pick(['spd', 'sho', 'pas', 'dri', 'phy'])] += rng.range(3, 9);
    for (const k of STATS) st[k] = Math.round(U.clamp(st[k], 15, 99));
    let ovr = calcOVR(role, st);
    const delta = target - ovr;
    for (const k of STATS) st[k] = Math.round(U.clamp(st[k] + delta, 15, 99));
    ovr = calcOVR(role, st);
    return {
      id, first: n.first, name: n.last, pos, role, num, stats: st, ovr,
      skin: rng.int(0, 2), hair: rng.int(0, 4), age: rng.int(18, 35),
    };
  }

  const TEAMS = [];
  const PLAYERS = {}; // id -> def (для карточек «Звёздного состава»)
  LEAGUES.forEach((lg, li) => {
    lg.teams.forEach((t, ti) => {
      const id = lg.id + ti;
      const rng = new U.RNG(U.hashStr(id + t[0]));
      const team = {
        id, name: t[0], short: t[1], league: li, style: lg.style, rating: t[6],
        kit: {
          home: { p: t[2], s: t[3], pat: t[4], shorts: t[5], socks: t[2] },
          away: makeAway(t[2], t[3], rng),
        },
        crest: { shape: rng.int(0, 3), band: rng.int(0, 3) },
        formation: rng.pick(['4-4-2', '4-3-3', '4-2-3-1', '4-4-2', '3-5-2', '5-3-2']),
        tactics: { press: rng.int(0, 2), width: 1, line: rng.int(0, 2) },
        squad: [],
      };
      SQUAD.forEach((sq, i) => {
        const tgt = t[6] + (i < 11 ? rng.int(-3, 3) : rng.int(-9, -3));
        const p = makePlayer(rng, lg.style, sq[0], sq[1], tgt, NUMS[i], id + '-' + i);
        p.team = id;
        team.squad.push(p);
        PLAYERS[p.id] = p;
      });
      TEAMS.push(team);
    });
  });

  function makeAway(p, s, rng) {
    const light = U.luma(p) > 0.6;
    if (light) return { p: s, s: p, pat: 'plain', shorts: s, socks: s };
    const opts = ['#f4f4f4', '#1a1a1a', '#f0d020', '#40c0b0'];
    let best = opts[0], bd = -1;
    for (const o of opts) { const d = U.colorDist(o, p); if (d > bd) { bd = d; best = o; } }
    return { p: best, s: p, pat: rng.chance(0.3) ? 'sash' : 'plain', shorts: best, socks: best };
  }

  // Легенды для паков — вымышленные «иконы»
  const ICONS = [
    ['А.', 'СТРЕЛЕЦКИЙ', 'НАП', 'FWD', 93], ['Л.', 'ФЬОРЕНЦИ', 'АП', 'MID', 92], ['Э.', 'МАКБРАЙТ', 'ЦЗ', 'DEF', 90],
    ['Х.', 'МОНТЕАЛЬТО', 'ЦП', 'MID', 91], ['К.', 'ДОННЕРМАНН', 'ВР', 'GK', 91], ['С.', 'ЯРОВОЙ', 'ЦН', 'FWD', 92],
    ['М.', 'ПЕНТАРРО', 'ПН', 'FWD', 90], ['Ж.', 'ЛЮМЬЕН', 'ЛП', 'MID', 89], ['Б.', 'АРКАДИО', 'ЛЗ', 'DEF', 88],
    ['Т.', 'ХОЛЬМГРЕН', 'ЦЗ', 'DEF', 89], ['Г.', 'КАСТИЛЬОН', 'ОП', 'MID', 90], ['В.', 'ДАЛЬСТРЕМ', 'ПЗ', 'DEF', 88],
  ];
  const iconRng = new U.RNG(2027);
  const ICON_LIST = ICONS.map((d, i) => {
    const p = makePlayer(iconRng, 'en', d[2], d[3], d[4], [9, 10, 4, 8, 1, 11, 7, 17, 3, 5, 6, 2][i], 'icon-' + i);
    p.first = d[0]; p.name = d[1]; p.icon = true; p.team = 'icon';
    PLAYERS[p.id] = p;
    return p;
  });

  function rarity(p) { return p.icon ? 'icon' : p.ovr >= 75 ? 'gold' : p.ovr >= 65 ? 'silver' : 'bronze'; }

  // Подбираем комплекты формы, чтобы цвета не сливались
  function pickKits(home, away) {
    const hk = home.kit.home;
    let ak = away.kit.home;
    if (U.colorDist(hk.p, ak.p) < 130) ak = away.kit.away;
    if (U.colorDist(hk.p, ak.p) < 130) ak = { p: U.luma(hk.p) > 0.5 ? '#1a1a1a' : '#f4f4f4', s: ak.p, pat: 'plain', shorts: '#555555', socks: '#555555' };
    const gkOpts = ['#30c050', '#f0d020', '#e040a0', '#ff8020', '#202020', '#40e0e0'];
    const gk = [];
    for (const k of [hk, ak]) {
      let best = gkOpts[0], bd = -1;
      for (const o of gkOpts) {
        if (gk.length && o === gk[0].p) continue;
        const d = Math.min(U.colorDist(o, hk.p), U.colorDist(o, ak.p));
        if (d > bd) { bd = d; best = o; }
      }
      gk.push({ p: best, s: U.shade(best, -0.35), pat: 'plain', shorts: U.shade(best, -0.4), socks: best, gk: true });
    }
    return [hk, ak, gk[0], gk[1]];
  }

  PF.Data = {
    LEAGUES, TEAMS, PLAYERS, ICONS: ICON_LIST, STATS, STAT_NAMES,
    calcOVR, rarity, pickKits,
    team: (id) => TEAMS.find((t) => t.id === id),
    teamRatings(t, ids) {
      const sq = ids ? ids.map((i) => PLAYERS[i]) : t.squad.slice(0, 11);
      const avg = (r) => { const a = sq.filter((p) => p.role === r); return a.length ? Math.round(a.reduce((s, p) => s + p.ovr, 0) / a.length) : 50; };
      return { att: avg('FWD'), mid: avg('MID'), def: Math.round((avg('DEF') * 4 + avg('GK')) / 5), ovr: Math.round(sq.reduce((s, p) => s + p.ovr, 0) / sq.length) };
    },
  };
})(window.PF);
