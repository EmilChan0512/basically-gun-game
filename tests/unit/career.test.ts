import { describe, expect, it } from 'vitest';
import { Accounts, ACCOUNTS_KEY } from '../../src/game/campaign/Accounts';
import { CareerProgress } from '../../src/game/campaign/CareerProgress';
import { SAVE_KEY, type SaveStorage } from '../../src/game/campaign/Progress';
import { CLASSES, SKILLS, WEAPONS, defaultLoadout, type ClassId, type SkillId } from '../../src/game/campaign/Catalog';
import { Battle, idleInput, seededRandom } from '../../src/game/campaign/Battle';
import { MISSIONS } from '../../src/game/campaign/Missions';
import { Arsenal } from '../../src/game/campaign/Arsenal';
import { pilot } from '../helpers/campaign-pilot';

function memory(): SaveStorage { const map = new Map<string, string>(); return { getItem: key => map.get(key) ?? null, setItem: (key, value) => { map.set(key, value); } }; }
const createBattle = (classId: ClassId = 'medic', skill?: SkillId) => {
  const kit = defaultLoadout(classId); if (skill) kit.skill = skill;
  return new Battle(MISSIONS[0], 'easy', 'm4', seededRandom(7), kit);
};

describe('local accounts', () => {
  it('registers, verifies passwords, isolates careers, persists sessions and logs out', async () => {
    const storage = memory(), session = memory(), accounts = new Accounts(storage, session);
    await accounts.register('Alpha', 'alpha-secret');
    const a = new CareerProgress(accounts.profileStorage()); a.current.xp = 2240; a.current.loadout.level = 15; a.data.career.credits = 3000; a.buyWeapon('vector');
    expect(accounts.active?.name).toBe('Alpha'); expect(new Accounts(storage, session).active?.name).toBe('Alpha');
    const oldAdapter = accounts.profileStorage(); accounts.logout();
    expect(new Accounts(storage, session).active).toBeNull();
    expect(() => oldAdapter.setItem(SAVE_KEY, '{}')).toThrow('切换');
    await expect(accounts.login('Alpha', 'incorrect')).rejects.toThrow('不正确');
    await expect(accounts.register(' ALPHA ', 'another-secret')).rejects.toThrow('已存在');
    await accounts.register('Beta', 'beta-secret');
    expect(new CareerProgress(accounts.profileStorage()).data.career.weapons).not.toContain('vector');
    await accounts.login('alpha', 'alpha-secret');
    expect(new CareerProgress(accounts.profileStorage()).data.career.weapons).toContain('vector');
    const saved = storage.getItem(ACCOUNTS_KEY)!;
    expect(saved).not.toContain('alpha-secret'); expect(saved).not.toContain('beta-secret');
    expect(JSON.parse(saved).accounts[0].salt).not.toBe(JSON.parse(saved).accounts[1].salt);
  });
  it('migrates the old anonymous campaign once without deleting it or copying it to another account', async () => {
    const storage = memory(); storage.setItem(SAVE_KEY, JSON.stringify({ version: 1, completed: ['signal', 'foundry'], best: { signal: 3 }, difficulty: 'easy', weapon: 'usp' }));
    const accounts = new Accounts(storage); await accounts.register('First', 'secret-123');
    expect(new CareerProgress(accounts.profileStorage()).unlocked).toBe(2);
    expect(storage.getItem(SAVE_KEY)).toContain('foundry');
    await accounts.register('Second', 'secret-456'); expect(new CareerProgress(accounts.profileStorage()).unlocked).toBe(0);
  });
  it('rejects invalid names and storage failures without creating a logged-in account', async () => {
    const accounts = new Accounts(memory());
    await expect(accounts.register('<script>', 'secret-123')).rejects.toThrow('账号名');
    await expect(accounts.register('Test', '123')).rejects.toThrow('密码');
    const blocked = new Accounts({ getItem: () => null, setItem: () => { throw Error('quota'); } });
    await expect(blocked.register('Test', 'secret-123')).rejects.toThrow('保存失败'); expect(blocked.active).toBeNull();
  });
});

