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
import { Player } from './player/Player';
import { CameraRig } from './player/CameraRig';
import { VehicleManager } from './vehicles/VehicleManager';
import { Weapons } from './combat/Weapons';
import { Effects } from './fx/Particles';

/**
 * Корень композиции: создаёт системы, связывает их через GameContext
 * и задаёт порядок обновления в фиксированном и кадровом шагах.
 */
export class Game {
  readonly ctx: GameContext;
  readonly loop: Loop;
  private debugEl: HTMLElement | null;
  /** Сглаженное время логики (без рендера) и рендера, мс — для профилирования. */
  cpuMs = 0;
  /** Накопленное игровое время (с) и число кадров — для автотестов. */
  simTime = 0;
  frameCount = 0;
  renderMs = 0;
  private fixedAccumMs = 0;

  private constructor(ctx: GameContext) {
    this.ctx = ctx;
    this.loop = new Loop(
      CONFIG.physics.fixedDt,
      CONFIG.physics.maxSubSteps,
      (dt) => this.fixedUpdate(dt),
      (dt, a) => this.update(dt, a),
    );
    this.debugEl = document.getElementById('debug');
    window.addEventListener('resize', () => this.onResize());
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
    ctx.weapons = new Weapons(ctx);
    ctx.vehicles = new VehicleManager(ctx);
    onProgress('Машины…');
    ctx.vehicles.spawnParked();
    ctx.cameraRig = new CameraRig(ctx, camera);
    const home = city.poi('safehouse');
    ctx.player = new Player(ctx, new THREE.Vector3(home.x, 0.2, home.z));
    ctx.cameraRig.yaw = Math.PI;

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

  private fixedUpdate(dt: number): void {
    const t0 = performance.now();
    this.fixedStep(dt);
    this.fixedAccumMs += performance.now() - t0;
  }

  private fixedStep(dt: number): void {
    const c = this.ctx;
    this.simTime += dt;
    c.player.fixedUpdate(dt);
    c.vehicles.fixedUpdate(dt);
    c.physics.step();
    c.vehicles.postStep(dt);
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
    return { cpuMs: +this.cpuMs.toFixed(2), renderSubmitMs: +this.renderMs.toFixed(2) };
  }

  private frame(dt: number, alpha: number): void {
    const c = this.ctx;
    c.vehicles.update(dt, alpha);
    c.player.update(dt, alpha);
    c.cameraRig.update(dt);
    c.effects.update(dt);
    c.dayNight.update(dt, c.player.renderPosition, c.camera);
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
