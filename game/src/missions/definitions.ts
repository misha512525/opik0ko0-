import type { CityLayout } from '../world/CityLayout';
import type { MissionDef, Point } from './types';

/**
 * Сюжетная цепочка «Velmont Heat». Все координаты выводятся из раскладки
 * города, поэтому миссии не ломаются при изменении параметров сетки.
 *
 * Чтобы добавить миссию: допишите объект в массив ниже, указав `requires`
 * (id предыдущей миссии), точку старта и шаги (см. types.ts).
 */
export function buildMissions(city: CityLayout): MissionDef[] {
  const home = city.poi('safehouse');
  const X = city.xs;
  const Z = city.zs;
  const lane = 5.25; // смещение внешней полосы от оси дороги
  const promZ = (city.promenade.z0 + city.promenade.z1) / 2 - 1;
  const p = (x: number, z: number): Point => ({ x, z });
  const LOU = 'Лу';
  const ME = 'Марк';

  return [
    {
      id: 'm1_delivery',
      title: 'Старые долги',
      giver: LOU,
      start: p(home.x, home.z),
      reward: 500,
      protect: ['car'],
      steps: [
        {
          type: 'dialog',
          lines: [
            [LOU, 'Марк Ветров! Пять лет ни слуху ни духу, а теперь стоишь у моего гаража.'],
            [ME, 'Мне нужна работа, Лу. И крыша над головой.'],
            [LOU, 'Работа есть. Седан у ворот надо отогнать на причал №4. Клиент ждёт.'],
            [LOU, 'Две минуты. И чтоб ни царапины — машина дороже тебя.'],
          ],
        },
        { type: 'spawnVehicle', key: 'car', vehicle: 'sedan', at: p(home.x + 8, Z[6] + lane), yaw: Math.PI / 2, color: 0x2a9d8f },
        { type: 'enterVehicle', key: 'car', text: 'Сядь в седан Лу' },
        { type: 'timeLimit', seconds: 120, reason: 'Клиент не дождался' },
        { type: 'goto', at: p(X[8] + 50, promZ), radius: 7, vehicle: 'car', minHealth: 0.5, text: 'Отгони седан на причал №4 (не разбей машину!)' },
        { type: 'clearTimer' },
      ],
      outro: [[LOU, 'Чисто сработано. Держи деньги — и загляни ко мне, есть дело посерьёзнее.']],
    },
    {
      id: 'm2_chase',
      title: 'Хвост',
      giver: LOU,
      start: p(home.x, home.z),
      requires: 'm1_delivery',
      reward: 800,
      steps: [
        {
          type: 'dialog',
          lines: [
            [LOU, 'Барон Кесслер подмял под себя весь порт. Его курьер возит бухгалтерскую книгу.'],
            [LOU, 'Если книга окажется у нас — Барон станет сговорчивее.'],
            [ME, 'Где искать курьера?'],
            [LOU, 'Только что проехал по центру. Найди тачку и прижми его!'],
          ],
        },
        { type: 'enterAnyVehicle', text: 'Найди машину' },
        { type: 'chase', key: 'courier', vehicle: 'compact', at: p(X[4] + 30, Z[5] + lane), yaw: Math.PI / 2, text: 'Останови курьера Барона (тарань или стреляй)', escapeDistance: 300 },
        { type: 'pickup', atVehicle: 'courier', text: 'Забери бухгалтерскую книгу из машины курьера' },
        { type: 'goto', at: p(home.x, home.z), radius: 4, text: 'Привези книгу Лу' },
      ],
      outro: [[LOU, 'Ого, да тут вся портовая касса! Барону это не понравится.']],
    },
    {
      id: 'm3_race',
      title: 'Гонка по набережной',
      giver: 'Рико',
      start: p(X[0] + 75, promZ - 6),
      requires: 'm2_chase',
      reward: 1000,
      protect: ['racer'],
      steps: [
        {
          type: 'dialog',
          lines: [
            ['Рико', 'Ты тот самый Ветров? Говорят, ты неплохо водишь.'],
            ['Рико', 'Проверим. Круг по набережной и через город — уложись в лимит, и машина твоя.'],
          ],
        },
        { type: 'spawnVehicle', key: 'racer', vehicle: 'sports', at: p(X[0] + 90, promZ), yaw: Math.PI / 2, color: 0xffbd00 },
        { type: 'enterVehicle', key: 'racer', text: 'Садись в «Стрикс GT»' },
        { type: 'dialog', lines: [['Рико', 'Три… два… один… ГАЗ!']] },
        { type: 'timeLimit', seconds: 100, reason: 'Время вышло' },
        {
          type: 'checkpoints',
          radius: 10,
          vehicle: 'racer',
          text: 'Проходи контрольные точки',
          points: [
            p(-300, promZ), p(-150, promZ), p(0, promZ), p(150, promZ), p(X[8], promZ),
            p(X[8], Z[8] + 30), p(X[8], Z[7]), p(X[8], Z[6]),
            p(X[7], Z[6]), p(X[5], Z[6]), p(X[3], Z[6]),
            p(X[3], Z[7]), p(X[3], Z[8] + 40), p(X[3], Z[9]), p(X[2], promZ),
          ],
        },
        { type: 'clearTimer' },
      ],
      outro: [['Рико', 'Неплохо, Ветров. «Стрикс» твой — береги его.']],
    },
    {
      id: 'm4_escape',
      title: 'Горячий груз',
      giver: LOU,
      start: p(home.x, home.z),
      requires: 'm3_race',
      reward: 1500,
      protect: ['cargo'],
      steps: [
        {
          type: 'dialog',
          lines: [
            [LOU, 'Кесслер перевозит оружие в фургоне со своего склада в промзоне.'],
            [LOU, 'Угони фургон. Склад под охраной полиции — Барон им хорошо платит.'],
            [LOU, 'Сбрось хвост и пригони фургон сюда. Можно перекраситься в «Хамелеоне».'],
          ],
        },
        { type: 'spawnVehicle', key: 'cargo', vehicle: 'van', at: p(X[8] + 30, Z[7] - lane), yaw: -Math.PI / 2, color: 0x6c584c },
        { type: 'enterVehicle', key: 'cargo', text: 'Угони фургон Кесслера на складе в промзоне' },
        { type: 'setWanted', stars: 3 },
        { type: 'dialog', lines: [[ME, 'Сирены… Барон и правда держит копов на зарплате.']] },
        { type: 'loseWanted', text: 'Оторвись от полиции' },
        { type: 'goto', at: p(home.x + 8, Z[6] + lane), radius: 8, vehicle: 'cargo', text: 'Пригони фургон в гараж Лу' },
      ],
      outro: [[LOU, 'Ящики с оружием… Теперь у нас есть чем ответить Барону.']],
    },
    {
      id: 'm5_finale',
      title: 'Финал: причал Кесслера',
      giver: LOU,
      start: p(home.x, home.z),
      requires: 'm4_escape',
      reward: 5000,
      steps: [
        {
          type: 'dialog',
          lines: [
            [LOU, 'Барон назначил встречу на восточном причале. Это ловушка — но и шанс.'],
            [LOU, 'Бери автомат и бронежилет. Закончи это, Марк.'],
          ],
        },
        { type: 'give', weapon: 'rifle', ammo: 180, armor: 100, health: 100 },
        {
          type: 'spawnEnemies',
          group: 'guards',
          aggroRange: 55,
          list: [
            { at: p(410, 414), role: 'gang', weapon: 'pistol' },
            { at: p(425, 432), role: 'gang', weapon: 'rifle' },
            { at: p(440, 416), role: 'gang', weapon: 'pistol' },
            { at: p(455, 438), role: 'gang', weapon: 'pistol' },
            { at: p(470, 420), role: 'gang', weapon: 'rifle' },
            { at: p(395, 436), role: 'gang', weapon: 'pistol' },
            { at: p(480, 432), role: 'boss', weapon: 'rifle' },
          ],
        },
        { type: 'goto', at: p(420, promZ), radius: 45, text: 'Езжай на восточный причал' },
        { type: 'killGroup', group: 'guards', text: 'Уничтожь охрану и Барона Кесслера' },
        { type: 'dialog', lines: [[ME, 'С Бароном покончено. Теперь бы ноги унести.']] },
        { type: 'setWanted', stars: 4 },
        { type: 'loseWanted', text: 'Уйди от полиции' },
        { type: 'goto', at: p(home.x, home.z), radius: 5, text: 'Вернись в убежище' },
      ],
      outro: [
        [LOU, 'Порт свободен, Марк. Город теперь наш.'],
        ['', 'КОНЕЦ СЮЖЕТА. Свободная игра продолжается — Порт-Велмонт ваш.'],
      ],
    },
  ];
}
