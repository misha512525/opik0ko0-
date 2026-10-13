/**
 * Единый файл настроек игры. Все «магические числа» геймплея живут здесь:
 * скорости, урон, плотность трафика, цены, параметры розыска и т. д.
 */

export type VehicleTypeId = 'compact' | 'sedan' | 'sports' | 'van' | 'police';

export interface VehicleSpec {
  id: VehicleTypeId;
  name: string;
  /** Полуразмеры кузова (м). */
  half: { x: number; y: number; z: number };
  mass: number;
  /** Максимальная скорость вперёд, м/с. */
  maxSpeed: number;
  maxReverse: number;
  /** Ускорение разгона, м/с². */
  accel: number;
  brake: number;
  /** Сцепление шин: насколько быстро гасится боковое скольжение (1/с). */
  grip: number;
  /** Сцепление при ручнике. */
  handbrakeGrip: number;
  /** Максимальный угол поворота колёс, рад. */
  steer: number;
  wheelBase: number;
  wheelRadius: number;
  health: number;
  /** Палитра цветов кузова (hex). */
  colors: number[];
  /** Вес при случайном выборе для трафика. */
  trafficWeight: number;
}

export const CONFIG = {
  title: 'VELMONT HEAT',
  cityName: 'Порт-Велмонт',

  physics: {
    fixedDt: 1 / 60,
    maxSubSteps: 5,
    gravity: -22,
  },

  world: {
    seed: 7351,
    blockSize: 100,
    cols: 10,
    rows: 9,
    roadWidth: 14,
    laneWidth: 3.5,
    sidewalk: 4.5,
    plinthHeight: 0.15,
    /** Где начинается вода (набережная — южнее последней улицы). */
    waterZ: 445,
    boundary: 545,
    lampSpacing: 32,
  },

  player: {
    walkSpeed: 2.6,
    runSpeed: 7.2,
    aimWalkSpeed: 2.0,
    jumpSpeed: 7.5,
    accelGround: 18,
    accelAir: 4,
    radius: 0.35,
    halfHeight: 0.55,
    maxHealth: 100,
    maxArmor: 100,
    enterVehicleRange: 4.0,
    /** Урон от удара машиной на скорости (за каждый м/с выше порога). */
    carHitDamagePerMs: 4,
    carHitMinSpeed: 6,
    fallDamageMinSpeed: 14,
  },

  camera: {
    fov: 68,
    aimFov: 48,
    distance: 4.6,
    aimDistance: 1.9,
    height: 1.55,
    shoulder: 0.55,
    vehicleDistance: 8.5,
    vehicleHeight: 2.2,
    minPitch: -1.2,
    maxPitch: 0.75,
    collisionPadding: 0.25,
    autoCenterDelay: 1.4,
  },

  vehicles: {
    types: {
      compact: {
        id: 'compact', name: 'Кестрел', half: { x: 0.85, y: 0.55, z: 1.85 }, mass: 1000,
        maxSpeed: 38, maxReverse: 9, accel: 9, brake: 22, grip: 9, handbrakeGrip: 1.6,
        steer: 0.62, wheelBase: 2.4, wheelRadius: 0.32, health: 800,
        colors: [0xd94f3d, 0x3f88c5, 0xf2c14e, 0x7bc950, 0xf5f5f5, 0x2b2d42], trafficWeight: 4,
      },
      sedan: {
        id: 'sedan', name: 'Марлоу', half: { x: 0.95, y: 0.6, z: 2.3 }, mass: 1400,
        maxSpeed: 44, maxReverse: 10, accel: 9.5, brake: 24, grip: 8, handbrakeGrip: 1.5,
        steer: 0.58, wheelBase: 2.9, wheelRadius: 0.35, health: 1000,
        colors: [0x1d3557, 0x6d6875, 0xe5e5e5, 0x2a9d8f, 0x8d0801, 0x111111], trafficWeight: 5,
      },
      sports: {
        id: 'sports', name: 'Стрикс GT', half: { x: 1.0, y: 0.5, z: 2.25 }, mass: 1250,
        maxSpeed: 62, maxReverse: 11, accel: 15, brake: 30, grip: 10, handbrakeGrip: 1.8,
        steer: 0.55, wheelBase: 2.7, wheelRadius: 0.34, health: 850,
        colors: [0xff5400, 0xffbd00, 0x9b5de5, 0x00bbf9, 0xef233c], trafficWeight: 1,
      },
      van: {
        id: 'van', name: 'Бастион', half: { x: 1.1, y: 1.05, z: 2.8 }, mass: 2600,
        maxSpeed: 32, maxReverse: 8, accel: 6, brake: 16, grip: 7, handbrakeGrip: 1.4,
        steer: 0.55, wheelBase: 3.4, wheelRadius: 0.4, health: 1500,
        colors: [0xf1faee, 0xa8dadc, 0x6c584c, 0xbc6c25], trafficWeight: 2,
      },
      police: {
        id: 'police', name: 'Патруль', half: { x: 0.98, y: 0.62, z: 2.35 }, mass: 1500,
        maxSpeed: 52, maxReverse: 11, accel: 12, brake: 28, grip: 9.5, handbrakeGrip: 1.6,
        steer: 0.6, wheelBase: 2.9, wheelRadius: 0.36, health: 1300,
        colors: [0x0d1b2a], trafficWeight: 0,
      },
    } satisfies Record<VehicleTypeId, VehicleSpec>,
    /** Порог изменения скорости при столкновении, после которого идёт урон (м/с). */
    crashThreshold: 4.5,
    crashDamagePerMs: 40,
    smokeAt: 0.4,
    fireAt: 0.15,
    burnSecondsBeforeExplosion: 5,
    explosionRadius: 9,
    explosionDamage: 160,
    explosionImpulse: 18000,
    parkedCars: 46,
    lodDistance: 70,
    hideDistance: 320,
  },

  traffic: {
    maxCars: 26,
    spawnRadiusMin: 70,
    spawnRadiusMax: 170,
    despawnRadius: 210,
    cruiseSpeed: 12,
    lookAhead: 6,
    safeGap: 9,
    stopLineOffset: 11.5,
    laneChangeAfterBlocked: 2.5,
    yellowSeconds: 3,
    greenSeconds: 13,
  },

  peds: {
    max: 55,
    spawnRadiusMin: 25,
    spawnRadiusMax: 120,
    despawnRadius: 150,
    walkSpeed: 1.4,
    runSpeed: 5.2,
    health: 40,
    fleeRadius: 28,
    fleeSeconds: 8,
    cashDropMin: 5,
    cashDropMax: 40,
  },

  weapons: {
    fists: { id: 'fists', name: 'Кулаки', damage: 12, range: 1.7, fireInterval: 0.45, auto: false, magazine: 0, spread: 0, recoil: 0, price: 0, ammoPrice: 0, ammoPack: 0 },
    pistol: { id: 'pistol', name: 'Пистолет «Оса»', damage: 26, range: 90, fireInterval: 0.22, auto: false, magazine: 12, spread: 0.012, recoil: 0.035, price: 300, ammoPrice: 60, ammoPack: 36 },
    rifle: { id: 'rifle', name: 'Автомат «Шквал»', damage: 18, range: 130, fireInterval: 0.09, auto: true, magazine: 30, spread: 0.022, recoil: 0.022, price: 1500, ammoPrice: 120, ammoPack: 90 },
    reloadSeconds: 1.4,
    headshotMultiplier: 2,
  },

  wanted: {
    /** Сколько «очков жары» нужно на каждую звезду. */
    thresholds: [0, 40, 120, 260, 480, 800],
    crimes: {
      hitPed: 30,
      killPed: 55,
      shootNearPeople: 25,
      carjack: 25,
      attackCop: 140,
      killCop: 260,
      destroyCar: 45,
      destroyPoliceCar: 200,
      reckless: 4,
    },
    /** Радиус зоны поиска по звёздам. */
    searchRadius: [0, 90, 120, 160, 210, 260],
    /** Сколько секунд вне поля зрения и вне зоны, чтобы звёзды погасли. */
    evadeSeconds: [0, 6, 9, 12, 15, 18],
    sightRange: 75,
    witnessRange: 45,
  },

  police: {
    unitsPerStar: [0, 1, 2, 3, 4, 5],
    footCopsPerCar: 2,
    copHealth: 80,
    spawnDistanceMin: 90,
    spawnDistanceMax: 160,
    despawnDistance: 280,
    shootFromStars: 3,
    roadblockFromStars: 4,
    arrestSeconds: 2.2,
    arrestRange: 2.2,
    copAccuracy: 0.24,
    copDamage: 7,
    copFireInterval: 0.9,
    chaseSpeedBonus: 1.08,
  },

  economy: {
    startMoney: 250,
    deathPenalty: 0.1,
    arrestPenalty: 0.15,
    respray: 150,
    armor: 250,
    health: 100,
  },

  dayNight: {
    /** Длина игровых суток в реальных секундах. */
    dayLengthSec: 16 * 60,
    startHour: 17.5,
  },

  quality: {
    low: { pixelRatio: 0.75, shadows: false, shadowSize: 0, drawDistance: 330, trafficScale: 0.6, pedScale: 0.6, antialias: false },
    medium: { pixelRatio: 1, shadows: true, shadowSize: 1024, drawDistance: 480, trafficScale: 0.85, pedScale: 0.85, antialias: false },
    high: { pixelRatio: 1.5, shadows: true, shadowSize: 2048, drawDistance: 650, trafficScale: 1, pedScale: 1, antialias: true },
  },

  audio: {
    masterVolume: 0.8,
    musicVolume: 0.55,
    sfxVolume: 0.9,
  },

  save: {
    key: 'velmont-heat-save-v1',
    settingsKey: 'velmont-heat-settings-v1',
  },
} as const;

export type QualityLevel = keyof typeof CONFIG.quality;
export type WeaponId = 'fists' | 'pistol' | 'rifle';
export const WEAPON_ORDER: WeaponId[] = ['fists', 'pistol', 'rifle'];

/** Группы коллизий Rapier (битовые маски). */
export const GROUP = {
  STATIC: 1 << 0,
  VEHICLE: 1 << 1,
  PLAYER: 1 << 2,
  PROP: 1 << 3,
} as const;

/** Rapier: старшие 16 бит — принадлежность, младшие — с кем сталкиваемся. */
export function groups(member: number, filter: number): number {
  return (((member & 0xffff) << 16) | (filter & 0xffff)) >>> 0;
}
