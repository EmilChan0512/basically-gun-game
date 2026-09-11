import { STARTER_WEAPONS } from '../../src/game/campaign/Catalog';
import { expect, it } from 'vitest';
import { CareerProgress } from '../../src/game/campaign/CareerProgress';
import { SAVE_KEY, type SaveStorage } from '../../src/game/campaign/Progress';
import { Battle, idleInput } from '../../src/game/campaign/Battle';
import { customMatch } from '../../src/shared/content/Maps';

function memory(): SaveStorage {
  const data = new Map<string, string>();
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); } };
}

it.each(['knife', 'shield'] as const)('persists %s as a real secondary and creates only the primary gun', id => {
  const storage = memory(), progress = new CareerProgress(storage);
  progress.selectClass(id === 'knife' ? 'assassin' : 'tank');
  progress.current.xp = 160; progress.current.loadout.level = 2;
  expect(progress.equipOffhand(id)).toBe(true);
  const restored = new CareerProgress(storage);
  expect(restored.loadout.secondary).toBe(id);
  const battle = new Battle({ ...customMatch('signal'), allies: 0, enemies: 1 }, 'normal', 'm4', undefined, restored.loadout);
  expect(battle.player.offhand!.kind).toBe(id === 'knife' ? 'melee' : 'shield');
  expect(battle.player.arsenal.checkpoint().guns.map(g => g.id)).toEqual([restored.loadout.primary]);
  battle.swap(); expect(battle.player.offhand!.equipped).toBe(true);
  const reloaded = Battle.restore(battle.checkpoint());
  reloaded.player.life.spawnProtectionFrames = 0; reloaded.damage(reloaded.player, 9999);
  reloaded.player.life.respawnFrames = 0; reloaded.tick(idleInput());
  expect(reloaded.player.offhand!.kind).toBe(battle.player.offhand!.kind);
  expect(reloaded.player.offhand!.equipped).toBe(false);
  expect(reloaded.player.arsenal.checkpoint().guns).toHaveLength(1);
});

it('preserves legacy secondary ownership and safely defaults unknown IDs', () => {
  const storage = memory(), progress = new CareerProgress(storage);
  progress.equipWeapon('usp');
  expect(new CareerProgress(storage).loadout.secondary).toBe('usp');
  progress.equipOffhand('knife');
  const raw = JSON.parse(storage.getItem(SAVE_KEY)!);
  raw.career.classes.medic.loadout.secondary = 'unknown-shield';
  raw.career.classes.medic.loadout.primary = 'knife';
  storage.setItem(SAVE_KEY, JSON.stringify(raw));
  expect(new CareerProgress(storage).loadout).toMatchObject({ primary: 'm4', secondary: 'usp' });
  expect(progress.equipWeapon('usp')).toBe(true);
  expect(progress.loadout.secondary).toBe('usp');
  expect(progress.data.career.weapons).toEqual(STARTER_WEAPONS);
});