describe('career economy and loadouts', () => {
  it('rewards an actual terminal battle once, unlocks training, equipment and skills, and persists them', () => {
    const store = memory(), p = new CareerProgress(store), b = createBattle();
    while (b.phase === 'running') b.tick(pilot(b));
    expect(b.phase).toBe('won');
    const reward = p.settle(b)!;
    expect(reward.firstClear).toBe(true); expect(reward.level).toBeGreaterThan(1);
    expect(p.unlocked).toBe(1); expect(p.settle(b)).toBeNull();
    const loaded = new CareerProgress(store); expect(loaded.settle(b)).toBeNull();
    expect(loaded.equipSkill('regenerate')).toBe(true); expect(loaded.train('vitality')).toBe(true);
    expect(loaded.buyWeapon('needler')).toBe(true); expect(loaded.equipWeapon('needler')).toBe(true);
    const again = new CareerProgress(store);
    expect(again.loadout).toMatchObject({ primary: 'needler', skill: 'regenerate', training: { vitality: 1 } });
    expect(again.current.xp).toBe(p.current.xp);
  });
  it('separates class levels, gates purchases, prevents overspending and duplicate unlock charges', () => {
    const p = new CareerProgress(memory());
    expect(p.buyWeapon('saw')).toBe(false); expect(p.equipSkill('regenerate')).toBe(false); expect(p.train('vitality')).toBe(false);
    p.current.xp = 320; p.current.loadout.level = 3;
    expect(p.buyWeapon('uzi')).toBe(true); expect(p.data.career.credits).toBe(275);
    expect(p.buyWeapon('uzi')).toBe(false); expect(p.data.career.credits).toBe(275);
    expect(p.buyItem('ammo')).toBe(true); expect(p.data.career.credits).toBe(155);
    p.selectClass('tank'); expect(p.current.xp).toBe(0); expect(p.equipWeapon('uzi')).toBe(false);
    expect(p.loadout.classId).toBe('tank'); p.selectClass('medic'); expect(p.loadout.primary).toBe('m4');
    const battle = createBattle('tank'); battle.phase = 'lost'; battle.player.kills = 2;
    const result = p.settle(battle)!; expect(result.xp).toBe(55); expect(result.firstClear).toBe(false);
    expect(p.data.career.classes.tank.xp).toBe(55); expect(p.data.career.classes.medic.xp).toBe(320);
    expect(p.unlocked).toBe(0);
  });
  it('validates old and malformed saves instead of accepting impossible equipment or training', () => {
    const store = memory(); const p = new CareerProgress(store); p.save();
    const raw = JSON.parse(store.getItem(SAVE_KEY)!); raw.career.credits = -100; raw.career.classes.medic.loadout = { primary: 'dragunov', secondary: 'shotgun', skill: 'cloak', item: 'frag', training: { vitality: 999, handling: 999 } };
    store.setItem(SAVE_KEY, JSON.stringify(raw)); const loaded = new CareerProgress(store);
    expect(loaded.data.career.credits).toBe(0); expect(loaded.loadout).toMatchObject({ primary: 'm4', secondary: 'usp', skill: 'heal', item: 'medkit', training: { vitality: 0, handling: 0 } });
  });
});

