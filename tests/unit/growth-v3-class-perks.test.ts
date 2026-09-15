import { expect, it } from 'vitest';
import { Battle, idleInput, seededRandom } from '../../src/game/campaign/Battle';
import { GrowthRangeSession } from '../../src/client/session/GrowthRangeSession';
import { defaultGrowthLoadoutV3, changeGrowthAbility, validateGrowthLoadoutV3, type GrowthLoadoutV3 } from '../../src/shared/content/growth-v3/Loadout';
import { GROWTH_CLASS_IDS, type GrowthClassId } from '../../src/shared/content/growth-v3/Core';
import { GROWTH_V3_OPERATORS, type GrowthAbilityId } from '../../src/shared/content/growth-v3/Operators';
import { GROWTH_V3_PERKS, legalGrowthPerks, type GrowthPerkId } from '../../src/shared/content/growth-v3/Perks';
import { freshGrowthCareerV3, migrateGrowthCareerV3 } from '../../src/shared/content/growth-v3/Career';
import { grantArmor, newArmor, resolveIncomingDamage } from '../../src/shared/simulation/growth-v3/DamageRules';
import { resolveAbility } from '../../src/shared/simulation/growth-v3/AbilityRules';
import { GrowthArsenalV3 } from '../../src/shared/simulation/growth-v3/WeaponRules';
import { defaultGrowthLoadoutV3 as archivedBuild } from '../helpers/legacyGrowthLoadout';
import { mkdtempSync, readFileSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { OnlineAccounts } from '../../server/OnlineAccounts';

function build(cls: GrowthClassId, ability?: GrowthAbilityId, ...perks: GrowthPerkId[]) {
  const b = ability ? changeGrowthAbility(defaultGrowthLoadoutV3(cls), ability) : defaultGrowthLoadoutV3(cls);
  for (const perk of perks) b.perks[b.perks.findIndex(id => GROWTH_V3_PERKS[id].group === GROWTH_V3_PERKS[perk].group)] = perk;
  return b;
}
function fixture(loadout: GrowthLoadoutV3, allies = 1, enemyBuild = defaultGrowthLoadoutV3()) {
  const range = new GrowthRangeSession(loadout, { distance: 1800, health: 100, armor: 0 });
  const b = new Battle({ ...range.battle.mission, allies, enemies: 2 }, 'normal', 'm4', seededRandom(43191));
  b.enableGrowthV3(Object.fromEntries(b.actors.map(a => [a.id, a.id === 'player' ? loadout : a.team === 2 ? enemyBuild : defaultGrowthLoadoutV3()])), 5);
  b.actors.forEach(a => { a.human = true; a.life.spawnProtectionFrames = 0; a.movement.reset(a.id === 'player' ? 400 : a.team === 1 ? 470 : 1000, 499.5); });
  const ally = b.actors.find(a => a.team === 1 && a.id !== 'player')!, enemies = b.actors.filter(a => a.team === 2);
  const p = b.growthV3!.participant('player'), gun = b.growthV3!.weapons.get('player')!;
  const step = (n = 1) => { for (let i = 0; i < n; i++) b.tickPlayers(new Map()); };
  const cast = () => { b.player.aim = { x: ally.movement.x, y: ally.movement.y - 33 }; b.useSkill(); step(); while (b.growthV3!.abilities.actorState('player').pending) step(); };
  const finish = () => { while (b.growthV3!.abilities.actorState('player').active) step(); };
  return { b, ally, enemies, p, gun, step, cast, finish };
}

it.each(GROWTH_CLASS_IDS)('%s has six exclusive perks and legal automatic A/B switching', cls => {
  const ids = new Set<GrowthPerkId>();
  for (const ability of GROWTH_V3_OPERATORS[cls].abilities) {
    const b = build(cls, ability), legal = legalGrowthPerks(cls, ability);
    expect(legal).toHaveLength(5); legal.forEach(id => ids.add(id));
    expect(validateGrowthLoadoutV3(b, 5)).toEqual(b);
    expect(() => validateGrowthLoadoutV3({ ...b, perks: ['pk_landing', 'pk_sidefeed', 'pk_dressing'] }, 5)).toThrow('perk');
    expect(() => validateGrowthLoadoutV3({ ...b, perks: ['as_ambush', 'tk_steel', 'sn_perfect'] }, 5)).toThrow('perk');
  }
  expect(ids.size).toBe(6);
});

it('migrates saved generic perks once, preserving equipment, progression and the archived original', () => {
  const old = freshGrowthCareerV3(); old.loadouts[0].perks = ['pk_landing', 'pk_sidefeed', 'pk_dressing']; old.xp = 333;
  const next = migrateGrowthCareerV3(old);
  expect(next.xp).toBe(333); expect(next.loadouts[0].perks).toEqual(defaultGrowthLoadoutV3().perks);
  expect(next.legacyLoadoutArchive[0].original).toEqual(old.loadouts[0]);
  expect(migrateGrowthCareerV3(next)).toEqual(next); expect(old.loadouts[0].perks[0]).toBe('pk_landing');
});

it('翻滚突袭 spends the first-shot bonus once and accelerates a real reload', () => {
  const r = new GrowthRangeSession(build('assault'), { distance: 180, health: 115, armor: 0 }), b = r.battle;
  b.useSkill(); for (let i = 0; i < 13; i++) r.step();
  const p = b.growthV3!.participant('player'), gun = b.growthV3!.weapons.get('player')!;
  expect(p.buffs.ambush).toBe(103);
  r.step({ fire: true }); expect(r.damage).toBe(14); expect(p.buffs.ambush).toBeUndefined();
  for (let i = 0; i < 4; i++) r.step(); b.reload(); r.step();
  expect(gun.current.reloadDuration).toBe(21);
});

it('满膛突进 fills from reserve only and opens a 90 tick fire-rate window', () => {
  const f = fixture(build('assault', 'as_reloadrush')); f.gun.current.ammo = 2; f.gun.current.reserve = 7;
  f.cast(); expect(f.gun.current.ammo).toBe(9); expect(f.gun.current.reserve).toBe(0);
  f.finish(); expect(f.p.buffs.fullrush).toBe(f.b.frame + 90);
});

it('嗜血前锋 grants actual kill healing and non-stacking armor; 杀戮复位 refunds once', () => {
  const f = fixture(build('assault')); f.b.damage(f.b.player, 60, f.enemies[0]); f.cast(); f.finish();
  const state = f.b.growthV3!.abilities.actorState('player'), before = state.queue[0];
  f.b.damage(f.enemies[0], 999, f.b.player);
  expect(f.b.player.life.health).toBe(65); expect(f.p.armor.remaining).toBe(20000); expect(before - state.queue[0]).toBe(144);
  const after = state.queue[0]; f.b.damage(f.enemies[1], 999, f.b.player);
  expect(f.b.player.life.health).toBe(90); expect(f.p.armor.remaining).toBe(20000); expect(state.queue[0]).toBe(after);
});

it('近战压制 adds twenty percent and slows only at close range', () => {
  const r = new GrowthRangeSession(build('assault', undefined, 'as_close'), { distance: 100, health: 115, armor: 0 });
  r.step({ fire: true }); expect(r.damage).toBe(12);
  const p = r.battle.growthV3!.participant('enemy-0'); expect(p.slowScale).toBe(.15); expect(p.slowUntil).toBe(25);
});

it('双枪狂热 requires an empty primary and preserves reserve conservation', () => {
  const f = fixture(build('assault', undefined, 'as_dual')); f.gun.current.ammo = 0;
  const total = f.gun.checkpoint().guns.secondary.ammo + f.gun.checkpoint().guns.secondary.reserve;
  f.b.swap(); f.step(); expect(f.gun.readyTick - f.b.frame).toBe(2); expect(f.p.buffs.dual).toBe(91);
  expect(f.gun.current.ammo + f.gun.current.reserve).toBe(total);
});

it('移动堡垒 adds to cards while the combined defense cap remains 65 percent', () => {
  const f = fixture(build('tank')); f.cast();
  expect(f.b.player.movement.speedScale).toBe(.9);
  f.b.damage(f.b.player, 20, f.enemies[0]); expect(f.b.player.life.health).toBe(106);
  expect(resolveIncomingDamage({ hp: 100, tick: 0, armor: newArmor(), personalReductions: [.55, .15] }).life).toBe(35000);
});

it('攻城盾牌 doubles budget and grants forty armor on deliberate shield release', () => {
  const f = fixture(build('tank', 'tk_shield')); f.cast();
  expect(f.b.growthV3!.abilities.actorState('player').active!.shieldBudget).toBe(240000);
  f.b.useSkill(); f.step(); expect(f.p.armor.remaining).toBe(40000); expect(f.p.armor.until).toBe(f.b.frame + 120);
});

it('钢铁躯壳 raises respawn health too and speeds the low-health reload', () => {
  const f = fixture(build('tank', undefined, 'tk_steel')); expect(f.b.player.life.maxHealth).toBe(150);
  f.b.damage(f.b.player, 80, f.enemies[0]); f.gun.current.ammo--; f.b.reload(); f.step();
  expect(f.gun.current.reloadDuration).toBe(46);
  f.b.damage(f.b.player, 999, f.enemies[0]); f.step(150); expect(f.b.player.life.health).toBe(150);
});

it('重火力平台 accelerates sustained fire, reduces recoil and expires after a pause', () => {
  const f = fixture(build('tank'));
  const aim = { x: 20, y: 100 };
  for (let i = 0; i < 35; i++) f.b.tickPlayers(new Map([['player', { ...idleInput(), fire: true, aim }]]));
  expect(f.b.journal.since(0).some(e => e.kind === 'perkTriggered' && e.cause === '重火力平台')).toBe(true);
  f.step(15); expect(f.p.perkState.platformStart).toBe(f.b.frame);
});

it('以战养盾 counts actual enemy damage and refuses self-damage credit', () => {
  const f = fixture(build('tank')); f.cast(); f.b.damage(f.b.player, 100, f.enemies[0]);
  f.finish(); expect(f.p.perkState.refunded).toBe(180);
  const g = fixture(build('tank')); g.cast(); g.b.damage(g.b.player, 50, g.b.player, true); g.finish();
  expect(g.p.perkState.refunded).toBe(0);
});

it('报复火力 banks prevented damage and limits the burst to five shots', () => {
  const f = fixture(build('tank', undefined, 'tk_revenge')); f.cast(); f.b.damage(f.b.player, 100, f.enemies[0]); f.finish();
  expect(f.p.perkState.revengeBonus).toBeCloseTo(.22); expect(f.p.perkState.revengeShots).toBe(5);
  for (let i = 0; i < 35; i++) f.b.tickPlayers(new Map([['player', { ...idleInput(), fire: true, aim: { x: 20, y: 100 } }]]));
  expect(f.p.perkState.revengeShots).toBe(0);
});

it('处决专注 boosts the first real rifle shot and consumes the charge', () => {
  const r = new GrowthRangeSession(build('sniper'), { distance: 180, health: 115, armor: 0 });
  r.battle.useSkill(); for (let i = 0; i < 4; i++) r.step(); r.step({ fire: true });
  expect(r.damage).toBeCloseTo(52 * 1.45); expect(r.battle.growthV3!.participant('player').buffs.execute).toBeUndefined();
});

it('游猎转移 has forty percent movement and expires the post-skill first shot', () => {
  const f = fixture(build('sniper', 'sn_relocate')); f.cast(); expect(f.b.player.movement.speedScale).toBeCloseTo(1.4);
  f.finish(); expect(f.p.buffs.hunt).toBe(f.b.frame + 90); f.step(90);
  expect(f.p.buffs.hunt).toBeLessThanOrEqual(f.b.frame);
});

it('猎杀标记 only boosts subsequent shots from its owner', () => {
  const b = build('sniper'); b.primary = 'm4';
  const r = new GrowthRangeSession(b, { distance: 180, health: 115, armor: 0 });
  r.step({ fire: true }); const first = r.damage; r.step(); for (let i = 0; i < 12; i++) r.step(); r.step({ fire: true });
  expect(r.damage - first).toBeCloseTo(first * 1.25);
});

it('穿甲重弹 bypasses sixty percent of damage past armor without consuming bypassed armor', () => {
  const armor = newArmor(); grantArmor(armor, 40, 90, 0, 'test');
  expect(resolveIncomingDamage({ hp: 20, tick: 1, armor, armorBypass: .6 })).toEqual({ life: 12000, armor: 8000, shield: 0, personal: 0 });
  expect(armor.remaining).toBe(32000);
});

it('完美猎杀 refunds a head kill and transfers one reserve round, then respects cooldown', () => {
  const f = fixture(build('sniper')); f.gun.current.ammo = 2; f.cast(); const state = f.b.growthV3!.abilities.actorState('player'), before = state.queue[0];
  f.b.growthV3!.directDamage(f.enemies[0], { kind: 'bullet', amount: 999, sourceId: 'player', headshot: true, origin: {x:400,y:466}, hitPoint:{x:1000,y:440} });
  expect(f.gun.current.ammo).toBe(3); expect(before - state.queue[0]).toBe(252);
  const after = state.queue[0]; f.b.growthV3!.directDamage(f.enemies[1], { kind: 'bullet', amount: 999, sourceId: 'player', headshot: true, origin: {x:400,y:466}, hitPoint:{x:1000,y:440} });
  expect(f.gun.current.ammo).toBe(3); expect(state.queue[0]).toBe(after);
});

it('猎手脱身 grants thirty armor and a temporary movement bonus; death clears buffs', () => {
  const f = fixture(build('sniper', undefined, 'sn_escape')); f.b.damage(f.enemies[0], 999, f.b.player); f.step();
  expect(f.p.armor.remaining).toBe(30000); expect(f.b.player.movement.speedScale).toBe(1.3);
  f.b.damage(f.b.player, 999, f.enemies[1]); expect(f.p.buffs).toEqual({}); expect(f.p.cooldowns.escape).toBe(180);
});

it('强效急救 heals fifty, turns overflow into armor, and does not reward self-inflicted wounds', () => {
  const f = fixture(build('medic')); f.b.damage(f.ally, 30, f.enemies[0]); f.cast();
  expect(f.ally.life.health).toBe(100); expect(f.b.growthV3!.participant(f.ally.id).armor.remaining).toBe(20000);
  const g = fixture(build('medic')); g.b.damage(g.ally, 30, g.ally, true); g.cast();
  expect(g.b.growthV3!.participant(g.ally.id).armor.remaining).toBe(0); expect(g.p.buffs.adrenaline).toBeUndefined();
});

it('战地输血 heals nine per pulse and applies link defense to both endpoints', () => {
  const f = fixture(build('medic', 'md_link')); f.b.damage(f.ally, 60, f.enemies[0]); f.cast(); f.step(15);
  expect(f.ally.life.health).toBe(49); f.b.damage(f.ally, 10, f.enemies[0]); expect(f.ally.life.health).toBe(41);
  f.b.damage(f.b.player, 10, f.enemies[0]); expect(f.b.player.life.health).toBe(87);
  expect(f.b.growthV3!.abilities.actorState('player').active).toBeNull();
});

it('肾上腺素 affects both players and fire-rate bonuses alter real weapon timers', () => {
  const f = fixture(build('medic')); f.b.damage(f.ally, 60, f.enemies[0]); f.cast();
  expect(f.p.buffs.adrenaline).toBe(f.b.frame + 120); expect(f.b.growthV3!.participant(f.ally.id).buffs.adrenaline).toBe(f.b.frame + 120);
  const gun = new GrowthArsenalV3(defaultGrowthLoadoutV3());
  gun.step(0, true, { moving: false, airborne: false, crouching: false, stationaryTicks: 0 }, () => .5, [], false, .25);
  expect(gun.readyTick).toBe(4);
});

it('武装医护 awards eight buffed rounds and 救援回路 refunds only effective healing', () => {
  const f = fixture(build('medic', undefined, 'md_armed')); f.b.damage(f.ally, 60, f.enemies[0]); f.cast();
  expect(f.p.armor.remaining).toBe(25000); expect(f.p.perkState.armedShots).toBe(8); expect(f.p.perkState.refunded).toBe(84);
  const g = fixture(build('medic', undefined, 'md_armed')); g.ally.life.health = 40; g.cast();
  expect(g.p.perkState.armedShots).toBeUndefined(); expect(g.p.perkState.refunded).toBe(0);
});

it('共同进攻 shares one cooldown per medic and never recurses through self-healing', () => {
  const f = fixture(build('medic', undefined, 'md_together')); f.b.damage(f.ally, 60, f.enemies[0]); f.b.damage(f.b.player, 60, f.enemies[0]); f.cast();
  const before = f.b.player.life.health; f.b.damage(f.enemies[0], 999, f.ally);
  expect(f.b.player.life.health).toBe(Math.min(95, before + 20)); expect(f.p.cooldowns.together).toBe(f.b.frame + 120);
  const after = f.p.cooldowns.together; f.b.damage(f.enemies[1], 999, f.ally); expect(f.p.cooldowns.together).toBe(after);
});

it.each(GROWTH_CLASS_IDS)('%s class perk state survives a deterministic checkpoint and never resets cooldown on restore', cls => {
  const f = fixture(build(cls)); if (cls === 'medic') f.b.damage(f.ally, 60, f.enemies[0]); f.cast();
  const restored = Battle.restore(f.b.checkpoint());
  for (let i = 0; i < 100; i++) { f.step(); restored.tickPlayers(new Map()); }
  expect(restored.checkpoint()).toEqual(f.b.checkpoint());
});

it('ability cards add to class perks rather than erasing their investment', () => {
  expect(resolveAbility('md_pulse', ['md_A1', 'md_A2'], ['md_emergency']).heal).toBe(40);
  expect(resolveAbility('tk_shield', ['tk_B1'], ['tk_siege']).shieldBudget).toBe(270);
  expect(resolveAbility('sn_relocate', ['sn_B3'], ['sn_hunt']).speed).toBeCloseTo(1.35);
});

it('skill switching preserves user choices even when UI click order reordered the draft slots', () => {
  const draft = build('assault'); draft.perks = ['as_dual', 'as_close', 'as_ambush'];
  expect(changeGrowthAbility(draft, 'as_reloadrush').perks).toEqual(['as_fullrush', 'as_close', 'as_dual']);
});

it('shotgun first-shot bonuses multiply the whole emission once and consume one charge', () => {
  const strong = build('assault'), base = archivedBuild(); strong.primary = base.primary = 'shotgun';
  const a = new GrowthRangeSession(strong, { distance: 60, health: 115, armor: 0 });
  const b = new GrowthRangeSession(base, { distance: 60, health: 115, armor: 0 });
  for (const r of [a, b]) { r.battle.useSkill(); for (let i = 0; i < 13; i++) r.step(); r.step({ fire: true }); }
  expect(a.damage).toBeCloseTo(b.damage * 1.4, 3);
  expect(a.battle.effects.filter(e => e.actorId === 'player')).toHaveLength(7);
  expect(a.battle.growthV3!.participant('player').buffs.ambush).toBeUndefined();
});

it('穿甲重弹 doubles real deployed beacon damage and boosts real armor penetration', () => {
  const loadout = build('sniper', undefined, 'sn_pierce'); loadout.primary = 'm4';
  const r = new GrowthRangeSession(loadout, { distance: 100, health: 115, armor: 25 }); r.step({ fire: true });
  expect(r.damage).toBe(6); expect(r.battle.growthV3!.participant('enemy-0').armor.remaining).toBe(21000);
  const f = fixture(loadout, 0, build('sniper'));
  f.enemies[0].movement.reset(600, 499.5); f.enemies[1].movement.reset(1500, 499.5);
  f.b.useItem({ x: 640, y: 499.5 }, f.enemies[0]); f.step(13);
  const beacon = f.b.growthV3!.gadgets.entities()[0]; expect(beacon).toBeDefined();
  f.enemies[0].movement.reset(1000, 499.5);
  f.b.tickPlayers(new Map([['player', { ...idleInput(), fire: true, aim: { ...beacon.position } }]]));
  expect(beacon.health).toBe(15000);
});

it('救援回路 caps one multi-target cast at 60 percent despite two hundred effective healing', () => {
  const f = fixture(build('medic'), 4);
  for (const a of f.b.actors.filter(a => a.team === 1 && a.id !== 'player')) f.b.damage(a, 60, f.enemies[0]);
  f.cast(); expect(f.p.perkState.cycleRefund).toBe(3); expect(f.p.perkState.refunded).toBe(252);
  expect(f.p.metrics.healingDone).toBe(200);
});

it('card refunds cannot increase an already shortened cooldown or cross the 80 percent floor', () => {
  const f = fixture(build('sniper')); f.p.progression.selected.push('sn_A1', 'sn_A2');
  f.b.growthV3!.abilities.updateBuild('player', f.p.progression.selected, 0); f.cast();
  f.b.applyDamage(f.enemies[0], { kind: 'bullet', amount: 999, sourceId: 'player', headshot: true, origin: {x:400,y:466}, hitPoint:{x:1000,y:440} });
  const state = f.b.growthV3!.abilities.actorState('player'), before = state.queue[0];
  expect(before).toBeGreaterThanOrEqual(f.p.perkState.castStart + 72);
  f.step(30); f.b.applyDamage(f.enemies[1], { kind: 'bullet', amount: 1, sourceId: 'player', headshot: true, origin: {x:400,y:466}, hitPoint:{x:1000,y:440} });
  expect(state.queue[0]).toBe(before);
});

it('account startup writes the generic-perk migration and exactly one rollback backup', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'strike-class-perks-')), file = join(dir, 'accounts.json');
  try {
    const store = new OnlineAccounts(file), account = await store.login('register', 'Perk migration', 'test-password-123', 'fixture');
    const db = JSON.parse(readFileSync(file, 'utf8')); db.accounts[0].profile.growth.loadouts[0].perks = archivedBuild().perks;
    writeFileSync(file, JSON.stringify(db));
    const migrated = new OnlineAccounts(file).profile(account.profile.id).growth!;
    expect(migrated.loadouts[0].perks).toEqual(defaultGrowthLoadoutV3().perks);
    expect(JSON.parse(readFileSync(file, 'utf8')).accounts[0].profile.growth).toEqual(migrated);
    expect(readdirSync(dir).filter(name => name.endsWith('.backup'))).toHaveLength(1);
    expect(new OnlineAccounts(file).profile(account.profile.id).growth).toEqual(migrated);
    expect(readdirSync(dir).filter(name => name.endsWith('.backup'))).toHaveLength(1);
  } finally {
    if (!dir.startsWith(join(tmpdir(), 'strike-class-perks-'))) throw Error('Unexpected cleanup path');
    rmSync(dir, { recursive: true });
  }
});
