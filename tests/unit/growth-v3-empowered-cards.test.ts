import { expect, it } from 'vitest';
import { Battle, idleInput, seededRandom } from '../../src/game/campaign/Battle';
import { OriginalLife } from '../../src/game/combat/OriginalLife';
import { GrowthRangeSession } from '../../src/client/session/GrowthRangeSession';
import { defaultGrowthLoadoutV3, changeGrowthAbility } from '../../src/shared/content/growth-v3/Loadout';
import { GROWTH_V3_CARDS, GROWTH_V3_EVOLUTIONS, legalGrowthCards, type GrowthCardId, type GrowthEvolutionId } from '../../src/shared/content/growth-v3/Cards';
import { GROWTH_V3_OPERATORS, type GrowthAbilityId } from '../../src/shared/content/growth-v3/Operators';
import { GROWTH_V3_GADGETS, resolveGadget, type GrowthGadgetId } from '../../src/shared/content/growth-v3/Gadgets';
import type { GrowthClassId } from '../../src/shared/content/growth-v3/Core';
import { awardGrowthV3 } from '../../src/shared/simulation/growth-v3/Progression';
import { GROWTH_V3_WEAPONS } from '../../src/shared/content/growth-v3/Weapons';

function fixture(cls: GrowthClassId, ability: GrowthAbilityId, card?: GrowthCardId, gadget?: GrowthGadgetId) {
  const build = changeGrowthAbility(defaultGrowthLoadoutV3(cls), ability);
  if (card) build.pool = [card, ...legalGrowthCards(cls, ability).filter(id => id !== card)].slice(0, 8);
  if (gadget) build.gadgetId = gadget;
  const mission = new GrowthRangeSession(build, { distance: 1800, health: 100, armor: 0 }).battle.mission;
  const b = new Battle({ ...mission, allies: 1 }, 'normal', 'm4', seededRandom(43191));
  b.enableGrowthV3(Object.fromEntries(b.actors.map(a => [a.id, a.id === 'player' ? build : defaultGrowthLoadoutV3()])), 5);
  b.actors.forEach(a => { a.human = true; a.life.spawnProtectionFrames = 0; a.movement.reset(a.id === 'player' ? 400 : a.team === 1 ? 350 : 1200, 499.5); });
  const ally = b.actors.find(a => a.team === 1 && a.id !== 'player')!, enemy = b.actors.find(a => a.team === 2)!;
  enemy.life = new OriginalLife(10000); enemy.life.spawnProtectionFrames = 0;
  const p = b.growthV3!.participant('player'), gun = b.growthV3!.weapons.get('player')!;
  const step = (count = 1, fire = false, crouch = false) => { for (let i = 0; i < count; i++) b.tickPlayers(new Map([['player', { ...idleInput(), fire, crouch, aim: { x: ally.movement.x, y: ally.movement.y - 33 } }]])); };
  const state = () => b.growthV3!.abilities.actorState('player');
  if (card) {
    awardGrowthV3(p.progression, p.loadout, 200, 0, () => 0);
    expect(p.progression.offer!.cards).toContain(card);
    expect(b.growthChoice('player', p.progression.offer!.batch, card)).toBe(true);
  }
  const cast = () => {
    if (cls === 'medic') b.damage(ally, 90, enemy);
    b.useSkill(); step(); while (state().pending) step();
    expect(state().active).not.toBeNull();
  };
  const finish = () => { while (state().active) step(); };
  const fire = () => b.tickPlayers(new Map([['player', { ...idleInput(), fire: true, aim: { x: enemy.movement.x, y: enemy.movement.y - 33 } }]]));
  return { b, p, gun, ally, enemy, step, state, cast, finish, fire };
}

