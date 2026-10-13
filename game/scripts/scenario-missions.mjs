// Сценарий: HUD, карта, пауза, магазины, сохранение и прохождение миссий.
export default async function ({ page, g, hold, shot, stats, errors, waitSim, waitFrames }) {
  const ms = () => g(() => window.__game.ctx.missions.debugState());
  const skipDialog = async (maxLines = 8) => {
    for (let i = 0; i < maxLines; i++) {
      const s = await ms();
      if (!s || s.type !== 'dialog') return;
      await hold('Enter', 0);
      await waitFrames(2);
      await waitSim(0.1);
    }
  };
  const tpPlayer = (x, z) => g(([x, z]) => window.__game.ctx.player.teleport({ x, y: 0.2, z }), [x, z]);
  const tpVehicle = (x, z, yaw = 0) => g(([x, z, yaw]) => { const v = window.__game.ctx.vehicles.playerVehicle; v.teleport(x, z, yaw); }, [x, z, yaw]);

  await g(() => { window.__game.ctx.dayNight.hour = 16; });
  await waitFrames(3);
  await shot('01-hud');

  // --- Миссия 1: доставка.
  const m1 = await g(() => window.__game.ctx.missions.next().start);
  await tpPlayer(m1.x, m1.z);
  await waitSim(0.5);
  let st = await ms();
  console.log('mission after marker', JSON.stringify(st));
  if (!st || st.id !== 'm1_delivery') errors.push('[test] mission 1 did not start from marker');
  await waitSim(1);
  await shot('02-dialog');
  await skipDialog();
  st = await ms();
  console.log('m1 step', JSON.stringify(st));
  await g(() => { const c = window.__game.ctx; const v = c.missions.vehicle('car'); c.player.teleport({ x: v.position.x, y: 0.2, z: v.position.z + 3 }); });
  await waitFrames(2);
  await hold('KeyF', 0);
  await waitFrames(3);
  st = await ms();
  console.log('m1 after enter', JSON.stringify(st));
  await waitSim(0.5);
  await shot('03-mission-drive');
  const target = await g(() => { const d = window.__game.ctx.missions.defs[0].steps.find((s) => s.type === 'goto'); return d.at; });
  await tpVehicle(target.x - 3, target.z, Math.PI / 2);
  await waitSim(1);
  const money1 = await g(() => window.__game.ctx.economy.money);
  const done1 = await g(() => [...window.__game.ctx.missions.completed]);
  console.log('after m1: money', money1, 'completed', done1, 'save', await g(() => !!localStorage.getItem('velmont-heat-save-v1')));
  if (!done1.includes('m1_delivery')) errors.push('[test] mission 1 not completed');
  await shot('04-mission-passed');
  await hold('KeyF', 0);
  await waitFrames(3);

  // --- Миссия 2: погоня.
  await tpPlayer(m1.x, m1.z);
  await waitSim(0.5);
  await skipDialog();
  // Садимся в машину рядом.
  await g((m) => { const c = window.__game.ctx; const v = c.vehicles.spawn('sports', m.x + 5, 105.25, Math.PI / 2); c.player.teleport({ x: v.position.x, y: 0.2, z: v.position.z + 3 }); }, m1);
  await waitFrames(2);
  await hold('KeyF', 0);
  await waitSim(3);
  st = await ms();
  const courier = await g(() => { const v = window.__game.ctx.missions.vehicle('courier'); return v ? { speed: v.speed, x: v.position.x, z: v.position.z } : null; });
  console.log('m2 chase', JSON.stringify(st), 'courier', JSON.stringify(courier));
  if (!courier || courier.speed < 3) errors.push('[test] courier is not fleeing');
  await g(() => { const c = window.__game.ctx; const v = c.missions.vehicle('courier'); c.vehicles.playerVehicle.teleport(v.position.x - Math.sin(v.yaw) * 12, v.position.z - Math.cos(v.yaw) * 12, v.yaw); c.cameraRig.yaw = v.yaw; });
  await waitFrames(3);
  await shot('05-chase');
  await g(() => { const v = window.__game.ctx.missions.vehicle('courier'); v.damage(v.maxHealth * 0.75, true); });
  await waitSim(0.5);
  st = await ms();
  console.log('m2 after disabling courier', JSON.stringify(st));
  await hold('KeyF', 0);
  await waitFrames(3);
  await g(() => { const c = window.__game.ctx; const v = c.missions.vehicle('courier'); const p = v.localToWorld(v.spec.half.x + 1.2, 0, 0); c.player.teleport({ x: p.x, y: 0.2, z: p.z }); });
  await waitSim(0.5);
  await tpPlayer(m1.x, m1.z);
  await waitSim(1);
  console.log('after m2 completed', await g(() => [...window.__game.ctx.missions.completed]));
  await skipDialog();

  // --- Миссия 3: гонка по контрольным точкам.
  const m3 = await g(() => window.__game.ctx.missions.next());
  console.log('next mission', m3.id);
  await tpPlayer(m3.start.x, m3.start.z);
  await waitSim(0.5);
  await skipDialog();
  await g(() => { const c = window.__game.ctx; const v = c.missions.vehicle('racer'); c.player.teleport({ x: v.position.x, y: 0.2, z: v.position.z - 3 }); });
  await waitFrames(2);
  await hold('KeyF', 0);
  await waitFrames(3);
  await skipDialog();
  const pts = await g(() => window.__game.ctx.missions.defs.find((d) => d.id === 'm3_race').steps.find((s) => s.type === 'checkpoints').points);
  await waitSim(0.3);
  await shot('06-race');
  for (const p of pts) {
    await tpVehicle(p.x, p.z, 0);
    await waitSim(0.25);
  }
  await waitSim(0.5);
  const done3 = await g(() => [...window.__game.ctx.missions.completed]);
  console.log('after race', done3);
  if (!done3.includes('m3_race')) errors.push('[test] race mission not completed');
  await hold('KeyF', 0);
  await waitFrames(3);

  // --- Оружейная.
  await g(() => { const c = window.__game.ctx; c.economy.add(5000); const p = c.city.poi('gunshop_w'); c.player.teleport({ x: p.x, y: 0.2, z: p.z }); });
  await waitSim(0.3);
  await hold('KeyE', 0);
  await waitFrames(3);
  const shopState = await g(() => window.__game.state);
  console.log('state after E at gunshop', shopState);
  if (shopState !== 'shop') errors.push('[test] gun shop did not open');
  await shot('07-gunshop');
  await page.click('.shop-item[data-id="pistol"]');
  await page.click('.shop-item[data-id="armor"]');
  await page.click('.shop-close');
  await waitFrames(3);
  const inv = await g(() => { const c = window.__game.ctx; return { owned: [...c.weapons.owned], armor: c.player.armor, money: c.economy.money, state: window.__game.state }; });
  console.log('after shopping', JSON.stringify(inv));
  if (!inv.owned.includes('pistol') || inv.armor < 100) errors.push('[test] purchase failed');

  // --- Покрасочная сбрасывает розыск.
  await g(() => {
    const c = window.__game.ctx;
    const p = c.city.poi('paint_s');
    const v = c.vehicles.spawn('compact', p.x, p.z, 0);
    c.vehicles.enter(v);
    c.wanted.setStars(2);
    c.wanted.seen = false;
  });
  await waitFrames(2);
  await hold('KeyE', 0);
  await waitFrames(3);
  const stars = await g(() => window.__game.ctx.wanted.stars);
  console.log('stars after respray', stars);
  if (stars !== 0) errors.push('[test] respray did not clear wanted level');
  await hold('KeyF', 0);
  await waitFrames(3);

  // --- Карта и пауза.
  await hold('KeyM', 0);
  await waitFrames(3);
  console.log('state after M', await g(() => window.__game.state));
  await shot('08-map');
  await hold('KeyM', 0);
  await waitFrames(3);
  await hold('Escape', 0);
  await waitFrames(3);
  console.log('state after Esc', await g(() => window.__game.state));
  await shot('09-pause');
  await page.click('button[data-act="settings"]');
  await waitFrames(2);
  await shot('10-settings');
  await page.click('button[data-act="back"]');
  await page.click('button[data-act="resume"]');
  await waitFrames(3);
  const resumed = await g(() => window.__game.state);
  if (resumed !== 'playing') errors.push('[test] resume from pause failed: ' + resumed);

  // --- Сохранение/загрузка.
  const saved = await g(() => { const c = window.__game.ctx; c.save.save('manual'); return { money: c.economy.money, done: [...c.missions.completed] }; });
  await g(() => { const c = window.__game.ctx; c.economy.add(-100); c.player.teleport({ x: 0, y: 0.2, z: -300 }); });
  await waitFrames(2);
  const loaded = await g(() => { const c = window.__game.ctx; c.save.load(); return { money: c.economy.money, done: [...c.missions.completed] }; });
  console.log('save/load', JSON.stringify(saved), JSON.stringify(loaded));
  if (saved.money !== loaded.money || saved.done.length !== loaded.done.length) errors.push('[test] save/load mismatch');
  await stats('end-missions');
}
