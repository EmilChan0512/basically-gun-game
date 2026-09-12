import { expect, it } from 'vitest';
import { Room } from '../../src/shared/simulation/Room';
import { GROWTH_WEAPONS, defaultGrowthLoadout, growthWeaponConfigs } from '../../src/shared/content/GrowthCatalog';
import { freshGrowthCareer, ownedGrowthLoadout } from '../../src/shared/content/GrowthCareer';
import { freshGrowthMetrics, earnedGrowthTraits, earnedGrowthAchievements } from '../../src/shared/content/GrowthRecords';
import { OnlineAccounts } from '../../server/OnlineAccounts';
import { Battle, seededRandom, idleInput } from '../../src/game/campaign/Battle';
import { newGrowth, offerGrowth, selectGrowth } from '../../src/shared/simulation/Growth';

it('weapon attachments have real costs, never modify base damage, and survive a battle checkpoint', () => {
  const base = defaultGrowthLoadout('sniper');
  for (const attachment of ['heavy', 'short', 'quickmag'] as const) {
    const loadout = { ...base, attachment }, config = growthWeaponConfigs(loadout).scout;
    expect(config.damage).toBe(GROWTH_WEAPONS.scout.damage);
    if (attachment === 'heavy') { expect(config.recoil).toBeLessThan(GROWTH_WEAPONS.scout.recoil); expect(config.reloadFrames).toBeGreaterThan(GROWTH_WEAPONS.scout.reloadFrames); }
    if (attachment === 'short') { expect(config.rangeUnits).toBeLessThan(GROWTH_WEAPONS.scout.rangeUnits); expect(config.recoil).toBeGreaterThan(GROWTH_WEAPONS.scout.recoil); }
    if (attachment === 'quickmag') { expect(config.magazineSize).toBeLessThan(GROWTH_WEAPONS.scout.magazineSize); expect(config.reloadFrames).toBeLessThan(GROWTH_WEAPONS.scout.reloadFrames); }
    const room = new Room('depth', 'signal', 'tdm', false, 'growth'); room.join('a', 'A'); room.equipGrowth('a', loadout); room.ready('a', true); room.start('a', 3);
    const battle = room.session!.battle; expect(battle.player.arsenal.gun.weapon).toEqual(config);
    const restored = Battle.restore(battle.checkpoint()); restored.tick(idleInput()); battle.tick(idleInput()); expect(restored.checkpoint()).toEqual(battle.checkpoint());
  }
  expect(GROWTH_WEAPONS.scout.magazineSize).toBe(4);
});

it('requires mastery/ownership for attachments, titles and evolutions rather than trusting requested flags', () => {
  const career = freshGrowthCareer(), loadout = defaultGrowthLoadout();
  expect(() => ownedGrowthLoadout(career, { ...loadout, attachment: 'heavy' })).toThrow('配件');
  career.weaponXp.m4 = 200; expect(ownedGrowthLoadout(career, { ...loadout, attachment: 'heavy' }).attachment).toBe('heavy');
  expect(() => ownedGrowthLoadout(career, { ...loadout, title: 'ghost' })).toThrow('称号');
  expect(() => ownedGrowthLoadout(career, { ...loadout, evolutions: true })).toThrow('Lv.5');
  career.achievements.push('ghost'); career.mastery.assault = 1000;
  expect(ownedGrowthLoadout(career, { ...loadout, title: 'ghost', evolutions: true }).title).toBe('ghost');
});

it('records server-side kill behavior, resets streaks on death, and preserves historical achievement peaks', () => {
  const room = new Room('records', 'signal', 'tdm', false, 'growth'); room.join('a', 'A'); room.ready('a', true); room.start('a', 2);
  const battle = room.session!.battle, player = battle.player, bot = battle.actors[1];
  player.life.health = 5; player.movement.vx = 4;
  for (let i = 0; i < 5; i++) {
    bot.life.alive = true; bot.life.health = 100; bot.life.spawnProtectionFrames = 0;
    battle.applyDamage(bot, { kind: 'bullet', amount: 1000, sourceId: player.id, origin: player.movement, hitPoint: bot.movement, weapon: 'm4', headshot: true });
  }
  expect(player.growth!.metrics.headshotKills).toBe(5); expect(player.growth!.metrics.movingKills).toBe(5);
  expect(earnedGrowthAchievements(player.growth!.metrics)).toEqual(expect.arrayContaining(['notToday', 'ghost', 'oneMagazine']));
  battle.damage(player, 10000); expect(player.growth!.headshotStreak).toBe(0); expect(player.growth!.killStreak).toBe(0);
  expect(player.growth!.metrics.bestHeadshotStreak).toBe(5);
});

it('settles weapon-specific mastery and behavior unlocks exactly once without touching old credits or classes', async () => {
  const store = new OnlineAccounts(), { profile } = await store.login('register', 'Depth pilot', 'test-password-123', 'fixture');
  const metrics = { ...freshGrowthMetrics(), movingKills: 10, lowHealthKills: 5, headshotKills: 10, bestHeadshotStreak: 5 };
  const reward = { accountId: profile.id, classId: 'assault' as const, matchXp: 0, kills: 0, won: false, metrics,
    weaponMetrics: { m4: { shots: 10, hits: 10, kills: 4, magazineKills: 0 }, usp: { shots: 2, hits: 1, kills: 0, magazineKills: 0 } } };
  store.settleGrowth('depth1', [reward]); const next = store.profile(profile.id);
  expect(next.growth!.weaponXp).toEqual({ m4: 200, usp: 4 }); expect(next.growth!.traits).toEqual(earnedGrowthTraits(metrics));
  const loadout = defaultGrowthLoadout(); loadout.pool![0] = 'rollingReserve';
  expect(() => ownedGrowthLoadout(next.growth!, loadout)).not.toThrow();
  expect(next.credits).toBe(profile.credits); expect(next.classes).toEqual(profile.classes);
  store.settleGrowth('depth1', [reward]); expect(store.profile(profile.id)).toEqual(next);
});

it('evolutions require the earlier selection, consume normal choices and keep the four-choice cap', () => {
  const g = newGrowth({ ...defaultGrowthLoadout(), evolutions: true }); g.level = 5; g.xp = 1200;
  for (let seed = 0; seed < 20; seed++) { g.offer = null; offerGrowth(g, seededRandom(seed), 0); expect(g.offer!.cards).not.toContain('momentumII'); }
  g.selected = ['momentum']; let found = false;
  for (let seed = 0; seed < 100; seed++) { g.offer = null; offerGrowth(g, seededRandom(seed), 0); if (g.offer!.cards.includes('momentumII')) { found = true; break; } }
  expect(found).toBe(true); selectGrowth(g, g.offer!.batch, 'momentumII', seededRandom(5), 1);
  expect(g.selected).toHaveLength(2); g.killStreak = 2;
  for (let seed = 0; seed < 100; seed++) { g.offer = null; offerGrowth(g, seededRandom(seed), 2); if (g.offer!.cards.includes('killingSpree')) break; }
  expect(g.offer!.cards).toContain('killingSpree'); selectGrowth(g, g.offer!.batch, 'killingSpree', seededRandom(6), 3);
  selectGrowth(g, g.offer!.batch, g.offer!.cards[0], seededRandom(7), 4); expect(g.selected).toHaveLength(4); expect(g.offer).toBeNull();
});
