'use strict';
// Вымышленный комментатор: реплики по событиям матча + бегущая строка.
(function (PF) {
  const NAME = 'П. ПИКСЕЛЕВ';
  const T = {
    kickoff: ['Стартовый свисток! {home} против {away}, поехали!', 'Матч начался! Трибуны ревут!', 'Мяч в игре. Посмотрим, кто сегодня сильнее.'],
    second: ['Второй тайм начался!', 'Команды вернулись на поле. Второй тайм!'],
    goal: ['ГОЛ! {player} отправляет мяч в сетку!', 'Какой удар! {player} забивает!', 'Г-О-О-ОЛ! {team} празднует, автор - {player}!', 'Вратарь бессилен! {player} точен!'],
    goalAssist: ['Передача {assist}, удар {player} - ГОЛ!', 'Отличная связка: {assist} и {player}! ГОЛ!'],
    owngoal: ['Автогол! Неприятность для команды {team}...', 'Ох, срезка в свои ворота!'],
    save: ['Отличный сейв, {player}!', 'Вратарь {player} спасает команду!', 'Какая реакция у {player}!'],
    post: ['Штанга! Мяч звенит от каркаса!', 'Каркас ворот спасает!', 'В перекладину! Чуть-чуть не хватило!'],
    miss: ['Мимо ворот. {player} хватается за голову.', 'Выше ворот. Неточно, {player}.', 'Удар мимо цели.'],
    foul: ['Нарушение правил. Свисток.', 'Судья фиксирует фол.', 'Грубовато сыграл {player}.'],
    yellow: ['Желтая карточка: {player}.', '{player} получает предупреждение.'],
    red: ['Красная карточка! {player} покидает поле!', 'Удаление! {team} остается в меньшинстве.'],
    corner: ['Угловой для команды {team}.', 'Будет подача с углового.'],
    offside: ['Офсайд! {player} поспешил.', 'Флаг поднят - положение вне игры.'],
    penalty: ['Пенальти! Судья показывает на точку!', 'Одиннадцатиметровый! Вот это момент!'],
    freekick: ['Штрафной удар для команды {team}.', 'Опасный штрафной!'],
    halftime: ['Перерыв. На табло {score}.', 'Свисток на перерыв. {score}.'],
    fulltime: ['Финальный свисток! Итог - {score}.', 'Матч окончен! {score}.'],
    chance: ['Опасный момент!', 'Атака набирает обороты!', 'Острая атака команды {team}!'],
    tackle: ['Чистый отбор от {player}.', '{player} отбирает мяч!'],
    through: ['Пас на ход от {player}!', 'Разрезающая передача!'],
    cross: ['Навес в штрафную!', 'Подача от {player}!'],
    sub: ['Замена у команды {team}: выходит {player}.'],
    shootout: ['Серия пенальти! Нервы на пределе!'],
    penGoal: ['Забил! {player} уверенно.', 'Точно в угол!'],
    penMiss: ['Не забил! {player} промахнулся!', 'Вратарь угадал!'],
    added: ['Добавлено {n} мин.'],
  };
  const C = {
    queue: [], cur: null, x: 0, cool: 0, last: {},
    reset() { this.queue.length = 0; this.cur = null; this.cool = 0; this.last = {}; },
    say(key, vars, prio) {
      const list = T[key];
      if (!list) return;
      const now = performance.now();
      if (!prio && this.last[key] && now - this.last[key] < 6000) return;
      this.last[key] = now;
      let s = list[Math.floor(Math.random() * list.length)];
      if (vars) for (const k in vars) s = s.split('{' + k + '}').join(vars[k]);
      const msg = { text: NAME + ': ' + s, prio: prio || 0 };
      if (prio) { this.queue = this.queue.filter((m) => m.prio >= prio); this.queue.unshift(msg); if (this.cur && this.cur.prio < prio) this.cur = null; }
      else if (this.queue.length < 3) this.queue.push(msg);
    },
    update(dt, width) {
      if (!this.cur) {
        if (!this.queue.length) return;
        this.cur = this.queue.shift();
        this.x = width;
        this.w = PF.Font.width(this.cur.text);
      }
      this.x -= dt * (this.queue.length ? 95 : 70);
      if (this.x < -this.w - 10) this.cur = null;
    },
  };
  PF.Comm = C;
})(window.PF);