const abilityRows: [GrowthCardId, GrowthAbilityId, Record<string, number | boolean>][] = [
  ['as_A1','as_roll',{transfer:1000000}], ['as_A2','as_roll',{cooldown:144,speed:1.8}],
  ['as_B1','as_reloadrush',{transfer:1000000}], ['as_B2','as_reloadrush',{duration:30,speed:1.6,cooldown:330}],
  ['tk_A1','tk_barrier',{speed:1.15,cooldown:360}], ['tk_A2','tk_barrier',{refundPerHit:60,refundGap:15,refundCap:180}],
  ['tk_B1','tk_shield',{shieldBudget:420,speed:.85}], ['tk_B2','tk_shield',{cast:0,recovery:0,duration:120}],
  ['sn_A1','sn_focus',{cooldown:216,duration:120}], ['sn_A2','sn_focus',{refundPerHit:60,refundGap:15,refundCap:180}],
  ['sn_A3','sn_focus',{transfer:1000000}], ['sn_B1','sn_relocate',{duration:90,cooldown:288}],
  ['sn_B2','sn_relocate',{transfer:1000000}], ['sn_B3','sn_relocate',{noiseScale:.1,speed:1.6}],
  ['md_C4','md_pulse',{selfHeal:75}], ['md_C4','md_link',{selfHeal:7}],
  ['md_A1','md_pulse',{radius:300,heal:65}], ['md_A2','md_pulse',{cooldown:252,heal:50}],
  ['md_A3','md_pulse',{speed:1.2,cooldown:420}], ['md_B1','md_link',{radius:420,heal:12,selfHeal:5}],
  ['md_B2','md_link',{pauseOnDamage:true,pauseTicks:0,duration:120}], ['md_B3','md_link',{duration:90,pulseInterval:6}],
];
it.each(abilityRows)('%s strengthens the real committed %s without erasing class perks', (id, ability, expected) => {
  const f = fixture(GROWTH_V3_CARDS[id].classId, ability, id); f.gun.current.ammo = 1;
  const total = f.gun.current.ammo + f.gun.current.reserve;
  f.cast();
  for (const [key,value] of Object.entries(expected)) {
    const actual = f.state().active!.definition[key as keyof import('../../src/shared/simulation/growth-v3/AbilityRules').ResolvedAbility];
    if (typeof value === 'number') expect(actual).toBeCloseTo(value, 8); else expect(actual).toBe(value);
  }
  expect(f.gun.current.ammo + f.gun.current.reserve).toBe(total);
});

it.each(Object.keys(GROWTH_V3_EVOLUTIONS) as GrowthEvolutionId[])('%s is earned through four legal choices and survives deterministic restore', id => {
  const evo = GROWTH_V3_EVOLUTIONS[id], ability = GROWTH_V3_OPERATORS[evo.classId].abilities[evo.group === 'A' ? 0 : 1];
  const f = fixture(evo.classId, ability);
  awardGrowthV3(f.p.progression, f.p.loadout, 1200, 0, () => 0);
  for (let i = 0; i < 3; i++) {
    const card = f.p.progression.offer!.cards.find(card => card.startsWith(id.slice(0, 3) + evo.group))!;
    expect(f.b.growthChoice('player', f.p.progression.offer!.batch, card)).toBe(true);
  }
  expect(f.p.progression.offer!.cards).toContain(id); expect(f.b.growthChoice('player', f.p.progression.offer!.batch, id)).toBe(true);
  f.gun.current.ammo = 1; f.cast(); const d = f.state().active!.definition;
  const expected = {
    as_EV_A:{maxCharges:2,cooldown:180,chargeGap:15}, as_EV_B:{cooldown:198,duration:30},
    tk_EV_A:{duration:180,reduction:.65,speed:1.2}, tk_EV_B:{shieldBudget:420,cast:0,recovery:0},
    sn_EV_A:{duration:180,stationarySpread:.15,cooldown:216}, sn_EV_B:{fireLock:0,duration:90},
    md_EV_A:{heal:65,cooldown:252}, md_EV_B:{fireLock:0,reloadLock:false,swapLock:false,duration:120},
  }[id]; expect(d).toMatchObject(expected);
  if (id === 'sn_EV_A') {
    const baseline = Battle.restore(f.b.checkpoint());
    baseline.growthV3!.abilities.actorState('player').active!.definition.stationarySpread = .3;
    f.fire(); baseline.tickPlayers(new Map([['player',{...idleInput(),fire:true,aim:{x:f.enemy.movement.x,y:f.enemy.movement.y-33}}]]));
    const angle = (b: Battle) => {
      const trace = b.effects.find(e=>e.actorId==='player'&&e.frame===b.frame)!.trace;
      return Math.atan2(trace.end.y-trace.origin.y,trace.end.x-trace.origin.x)
        - Math.atan2(f.enemy.movement.y-33-trace.origin.y,f.enemy.movement.x-trace.origin.x);
    };
    expect(Math.abs(angle(baseline))).toBeGreaterThan(0);
    expect(angle(f.b)/angle(baseline)).toBeCloseTo(.5,6);
  }
  if (id === 'sn_EV_B' || id === 'md_EV_B') { const ammo = f.gun.current.ammo; f.fire(); expect(f.gun.current.ammo).toBe(ammo - 1); }
  if (id === 'tk_EV_A') { f.b.damage(f.b.player, 10, f.enemy); expect(f.b.player.life.health).toBeCloseTo(111.5); }
  const restored = Battle.restore(f.b.checkpoint());
  for (let i = 0; i < 200; i++) { f.b.tickPlayers(new Map()); restored.tickPlayers(new Map()); }
  expect(restored.checkpoint()).toEqual(f.b.checkpoint());
  if (id === 'as_EV_B') expect(f.p.buffs.rushEvolution).toBeGreaterThan(0);
  if (id === 'tk_EV_B') expect(f.p.buffs.counterEvolution).toBeGreaterThan(0);
  if (id === 'md_EV_A') expect(f.b.growthV3!.participant(f.ally.id).buffs.rescuePower).toBeGreaterThan(0);
});

