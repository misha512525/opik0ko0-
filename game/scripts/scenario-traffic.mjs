// Сценарий: трафик и пешеходы — количество, движение, светофоры, паника.
export default async function ({ g, shot, stats, errors, waitSim, waitFrames }) {
  // Игрок на углу перекрёстка в центре.
  await g(() => {
    const c = window.__game.ctx;
    const n = c.city.nodes[c.city.nodeIndex(3, 3)];
    c.player.teleport({ x: n.x + 9, y: 0.2, z: n.z + 9 }, Math.PI);
    c.dayNight.hour = 10;
  });
  await waitSim(20);
  const s = await stats('after-20s');
  const ex = s.extra;
  if (ex.traffic < 8) errors.push(`[test] too few traffic cars: ${ex.traffic}`);
  if (ex.peds < 15) errors.push(`[test] too few pedestrians: ${ex.peds}`);
  const motion = await g(() => {
    const c = window.__game.ctx;
    const ag = c.traffic.agents;
    const speeds = ag.map((a) => Math.abs(a.vehicle.forwardSpeed));
    const moving = speeds.filter((v) => v > 2).length;
    // Машины, стоящие у стоп-линии на красный.
    let waitingRed = 0;
    for (const a of ag) {
      if (a.cur.kind !== 'segment') continue;
      const st = c.lights.state(a.cur.to, a.cur.dir);
      if (st === 'red' && a.cur.length - a.s < 12 && Math.abs(a.vehicle.forwardSpeed) < 0.5) waitingRed++;
    }
    const pedsWalking = c.peds.list.filter((p) => p.movedSpeed > 0.5).length;
    return { agents: ag.length, moving, waitingRed, pedsWalking };
  });
  console.log('traffic motion', JSON.stringify(motion));
  if (motion.moving < 3) errors.push('[test] traffic is not moving');
  if (motion.pedsWalking < 5) errors.push('[test] pedestrians are not walking');
  await g(() => { const c = window.__game.ctx; c.cameraRig.pitch = -0.55; c.cameraRig.yaw = Math.PI * 0.75; });
  await waitFrames(3);
  await shot('01-street');
  // Паника от выстрела.
  const fled = await g(() => {
    const c = window.__game.ctx;
    c.events.emit('gunshot', { position: c.player.position.clone(), byPlayer: true });
    return c.peds.list.filter((p) => p.state === 'flee' || (p.state === 'cross' && p.timer > 0)).length;
  });
  console.log('peds fleeing after gunshot', fled);
  await waitSim(1);
  await shot('02-panic');
  // Наезд машиной на пешехода.
  const hit = await g(() => {
    const c = window.__game.ctx;
    // Пешеход «под скриптом» не уворачивается — проверяем сам удар.
    const ped = c.peds.spawnAt('cop', c.player.position.x + 20, c.player.position.z - 9);
    ped.state = 'script'; ped.persistent = true;
    const v = c.vehicles.spawn('sedan', ped.x - 8, ped.z, Math.PI / 2);
    v.body.setLinvel({ x: 16, y: 0, z: 0 }, true);
    v.driver = 'mission'; v.controls.throttle = 1;
    window.__hitPed = ped;
    return ped.id;
  });
  await waitSim(1.5);
  const pedState = await g(() => ({ state: window.__hitPed.state, hp: window.__hitPed.health }));
  console.log('hit ped', hit, JSON.stringify(pedState));
  if (pedState.state !== 'dead' && pedState.state !== 'down') errors.push('[test] car did not knock pedestrian');
  await stats('perf');
}
