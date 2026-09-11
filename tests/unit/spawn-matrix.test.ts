import { expect, it } from 'vitest';
import { MAPS, customMatch } from '../../src/shared/content/Maps';
import { Battle, seededRandom } from '../../src/game/campaign/Battle';
import { objectiveIssues } from '../../src/shared/content/MapObjectives';

it('rejects undersized or overlapping coop spawn slots before opening a map', () => {
  const geometry = structuredClone(MAPS.find(m => m.id === 'hijack')!.geometry);
  expect(objectiveIssues(geometry, 'cooperative')).toEqual([]);
  geometry.spawns[0].pop(); expect(objectiveIssues(geometry, 'cooperative')).toContain('合作地图需要至少8个玩家出生点');
  geometry.spawns[0].push({ ...geometry.spawns[0][0] });
  expect(objectiveIssues(geometry, 'cooperative')).toContain('合作玩家出生空间重叠');
});

for (const map of MAPS) for (const mode of map.modes) it(`${map.id}/${mode} full roster settles and respawns without overlap`, () => {
  const mission = customMatch(map.id, mode);
  // This matrix isolates spawn geometry; wave combat has separate tests.
  if (mission.scenario) mission.scenario.warmupTicks = 900;
  const battle = new Battle({ ...mission, allies: mode === 'coop' ? 7 : 3, enemies: mode === 'coop' ? 0 : 4 }, 'normal', 'm4', seededRandom(14));
  battle.actors.forEach(a => a.human = true);
  const verify = () => {
    expect(battle.actors).toHaveLength(8);
    for (const actor of battle.actors) {
      const m = actor.movement;
      expect(actor.life.alive, actor.id).toBe(true);
      expect(m.jumping, actor.id).toBe(false);
      expect(m.y, actor.id).toBeLessThan(mission.killY ?? 840);
      for (const dx of [-10, 0, 10]) for (const dy of [-55, -35, -15]) expect(battle.wall(m.x + dx, m.y + dy), `${actor.id} body ${dx},${dy}`).toBe(false);
    }
    for (let i = 0; i < battle.actors.length; i++) for (let j = i + 1; j < battle.actors.length; j++) {
      const a = battle.actors[i].movement, b = battle.actors[j].movement;
      expect(Math.abs(a.x - b.x) >= 28 || Math.abs(a.y - b.y) >= 65, `${battle.actors[i].id}/${battle.actors[j].id}`).toBe(true);
    }
  };
  for (let i = 0; i < 90; i++) battle.tickPlayers(new Map());
  verify();
  for (const actor of battle.actors) { actor.life.spawnProtectionFrames = 0; battle.damage(actor, 9999); }
  for (let i = 0; i < 241; i++) battle.tickPlayers(new Map());
  verify();
});