it.each(Object.keys(GROWTH_V3_GADGETS) as GrowthGadgetId[])('%s G2 strengthens actual created definitions and preserves resource caps', gadget => {
  const cls = GROWTH_V3_GADGETS[gadget].classId, prefix = {assault:'as',tank:'tk',sniper:'sn',medic:'md'}[cls];
  const f = fixture(cls, GROWTH_V3_OPERATORS[cls].abilities[0], `${prefix}_G2` as GrowthCardId, gadget);
  const def = resolveGadget(gadget, true, true), old = resolveGadget(gadget, false);
  expect(def.damageMax + def.radius + def.health + def.armor + def.noiseRadius).toBeGreaterThan(old.damageMax + old.radius + old.health + old.armor + old.noiseRadius);
  expect(f.b.useItem({x:440,y:499.5})).toBe(true); f.step();
  expect(f.b.growthV3!.gadgets.inventory('player').cast!.definition).toEqual(def);
  f.step(31);
  expect(f.b.growthV3!.gadgets.inventory('player').charges).toBeLessThanOrEqual(2);
  const restored = Battle.restore(f.b.checkpoint()); expect(restored.growthV3!.gadgets.checkpoint()).toEqual(f.b.growthV3!.gadgets.checkpoint());
});

it.each(['assault','tank','sniper','medic'] as const)('%s G1 grants one charge and halves future cooldowns without duplicate grants', cls => {
  const prefix = {assault:'as',tank:'tk',sniper:'sn',medic:'md'}[cls], f = fixture(cls, GROWTH_V3_OPERATORS[cls].abilities[0], `${prefix}_G1` as GrowthCardId);
  const inventory = f.b.growthV3!.gadgets.inventory('player'), base = GROWTH_V3_GADGETS[inventory.gadgetId];
  expect(inventory.charges).toBe(Math.min(3,base.charges+1));
  expect(f.b.growthV3!.gadgets.extraCharge('player')).toBe(false);
  expect(f.b.useItem({x:440,y:499.5})).toBe(true); f.step(13);
  expect(inventory.rechargeTick! - 1 - base.cast).toBe(base.cooldown / 2);
});