describe('class skills and tactical items in the actual battle', () => {
  it('applies class health/ammo/aim and keeps training and equipment across respawn', () => {
    const kit = defaultLoadout('tank'); kit.primary = 'saw'; kit.training.vitality = 2;
    const b = new Battle(MISSIONS[0], 'easy', 'saw', seededRandom(5), kit);
    expect(b.player.life.maxHealth).toBe(146); expect(b.player.arsenal.gun.ammo).toBe(50);
    b.damage(b.player, 999); for (let i = 0; i < 151; i++) b.tick(idleInput());
    expect(b.player.life.health).toBe(146); expect(b.player.arsenal.selected).toBe('saw'); expect(b.player.kit?.training.vitality).toBe(2);
    expect(createBattle('commando').player.arsenal.gun.reserveAmmo).toBeGreaterThan(createBattle().player.arsenal.gun.reserveAmmo);
  });
  it('heals only injured allies and rejects cooldown/dead/finished activation', () => {
    const b = createBattle(); expect(b.useSkill()).toBe(false); expect(b.player.skillCooldown).toBe(0);
    b.damage(b.player, 50); expect(b.useSkill()).toBe(true); expect(b.player.life.health).toBe(75);
    expect(b.player.skillCooldown).toBe(SKILLS.heal.cooldown); expect(b.useSkill()).toBe(false);
    b.damage(b.player, 999); expect(b.useSkill()).toBe(false); b.phase = 'lost'; expect(b.useItem()).toBe(false);
  });
  it('regeneration heals over time; supply refills reserves but not magazine rounds', () => {
    const b = createBattle('medic', 'regenerate'); b.damage(b.player, 60); b.useSkill();
    const hp = b.player.life.health; for (let i = 0; i < 30; i++) b.tick(idleInput()); expect(b.player.life.health).toBeCloseTo(hp + 10);
    const supply = createBattle('commando'); supply.player.arsenal.gun.reserveAmmo = 0; supply.player.arsenal.gun.ammo = 10;
    expect(supply.useSkill()).toBe(true); expect(supply.player.arsenal.gun.ammo).toBe(10); expect(supply.player.arsenal.gun.reserveAmmo).toBe(210);
  });
  it('timed regeneration lasts exactly its configured number of logic updates', () => {
    const b = createBattle('medic', 'regenerate'); b.player.life.health = 1; b.player.life.regenDelay = 1000;
    for (const enemy of b.actors.slice(1)) { enemy.life.alive = false; enemy.life.respawnFrames = 1000; }
    b.useSkill(); for (let i = 0; i < 180; i++) b.tick(idleInput());
    expect(b.player.life.health).toBeCloseTo(61); expect(b.player.skillFrames).toBe(0);
    b.tick(idleInput()); expect(b.player.life.health).toBeCloseTo(61);
  });
  it('barrier and iron mitigate damage, tank resists explosives, and cloak breaks on real damage', () => {
    for (const [skill, damage] of [['barrier', 20], ['iron', 8]] as const) {
      const b = createBattle('tank', skill); b.player.life.spawnProtectionFrames = 0; b.useSkill(); b.damage(b.player, 40, b.actors[1]);
      expect(b.player.life.health).toBe(130 - damage);
      if (skill === 'iron') { b.damage(b.player, 40, b.actors[1]); expect(b.player.life.health).toBe(82); }
    }
    const tank = createBattle('tank'); tank.player.life.spawnProtectionFrames = 0; tank.damage(tank.player, 40, tank.actors[1], true); expect(tank.player.life.health).toBe(102);
    const cloak = createBattle('assassin', 'cloak'); cloak.player.life.spawnProtectionFrames = 0; cloak.useSkill(); expect(cloak.player.skillFrames).toBe(120);
    cloak.damage(cloak.player, 10, cloak.actors[1]); expect(cloak.player.skillFrames).toBe(0);
  });
  it('focus reduces actual spread and overdrive increases actual bullet damage', () => {
    const sample = (skill: SkillId, activate: boolean) => {
      const b = createBattle(skill === 'focus' ? 'assassin' : 'commando', skill);
      b.player.movement.reset(300, 599.5); b.actors[1].movement.reset(580, 599.5); b.actors[1].life.spawnProtectionFrames = 0;
      b.player.aim = { x: 580, y: 564 };
      if (activate) b.useSkill();
      b.tick({ ...idleInput(), fire: true, aim: b.player.aim }); return b;
    };
    const normal = sample('overdrive', false), boost = sample('overdrive', true);
    expect(boost.effects[0].damage).toBeGreaterThan(normal.effects[0].damage);
    const unfocused = sample('focus', false).effects[0].trace, focused = sample('focus', true).effects[0].trace;
    const slope = (t: typeof focused) => (t.end.y - t.origin.y) / (t.end.x - t.origin.x);
    const ideal = (564 - 557.5) / 280;
    expect(Math.abs(slope(focused) - ideal)).toBeLessThan(Math.abs(slope(unfocused) - ideal));
  });
  it('medical items do not consume at full health, have finite mission charges, and do not refill on death', () => {
    const b = createBattle(); expect(b.useItem()).toBe(false); expect(b.player.itemCharges).toBe(2);
    b.damage(b.player, 50); expect(b.useItem()).toBe(true); expect(b.player.itemCharges).toBe(1);
    b.damage(b.player, 999); for (let i = 0; i < 151; i++) b.tick(idleInput()); expect(b.player.itemCharges).toBe(1);
  });
  it('cloak prevents AI lock-on until firing reveals the player, and ammo packs restore reserves', () => {
    const b = createBattle('assassin', 'cloak');
    b.player.movement.reset(300, 599.5); b.actors[1].movement.reset(500, 599.5);
    b.useSkill(); b.tick(idleInput()); expect(b.actors[1].brain.target).toBeNull();
    b.tick({ ...idleInput(), fire: true }); expect(b.player.skillFrames).toBe(0); expect(b.actors[1].brain.target).toBe('player');
    const kit = defaultLoadout(); kit.item = 'ammo'; const ammo = new Battle(MISSIONS[0], 'easy', 'm4', seededRandom(1), kit);
    expect(ammo.useItem()).toBe(false); ammo.player.arsenal.gun.reserveAmmo = 0;
    expect(ammo.useItem()).toBe(true); expect(ammo.player.arsenal.gun.reserveAmmo).toBe(78); expect(ammo.player.itemCharges).toBe(1);
  });
  it('explosions do not damage enemies behind solid cover', () => {
    const kit = defaultLoadout(); kit.item = 'frag';
    const b = new Battle(MISSIONS[1], 'easy', 'm4', seededRandom(1), kit);
    b.player.movement.reset(650, 599.5); const enemy = b.actors.find(a => a.team === 2)!; enemy.movement.reset(760, 599.5);
    // Central wall spans x730..1070, y500..600, separating the blast from this fixture.
    b.useItem({ x: 760, y: 550 }); const g = b.grenades[0]; g.x = 700; g.y = 555; g.vx = g.vy = 0; g.fuse = 1;
    enemy.life.spawnProtectionFrames = 0;
    // An isolated no-motion iteration checks the real explosion path without movement resolving the embedded fixture.
    enemy.movement.tick = () => {};
    b.tick(idleInput()); expect(enemy.life.health).toBe(85);
  });
  it('grenades have a fuse, fly and explode with team/terrain filtering and kill attribution', () => {
    const kit = defaultLoadout(); kit.item = 'frag';
    const b = new Battle(MISSIONS[0], 'easy', 'm4', seededRandom(2), kit);
    b.player.movement.reset(300, 599.5); b.actors[1].movement.reset(500, 599.5); b.actors[1].life.spawnProtectionFrames = 0;
    expect(b.useItem({ x: 500, y: 550 })).toBe(true); expect(b.grenades[0].fuse).toBe(45);
    const start = b.grenades[0].x; b.tick(idleInput()); expect(b.grenades[0].x).toBeGreaterThan(start);
    // Freeze the throw at its detonation position to isolate explosion behavior from travel.
    const g = b.grenades[0]; g.x = 500; g.y = 550; g.vx = g.vy = 0; g.fuse = 1;
    b.actors[1].life.health = 20;
    b.tick(idleInput()); expect(b.grenades).toHaveLength(0); expect(b.player.kills).toBe(1); expect(b.scores[0]).toBe(1); expect(b.player.life.health).toBe(85);
  });
});

