import * as THREE from 'three';
import { CONFIG } from './config';
import type { GameContext } from './core/Context';
import { EventBus } from './core/Events';
import { Input } from './core/Input';
import { Loop } from './core/Loop';
import { Physics } from './core/Physics';
import { Settings } from './core/Settings';
import { CityLayout } from './world/CityLayout';
import { CityBuilder } from './world/CityBuilder';
import { DayNight } from './world/DayNight';
import { TrafficLights } from './world/TrafficLights';
import { Player } from './player/Player';
import { CameraRig } from './player/CameraRig';
import { VehicleManager } from './vehicles/VehicleManager';
import { Weapons } from './combat/Weapons';
import { Damage } from './combat/Damage';
import { Wanted } from './combat/Wanted';
import { Effects } from './fx/Particles';
import { Markers } from './fx/Markers';
import { Roads } from './ai/Roads';
import { Traffic } from './ai/Traffic';
import { Pedestrians } from './ai/Pedestrians';
import { Police } from './ai/Police';
import { Economy } from './economy/Economy';
import { Pickups } from './economy/Pickups';
import { Shops } from './economy/Shops';
import { MissionManager } from './missions/MissionManager';
import { SaveSystem } from './save/SaveSystem';
import { Hud } from './ui/Hud';
import { Menu } from './ui/Menu';

type FlowState = 'menu' | 'playing' | 'paused' | 'shop' | 'map';

/**
 * Корень композиции: создаёт системы, связывает их через GameContext,
 * задаёт порядок обновления в фиксированном и кадровом шагах и управляет
 * состояниями игры (меню, игра, пауза, магазин, карта).
 */
export class Game {
  readonly ctx: GameContext;
  readonly loop: Loop;
  readonly menu: Menu;
  private debugEl: HTMLElement | null;
  state: FlowState = 'menu';
  /** Сглаженное время логики (без рендера) и рендера, мс — для профилирования. */
  cpuMs = 0;
  renderMs = 0;
  /** Накопленное игровое время (с) и число кадров — для автотестов. */
  simTime = 0;
  frameCount = 0;
  private fixedAccumMs = 0;
  private menuOrbit = 0;

  private constructor(ctx: GameContext) {
    this.ctx = ctx;
    this.loop = new Loop(
      CONFIG.physics.fixedDt,
      CONFIG.physics.maxSubSteps,
      (dt) => this.fixedUpdate(dt),
      (dt, a) => this.update(dt, a),
    );
    this.debugEl = document.getElementById('debug');
    if (this.debugEl && !ctx.settings.data.showFps) this.debugEl.style.display = 'none';
    window.addEventListener('resize', () => this.onResize());

    this.menu = new Menu(ctx, {
      newGame: () => {
        ctx.save.reset();
        this.play();
      },
      continueGame: () => {
        if (ctx.save.load()) this.play();
      },
      save: () => ctx.save.save('manual'),
      load: () => ctx.save.load(),
      hasSave: () => ctx.save.has(),
    });
    this.loop.paused = true;
    ctx.hud.setVisible(false);
    ctx.shops.onClose = () => this.setState('playing');

    document.addEventListener('pointerlockchange', () => {
      // Esc в браузере сначала снимает захват мыши — считаем это паузой.
      if (!document.pointerLockElement && this.state === 'playing' && !ctx.input.freeLook) this.pause();
    });
  }

