'use strict';
// Сохранение прогресса в localStorage (настройки, тактики, монеты, карточки, карьера, турнир).
(function (PF) {
  const KEY = 'pixel-league-27.save';
  const def = () => ({
    v: 1,
    settings: { halfMin: 3, diff: 1, offside: true, cards: true, master: 0.8, music: 0.6, sfx: 0.8, fps: false, night: false },
    quick: { home: 'pp0', away: 'ls0', side: 0 },
    tactics: {},
    coins: PF.C.START_COINS,
    club: null,
    career: null,
    tournament: null,
    records: { played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0 },
  });
  const S = {
    data: null,
    load() {
      try {
        const raw = localStorage.getItem(KEY);
        const d = raw ? JSON.parse(raw) : null;
        this.data = Object.assign(def(), d || {});
        this.data.settings = Object.assign(def().settings, (d && d.settings) || {});
      } catch (err) { this.data = def(); } // повреждённое сохранение — начинаем заново
      return this.data;
    },
    save() {
      try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (err) { /* приватный режим — играем без сохранения */ }
    },
    reset() { this.data = def(); this.save(); },
    // Тактика и состав команды (по умолчанию — из базы)
    teamSetup(team) {
      const t = this.data.tactics[team.id];
      const base = { formation: team.formation, press: team.tactics.press, width: team.tactics.width, line: team.tactics.line, lineup: team.squad.map((p) => p.id) };
      if (!t) return base;
      const valid = t.lineup && t.lineup.length === 18 && t.lineup.every((id) => PF.Data.PLAYERS[id]);
      return Object.assign(base, t, valid ? {} : { lineup: base.lineup });
    },
    setTeamSetup(id, setup) { this.data.tactics[id] = setup; this.save(); },
    record(gf, ga) {
      const r = this.data.records;
      r.played++; r.gf += gf; r.ga += ga;
      if (gf > ga) r.won++; else if (gf < ga) r.lost++; else r.drawn++;
      this.save();
    },
  };
  PF.Save = S;
})(window.PF);
