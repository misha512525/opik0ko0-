// Сценарий: стрельба, урон NPC, розыск, полиция, уход от погони, смерть и возрождение.
export default async function ({ g, shot, stats, errors, waitSim, waitFrames }) {
  const aimAt = (id) => g((pid) => {
    const c = window.__game.ctx;
    const p = c.peds.list.find((q) => q.id === pid);
    if (!p) return false;
    const cam = c.camera.position;
    const dx = p.x - cam.x, dy = p.y + 1.1 - cam.y, dz = p.z - cam.z;
    c.cameraRig.yaw = Math.atan2(dx, dz);
    c.cameraRig.pitch = Math.atan2(dy, Math.hypot(dx, dz));
    return true;
  }, id);
  const pedId = await g(() => {
    const c = window.__game.ctx;
    c.dayNight.hour = 13;
    const n = c.city.nodes[c.city.nodeIndex(2, 6)];
    c.player.teleport({ x: n.x + 10, y: 0.2, z: n.z + 10 }, 0);
    c.weapons.give('pistol', 48);
    c.weapons.give('rifle', 120);
    c.weapons.select('pistol');
    const ped = c.peds.spawnAt('civilian', n.x + 10, n.z + 24);
    ped.state = 'idle'; ped.timer = 999; ped.persistent = true;
    c.input.rmb = true;
    return ped.id;
  });
  await waitFrames(3);
  for (let i = 0; i < 8; i++) {
    await aimAt(pedId);
    await waitFrames(1);
    await g(() => { window.__game.ctx.input.lmbPressed = true; });
    await waitFrames(2);
    await waitSim(0.3);
  }
  await shot('01-aim-shoot');
  const r1 = await g((pid) => {
    const c = window.__game.ctx;
    const p = c.peds.list.find((q) => q.id === pid);
    return { pedState: p ? p.state : 'gone', pedHp: p ? p.health : 0, stars: c.wanted.stars, heat: c.wanted.heat, ammo: c.weapons.ammo.pistol };
  }, pedId);
  console.log('after shooting', JSON.stringify(r1));
  if (r1.pedState !== 'dead') errors.push('[test] ped not killed by pistol');
  if (r1.stars < 1) errors.push('[test] no wanted level after killing a ped in public');
  // Розыск 3★ → полиция.
  await g(() => { const c = window.__game.ctx; c.input.rmb = false; c.wanted.setStars(3); });
  await waitSim(14);
  const r2 = await stats('police-3-stars');
  const cops = await g(() => window.__game.ctx.peds.list.filter((p) => p.role === 'cop').length);
  console.log('police units', r2.extra.police, 'cops on foot', cops, 'player hp', r2.extra.health);
  if (r2.extra.police < 1) errors.push('[test] no police units spawned');
  await g(() => {
    const c = window.__game.ctx;
    const u = c.police.units.find((q) => q.vehicle);
    if (u) { const v = u.vehicle.position; c.cameraRig.yaw = Math.atan2(v.x - c.player.position.x, v.z - c.player.position.z); c.cameraRig.pitch = -0.1; }
  });
  await waitFrames(3);
  await shot('02-police');
  // Отстреливаемся из автомата.
  await g(() => { const c = window.__game.ctx; c.weapons.select('rifle'); c.input.rmb = true; c.input.lmb = true; });
  await waitSim(2);
  await g(() => { const c = window.__game.ctx; c.input.rmb = false; c.input.lmb = false; });
  await shot('03-firefight');
  // Уход от погони: телепорт далеко и ждём.
  await g(() => {
    const c = window.__game.ctx;
    c.player.invulnerable = 100;
    const n = c.city.nodes[c.city.nodeIndex(9, 0)];
    c.player.teleport({ x: n.x + 10, y: 0.2, z: n.z + 10 });
  });
  await waitSim(24);
  const r3 = await g(() => ({ stars: window.__game.ctx.wanted.stars, seen: window.__game.ctx.wanted.seen }));
  console.log('after evading', JSON.stringify(r3));
  if (r3.stars !== 0) errors.push('[test] wanted level did not clear after escaping the search zone');
  // Смерть и возрождение.
  const money0 = await g(() => { const c = window.__game.ctx; c.player.invulnerable = 0; c.economy.add(1000); return c.economy.money; });
  await g(() => window.__game.ctx.damage.damagePlayer(500, null));
  await waitFrames(2);
  await shot('04-dead');
  await waitSim(5);
  const r4 = await g(() => { const c = window.__game.ctx; return { mode: c.player.mode, hp: c.player.health, money: c.economy.money }; });
  console.log('after respawn', JSON.stringify(r4), 'money before', money0);
  if (r4.mode !== 'foot' || r4.hp < 100 || r4.money >= money0) errors.push('[test] respawn after death failed');
}
