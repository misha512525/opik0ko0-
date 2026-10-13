// Сценарий: Web Audio — радио в машине, переключение станций, эффекты, ночь и фары.
export default async function ({ g, hold, shot, errors, waitSim, waitFrames }) {
  await g(() => window.__game.ctx.audio.resume());
  await g(() => {
    const c = window.__game.ctx;
    c.dayNight.hour = 22;
    const lane = c.city.nearestLane(c.player.position.x, c.player.position.z);
    const yaw = [Math.PI, Math.PI / 2, 0, -Math.PI / 2][lane.dir];
    const v = c.vehicles.spawn('sports', lane.x, lane.z, yaw);
    c.player.teleport({ x: lane.x + 3, y: 0.2, z: lane.z });
    window.__car = v;
  });
  await waitFrames(3);
  await hold('KeyF', 0);
  await waitFrames(3);
  const r1 = await g(() => { const a = window.__game.ctx.audio; return { state: a.engine.ctx.state, station: a.radio.station, name: a.radio.stationName }; });
  console.log('radio on enter', JSON.stringify(r1));
  if (r1.station < 0) errors.push('[test] radio did not turn on in the car');
  const names = [];
  for (let i = 0; i < 4; i++) {
    await hold('KeyR', 0);
    await waitFrames(2);
    names.push(await g(() => window.__game.ctx.audio.radio.stationName));
  }
  console.log('stations cycled', JSON.stringify(names));
  if (new Set(names).size < 3) errors.push('[test] radio stations do not cycle');
  await hold('KeyR', 0);
  await waitFrames(2);
  await g((c) => window.__game.ctx.input.simulate(c, true), 'KeyW');
  await waitSim(3);
  await shot('01-night-drive-headlights');
  await g((c) => window.__game.ctx.input.simulate(c, false), 'KeyW');
  const t = await g(() => window.__game.ctx.audio.engine.ctx.currentTime);
  console.log('audio clock', t.toFixed(2), 'headlight', await g(() => window.__game.ctx.scene.children.filter((o) => o.isSpotLight).map((l) => l.intensity.toFixed(0))));
  // Звуки событий не должны падать.
  await g(() => {
    const c = window.__game.ctx;
    c.events.emit('gunshot', { position: c.player.position.clone(), byPlayer: true, weapon: 'rifle' });
    c.events.emit('explosion', { position: c.player.position.clone().setX(c.player.position.x + 30), radius: 1, byPlayer: false });
    c.events.emit('horn', { position: c.player.position.clone() });
    c.events.emit('pickup', { kind: 'cash' });
    c.events.emit('missionCompleted', { id: 'x', reward: 0 });
  });
  await waitSim(1);
}