it.each([['assault','as_C1','as_roll',26],['tank','tk_C2','tk_barrier',47],['sniper','sn_C4','sn_focus',36]] as const)('%s weapon card accelerates a real empty reload', (cls, card, ability, ticks) => {
  const f = fixture(cls, ability, card); f.gun.current.ammo = 0; f.b.reload(); f.step();
  expect(f.gun.current.reloadDuration).toBe(ticks);
});

it('as_C2, sn_C1 and sn_C2 add substantial real bullet damage in their stated windows', () => {
  for (const [cls,card,ability,damage] of [['assault','as_C2','as_roll',12],['sniper','sn_C1','sn_focus',62.4],['sniper','sn_C2','sn_focus',70.2]] as const) {
    const f = fixture(cls,ability,card); f.enemy.movement.reset(650,499.5); f.step(15); const before = f.enemy.life.health; f.fire();
    expect(before - f.enemy.life.health).toBeCloseTo(damage,3);
  }
});

it('roll follow-up and rush damage cards stack with perks in real shots', () => {
  for (const [card,ability,damage] of [['as_A3','as_roll',17],['as_B1','as_reloadrush',12.5]] as const) {
    const f = fixture('assault',ability,card); f.enemy.movement.reset(650,499.5); f.cast(); f.finish(); const hp = f.enemy.life.health; f.fire();
    expect(hp-f.enemy.life.health).toBeCloseTo(damage,3);
  }
});

it('tk_C1 and tk_C3 provide 30 percent personal and 50 percent explosive defense', () => {
  for (const [card,explosion,hp] of [['tk_C1',false,101],['tk_C3',true,105]] as const) {
    const f = fixture('tank','tk_barrier',card); f.step(1,false,true); f.b.damage(f.b.player,20,f.enemy,explosion);
    expect(f.b.player.life.health).toBe(hp);
  }
});

it('md_C1 rescues a critical teammate for eighty and md_C2 boosts both players', () => {
  const f = fixture('medic','md_pulse','md_C1'); f.cast(); expect(f.ally.life.health).toBe(90);
  const g = fixture('medic','md_pulse','md_C2'); g.cast(); g.step();
  expect(g.b.player.movement.speedScale).toBeCloseTo(1.17); expect(g.ally.movement.speedScale).toBeCloseTo(1.43);
});

it('md_B2 keeps healing after incoming damage and md_B3 schedules fifteen real pulses', () => {
  const f = fixture('medic','md_link','md_B2'); f.cast(); f.b.damage(f.b.player,10,f.enemy); f.step(15);
  expect(f.state().active).not.toBeNull(); expect(f.ally.life.health).toBe(19);
  const g = fixture('medic','md_link','md_B3'); g.cast();
  for(let i=0;i<90;i++) { if(g.ally.life.health>50)g.b.damage(g.ally,40,g.enemy); g.step(); }
  expect(g.b.journal.since(0).filter(e=>e.kind==='heal'&&e.targetId===g.ally.id)).toHaveLength(15);
});

it('as_C3 loots a corpse once for a full magazine reserve and ten actual healing', () => {
  const f = fixture('assault','as_roll','as_C3'); f.enemy.movement.reset(600,499.5);
  f.gun.current.ammo=5; f.gun.current.reserve=10; f.b.damage(f.b.player,50,f.enemy);
  f.b.damage(f.enemy,99999,f.b.player); const hp=f.b.player.life.health;
  f.step(); expect(f.b.player.life.health).toBe(hp+10); expect(f.gun.current.reserve).toBe(40);
  f.step(); expect(f.gun.current.reserve).toBe(40); expect(f.p.scavenged).toHaveLength(1);
});

it('as_C4 fills the secondary from its finite reserve and starts the damage window', () => {
  const f=fixture('assault','as_roll','as_C4'); f.gun.current.ammo=0;
  f.b.swap(); f.step(); expect(f.p.buffs.sideCardPower).toBe(91); expect(f.p.cooldowns.sidecard).toBe(91);
  const total=f.gun.current.ammo+f.gun.current.reserve; f.step(10); f.enemy.movement.reset(500,499.5); const hp=f.enemy.life.health; f.fire();
  expect(hp-f.enemy.life.health).toBeCloseTo(GROWTH_V3_WEAPONS.usp.damage*1.3,3);
  expect(f.gun.current.ammo+f.gun.current.reserve).toBe(total-1);
});

