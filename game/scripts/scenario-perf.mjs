// Сценарий: замер производительности — езда по центру с трафиком и пешеходами.
export default async function ({ g, stats, shot, waitSim, waitFrames }) {
  await g(() => {
    const c = window.__game.ctx;
    c.dayNight.hour = 18.5;
    const n = c.city.nodes[c.city.nodeIndex(6, 3)];
    const v = c.vehicles.spawn('sedan', n.x + 30, n.z + 5.25, Math.PI / 2);
    c.vehicles.enter(v);
    c.player.invulnerable = 999;
  });
  await waitSim(12);
  await g((c) => window.__game.ctx.input.simulate(c, true), 'KeyW');
  const samples = [];
  for (let i = 0; i < 5; i++) {
    await waitSim(2);
    samples.push(await stats('perf-' + i));
  }
  await g((c) => window.__game.ctx.input.simulate(c, false), 'KeyW');
  await waitFrames(2);
  await shot('01-downtown');
  const avg = (k) => (samples.reduce((s, x) => s + (k(x) ?? 0), 0) / samples.length).toFixed(2);
  console.log('PERF avg: stepMs', avg((s) => s.extra.stepMs), 'frameLogicMs', avg((s) => s.extra.frameLogicMs), 'cpuMs', avg((s) => s.extra.cpuMs), 'drawCalls', avg((s) => s.calls), 'tris', avg((s) => s.tris), 'fps(swiftshader)', avg((s) => s.fps));
}
