import { performance } from 'node:perf_hooks';
import { mkdirSync, writeFileSync } from 'node:fs';
import { Room } from '../src/shared/simulation/Room';
import { idleInput, seededRandom } from '../src/game/campaign/Battle';
import { awardGrowth, growthView } from '../src/shared/simulation/Growth';
import { CONTENT_VERSION } from '../src/shared/protocol/ContentVersion';

const results = (['classic', 'growth'] as const).map(rules => {
  const room = new Room(`benchmark-${rules}`, 'signal', 'tdm', false, rules);
  for (let i = 0; i < 8; i++) { room.join(`p${i}`, `Pilot ${i}`); room.ready(`p${i}`, true); }
  room.start('p0', 1);
  const session = room.session!, battle = session.battle;
  if (rules === 'growth') for (const actor of battle.actors) awardGrowth(actor.growth!, 1200, seededRandom(2), 0);
  const times: number[] = [];
  for (let sequence = 0; sequence < 2400; sequence++) {
    const start = performance.now();
    for (let i = 0; i < 8; i++) room.command(`p${i}`, { sequence, input: idleInput(), actions: [] });
    session.tick(); if (sequence >= 300) times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  return { rules, actors: battle.actors.length, measuredTicks: times.length, p95Ms: times[Math.floor(times.length * .95)],
    p99Ms: times[Math.floor(times.length * .99)], snapshotBytes: Buffer.byteLength(JSON.stringify(battle.snapshot())),
    ownGrowthBytes: battle.player.growth ? Buffer.byteLength(JSON.stringify(growthView(battle.player.growth))) : 0 };
});
const report = { date: new Date().toISOString(), content: CONTENT_VERSION, results,
  scope: 'Same-process Windows comparison, 8 stationary authenticated-equivalent controllers, 300 warmup + 2100 sampled ticks. Snapshot bytes before visibility filtering; no transport, rendering, combat or cross-device acceptance.' };
mkdirSync('artifacts/qa', { recursive: true });
writeFileSync('artifacts/qa/growth-baseline.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