describe('distinct weapon mechanics and playable professions', () => {
  for (const id of Object.keys(WEAPONS) as (keyof typeof WEAPONS)[]) it(`${id} spends ammunition and deals damage in the integrated battle`, () => {
    const role = WEAPONS[id].classId; const kit = defaultLoadout(role === 'shared' ? 'medic' : role); kit[WEAPONS[id].slot] = id;
    const b = new Battle(MISSIONS[0], 'easy', 'm4', () => 0.5, kit);
    if (WEAPONS[id].slot === 'secondary') b.swap();
    b.player.movement.reset(300, 599.5); b.actors[1].movement.reset(500, 599.5); b.actors[1].life.spawnProtectionFrames = 0;
    b.player.aim = { x: 500, y: 566.5 }; const ammo = b.player.arsenal.gun.ammo;
    b.tick({ ...idleInput(), fire: true, aim: b.player.aim });
    expect(b.player.arsenal.gun.ammo).toBe(ammo - 1);
    if (WEAPONS[id].projectile) for (let frame = 0; frame < 10 && b.actors[1].life.health === 85; frame++) b.tick(idleInput());
    expect(b.actors[1].life.health).toBeLessThan(85);
  });
  it('fires five shotgun pellets for one shell and respects semiautomatic release', () => {
    const a = new Arsenal('shotgun'); const pose = { crouching: false, airborne: false, moving: false, aimStat: 1 };
    a.setTrigger(true);
    const traces = a.tick('p', 1, { x: 100, y: 100 }, { x: 400, y: 100 }, pose, [], () => false, () => 0.5);
    expect(traces).toHaveLength(5); expect(a.gun.ammo).toBe(3); expect(new Set(traces.map(t => t.end.y)).size).toBe(5);
    for (let i = 0; i < 40; i++) a.tick('p', 1, { x: 100, y: 100 }, { x: 400, y: 100 }, pose, [], () => false, () => 0.5);
    expect(a.gun.ammo).toBe(3); expect(a.shots).toBe(1);
    expect(WEAPONS.dragunov.config.rangeUnits).toBeGreaterThan(WEAPONS.m4.config.rangeUnits);
    expect(WEAPONS.saw.config.magazineSize).toBe(50); expect(WEAPONS.vector.config.shootDelayFrames).toBeLessThan(WEAPONS.m4.config.shootDelayFrames);
  });
  for (const classId of Object.keys(CLASSES) as ClassId[]) it(`${classId} can complete the first mission through ordinary controls`, () => {
    const b = createBattle(classId);
    while (b.phase === 'running') {
      if (b.player.life.health < b.player.life.maxHealth * 0.7 || classId !== 'medic') b.useSkill();
      b.tick(pilot(b));
    }
    expect(b.phase, JSON.stringify(b.snapshot())).toBe('won');
  });
});
