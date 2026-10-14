'use strict';
// Глобальное пространство имён игры. Все модули регистрируются здесь,
// чтобы игра запускалась двойным кликом по index.html (file://),
// где ES-модули блокируются политикой CORS браузеров.
window.PF = window.PF || {};

// Единый конфиг: все «магические числа» живут здесь.
PF.C = {
  // --- Экран ---
  W: 384, H: 216,                 // внутреннее разрешение
  DT: 1 / 60,                     // фиксированный шаг физики, с
  MAX_FRAME: 0.25,                // защита от «спирали смерти» после сворачивания вкладки

  // --- Мир и проекция (метры -> пиксели) ---
  PITCH_L: 105, PITCH_W: 68,      // размеры поля, м
  PPM: 8,                         // пикселей на метр по X
  PPM_Y: 5,                       // пикселей на метр по Y (сжатие = псевдо-3D наклон камеры)
  PPM_Z: 7,                       // пикселей на метр высоты
  WORLD_X0: -12, WORLD_X1: 117,   // видимая область мира по X, м
  WORLD_Y0: -4, WORLD_Y1: 77,     // по Y, м
  STANDS_H: 92,                   // высота трибун над полем, px

  // --- Ворота и разметка ---
  GOAL_HALF: 3.66, GOAL_H: 2.44, GOAL_DEPTH: 2.0, POST_R: 0.07,
  BOX_DEPTH: 16.5, BOX_HALF: 20.16, SIX_DEPTH: 5.5, SIX_HALF: 9.16,
  PEN_SPOT: 11, CIRCLE_R: 9.15, WALL_DIST: 9.15,

  // --- Мяч ---
  BALL_R: 0.11,
  GRAVITY: 11.5,
  ROLL_DECEL: 2.0,                // постоянное трение качения, м/с²
  ROLL_DRAG: 0.25,                // линейное сопротивление на земле, 1/с
  AIR_DRAG: 0.12,                 // сопротивление в воздухе, 1/с
  BOUNCE: 0.55,                   // коэффициент отскока по высоте
  BOUNCE_FRICTION: 0.82,          // гашение горизонтали при отскоке
  BOUNCE_STOP: 1.4,               // ниже этой |vz| мяч перестаёт подпрыгивать
  MAGNUS: 0.3,                    // сила закрутки (curve): боковое ускорение = spin * скорость * MAGNUS
  SPIN_DECAY: 0.9,                // затухание закрутки, 1/с
  POST_BOUNCE: 0.65,
  PRED_STEPS: 64, PRED_DT: 0.05,  // предсказание траектории для ИИ (3.2 с)

  // --- Игроки ---
  PLAYER_R: 0.42,                 // радиус для расталкивания
  BASE_SPEED: 5.6,                // м/с при скорости 0
  SPEED_STAT_K: 2.6,              // прибавка при скорости 100
  SPRINT_MUL: 1.28,
  DRIBBLE_MUL: 0.9,               // замедление с мячом
  ACCEL: 22, DECEL: 26,           // м/с²
  TURN_RATE: 14,                  // рад/с
  TURN_RATE_BALL: 10,
  STAMINA_SPRINT: 0.028,          // расход в секунду в спринте
  STAMINA_RUN: 0.004,
  STAMINA_REGEN: 0.012,
  STAMINA_SLOW: 0.82,             // множитель скорости при пустом баке
  CONTROL_R: 0.75,                // радиус приёма мяча
  CONTROL_R_GK: 1.05,
  CONTROL_Z: 0.95,                // выше — только голова/грудь
  HEADER_Z_MIN: 1.15, HEADER_Z_MAX: 2.7,
  GK_REACH_Z: 2.6,
  KICK_COOLDOWN: 0.28,            // после удара игрок не может сразу коснуться мяча
  DRIBBLE_DIST: 0.55,
  FIRST_TOUCH_SPEED: 24,          // выше этой относительной скорости приём может отскочить
  ACTION_BUFFER: 0.45,            // буфер первого касания (пас/удар в одно касание)
  SHOT_CHARGE_TIME: 0.9,          // время полного заряда удара
  // Сила паса/навеса/паса на ход/удара: держим кнопку — копится шкала, отпускаем — исполняем
  CHARGE_TIME: { pass: 0.75, lob: 0.85, through: 0.75, shoot: 0.9 },
  TAP_TIME: 0.12,                 // короткое нажатие = автоматическая сила (ассистент)
  SKILL_TIME: 0.42, SKILL_SPEED: 7.5,
  TACKLE_RANGE: 1.7, TACKLE_TIME: 0.32,
  SLIDE_TIME: 0.62, SLIDE_SPEED: 9.5,
  STUN_TIME: 1.1, FALL_TIME: 1.4,

  // --- Удары и пасы ---
  PASS_MIN: 13, PASS_MAX: 32,     // скорость низового паса
  PASS_ARRIVE: 10,                // желаемая скорость мяча у адресата (резкий пас)
  LOB_T_BASE: 0.5, LOB_T_PER_M: 0.023, // время полёта навеса: быстрее и прямее
  SHOT_MIN: 21, SHOT_MAX: 35,
  THROUGH_LEAD: 0.9,              // упреждение паса на ход, с
  CROSS_ZONE_X: 78,               // в атакующих координатах: начиная с этой отметки K = навес в штрафную

  // --- Вратарь ---
  GK_DIVE_SPEED: 7.5, GK_DIVE_TIME: 0.55, GK_DIVE_REACH: 2.9,
  GK_HOLD_TIME: 1.3,

  // --- Матч ---
  HALF_MINUTES: [1, 2, 3, 4, 5, 6],
  GAME_HALF_SEC: 45 * 60,
  STOPPAGE_GOAL: 40, STOPPAGE_CARD: 25, STOPPAGE_SUB: 20, STOPPAGE_OTHER: 4, // игровые секунды
  MAX_SUBS: 5,
  OFFSIDE_MARGIN: 0.25,
  SETPIECE_PREP: 1.6,             // время на расстановку
  AI_SETPIECE_WAIT: 1.1,
  GOAL_CELEB_TIME: 3.2,
  GOAL_SLOWMO: 0.32, GOAL_SLOWMO_TIME: 1.1,
  REPLAY_SEC: 5.5,
  REPLAY_STRIDE: 2,               // записываем каждый 2-й тик (30 Гц)
  REPLAY_CAP: 300,                // 10 с
  STOP_DELAY: 1.0,                // пауза после свистка

  // --- Сложность ---
  DIFF: [
    { name: 'НОВИЧОК', react: 0.42, statMul: 0.86, err: 1.5, press: 0.6, gkReact: 0.30, tackle: 0.55, decide: 0.42 },
    { name: 'ПРОФИ',   react: 0.26, statMul: 0.97, err: 1.0, press: 1.0, gkReact: 0.2,  tackle: 0.85, decide: 0.27 },
    { name: 'ЛЕГЕНДА', react: 0.14, statMul: 1.07, err: 0.65, press: 1.3, gkReact: 0.12, tackle: 1.1, decide: 0.16 },
  ],

  // --- Камера ---
  CAM_SMOOTH: 4.2,
  CAM_LEAD: 0.32,                 // упреждение по скорости мяча, с
  SHAKE_GOAL: 4, SHAKE_DECAY: 6,

  // --- Экономика «Звёздного состава» ---
  COINS_WIN: 600, COINS_DRAW: 300, COINS_LOSS: 150, COINS_GOAL: 50,
  PACKS: [
    { id: 'bronze', name: 'БРОНЗОВЫЙ', price: 400,  n: 5, odds: { bronze: 0.8, silver: 0.18, gold: 0.02, icon: 0 } },
    { id: 'silver', name: 'СЕРЕБРЯНЫЙ', price: 1200, n: 5, odds: { bronze: 0.25, silver: 0.65, gold: 0.1, icon: 0 } },
    { id: 'gold',   name: 'ЗОЛОТОЙ',   price: 3500, n: 5, odds: { bronze: 0, silver: 0.4, gold: 0.57, icon: 0.03 } },
    { id: 'prime',  name: 'ПРЕМИУМ',   price: 8000, n: 6, odds: { bronze: 0, silver: 0.1, gold: 0.8, icon: 0.1 } },
  ],
  START_COINS: 2000,

  // --- Цвета интерфейса ---
  COL: {
    bg: '#0b0f1a', panel: '#141b2e', panel2: '#1d2742', line: '#2f3d66',
    text: '#e8ecf8', dim: '#8a94b8', accent: '#3cf0a0', accent2: '#ffd23c',
    red: '#ff4f5e', blue: '#4fa3ff', white: '#ffffff', black: '#000000',
    outline: '#140f1c',
    bronze: '#c08050', silver: '#c8d0dc', gold: '#ffcf40', icon: '#d070ff',
  },
};

// Индексы поз в спрайт-листе игрока
PF.POSE = {
  IDLE: 0, RUN0: 1, RUN1: 2, RUN2: 3, RUN3: 4, KICK0: 5, KICK1: 6, SLIDE: 7, FALLEN: 8,
  CELEB0: 9, CELEB1: 10, THROW: 11, HEADER: 12, DIVE_UP: 13, DIVE_DOWN: 14, HOLD: 15, TACKLE: 16,
  COUNT: 17,
};
// Направления спрайта: лицом к камере, спиной, вправо, влево
PF.DIR = { DOWN: 0, UP: 1, RIGHT: 2, LEFT: 3 };
