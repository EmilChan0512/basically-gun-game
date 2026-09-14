import { mkdir, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { strict as assert } from 'node:assert';
import { Battle, seededRandom } from '../../src/game/campaign/Battle';
import { customMatch } from '../../src/shared/content/Maps';
import { defaultGrowthLoadoutV3, changeGrowthAbility } from '../../src/shared/content/growth-v3/Loadout';
import { CONTENT_VERSION, contentFingerprint } from '../../src/shared/protocol/ContentVersion';

// A complete authority match with the actual navigation/collision map. This is not browser/network evidence.
const classes = ['assault', 'tank', 'sniper', 'medic'] as const;
const battle = new Battle({ ...customMatch('hijack', 'tdm'), allies: 3, enemies: 4, seconds: 900, goal: Number.MAX_SAFE_INTEGER },
  'normal', 'm4', seededRandom(918203), null, 'growth-v3-full-match');
const loadouts = Object.fromEntries(battle.actors.map((actor, index) => {
  actor.human = false;
  let loadout = defaultGrowthLoadoutV3(classes[index % 4]);
  if (index >= 4) {
    loadout = changeGrowthAbility(loadout, (['as_reloadrush', 'tk_shield', 'sn_relocate', 'md_link'] as const)[index % 4]);
    loadout.gadgetId = (['as_charge', 'tk_interceptor', 'sn_emp', 'md_station'] as const)[index % 4];
  }
  return [actor.id, loadout];
}));
battle.enableGrowthV3(loadouts, 2);
let restored: Battle | undefined;
const samples: number[] = [], started = performance.now();
while (battle.phase === 'running') {
  const before = performance.now(); battle.tickPlayers(new Map()); samples.push(performance.now() - before);
  restored?.tickPlayers(new Map());
  if (battle.frame === 13500) restored = Battle.restore(battle.checkpoint());
  if (battle.frame % 4500 === 0) process.stdout.write(JSON.stringify({ frame: battle.frame, scores: battle.scores, elapsedMs: Math.round(performance.now() - started) }) + '\n');
  assert(battle.frame <= 27000, 'The authority match must end at the configured 15-minute limit');
}
assert.equal(battle.frame, 27000);
assert.deepEqual(restored!.checkpoint(), battle.checkpoint());
assert(battle.scores[0] + battle.scores[1] > 0, 'Bots must actually engage');
assert([...battle.growthV3!.participants.values()].every(p => p.progression.ultimate));
const sorted = [...samples].sort((a, b) => a - b), percentile = (p: number) => sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)];
const report = {
  date: new Date().toISOString(), content: CONTENT_VERSION,
  scope: 'One local 4v4 deterministic 15-minute authority match on hijack, stage 2, seed 918203; all 8 E variants, eight G choices; restore at minute 7.5 and compare complete final checkpoints. No browser rendering, transport, device clients or human balancing feedback.',
  frames: battle.frame, result: battle.result, scores: battle.scores, checkpointHash: contentFingerprint(battle.checkpoint()), restoredIdentically: true,
  simulationMs: { samples: samples.length, mean: samples.reduce((sum, n) => sum + n, 0) / samples.length, p95: percentile(.95), p99: percentile(.99), max: sorted.at(-1) },
  participants: battle.actors.map(a => ({ id: a.id, classId: battle.growthV3!.participant(a.id).loadout.classId,
    abilityId: battle.growthV3!.participant(a.id).loadout.abilityId, gadgetId: battle.growthV3!.participant(a.id).loadout.gadgetId,
    kills: a.kills, deaths: a.life.deaths, shots: a.arsenal.shots, gadgetCharges: a.itemCharges,
    xp: battle.growthV3!.participant(a.id).progression.xp, selected: battle.growthV3!.participant(a.id).progression.selected })),
};
await mkdir('artifacts/qa', { recursive: true });
await writeFile('artifacts/qa/growth-v3-simulation.json', JSON.stringify(report, null, 2) + '\n');
process.stdout.write(JSON.stringify({ passed: true, simulationMs: report.simulationMs, scores: report.scores }) + '\n');
