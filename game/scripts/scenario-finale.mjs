// Сценарий: миссии 4 («Горячий груз») и 5 («Финал») с уходом от полиции и боем.
export default async function ({ g, hold, shot, stats, errors, waitSim, waitFrames }) {
  const ms = () => g(() => window.__game.ctx.missions.debugState());
  const skipDialog = async () => {
    for (let i = 0; i < 8; i++) {
      const s = await ms();
      if (!s || s.type !== 'dialog') return;
      await hold('Enter', 0);
      await waitFrames(2);
      await waitSim(0.1);
    }
  };
  await g(() => { const c = window.__game.ctx; c.missions.restore(['m1_delivery', 'm2_chase', 'm3_race']); c.dayNight.hour = 21; });
  const home = await g(() => window.__game.ctx.missions.next().start);
  // --- Миссия 4.
  await g((h) => window.__game.ctx.player.teleport({ x: h.x, y: 0.2, z: h.z }), home);
  await waitSim(0.5);
  console.log('m4 start', JSON.stringify(await ms()));
  await skipDialog();
  await g(() => { const c = window.__game.ctx; const v = c.missions.vehicle('cargo'); c.player.teleport({ x: v.position.x, y: 0.2, z: v.position.z + 3.5 }); });
  await waitFrames(2);
  await hold('KeyF', 0);
  await waitFrames(3);
  await skipDialog();
  const s4 = await g(() => ({ st: window.__game.ctx.missions.debugState(), stars: window.__game.ctx.wanted.stars }));
  console.log('m4 after stealing van', JSON.stringify(s4));
  if (s4.stars < 3) errors.push('[test] stealing the van did not trigger wanted level');
  await waitSim(6);
  await shot('01-night-pursuit');
  // Уходим далеко и прячемся.
  await g(() => { const c = window.__game.ctx; c.player.invulnerable = 999; c.vehicles.playerVehicle.teleport(-450, -450, 0); });
  await waitSim(16);
  const s4b = await g(() => ({ st: window.__game.ctx.missions.debugState(), stars: window.__game.ctx.wanted.stars }));
  console.log('m4 after evading', JSON.stringify(s4b));
  await g((h) => window.__game.ctx.vehicles.playerVehicle.teleport(h.x + 8, 105.25, Math.PI / 2), home);
  await waitSim(1);
  const done4 = await g(() => [...window.__game.ctx.missions.completed]);
  console.log('after m4', done4);
  if (!done4.includes('m4_escape')) errors.push('[test] mission 4 not completed');
  await hold('KeyF', 0);
  await waitFrames(3);
  await skipDialog();
  // --- Миссия 5.
  await waitSim(3.5);
  await g((h) => window.__game.ctx.player.teleport({ x: h.x, y: 0.2, z: h.z }), home);
  await waitSim(0.5);
  await skipDialog();
  const s5 = await g(() => { const c = window.__game.ctx; return { st: c.missions.debugState(), guards: c.missions.group('guards').length, rifle: c.weapons.owned.has('rifle'), armor: c.player.armor }; });
  console.log('m5 start', JSON.stringify(s5));
  if (s5.guards !== 7 || !s5.rifle) errors.push('[test] finale did not spawn guards or give the rifle');
  await g(() => { const c = window.__game.ctx; c.player.teleport({ x: 400, y: 0.2, z: 425 }); c.cameraRig.yaw = Math.PI / 2; c.cameraRig.pitch = -0.05; c.player.invulnerable = 0; c.player.armor = 100; });
  await waitSim(3);
  await shot('02-finale-fight');
  const hp = await g(() => window.__game.ctx.player.health + window.__game.ctx.player.armor);
  console.log('player hp+armor after 3s in the fight', hp);
  await g(() => { const c = window.__game.ctx; c.player.invulnerable = 999; for (const p of c.missions.group('guards')) c.peds.damage(p, 999, true); });
  await waitSim(1);
  await skipDialog();
  const s5b = await g(() => ({ st: window.__game.ctx.missions.debugState(), stars: window.__game.ctx.wanted.stars }));
  console.log('m5 after fight', JSON.stringify(s5b));
  await g(() => window.__game.ctx.player.teleport({ x: -480, y: 0.2, z: -480 }));
  await waitSim(20);
  await g((h) => window.__game.ctx.player.teleport({ x: h.x, y: 0.2, z: h.z }), home);
  await waitSim(1);
  const done5 = await g(() => ({ done: [...window.__game.ctx.missions.completed], money: window.__game.ctx.economy.money }));
  console.log('after finale', JSON.stringify(done5));
  if (!done5.done.includes('m5_finale')) errors.push('[test] finale not completed');
  await waitFrames(3);
  await shot('03-the-end');
  await stats('end-finale');
}