  static async create(container: HTMLElement, onProgress: (text: string) => void): Promise<Game> {
    const settings = new Settings();
    const q = settings.quality;
    const renderer = new THREE.WebGLRenderer({ antialias: q.antialias, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, q.pixelRatio));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = q.shadows;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(CONFIG.camera.fov, window.innerWidth / window.innerHeight, 0.15, q.drawDistance + 50);

    onProgress('Физика…');
    const physics = await Physics.create();
    onProgress('Город…');
    const city = new CityLayout();
    const visuals = new CityBuilder(city, physics, q.shadows).build();
    scene.add(visuals.root);
    const dayNight = new DayNight(scene, visuals, q.drawDistance);
    dayNight.configureShadows(q.shadows, q.shadowSize);

    const ctx = {
      scene,
      camera,
      renderer,
      physics,
      input: new Input(renderer.domElement),
      events: new EventBus(),
      settings,
      city,
      visuals,
      dayNight,
    } as Partial<GameContext> as GameContext;

    ctx.effects = new Effects(scene);
    ctx.effects.resize(window.innerHeight);
    ctx.markers = new Markers(scene);
    ctx.weapons = new Weapons(ctx);
    ctx.vehicles = new VehicleManager(ctx);
    ctx.cameraRig = new CameraRig(ctx, camera);
    const home = city.poi('safehouse');
    // Рядом с маркером миссии, но не в нём — чтобы миссия не стартовала сама.
    ctx.player = new Player(ctx, new THREE.Vector3(home.x + 2, 0.2, home.z + 3));
    ctx.cameraRig.yaw = Math.PI;
    onProgress('Машины и люди…');
    ctx.vehicles.spawnParked();
    ctx.lights = new TrafficLights(city, visuals.trafficBulbs);
    ctx.roads = new Roads(city);
    ctx.traffic = new Traffic(ctx, ctx.roads);
    ctx.peds = new Pedestrians(ctx);
    ctx.economy = new Economy(ctx);
    ctx.damage = new Damage(ctx);
    ctx.wanted = new Wanted(ctx);
    ctx.police = new Police(ctx, ctx.roads);
    ctx.missions = new MissionManager(ctx);
    ctx.shops = new Shops(ctx);
    ctx.pickups = new Pickups(ctx);
    ctx.save = new SaveSystem(ctx);
    ctx.hud = new Hud(ctx);
    ctx.markers.addProvider(() => ctx.missions.markers());
    ctx.markers.addProvider(() => ctx.shops.markers());

    settings.onChange((s) => {
      const qq = CONFIG.quality[s.quality];
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, qq.pixelRatio));
      camera.far = qq.drawDistance + 50;
      camera.updateProjectionMatrix();
      dayNight.setDrawDistance(qq.drawDistance);
      if (renderer.shadowMap.enabled !== qq.shadows || (qq.shadows && dayNight.sun.shadow.mapSize.x !== qq.shadowSize)) {
        renderer.shadowMap.enabled = qq.shadows;
        dayNight.configureShadows(qq.shadows, qq.shadowSize);
        scene.traverse((o) => {
          const m = (o as THREE.Mesh).material as THREE.Material | undefined;
          if (m) m.needsUpdate = true;
        });
      }
    });

    onProgress('Готово');
    return new Game(ctx);
  }

  start(): void {
    this.loop.start();
  }

  // ------------------------------------------------------------ состояния

  private setState(s: FlowState): void {
    this.state = s;
    this.loop.paused = s !== 'playing';
    this.ctx.hud.setVisible(s !== 'menu');
    this.onStateChanged?.(s);
  }

  /** Хук для звука (пауза приглушает радио). */
  onStateChanged: ((s: FlowState) => void) | null = null;

  play(): void {
    this.menu.close();
    this.setState('playing');
  }

  pause(): void {
    if (this.state !== 'playing') return;
    this.setState('paused');
    this.ctx.input.unlockPointer();
    this.menu.showPause();
  }

  /** Для автотестов: сразу в игру без меню. */
  autotestStart(): void {
    this.ctx.input.freeLook = true;
    this.ctx.save.reset();
    this.play();
  }

  private handleGlobalKeys(): void {
    const { input, hud, shops } = this.ctx;
    if (this.state === 'paused' && !this.menu.open) this.setState('playing');
    if (this.state === 'shop' && !shops.open) this.setState('playing');
    if (this.state === 'playing') {
      if (input.pressed('Escape')) return this.pause();
      if (input.pressed('KeyM')) {
        hud.toggleMap(true);
        this.setState('map');
        return;
      }
      if (shops.open) this.setState('shop');
    } else if (this.state === 'map') {
      if (input.pressed('KeyM') || input.pressed('Escape')) {
        hud.toggleMap(false);
        this.setState('playing');
      }
    } else if (this.state === 'shop') {
      if (input.pressed('Escape')) shops.close();
    }
  }

  // ------------------------------------------------------------ циклы

  private fixedUpdate(dt: number): void {
    const t0 = performance.now();
    this.fixedStep(dt);
    this.fixedAccumMs += performance.now() - t0;
  }

  private fixedStep(dt: number): void {
    const c = this.ctx;
    this.simTime += dt;
    c.player.fixedUpdate(dt);
    c.traffic.fixedUpdate(dt);
    c.police.fixedUpdate(dt);
    c.vehicles.fixedUpdate(dt);
    c.physics.step();
    c.vehicles.postStep(dt);
    c.peds.fixedUpdate(dt);
    c.damage.fixedUpdate(dt);
    c.missions.fixedUpdate(dt);
  }

  private update(dt: number, alpha: number): void {
    const t0 = performance.now();
    this.frameCount++;
    this.frame(dt, alpha);
    const t1 = performance.now();
    this.ctx.renderer.render(this.ctx.scene, this.ctx.camera);
    const t2 = performance.now();
    this.cpuMs += (t1 - t0 + this.fixedAccumMs - this.cpuMs) * 0.05;
    this.renderMs += (t2 - t1 - this.renderMs) * 0.05;
    this.fixedAccumMs = 0;
    this.ctx.input.endFrame();
  }

  debugStats() {
    const c = this.ctx;
    return {
      cpuMs: +this.cpuMs.toFixed(2),
      renderSubmitMs: +this.renderMs.toFixed(2),
      vehicles: c.vehicles.list.length,
      traffic: c.traffic.agents.length,
      peds: c.peds.list.length,
      police: c.police.units.length,
      stars: c.wanted.stars,
      health: Math.round(c.player.health),
      money: c.economy.money,
      state: this.state,
      mission: c.missions.debugState(),
    };
  }

  private frame(dt: number, alpha: number): void {
    const c = this.ctx;
    this.handleGlobalKeys();
    if (this.state === 'menu') {
      // Медленный облёт города за главным меню.
      this.menuOrbit += 1 / 60 * 0.05;
      const p = c.player.renderPosition;
      c.camera.position.set(p.x + Math.sin(this.menuOrbit) * 60, 45, p.z + Math.cos(this.menuOrbit) * 60);
      c.camera.lookAt(p.x, 10, p.z);
      c.dayNight.update(1 / 60, p, c.camera);
      c.lights.update(1 / 60);
      return;
    }
    c.lights.update(dt);
    c.traffic.update(dt);
    c.vehicles.update(dt, alpha);
    c.peds.update(dt);
    c.police.update(dt);
    c.wanted.update(dt);
    c.player.update(dt, alpha);
    c.cameraRig.update(dt);
    if (this.state === 'playing') {
      c.weapons.update(dt);
      c.shops.update();
      c.missions.update(dt);
      c.pickups.update(dt);
    }
    c.effects.update(dt);
    c.markers.update(dt);
    c.dayNight.update(dt, c.player.renderPosition, c.camera);
    c.hud.update(dt);
    if (this.debugEl && c.settings.data.showFps) {
      const info = c.renderer.info;
      this.debugEl.textContent = `${this.loop.fps.toFixed(0)} FPS · CPU ${this.cpuMs.toFixed(1)} мс · ${info.render.calls} dc · ${(info.render.triangles / 1000).toFixed(0)}k tri`;
    }
  }

  private onResize(): void {
    const c = this.ctx;
    c.camera.aspect = window.innerWidth / window.innerHeight;
    c.camera.updateProjectionMatrix();
    c.renderer.setSize(window.innerWidth, window.innerHeight);
    c.effects.resize(window.innerHeight);
  }
}