it('tk_C4 rewards a kill with twenty healing and a full reserve magazine but never repeats a dead target', () => {
  const f=fixture('tank','tk_barrier','tk_C4'); f.gun.current.reserve=0; f.b.damage(f.b.player,65,f.enemy);
  f.b.damage(f.enemy,99999,f.b.player); expect(f.b.player.life.health).toBe(70); expect(f.gun.current.reserve).toBe(50);
  f.b.damage(f.enemy,99999,f.b.player); expect(f.gun.current.reserve).toBe(50); expect(f.p.cooldowns.reclaim).toBe(60);
});

it('sn_C3 strengthens moving secondary fire', () => {
  const f=fixture('sniper','sn_focus','sn_C3'); f.b.swap(); f.step(12); f.enemy.movement.reset(500,499.5);
  const hp=f.enemy.life.health;
  f.b.tickPlayers(new Map([['player',{...idleInput(),right:true,fire:true,aim:{x:500,y:466.5}}]]));
  expect(hp-f.enemy.life.health).toBeCloseTo(GROWTH_V3_WEAPONS.usp.damage*1.3,3);
});

it('md_C3 grants a real damage buff and faster reload after enemy-injury treatment', () => {
  const f=fixture('medic','md_pulse','md_C3'); f.cast(); f.enemy.movement.reset(650,499.5); const hp=f.enemy.life.health;
  f.fire(); expect(hp-f.enemy.life.health).toBeCloseTo(GROWTH_V3_WEAPONS.famas.damage*1.2,3);
  f.step(30); f.b.reload(); f.step(); expect(f.gun.current.reloadDuration).toBe(Math.ceil(GROWTH_V3_WEAPONS.famas.reload*.6));
});

it('as_B3, tk_A3 and tk_B3 grant their larger timed armor rewards through actual ability completion', () => {
  const a=fixture('assault','as_reloadrush','as_B3'); a.cast(); a.finish(); expect(a.p.armor.remaining).toBe(30000); expect(a.p.buffs.rushReload).toBe(a.b.frame+120);
  const t=fixture('tank','tk_barrier','tk_A3'); t.cast(); t.b.damage(t.b.player,20,t.enemy); t.finish();
  expect(t.p.armor.remaining).toBe(40000); expect(t.p.armor.until).toBe(t.b.frame+180);
  const s=fixture('tank','tk_shield','tk_B3'); s.cast(); s.finish();
  expect(s.b.growthV3!.participant(s.ally.id).armor).toMatchObject({remaining:40000,until:s.b.frame+180});
});

it('md_A3 gives actual healing recipients armor and cannot generate it from environment-only injuries', () => {
  const f=fixture('medic','md_pulse','md_A3'); f.cast(); expect(f.b.growthV3!.participant(f.ally.id).armor.remaining).toBe(25000);
  const g=fixture('medic','md_pulse','md_A3'); g.b.damage(g.ally,50); g.b.useSkill(); g.step(4);
  expect(g.b.growthV3!.participant(g.ally.id).armor.remaining).toBe(0);
});

it('G1 halves an in-flight recharge deadline only once and G2 never rewrites an already committed deployment', () => {
  const f=fixture('tank','tk_barrier',undefined,'tk_cover'); f.b.useItem({x:440,y:499.5}); f.step(13);
  const inventory=f.b.growthV3!.gadgets.inventory('player'),before=inventory.rechargeTick!;
  expect(f.b.growthV3!.gadgets.extraCharge('player',f.b.frame)).toBe(true);
  expect(inventory.rechargeTick).toBe(f.b.frame+Math.ceil((before-f.b.frame)*.5));
  const entity=f.b.growthV3!.gadgets.entities()[0],snapshot=structuredClone(entity.definition);
  f.b.growthV3!.gadgets.upgrade('player'); expect(entity.definition).toEqual(snapshot);
});
