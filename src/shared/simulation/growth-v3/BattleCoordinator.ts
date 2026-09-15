import { inBeaconVision } from '../BeaconVision';
import { VISION_RADIUS } from '../Vision';
import type { Actor, Battle, BattleInput, ShotEffect } from '../../../game/campaign/Battle';
import { Arsenal } from '../../../game/campaign/Arsenal';
import { OriginalLife } from '../../../game/combat/OriginalLife';
import type { Point, UnitHitbox } from '../../../game/combat/Ballistics';
import type { PlayerAction } from '../../protocol/Commands';
import type { DamageContext } from '../DamageContext';
import { validateDamageContext } from '../DamageContext';
import { GROWTH_V3_RULES, healthUnits, type ContentStage } from '../../content/growth-v3/Core';
import { validateGrowthLoadoutV3, type GrowthLoadoutV3 } from '../../content/growth-v3/Loadout';
import { GROWTH_V3_OPERATORS } from '../../content/growth-v3/Operators';
import { GROWTH_V3_WEAPONS, type GrowthWeaponId } from '../../content/growth-v3/Weapons';
import { resolveGrowthWeapon } from '../../content/growth-v3/Attachments';
import type { GrowthUpgradeId } from '../../content/growth-v3/Cards';
import type { GrowthPerkId } from '../../content/growth-v3/Perks';
import { GrowthArsenalV3, pelletDamageHp, type GrowthWeaponCheckpoint } from './WeaponRules';
import { AbilitySimulation, type AbilityCheckpoint, type AbilityPort, type ActiveAbility } from './AbilitySimulation';
import { abilityHealing } from './AbilityRules';
import { GadgetSimulation, type GadgetCheckpoint, type GadgetEvent, type GadgetWorldPort } from './GadgetSimulation';
import { newArmor, expireArmor, grantArmor, resolveIncomingDamage, type ArmorState } from './DamageRules';
import { newProgression, awardGrowthV3, chooseGrowthV3, rerollGrowthV3, newContributions, healingCredit,
  supportCredit, objectiveCredit, type GrowthProgressionState, type ContributionState } from './Progression';
import { newContinuousHealTarget, chooseContinuousHeal, commitContinuousHeal, type ContinuousHealTarget } from './HealingRules';
import { traceGrowthBullet } from './Ballistics';
import { nextWaypoint, trackedWaypoint } from '../../../game/campaign/Navigation';
import { traversalJump } from '../Traversal';
import { freshGrowthMetrics, freshWeaponMetrics, type GrowthMetrics, type GrowthWeaponMetrics } from '../../content/GrowthRecords';
import { growthSoundRecipients, GROWTH_SOUND_RADII, type GrowthSoundCue } from './Sound';
import { newGrowthRecoil, decayGrowthRecoil, addShotRecoil, addHitRecoil, type GrowthRecoil } from './Recoil';
import { GROWTH_V3_PRESETS } from '../../content/growth-v3/Presets';
import { GROWTH_V3_GADGETS, type GrowthGadgetId } from '../../content/growth-v3/Gadgets';
import type { GrowthCombatEventKind } from '../Events';

export interface GrowthParticipant {
  recoil: GrowthRecoil;
  id: string; loadout: GrowthLoadoutV3; progression: GrowthProgressionState; armor: ArmorState;
  contributions: ContributionState; continuousHeal: ContinuousHealTarget;
  cooldowns: Record<string, number>; buffs: Record<string, number>; attackers: Record<string, number>;
  lastDamage: number; stationary: number; braceTicks: number; stillShots: number; focusedReady: boolean; focusWait: number;
  deathTick: number; jumpHeld: boolean; slowUntil: number; slowScale: number; slowResistUntil: number;
  objectiveTicks: number; scavenged: string[]; healedCasts: string[]; shots: number;
  retired: boolean; metrics: GrowthMetrics; weaponMetrics: Partial<Record<GrowthWeaponId, GrowthWeaponMetrics>>;
  healingRemainder: number; killStreak: number; headStreak: number; lastHitShot: number; lastHeadShot: number;
}
interface PendingCommand { actorId: string; action: PlayerAction; aim?: Point }
interface PendingDamage {
  targetId: string; sourceId?: string; hp: number; origin?: Point; explosion?: boolean;
  weaponId?: GrowthWeaponId; headshot?: boolean; structure?: boolean; effects?: ShotEffect[];
  protectedHp?: number;
  shotSerial?: number; hitDistance?: number;
  gadgetId?: GrowthGadgetId;
}
interface PendingHeal { sourceId: string; targetId: string; amount: number; castId: string; cast: ActiveAbility }
export interface GrowthBattleCheckpoint {
  version: 3; stage: ContentStage; participants: GrowthParticipant[];
  weapons: { id: string; state: GrowthWeaponCheckpoint }[];
  abilities: AbilityCheckpoint; gadgets: GadgetCheckpoint; pending: PendingCommand[];
  gadgetEvents: GadgetEvent[];
  corpses: { id: string; team: 1 | 2; position: Point; expires: number }[];
  radar: GrowthRadarMark[];
  radarSerial: number;
  coverSupport: Record<string, { nearby: Record<string, number>; blocked: number }>;
}
export interface GrowthRadarMark { id: string; sourceId?: string; sourceTeam: 1 | 2; team: 1 | 2; position: Point; expiresTick: number; kind: 'shot' | 'intel' | 'decoy' }
export interface GrowthBattlePorts {
  random(): number;
  spawn(actor: Actor): void;
  death(target: Actor, source?: Actor): void;
  hitboxes(frame?: number): UnitHitbox[];
}
const byId = (a: { id: string }, b: { id: string }) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
const chest = (a: Actor): Point => ({ x: a.movement.x, y: a.movement.y - (a.movement.crouching ? 22 : 33) });
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const pose = (a: Actor) => ({ moving: Math.abs(a.movement.vx) > .1, crouching: a.movement.crouching,
  airborne: a.movement.jumping, stationaryTicks: 0 });

/** Actual Battle authority. Classic Arsenal/Life objects are presentation mirrors and are never ticked here. */
export class GrowthBattleCoordinator {
  readonly participants = new Map<string, GrowthParticipant>();
  readonly weapons = new Map<string, GrowthArsenalV3>();
  abilities: AbilitySimulation;
  gadgets: GadgetSimulation;
  private pending: PendingCommand[] = [];
  private damageQueue: PendingDamage[] = [];
  private healQueue: PendingHeal[] = [];
  private finished: { id: string; cast: ActiveAbility; reason: string; tick: number }[] = [];
  private deaths: { target: Actor; source?: Actor; context: PendingDamage }[] = [];
  private processing = false;
  private gadgetEvents: GadgetEvent[] = [];
  private corpses: GrowthBattleCheckpoint['corpses'] = [];
  private radar: GrowthRadarMark[] = [];
  private radarSerial = 0;
  private coverSupport: GrowthBattleCheckpoint['coverSupport'] = {};
  constructor(private readonly battle: Battle, readonly stage: ContentStage, private readonly ports: GrowthBattlePorts) {
    this.abilities = new AbilitySimulation(this.abilityPort());
    this.gadgets = new GadgetSimulation(this.gadgetPort());
  }
  private get tick() { return this.battle.frame; }
  private actors() { return [...this.battle.actors].sort(byId); }
  private actor(id: string) { const actor = this.battle.actors.find(a => a.id === id); if (!actor) throw Error('Unknown growth actor'); return actor; }
  participant(id: string) { const p = this.participants.get(id); if (!p) throw Error('Unknown growth participant'); return p; }
  private gun(id: string) { return this.weapons.get(id)!; }
  private has(id: string, card: GrowthUpgradeId) { return this.participant(id).progression.selected.includes(card); }
  private perk(id: string, perk: GrowthPerkId) { return this.participant(id).loadout.perks.includes(perk); }
  private buff(id: string, key: string) { return (this.participant(id).buffs[key] ?? 0) > this.tick; }
  private ready(id: string, key: string) { return (this.participant(id).cooldowns[key] ?? 0) <= this.tick; }
  private worldActors() {
    return this.actors().map(a => ({ id: a.id, team: a.team, position: chest(a), feet: { x: a.movement.x, y: a.movement.y },
      alive: a.life.alive, protected: a.life.spawnProtectionFrames > 0, hp: healthUnits(a.life.health), maxHp: healthUnits(a.life.maxHealth),
      armor: this.participant(a.id).armor, currentBaseTotalAmmo: GROWTH_V3_WEAPONS[this.gun(a.id).selectedId].totalAmmo }));
  }
  private sound(cue: GrowthSoundCue, point: Point, radius: number = GROWTH_SOUND_RADII.tactical, onlyId?: string, weapon?: import('../../../game/combat/Combat').WeaponId) {
    const listeners = this.actors().filter(a => !this.participant(a.id).retired && (!onlyId || a.id === onlyId))
      .map(a => ({ id: a.id, ...chest(a), alive: a.life.alive }));
    const soundRecipients = growthSoundRecipients(cue, point, radius, listeners);
    if (weapon) for (const sample of soundRecipients) sample.weapon = weapon;
    if (soundRecipients.length) this.battle.journal.emit({ tick: this.tick, kind: 'tactical-sound', soundRecipients });
  }
  private abilityPort(): AbilityPort {
    return { actors: () => this.worldActors(), canUse: id => !this.gadgets.inventory(id).cast && this.battle.phase === 'running',
      visible: (a, b, smoke) => this.gadgets.clearRay(a, b, smoke), interruptWeapon: id => this.gun(id).interrupt(),
      recoverUntil: (id, tick) => this.gun(id).blockUntil(tick), transfer: (id, count) => this.gun(id).transfer(count),
      heal: (sourceId, targetId, amount, castId) => {
        const cast = structuredClone(this.abilities.actorState(sourceId).active!);
        this.healQueue.push({ sourceId, targetId, amount, castId, cast }); return 0;
      },
      started: (id, cast) => {
        this.battle.journal.emit({ tick: this.tick, kind: 'skill', actorId: id, ability: cast.definition.id });
        this.battle.journal.emit({ tick: this.tick, kind: 'abilityStart', actorId: id, ability: cast.definition.id, duration: cast.endTick-this.tick, position:chest(this.actor(id)) });
      },
      finished: (id, cast, reason, tick) => {
        this.finished.push({ id, cast: structuredClone(cast), reason, tick });
        this.battle.journal.emit({ tick, kind: 'abilityEnd', actorId:id, ability:cast.definition.id, cause:reason, position:chest(this.actor(id)) });
      },
      error: (id, reason) => this.error(id, reason) };
  }
  private gadgetPort(): GadgetWorldPort {
    return { width: this.battle.mission.width, height: this.battle.mission.height ?? 700,
      spawns: this.battle.mission.spawns.flat(), objectives: this.battle.mission.mode === 'dom' ? [this.battle.mission.objective] : [],
      actors: () => this.worldActors(), wall: this.battle.wall,
      groundSupport:(x,y)=>this.battle.wall(x,y)||!!this.battle.mission.stairTreads?.some(t=>x>=t.x&&x<t.x+t.width&&y>=t.y&&y<t.y+t.height),
      canUse: id => !this.abilities.locks(id, this.tick).gadget && this.battle.phase === 'running',
      interruptWeapon: id => this.gun(id).interrupt(), recoverUntil: (id, tick) => this.gun(id).blockUntil(tick),
      damage: (targetId, hp, sourceId, origin, gadgetId) => this.damageQueue.push({ targetId, hp, sourceId, origin: { ...origin }, explosion: true, gadgetId }),
      queueStructureDamage: (targetId, hp, _team, sourceId, _gadget, origin) => this.damageQueue.push({ targetId, hp, sourceId, origin: { ...origin }, explosion: true, structure: true }),
      slow: (id, scale, duration) => this.slow(id, scale, duration), supply: (id, count) => this.supply(id, count),
      support: (id, xp, eventId, expires) => this.award(id, supportCredit(this.participant(id).contributions, xp, eventId, this.tick, expires)),
      event: event => {
        this.gadgetEvents.push(structuredClone(event));
        if (this.gadgetEvents.length > 512) this.gadgetEvents.shift();
        const kinds:Partial<Record<GadgetEvent['kind'],GrowthCombatEventKind>>={released:'gadgetReleased',created:'deployableCreated',
          damaged:'deployableDamaged',destroyed:'deployableDestroyed',intercept:'intercept',smoke:'smokeStarted','smoke-ended':'smokeEnded',intel:'intelPing'};
        const kind=kinds[event.kind];
        if(kind)this.battle.journal.emit({tick:event.tick,kind,actorId:event.sourceId,targetId:event.targetId,
          entityId:event.entityId,ability:event.gadgetId,position:event.position?{...event.position}:undefined,
          amount:event.amount,duration:event.expiresTick===undefined?undefined:event.expiresTick-event.tick,expiresTick:event.expiresTick,cause:event.reason,team:event.team});
        if(event.kind==='armor')this.armorEvent(event.sourceId,'granted',event.sourceId);
        if (event.kind === 'explosion') this.battle.bursts.push({ ...event.position!, frame: this.tick, radius: event.radius!, color: 0xf5b267 });
        if (event.kind === 'error') this.error(event.sourceId, event.reason ?? 'invalid_gadget');
        if (event.kind === 'error' && event.reason === 'no_charge') this.sound('gadget-empty', chest(this.actor(event.sourceId)), 1, event.sourceId);
        if (event.kind === 'released') this.sound('throw-warning', event.position!);
        if (event.kind === 'created') this.sound('deploy', event.position!);
        if (event.kind === 'intercept') this.sound('intercept', event.position!);
        if (event.kind === 'emp-burst') {
          this.sound('emp', event.position!);
          this.battle.bursts.push({ ...event.position!, frame: this.tick, radius: event.radius!, color: 0x95a5ff });
        }
        if (event.kind === 'smoke') this.sound('smoke', event.position!);
        if (event.kind === 'explosion') this.sound('explosion', event.position!, GROWTH_SOUND_RADII.explosion);
        if (event.kind === 'armor') this.sound('armor', chest(this.actor(event.sourceId)));
        if (['released', 'created', 'armor'].includes(event.kind)) this.battle.journal.emit({ tick: this.tick, kind: 'item', actorId: event.sourceId, ability: event.gadgetId });
        if (event.kind === 'intel') this.markRadar({ sourceId: event.targetId,
          sourceTeam: this.actor(event.targetId!).team, team: event.team!, position: { ...event.position! }, expiresTick: event.expiresTick!, kind: 'intel' });
        if (event.kind === 'decoy') {
          this.sound('decoy', event.position!, event.radius!);
          const sourceTeam = this.actor(event.sourceId).team, team = sourceTeam === 1 ? 2 : 1;
          if (this.actors().some(a => a.team === team && a.life.alive && distance(chest(a), event.position!) <= event.radius!))
            this.markRadar({ sourceTeam, team, position: { ...event.position! }, expiresTick: event.expiresTick!, kind: 'decoy' });
        }
      } };
  }
  /** Validate the entire roster before changing any actors. No partially classic growth rooms. */
  install(loadouts: Readonly<Record<string, GrowthLoadoutV3>>) {
    if (this.tick !== 0 || this.battle.phase !== 'running' || !['tdm', 'dom', 'ctf'].includes(this.battle.mission.mode)
      || this.battle.actors.length > 8 || Object.keys(loadouts).length !== this.battle.actors.length) throw Error('Invalid growth battle setup');
    const validated = this.actors().map(a => ({ actor: a, loadout: validateGrowthLoadoutV3(loadouts[a.id], this.stage) }));
    for (const { actor: a, loadout } of validated) {
      const p: GrowthParticipant = { recoil: newGrowthRecoil(), id: a.id, loadout, progression: newProgression(), armor: newArmor(), contributions: newContributions(),
        continuousHeal: newContinuousHealTarget(), cooldowns: {}, buffs: {}, attackers: {}, lastDamage: 0, stationary: 0, braceTicks: 0,
        stillShots: 0, focusedReady: false, focusWait: 0, deathTick: -1, jumpHeld: false, slowUntil: 0, slowScale: 0,
        slowResistUntil: 0, objectiveTicks: 0, scavenged: [], healedCasts: [], shots: 0,
        retired: false, metrics: freshGrowthMetrics(), weaponMetrics: {}, healingRemainder: 0, killStreak: 0, headStreak: 0, lastHitShot: -1, lastHeadShot: -1 };
      this.participants.set(a.id, p); this.weapons.set(a.id, new GrowthArsenalV3(loadout));
      a.growth = undefined; a.kit = null; a.equipment = undefined; a.offhand = undefined; a.shield = undefined;
      a.life = new OriginalLife(GROWTH_V3_OPERATORS[loadout.classId].health); a.stealthFrames = 0;
      this.mirrorArsenal(a);
      this.abilities.register(a.id, loadout); this.gadgets.register(a.id, loadout.classId, loadout.gadgetId);
    }
    this.abilities.step(0); this.gadgets.step(0); this.abilities.finishHealingPhase(0);
    for (const a of this.actors()) { this.gun(a.id).step(0, false, pose(a), this.ports.random); this.sync(a); }
  }
  private mirrorArsenal(a: Actor) {
    const loadout = this.participant(a.id).loadout;
    a.arsenal = new Arsenal(GROWTH_V3_WEAPONS[loadout.primary].artId, GROWTH_V3_WEAPONS[loadout.primary].artId, GROWTH_V3_WEAPONS[loadout.secondary].artId);
  }
  private sync(a: Actor) {
    const gun = this.gun(a.id), ability = this.abilities.actorState(a.id), gadget = this.gadgets.inventory(a.id);
    a.arsenal.selected = GROWTH_V3_WEAPONS[gun.selectedId].artId;
    a.arsenal.gun.ammo = gun.current.ammo; a.arsenal.gun.reserveAmmo = gun.current.reserve;
    a.arsenal.gun.reloadFrames = Math.max(0, gun.current.reloadUntil - this.tick); a.arsenal.shots = this.participant(a.id).shots;
    a.skillCooldown = ability.charges ? 0 : Math.max(0, (ability.queue[0] ?? this.tick) - this.tick);
    a.skillFrames = ability.active ? Math.max(0, ability.active.endTick - this.tick) : 0;
    a.itemCharges = gadget.charges; a.itemCooldown = Math.max(0, (gadget.charges?gadget.readyTick:gadget.rechargeTick??gadget.readyTick) - this.tick);
  }
  enqueue(actorId: string, action: PlayerAction, aim?: Point) {
    if (this.battle.phase !== 'running' || !this.participants.has(actorId) || !this.actor(actorId).life.alive) return false;
    if (aim && (!Number.isFinite(aim.x) || !Number.isFinite(aim.y))) return false;
    if (!this.pending.some(c => c.actorId === actorId && c.action === action)) this.pending.push({ actorId, action, ...(aim ? { aim: { ...aim } } : {}) });
    return true;
  }
  private error(actorId: string, reason: string) { this.battle.journal.emit({ tick: this.tick, kind: 'error', actorId, cause: reason }); }
  private markRadar(mark: Omit<GrowthRadarMark, 'id'>) { this.radar.push({ ...mark, id: `r3-${++this.radarSerial}` }); }
  private slow(id: string, scale: number, duration: number) {
    const p = this.participant(id);
    if (!this.actor(id).life.alive) return;
    const resisted = scale * (this.tick < p.slowResistUntil ? .5 : 1);
    p.slowScale = Math.max(p.slowUntil > this.tick ? p.slowScale : 0, Math.min(.25, resisted));
    p.slowUntil = Math.max(p.slowUntil, this.tick + Math.ceil(duration * (this.perk(id, 'pk_resilience') ? .8 : 1)));
  }
  private supply(id: string, count?: number) {
    const amount = count === undefined ? this.gun(id).resupply() : this.gun(id).supply(count);
    if (amount && this.perk(id, 'pk_supplyrun') && this.ready(id, 'supplyrun')) {
      this.participant(id).buffs.supplyrun = this.tick + 60; this.participant(id).cooldowns.supplyrun = this.tick + 360;
    }
    return amount;
  }
  private award(id: string, xp: number) {
    if (!xp) return;
    const p = this.participant(id), current = [...this.participants.values()].filter(p => !p.retired);
    const average = current.reduce((s, p) => s + p.progression.level, 0) / Math.max(1, current.length);
    awardGrowthV3(p.progression, p.loadout, Math.round(xp * (average - p.progression.level >= 2 ? 1.1 : 1)), this.tick, this.ports.random);
  }
  choice(id: string, batch: number, upgrade: unknown, reroll = false) {
    if (this.battle.phase !== 'running' || !this.participants.has(id)) return false;
    const p = this.participant(id);
    if (reroll) return rerollGrowthV3(p.progression, p.loadout, batch, this.tick, this.ports.random);
    if (!chooseGrowthV3(p.progression, p.loadout, batch, upgrade, this.tick, this.ports.random)) return false;
    if (String(upgrade).endsWith('_G1')) this.gadgets.extraCharge(id);
    if (String(upgrade).endsWith('_G2')) this.gadgets.upgrade(id);
    this.abilities.updateBuild(id, p.progression.selected, this.tick); this.sync(this.actor(id)); return true;
  }
  carryObjective(id: string) {
    const gun = this.gun(id);
    this.gadgets.cancelCast(id);
    if (gun.selectedSlot !== 'secondary') gun.swap(this.tick);
    this.sync(this.actor(id));
  }
  private swap(a: Actor) {
    if (a.deliveryPreviousWeapon !== undefined) return this.error(a.id, 'carrying_objective');
    const id = a.id, p = this.participant(id), gun = this.gun(id), toSide = gun.selectedSlot === 'primary';
    if (this.abilities.locks(id, this.tick).swap || this.gadgets.inventory(id).cast?.definition.kind === 'self') return this.error(id, 'busy');
    this.gadgets.cancelCast(id);
    const benefits = [this.perk(id, 'pk_quickswap') ? .9 : 1, toSide && p.loadout.classId === 'assault' ? .85 : 1,
      !toSide && this.buff(id, 'shieldCounter') ? .5 : 1];
    const cardFeed = toSide && this.has(id, 'as_C4') && gun.current.ammo === 0 && this.ready(id, 'sidecard');
    const perkFeed = toSide && this.perk(id, 'pk_sidefeed') && this.ready(id, 'sidefeed');
    gun.swap(this.tick, benefits);
    p.metrics.switches++;
    if (!toSide) delete p.buffs.shieldCounter;
    if (cardFeed || perkFeed) {
      gun.transfer(2);
      if (this.has(id, 'as_C4')) p.cooldowns.sidecard = this.tick + 240;
      if (this.perk(id, 'pk_sidefeed')) p.cooldowns.sidefeed = this.tick + 240;
    }
    this.battle.journal.emit({ tick: this.tick, kind: 'swap', actorId: id, weapon: GROWTH_V3_WEAPONS[gun.selectedId].artId });
  }
  private reload(a: Actor) {
    const id = a.id, gun = this.gun(id), p = this.participant(id), nonempty = gun.current.ammo > 0;
    if (this.abilities.locks(id, this.tick).reload || this.gadgets.inventory(id).cast) return this.error(id, 'busy');
    const def = resolveGrowthWeapon(gun.selectedId, p.loadout.attachments[gun.selectedSlot]);
    const benefits = [!nonempty && this.perk(id, 'pk_emptyreload') ? .92 : 1,
      nonempty && this.has(id, 'as_C1') ? .8 : 1, nonempty && a.movement.crouching && this.has(id, 'tk_C2') ? .8 : 1,
      nonempty && gun.current.ammo < def.magazine / 2 && this.has(id, 'sn_C4') ? .75 : 1,
      this.has(id, 'sn_B2') && this.abilities.actorState(id).active?.definition.id === 'sn_relocate' ? .8 : 1,
      this.buff(id, 'rushReload') ? .85 : 1, this.buff(id, 'medReload') ? .8 : 1];
    if (gun.reload(this.tick, benefits, this.perk(id, 'pk_reloadguard') ? [1.1] : [])) {
      if (nonempty) p.metrics.tacticalReloads++; else p.metrics.emptyReloads++;
      delete p.buffs.rushReload; delete p.buffs.medReload;
      this.battle.journal.emit({ tick: this.tick, kind: 'reload', actorId: id, weapon: GROWTH_V3_WEAPONS[gun.selectedId].artId,
        duration: gun.current.reloadDuration, emptyMagazine: !nonempty });
    }
  }
  private lifeStart(a: Actor) {
    const p = this.participant(a.id);
    if (p.retired) return;
    decayGrowthRecoil(p.recoil);
    p.progression.ultimate ||= this.tick >= GROWTH_V3_PRESETS[this.battle.mission.growthPreset ?? 'standard'].ultimateTick;
    const priorArmor=p.armor.remaining;expireArmor(p.armor, this.tick);
    if(priorArmor>0&&p.armor.remaining===0)this.armorEvent(a.id,'expired');
    if (p.slowUntil && this.tick >= p.slowUntil) { p.slowScale = 0; p.slowResistUntil = p.slowUntil + 45; p.slowUntil = 0; }
    if (a.life.alive) { a.life.spawnProtectionFrames = Math.max(0, a.life.spawnProtectionFrames - 1); return; }
    a.life.respawnFrames = Math.max(0, p.deathTick + 150 - this.tick);
    if (a.life.respawnFrames > 0) return;
    this.ports.spawn(a); a.life.alive = true; a.life.health = a.life.maxHealth; a.life.spawnProtectionFrames = 75; a.life.regenDelay = 0;
    const fresh = new GrowthArsenalV3(p.loadout).checkpoint(); fresh.lastTick = this.tick - 1;
    this.weapons.set(a.id, GrowthArsenalV3.restore(fresh)); this.mirrorArsenal(a);
    p.contributions.healable = 0; p.lastDamage = this.tick; p.continuousHeal = newContinuousHealTarget();
  }
  private movement(a: Actor, control: BattleInput) {
    const id = a.id, p = this.participant(id), m = a.movement, gun = this.gun(id), locks = this.abilities.locks(id, this.tick);
    const skillSpeed = locks.moveScale, gCast = !!this.gadgets.inventory(id).cast;
    const ordinaryBoost = Math.max(this.buff(id, 'berserker') ? .2 : 0, this.buff(id, 'medRun') ? .15 : 0,
      this.buff(id, 'supplyrun') ? .1 : 0, gun.selectedSlot === 'secondary' && this.perk(id, 'pk_sidewalk') ? .03 : 0);
    const definition = resolveGrowthWeapon(gun.selectedId, p.loadout.attachments[gun.selectedSlot]);
    const airborne = m.jumping, previousX = m.x;
    if (control.jump && !p.jumpHeld) m.jump();
    p.jumpHeld = control.jump;
    m.speedScale = GROWTH_V3_OPERATORS[p.loadout.classId].speed * definition.speedScale * (gCast ? .75 : Math.min(1, skillSpeed))
      * (1 + Math.max(ordinaryBoost, gCast ? 0 : Math.max(0, skillSpeed - 1))) * (1 - p.slowScale)
      * (control.crouch && !m.jumping && this.perk(id, 'pk_crouch') ? 1.08 : 1);
    m.tick(control); m.x = Math.max(20, Math.min(this.battle.mission.width - 20, m.x));
    if (Math.abs(m.vx) > .5) p.metrics.movingTicks++;
    if (!m.jumping && !m.crouching && Math.abs(m.x - previousX) > .5 && this.tick % 10 === 0) {
      const active = this.abilities.actorState(id).active;
      this.sound('footstep', chest(a), GROWTH_SOUND_RADII.footstep * (active?.definition.noiseScale ?? 1));
    }
    if (airborne && !m.jumping) { p.buffs.landing = this.tick + 18; this.battle.journal.emit({ tick: this.tick, kind: 'land', actorId: id }); }
    if (!airborne && m.jumping && m.vy < 0) this.battle.journal.emit({ tick: this.tick, kind: 'jump', actorId: id });
    const still = !m.jumping && Math.abs(m.vx) < .1 && !control.left && !control.right;
    p.stationary = still ? p.stationary + 1 : 0;
    p.braceTicks = m.crouching && !m.jumping && Math.abs(m.vx) < .1 ? (p.braceTicks ?? 0) + 1 : 0;
    p.focusWait = still ? p.focusWait + 1 : 0;
    if (!still) { p.stillShots = 0; p.focusedReady = false; }
    if (p.stationary === 15) p.stillShots = 3;
    if (p.focusWait >= 30) p.focusedReady = true;
    if (m.y > (this.battle.mission.killY ?? (this.battle.mission.height ?? 700) + 140)) this.damageQueue.push({ targetId: id, hp: 9999 });
  }
  private shoot(a: Actor, control: BattleInput, shotFrame?: number) {
    const id = a.id, p = this.participant(id), gun = this.gun(id), current = gun.current, active = this.abilities.actorState(id).active;
    const still = !a.movement.jumping && Math.abs(a.movement.vx) < .1;
    const base = resolveGrowthWeapon(gun.selectedId, p.loadout.attachments[gun.selectedSlot]);
    const spread = [active ? still ? active.definition.stationarySpread : active.definition.spread : 1,
      p.loadout.classId === 'sniper' && p.focusedReady ? .85 : 1,
      this.has(id, 'as_C2') && p.stillShots > 0 && p.stationary >= 15 ? .8 : 1,
      this.has(id, 'sn_C1') && p.stationary >= 30 ? .75 : 1,
      this.has(id, 'sn_C2') && current.ammo === base.magazine ? .7 : 1,
      this.has(id, 'sn_C3') && !still && gun.selectedSlot === 'secondary' ? .75 : 1,
      active?.selected.includes('sn_EV_B') && active.definition.id === 'sn_relocate' && this.tick >= active.startTick + 15 && !still ? .7 : 1,
      this.perk(id, 'pk_landing') && this.buff(id, 'landing') ? .85 : 1,
      this.perk(id, 'pk_firstshot') && this.tick - current.lastShotTick >= 30 ? .9 : 1,
      this.buff(id, 'rollSpread') ? .75 : 1];
    const wasReload = current.reloadUntil;
    const shot = gun.step(this.tick, control.fire, { ...pose(a), stationaryTicks: p.stationary, braceTicks: p.braceTicks }, this.ports.random, spread,
      !a.life.alive || a.life.spawnProtectionFrames > 0 || this.abilities.locks(id, this.tick).fire || !!this.gadgets.inventory(id).cast
      || this.damageQueue.some(d => d.targetId === id && !d.sourceId));
    if (wasReload && !current.reloadUntil) {
      if (p.weaponMetrics[gun.selectedId]) p.weaponMetrics[gun.selectedId]!.magazineKills = 0;
      this.battle.journal.emit({ tick: this.tick, kind: 'reload-end', actorId: id });
    }
    if (!shot) return;
    addShotRecoil(p.recoil, shot.definition.visualKick);
    p.shots++; p.focusedReady = false; p.focusWait = 0; p.stillShots = Math.max(0, p.stillShots - 1);
    p.metrics.shots++; (p.weaponMetrics[shot.weaponId] ??= freshWeaponMetrics()).shots++;
    delete p.buffs.rollSpread; delete p.buffs.ghost;
    this.battle.journal.emit({ tick: this.tick, kind: 'shot', actorId: id, weapon: shot.definition.artId, authoritativeSound: true });
    this.sound('shot', chest(a), shot.definition.noiseRadius, undefined, shot.definition.artId);
    const origin = chest(a), angle = Math.atan2(a.aim.y - origin.y, a.aim.x - origin.x);
    const audience = a.team === 1 ? 2 : 1;
    if (this.actors().some(observer => observer.team === audience && observer.life.alive && distance(chest(observer), origin) <= shot.definition.noiseRadius))
      this.markRadar({ sourceId: id, sourceTeam: a.team, team: audience,
        position: { ...origin }, expiresTick: this.tick + shot.definition.radarTicks, kind: 'shot' });
    const units = this.ports.hitboxes(a.human ? shotFrame : undefined), entities = this.gadgets.entities();
    const groups = new Map<string, PendingDamage>();
    for (const offset of shot.offsetsDegrees) {
      const hit = traceGrowthBullet(id, a.team, origin, angle + offset * Math.PI / 180, shot.definition.maxRange, units, entities, this.battle.wall);
      const effect: ShotEffect = { frame: this.tick, actorId: id, team: a.team, trace: hit.trace, damage: 0, killed: false };
      this.battle.effects.push(effect);
      const targetId = hit.structureId ?? (hit.trace.hit?.type === 'unit' ? hit.trace.hit.target : undefined);
      if (!targetId) continue;
      const head = hit.trace.hit?.type === 'unit' && hit.trace.hit.region === 'head', key = `${hit.structureId ? 'g' : 'a'}:${targetId}`;
      const group: PendingDamage = groups.get(key) ?? { targetId, sourceId: id, hp: 0, origin, weaponId: shot.weaponId, headshot: false,
        structure: !!hit.structureId, effects: [], shotSerial: p.shots, hitDistance: hit.distance };
      const hp = pelletDamageHp(shot.definition, hit.distance, head);
      if (hit.structureId) {
        const entity = entities.find(e => e.id === hit.structureId)!, ledger = this.coverSupport[entity.id];
        if (entity.gadgetId === 'tk_cover' && entity.team !== a.team && ledger) {
          const continued = traceGrowthBullet(id, a.team, hit.trace.end, angle + offset * Math.PI / 180,
            shot.definition.maxRange - hit.distance, units, entities.filter(e => e.id !== entity.id), this.battle.wall).trace.hit;
          if (continued?.type === 'unit' && continued.target !== entity.sourceId && this.tick - (ledger.nearby[continued.target] ?? -1000) <= 90)
            group.protectedHp = (group.protectedHp ?? 0) + hp;
        }
      }
      group.hp += hp; group.headshot ||= head; group.effects!.push(effect); groups.set(key, group);
    }
    this.damageQueue.push(...groups.values());
  }
  /** External trusted test/debug damage uses the same defenses and death bookkeeping. */
  directDamage(target: Actor, context: DamageContext) {
    validateDamageContext(context);
    if (context.sourceId) this.actor(context.sourceId);
    const event: PendingDamage = { targetId: target.id, hp: context.amount, sourceId: context.sourceId, origin: context.origin,
      explosion: context.kind === 'explosion', headshot: context.headshot };
    if (this.processing) { this.damageQueue.push(event); return false; }
    const killed = this.resolveDamage(event); this.finishDeaths(); this.finishAbilities();
    for (const a of this.actors()) this.sync(a);
    return killed;
  }
  private resolveDamage(event: PendingDamage) {
    const source = event.sourceId ? this.actor(event.sourceId) : undefined;
    if (event.structure) {
      const entity = this.gadgets.entities().find(e => e.id === event.targetId);
      if (source && entity) {
        const amount = this.gadgets.damageEntity(event.targetId, event.hp, source.team, this.tick), ledger = this.coverSupport[event.targetId];
        if (amount > 0) this.sound('structure-hit', entity.position);
        if (amount > 0 && ledger && event.protectedHp && event.hp > 0) {
          ledger.blocked += Math.round(amount * event.protectedHp / event.hp);
          const xp = Math.floor(ledger.blocked / 30000) * 5; ledger.blocked %= 30000;
          if (xp) this.award(entity.sourceId, supportCredit(this.participant(entity.sourceId).contributions, xp,
            `cover:${entity.id}:${this.tick}:${source.id}:${this.gun(source.id).shotCount}`, this.tick, this.tick + 900));
        }
      }
      return false;
    }
    const target = this.actor(event.targetId), id = target.id, p = this.participant(id), enemy = !!source && source.team !== target.team;
    if (!target.life.alive || source && !enemy && (source !== target || !event.explosion)) return false;
    if (enemy && !target.life.spawnProtectionFrames && p.progression.ultimate && p.loadout.classId === 'tank'
      && target.life.health < target.life.maxHealth * .3 && this.ready(id, 'juggernaut') && event.hp > 0) {
      this.giveArmor(id,25,150,id); p.cooldowns.juggernaut = this.tick + 600;
    }
    const cast = this.abilities.actorState(id).active, origin = event.origin ?? chest(target), center = chest(target);
    const angle = Math.atan2(origin.y - center.y, origin.x - center.x) - Math.atan2(target.aim.y - center.y, target.aim.x - center.x);
    const shield = cast?.definition.id === 'tk_shield' ? { budget: cast.shieldBudget, reduction: cast.definition.reduction, facing: Math.cos(angle) >= .5 } : undefined;
    const defense = resolveIncomingDamage({ hp: event.hp, tick: this.tick, armor: p.armor, environment: !source,
      spawnProtected: !!source && target.life.spawnProtectionFrames > 0, shield,
      personalReductions: [cast?.definition.id === 'tk_barrier' ? cast.definition.reduction : 0,
        this.has(id, 'tk_C1') && target.movement.crouching && !target.movement.jumping && Math.abs(target.movement.vx) < .1 ? .15 : 0,
        event.explosion && this.has(id, 'tk_C3') ? .25 : 0, event.explosion && this.perk(id, 'pk_blast') ? .1 : 0,
        this.perk(id, 'pk_reloadguard') && this.gun(id).current.reloadUntil > this.tick ? .1 : 0] });
    if (shield && cast) cast.shieldBudget = shield.budget;
    if(defense.armor>0)this.armorEvent(id,'damage');
    if (enemy) this.abilities.onAbsorbed(id, defense.shield + defense.personal, this.tick);
    const before = healthUnits(target.life.health), amount = Math.min(before, defense.life);
    target.life.health = (before - amount) / 1000;
    if (amount > 0) {
      if (enemy) {
        p.lastDamage = this.tick; p.attackers[source!.id] = this.tick; p.contributions.healable += amount;
        this.abilities.onLifeDamage(id, this.tick);
        if (event.headshot) this.abilities.onHeadDamage(source!.id, this.tick);
        if (event.weaponId && event.shotSerial !== undefined) {
          const attacker = this.participant(source!.id), stat = attacker.weaponMetrics[event.weaponId] ??= freshWeaponMetrics();
          if (attacker.lastHitShot !== event.shotSerial) {
            attacker.lastHitShot = event.shotSerial; attacker.metrics.hits++; stat.hits++;
            attacker.metrics.hitDistance += Math.round(event.hitDistance ?? 0);
          }
          if (event.headshot && attacker.lastHeadShot !== event.shotSerial) { attacker.lastHeadShot = event.shotSerial; attacker.metrics.headshots++; }
        }
      }
      if (enemy) this.gadgets.onLifeDamage(id);
      addHitRecoil(p.recoil, this.tick, this.actorView(id).hitKickScale);
      const direction = event.origin ? Math.round(Math.atan2(event.origin.y - center.y, event.origin.x - center.x) / (Math.PI / 4)) * 45 : undefined;
      this.battle.journal.emit({ tick: this.tick, kind: 'damage', actorId: source?.id, targetId: id, amount: amount / 1000, direction });
    }
    if (defense.armor + defense.personal + defense.shield > 0) this.battle.journal.emit({ tick: this.tick, kind: 'block', actorId: source?.id, targetId: id });
    if (defense.shield > 0) this.sound('shield-hit', chest(target));
    const killed = target.life.health === 0;
    if (event.effects?.length) { event.effects[0].damage = amount / 1000; event.effects[0].killed = killed; }
    if (killed) {
      target.life.alive = false; target.life.deaths++; target.life.respawnFrames = 150; target.life.spawnProtectionFrames = 0; p.deathTick = this.tick;
      this.abilities.onDeath(id, this.tick); this.gadgets.cancelCast(id); this.gun(id).interrupt();
      const armorAtDeath=p.armor.remaining;p.armor = newArmor();if(armorAtDeath>0)this.armorEvent(id,'death');
      p.buffs = {}; p.slowUntil = p.slowScale = p.slowResistUntil = 0;
      p.stationary = p.braceTicks = p.focusWait = p.stillShots = 0; p.focusedReady = false; p.contributions.healable = 0;
      p.killStreak = p.headStreak = 0;
      p.recoil = newGrowthRecoil();
      for (const stat of Object.values(p.weaponMetrics)) stat.magazineKills = 0;
      this.deaths.push({ target, source: enemy ? source : undefined, context: event });
    }
    return killed;
  }
  private armorEvent(targetId:string,cause:string,sourceId?:string) {
    const armor=this.participant(targetId).armor;
    this.battle.journal.emit({tick:this.tick,kind:'armorChanged',actorId:sourceId??targetId,targetId,
      amount:armor.remaining/1000,duration:Math.max(0,armor.until-this.tick),cause,position:chest(this.actor(targetId))});
  }
  private giveArmor(targetId:string,hp:number,duration:number,sourceId:string) {
    if(grantArmor(this.participant(targetId).armor,hp,duration,this.tick,sourceId))this.armorEvent(targetId,'granted',sourceId);
  }
  private heal(sourceId: string, targetId: string, requested: number, castId?: string, committedCast?: ActiveAbility) {
    const target = this.actor(targetId), source = this.actor(sourceId), p = this.participant(sourceId), t = this.participant(targetId);
    if (!target.life.alive || target.team !== source.team) return 0;
    const amount = Math.min(requested, healthUnits(target.life.maxHealth) - healthUnits(target.life.health));
    if (amount <= 0) return 0;
    target.life.health = (healthUnits(target.life.health) + amount) / 1000;
    t.buffs.healingFeedback = this.tick + 15;
    if (sourceId !== targetId && this.ready(targetId, 'healSound')) {
      this.sound('heal', chest(target)); this.participant(targetId).cooldowns.healSound = this.tick + 15;
    }
    const healingXp = healingCredit(p.contributions, t.contributions, sourceId, amount, this.tick, sourceId === targetId);
    this.award(sourceId, healingXp); p.metrics.healingXp += healingXp;
    if (sourceId !== targetId) { p.healingRemainder += amount; p.metrics.healingDone += Math.floor(p.healingRemainder / 1000); p.healingRemainder %= 1000; }
    const cast = committedCast ?? (castId ? this.abilities.castState(castId) : undefined);
    this.battle.journal.emit({tick:this.tick,kind:'heal',actorId:sourceId,targetId,amount:amount/1000,
      ability:cast?.definition.id??(sourceId!==targetId&&p.loadout.gadgetId==='md_station'?'md_station':undefined),position:chest(target)});
    if (castId) {
      this.abilities.markHealing(castId, amount);
      if (!p.healedCasts.includes(castId)) {
        p.healedCasts.push(castId); p.healedCasts = p.healedCasts.slice(-8);
        if (cast?.selected.includes('md_C3') && source.life.alive) p.buffs.medReload = this.tick + 60;
      }
      if (sourceId !== targetId && source.life.alive && cast?.selected.includes('md_C2') && this.ready(sourceId, 'medRun')) {
        p.buffs.medRun = this.tick + 60; p.cooldowns.medRun = this.tick + 180;
      }
    }
    if (sourceId !== targetId) {
      const ultimate = p.progression.ultimate && p.loadout.classId === 'medic' && this.ready(targetId, 'lifeline');
      const evolution = !!castId && cast?.selected.includes('md_EV_A') && p.loadout.abilityId === 'md_pulse' && this.ready(targetId, 'pulseArmor');
      if (ultimate) { this.giveArmor(targetId,15,90,sourceId); t.cooldowns.lifeline = this.tick + 600; }
      if (evolution) { if (!ultimate) this.giveArmor(targetId,10,60,sourceId); t.cooldowns.pulseArmor = this.tick + 300; }
    }
    return amount;
  }
  private finishAbilities() {
    for (const { id, cast, reason } of this.finished.splice(0)) {
      const a = this.actor(id), p = this.participant(id);
      if (!a.life.alive || reason !== 'expired') continue;
      const has = (card: GrowthUpgradeId) => cast.selected.includes(card);
      if (cast.definition.id === 'as_roll' && has('as_A3')) p.buffs.rollSpread = this.tick + 30;
      if (cast.definition.id === 'as_reloadrush' && has('as_B3')) p.buffs.rushReload = this.tick + 90;
      if (cast.definition.id === 'tk_barrier' && cast.absorbed > 0 && has('tk_A3')) this.giveArmor(id,10,60,id);
      if (cast.definition.id === 'tk_shield') {
        if (has('tk_EV_B')) p.buffs.shieldCounter = this.tick + 60;
        if (has('tk_B3')) {
          const ally = this.actors().filter(b => b !== a && b.team === a.team && b.life.alive && distance(chest(a), chest(b)) <= 120 && this.gadgets.clearRay(chest(a), chest(b), true))
            .sort((b, c) => distance(chest(a), chest(b)) - distance(chest(a), chest(c)) || byId(b, c))[0] ?? a;
          this.giveArmor(ally.id,10,60,id);
        }
      }
      if (cast.definition.id === 'md_link' && cast.effectiveHealing && has('md_EV_B') && cast.targetId && this.actor(cast.targetId).life.alive)
        this.giveArmor(cast.targetId,10,90,id);
    }
  }
  private finishDeaths() {
    for (const { target, source, context } of this.deaths.splice(0)) {
      const victim = this.participant(target.id);
      for (const a of this.actors()) {
        if (a.team === target.team) continue;
        if (a === source) this.award(a.id, 100);
        else if (this.tick - (victim.attackers[a.id] ?? -1000) <= 240) this.award(a.id, 60);
        else if (source && source.team === a.team && this.gadgetEvents.some(e => e.kind === 'intel' && e.sourceId === a.id && e.targetId === target.id && this.tick - e.tick <= 90))
          this.award(a.id, supportCredit(this.participant(a.id).contributions, 20, `intel:${target.id}:${target.life.deaths}`, this.tick, this.tick + 900));
      }
      victim.attackers = {};
      if (source) {
        source.kills++;
        const id = source.id, p = this.participant(id);
        if (context.weaponId) (p.weaponMetrics[context.weaponId] ??= freshWeaponMetrics()).kills++;
        if (source.life.alive) {
          p.killStreak++; p.headStreak = context.headshot ? p.headStreak + 1 : 0;
          p.metrics.bestKillStreak = Math.max(p.metrics.bestKillStreak, p.killStreak); p.metrics.bestHeadshotStreak = Math.max(p.metrics.bestHeadshotStreak, p.headStreak);
          if (context.headshot) p.metrics.headshotKills++;
          if (Math.abs(source.movement.vx) > .5) p.metrics.movingKills++;
          if (source.life.health < source.life.maxHealth * .25) p.metrics.lowHealthKills++;
          if (source.life.health < source.life.maxHealth * .1) p.metrics.criticalHealthKills++;
          if (context.weaponId) {
            const stat = p.weaponMetrics[context.weaponId]!; stat.magazineKills++; p.metrics.bestMagazineKills = Math.max(p.metrics.bestMagazineKills, stat.magazineKills);
            if (context.weaponId === p.loadout.secondary && this.gun(id).checkpoint().guns.primary.ammo === 0) p.metrics.sidearmKills++;
          }
          if (this.perk(id, 'pk_dressing') && source.life.health < source.life.maxHealth * .5 && this.ready(id, 'dressing')) {
            this.heal(id, id, 5000); p.cooldowns.dressing = this.tick + 300;
          }
          if (this.has(id, 'tk_C4') && this.ready(id, 'reclaim')) { this.gun(id).supply(10, 'primary'); p.cooldowns.reclaim = this.tick + 150; }
          if (p.progression.ultimate && p.loadout.classId === 'assault' && this.ready(id, 'berserker')) {
            this.heal(id, id, 15000); p.buffs.berserker = this.tick + 90; p.cooldowns.berserker = this.tick + 150;
          }
          if (p.progression.ultimate && p.loadout.classId === 'sniper' && context.headshot && this.ready(id, 'ghost')) {
            p.buffs.ghost = this.tick + 90; p.cooldowns.ghost = this.tick + 240;
          }
        }
      }
      this.corpses.push({ id: `${target.id}:${target.life.deaths}`, team: target.team, position: { ...chest(target) }, expires: this.tick + 180 });
      target.deathInfo = { sourceName: source?.name ?? (context.sourceId === target.id ? '自己' : '环境伤害'),
        cause: context.weaponId ? GROWTH_V3_WEAPONS[context.weaponId].name : context.gadgetId ? GROWTH_V3_GADGETS[context.gadgetId].name : context.explosion ? '战术爆炸' : '战场环境' };
      this.battle.journal.emit({ tick: this.tick, kind: 'death', actorId: source?.id, targetId: target.id, ...target.deathInfo });
      this.ports.death(target, source);
      this.battle.events.unshift({ frame: this.tick, text: source ? `${source.name} 击败 ${target.name}` : `${target.name} 阵亡`, team: source?.team ?? 0 });
      this.battle.events.length = Math.min(4, this.battle.events.length);
    }
  }
  /** Team sight includes living observers and active reconnaissance beacons. */
  private botControl(a: Actor): BattleInput {
    const id = a.id, p = this.participant(id), gun = this.gun(id), m = a.movement, brain = a.brain;
    const allies = this.actors().filter(b => b.team === a.team && b.life.alive);
    const circles = this.gadgets.visionCircles(a.team, this.tick);
    const visiblePoint = (point: Point) => inBeaconVision(point, circles) || allies.some(b => distance(chest(b), point) <= VISION_RADIUS && this.gadgets.clearRay({ x: b.movement.x, y: b.movement.y - 42 }, point, true));
    const enemies = this.actors().filter(b => b.team !== a.team && b.life.alive && visiblePoint(chest(b)))
      .sort((b, c) => distance(chest(a), chest(b)) - distance(chest(a), chest(c)) || byId(b, c));
    const target = enemies[0], dist = target ? distance(chest(a), chest(target)) : Infinity;
    const structures = this.gadgets.entities().filter(g => g.team !== a.team && visiblePoint(g.position));
    const structure = !target ? structures.filter(g => this.gadgets.clearRay(chest(a), g.position, true))
      .sort((b, c) => distance(chest(a), b.position) - distance(chest(a), c.position) || byId(b, c))[0] : undefined;
    const attackPoint = target ? chest(target) : structure?.position, attackId = target?.id ?? structure?.id ?? null;
    if (brain.target !== attackId) { brain.target = attackId; brain.acquired = this.tick; }
    const difficulty = this.battle.difficulty, reaction = { easy: 24, normal: 16, hard: 9 }[difficulty];
    if (this.tick % 12 === 0) brain.offset = (this.ports.random() * 2 - 1) * { easy: 90, normal: 55, hard: 28 }[difficulty];
    const def = resolveGrowthWeapon(gun.selectedId, p.loadout.attachments[gun.selectedSlot]);
    const primary = gun.checkpoint().guns.primary, secondary = gun.checkpoint().guns.secondary;
    const empty = primary.ammo + primary.reserve + secondary.ammo + secondary.reserve === 0;
    const delivery = this.battle.mission.mode === 'ctf';
    const destination = delivery ? this.battle.objectiveBotGoal(a).destination : empty ? this.battle.mission.spawns[a.team - 1][0]
      : this.battle.mission.mode === 'dom' ? this.battle.mission.objective : target?.movement ?? structure?.position ?? this.battle.mission.objective;
    const waypoint = this.battle.mission.collisionMask
      ? trackedWaypoint(this.battle.mission.navigation, m, destination, brain.route ??= {})
      : nextWaypoint(this.battle.mission.navigation, m, destination);
    const holding = this.battle.mission.mode === 'dom' && distance(m, destination) < 45;
    const stop = !delivery && !empty && !m.jumping && (holding || !!attackPoint && distance(chest(a), attackPoint) < Math.min(def.falloffStart, 450));
    const dx = waypoint.x - m.x;
    brain.stuck = !stop && Math.abs(m.x - brain.lastX) < .5 ? brain.stuck + 1 : 0; brain.lastX = m.x;
    const input: BattleInput = { left: !stop && dx < -8, right: !stop && dx > 8, crouch: m.shouldDescendStairs(waypoint) || m.shouldDescendStairs(destination) || stop && !!target && this.tick % 120 < 35,
      jump: !stop && !m.shouldDescendStairs(destination) && !m.jumping && (traversalJump(m, waypoint, this.battle.wall) || brain.stuck > 12),
      fire: !!attackPoint && this.tick - brain.acquired >= reaction && this.tick % 54 < 32 && (def.mode === 'auto' || this.tick % Math.max(2, def.interval) === 0),
      aim: attackPoint ? { x: attackPoint.x, y: attackPoint.y + (target ? brain.offset : brain.offset * .1) } : { x: m.x + Math.sign(dx || (a.team === 1 ? 1 : -1)) * 300, y: chest(a).y } };
    brain.state = empty ? 'resupply' : holding ? 'hold' : attackPoint ? 'engage' : 'advance';
    if (p.progression.offer) this.choice(id, p.progression.offer.batch, p.progression.offer.cards[Math.floor(this.ports.random() * p.progression.offer.cards.length)]);
    const danger = this.gadgets.flying().filter(f => (f.team !== a.team || f.sourceId === id)
      && f.definition.damageMax > 0 && f.detonateTick - this.tick <= 18 && visiblePoint(f.position))
      .map(f => ({ position: this.gadgets.predictFlyingImpact(f.id)!, radius: f.definition.radius }));
    for (const entity of structures) if (entity.gadgetId === 'as_charge' && entity.armedTick <= this.tick)
      danger.push({ position: entity.position, radius: entity.definition.radius });
    const nearby = danger.filter(d => distance(chest(a), d.position) <= d.radius + 40 && this.gadgets.clearRay(chest(a), d.position));
    if (nearby.length) {
      const clearance = (point: Point) => Math.min(...nearby.map(d => distance(point, d.position) - d.radius));
      const directions = [-1, 1].filter(direction => [8, 16, 24].every(offset => {
        const x = m.x + direction * offset;
        return x >= 14 && x <= this.battle.mission.width - 14 && !this.battle.wall(x, m.y - 33)
          && !this.battle.wall(x, m.y - 4) && (m.jumping || this.battle.wall(x, m.y + 4));
      })).sort((b, c) => clearance({ x: m.x + c * 96, y: chest(a).y }) - clearance({ x: m.x + b * 96, y: chest(a).y }) || b - c);
      const direction = directions[0];
      input.left = direction === -1; input.right = direction === 1; input.crouch = false;
      input.jump = direction === undefined && !m.jumping;
      brain.state = 'evade';
      // Keep ordinary fire and action locks; evasion never teleports or grants invulnerability.
      return input;
    }
    if (!this.ready(id, 'aiEval')) return input;
    p.cooldowns.aiEval = this.tick + 30;
    // Protected actors cannot cast. Preserve fire so ordinary attack input can end protection.
    if (a.life.spawnProtectionFrames > 0) return input;
    const e = this.abilities.actorState(id), injured = allies.filter(b => b.life.health < b.life.maxHealth && this.gadgets.clearRay(chest(a), chest(b), true))
      .sort((b, c) => b.life.health / b.life.maxHealth - c.life.health / c.life.maxHealth || byId(b, c));
    const near = injured.filter(b => b !== a && distance(chest(a), chest(b)) <= 180);
    let skill = false;
    if (!e.active && !e.pending && e.charges && this.tick >= e.useReadyTick && !this.gadgets.inventory(id).cast) {
      switch (p.loadout.abilityId) {
        case 'as_roll': skill = dist <= 400 && (a.life.health < 40 || this.tick - p.lastDamage <= 30); break;
        case 'as_reloadrush': skill = !!target && def.magazine - gun.current.ammo >= 4 && gun.current.reserve > 0; break;
        case 'tk_barrier': case 'tk_shield': skill = !!target && (this.tick - p.lastDamage <= 30 || enemies.length >= 2); break;
        case 'sn_focus': skill = !!target && dist >= 300 && p.stationary >= 30; break;
        case 'sn_relocate': skill = !!target && (dist < 180 || a.life.health < 35); break;
        case 'md_pulse': skill = near.reduce((sum, b) => sum + b.life.maxHealth - b.life.health, 0) >= 20 || a.life.health < 40; break;
        case 'md_link': {
          const ally = injured.find(b => b !== a && distance(chest(a), chest(b)) <= 240);
          skill = !!ally || a.life.health < 40;
          if (ally) input.aim = chest(ally);
          break;
        }
      }
    }
    if (skill) { this.enqueue(id, 'skill'); input.fire = false; return input; }
    const inventory = this.gadgets.inventory(id);
    if (inventory.cast || this.abilities.locks(id, this.tick).gadget || inventory.readyTick > this.tick) return input;
    const own = this.gadgets.entities().find(g => g.sourceId === id);
    if (p.loadout.gadgetId === 'as_charge' && own) {
      if (this.tick >= own.armedTick && distance(own.position, chest(a)) > 80
        && [...enemies.map(chest), ...structures.map(g => g.position)].some(point => distance(point, own.position) <= 100)) this.enqueue(id, 'item');
      return input;
    }
    if (!inventory.charges || this.gadgets.hasDeploymentReservation(id)) return input;
    const defensive = this.battle.mission.mode === 'dom' && distance(m, this.battle.mission.objective) < 240 || !!target;
    const deployment = [40, -40, 55, -55].map(x => ({ x: m.x + x, y: m.y })).find(point => this.gadgets.canPlace(id, point)
      && (p.loadout.gadgetId !== 'tk_cover' || !target || (point.x - m.x) * (target.movement.x - m.x) > 0));
    const endangered = injured.find(b => b !== a && b.life.health < 35 && this.tick - this.participant(b.id).lastDamage <= 30);
    const electronic = structures.find(g => g.definition.electronic);
    let goal: Point | undefined;
    switch (p.loadout.gadgetId) {
      case 'tk_cover': if (defensive && deployment) this.enqueue(id, 'item', deployment); break;
      case 'tk_interceptor': if (deployment && this.gadgets.flying().some(f => f.team !== a.team && visiblePoint(f.position))) this.enqueue(id, 'item', deployment); break;
      case 'tk_plate': if (a.life.health < 70 && p.armor.remaining < 15000 && this.tick - p.lastDamage > 30) this.enqueue(id, 'item', chest(a)); break;
      case 'sn_beacon': {
        const nodes = this.battle.mission.navigation;
        if (!nodes.length) break;
        const start = nodes.reduce((best, node, index) => Math.hypot(node.x-m.x, (node.y-m.y)*2)
          < Math.hypot(nodes[best].x-m.x, (nodes[best].y-m.y)*2) ? index : best, 0);
        const reachable = new Set<number>([start]), pending = [start];
        for (let i=0;i<pending.length;i++) for (const next of nodes[pending[i]].links)
          if (nodes[next] && !reachable.has(next)) { reachable.add(next); pending.push(next); }
        const junction = [...reachable].filter(index => nodes[index].links.length >= 2)
          .sort((left,right) => distance(chest(a),nodes[left])-distance(chest(a),nodes[right]) || left-right)
          .map(index => ({ x:nodes[index].x, y:nodes[index].y })).find(point => this.gadgets.canPlace(id,point));
        if (junction) this.enqueue(id,'item',junction);
        break;
      }
      case 'md_station': if (deployment && near.reduce((sum, b) => sum + b.life.maxHealth - b.life.health, 0) >= 25) this.enqueue(id, 'item', deployment); break;
      case 'md_ammo': if (deployment && allies.some(b => {
        if (distance(chest(a), chest(b)) > 140) return false;
        const other = this.gun(b.id), current = other.current;
        return current.ammo + current.reserve < GROWTH_V3_WEAPONS[other.selectedId].totalAmmo * .3;
      })) this.enqueue(id, 'item', deployment); break;
      case 'as_charge': if (deployment && structures.some(g => distance(g.position, deployment) <= 100)) this.enqueue(id, 'item', deployment); break;
      case 'as_frag': case 'as_concussion': if (target) goal = chest(target); break;
      case 'sn_emp': if (electronic) goal = electronic.position; break;
      case 'sn_decoy': if (target) goal = { x: m.x + (target.movement.x > m.x ? -160 : 160), y: m.y - 20 }; break;
      case 'md_smoke': if (endangered) goal = chest(endangered); break;
    }
    if (goal) {
      const center = chest(a), angle = Math.atan2(goal.y - center.y, goal.x - center.x);
      const throws = [-90, -60, -30, 0, 30, 60, 90].flatMap(offset => {
        const aim = this.gadgets.throwAim(id, angle + offset * Math.PI / 180);
        return aim ? [{ aim, impact: this.gadgets.predictThrow(id, aim) }] : [];
      }).filter((t): t is { aim: Point; impact: Point } => !!t.impact)
        .filter(t => !['as_frag', 'as_concussion'].includes(p.loadout.gadgetId) || distance(center, t.impact) > 80)
        .sort((a, b) => distance(a.impact, goal!) - distance(b.impact, goal!));
      if (throws[0] && distance(throws[0].impact, goal) <= 80 && this.gadgets.clearRay(throws[0].impact, goal)) this.enqueue(id, 'item', throws[0].aim);
    }
    return input;
  }
  /** Tactical decisions take priority; bots never cancel their own pending deployment to maintain a gun. */
  private botWeaponMaintenance(a: Actor) {
    const id = a.id;
    if (this.pending.some(command => command.actorId === id && (command.action === 'skill' || command.action === 'item'))
      || this.gadgets.inventory(id).cast) return;
    const gun = this.gun(id), locks = this.abilities.locks(id, this.tick);
    if (!gun.current.ammo && !gun.current.reserve) {
      const other = gun.checkpoint().guns[gun.selectedSlot === 'primary' ? 'secondary' : 'primary'];
      if (!locks.swap && other.ammo + other.reserve > 0) this.enqueue(id, 'swap');
      return;
    }
    // Weapon completion runs later in this tick. Re-requesting on its deadline would restart the reload.
    if (locks.reload || gun.current.reloadUntil || gun.readyTick > this.tick || !gun.current.reserve) return;
    const p = this.participant(id), def = resolveGrowthWeapon(gun.selectedId, p.loadout.attachments[gun.selectedSlot]);
    if (!gun.current.ammo || !a.brain.target && gun.current.ammo < def.magazine * .5) this.enqueue(id, 'reload');
  }
  /** Called after Battle advances its frame; every weapon and E/G clock advances exactly once. */
  step(inputs: ReadonlyMap<string, BattleInput>, shotFrames: ReadonlyMap<string, number>) {
    this.processing = true;
    for (const a of this.actors()) this.lifeStart(a);
    this.gadgets.beginTick(this.tick); this.abilities.step(this.tick);
    this.finishAbilities();
    const controls = new Map(this.actors().map(a => [a.id, !a.human && a.life.alive ? this.botControl(a)
      : inputs.get(a.id) ?? { left: false, right: false, crouch: false, jump: false, fire: false, aim: { ...a.aim } }]));
    for (const a of this.actors()) if (!a.human && a.life.alive) this.botWeaponMaintenance(a);
    for (const a of this.actors()) {
      const control = controls.get(a.id)!;
      a.aim = { ...control.aim };
      if (a.life.alive && a.life.spawnProtectionFrames > 0 && control.fire) {
        a.life.spawnProtectionFrames = 0;
        const p = this.participant(a.id), gun = this.gun(a.id);
        gun.blockUntil(this.tick + Math.ceil(resolveGrowthWeapon(gun.selectedId, p.loadout.attachments[gun.selectedSlot]).prepare));
      }
    }
    const actions = this.pending.splice(0), order: PlayerAction[] = ['skill', 'item', 'swap', 'reload'];
    for (const a of this.actors()) {
      let acceptedE = false;
      for (const action of order) {
        const command = actions.find(c => c.actorId === a.id && c.action === action);
        if (!command || !a.life.alive) continue;
        if (action === 'skill') { acceptedE = this.abilities.use(a.id, controls.get(a.id)!.aim, this.tick); this.abilities.commitReady(this.tick); }
        if (action === 'item') { if (acceptedE) this.error(a.id, 'busy'); else this.gadgets.use(a.id, command.aim ?? controls.get(a.id)!.aim, this.tick); }
        if (action === 'swap') this.swap(a);
        if (action === 'reload') this.reload(a);
      }
    }
    for (const a of this.actors()) if (a.life.alive) this.movement(a, controls.get(a.id)!);
    for (const entity of this.gadgets.entities()) if (entity.gadgetId === 'tk_cover') {
      const ledger = this.coverSupport[entity.id] ??= { nearby: {}, blocked: 0 };
      for (const ally of this.actors()) if (ally.id !== entity.sourceId && ally.team === entity.team && ally.life.alive && distance(chest(ally), entity.position) <= 80)
        ledger.nearby[ally.id] = this.tick;
      for (const [id, tick] of Object.entries(ledger.nearby)) if (this.tick - tick > 90) delete ledger.nearby[id];
    }
    this.gadgets.finishMovement(this.tick);
    for (const a of this.actors()) this.shoot(a, controls.get(a.id)!, shotFrames.get(a.id));
    for (const event of this.damageQueue.splice(0)) this.resolveDamage(event);
    for (const request of this.healQueue.splice(0)) {
      const cast = request.cast, target = this.actor(request.targetId);
      // The pulse committed before movement; low-health bonuses are evaluated after all damage.
      const amount = healthUnits(abilityHealing(cast.definition, request.sourceId === request.targetId,
        target.life.health, target.life.maxHealth, cast.selected));
      this.heal(request.sourceId, request.targetId, amount, request.castId, cast);
    }
    const targets = this.actors().sort((a, b) => a.life.health / a.life.maxHealth - b.life.health / b.life.maxHealth || byId(a, b));
    for (const a of targets) {
      const p = this.participant(a.id);
      // Rebuild candidates after every restoration: a station has one shared budget across all targets.
      const sources = [...this.abilities.healingSources(this.tick), ...this.gadgets.healingSources(this.tick)];
      const source = chooseContinuousHeal(p.continuousHeal, a.id, sources, this.tick);
      if (source) {
        const station = this.gadgets.entities().some(e => e.id === source.id);
        const restored = this.heal(source.ownerId, a.id, source.amount, station ? undefined : source.id);
        commitContinuousHeal(p.continuousHeal, this.tick, restored);
        if (restored && station) this.gadgets.consumeHealing(source.id, restored, this.tick);
      }
      if (a.life.alive && p.loadout.classId === 'medic' && this.tick - p.lastDamage >= 180 && (this.tick - p.lastDamage - 180) % 30 === 0)
        this.heal(a.id, a.id, Math.max(0, Math.min(2000, healthUnits(a.life.maxHealth * .5 - a.life.health))));
    }
    this.abilities.finishHealingPhase(this.tick); this.finishAbilities(); this.finishDeaths();
    this.corpses = this.corpses.filter(c => c.expires > this.tick);
    for (const id of Object.keys(this.coverSupport)) if (!this.gadgets.entities().some(e => e.id === id)) delete this.coverSupport[id];
    this.radar = this.radar.filter(mark => mark.expiresTick > this.tick);
    for (const a of this.actors()) {
      const p = this.participant(a.id);
      p.scavenged = p.scavenged.filter(id => this.corpses.some(c => c.id === id));
      if (a.life.alive) {
        if (this.has(a.id, 'as_C3')) for (const corpse of this.corpses) {
          if (corpse.team === a.team || p.scavenged.includes(corpse.id) || distance(chest(a), corpse.position) > 80) continue;
          if (this.gun(a.id).supply(Math.max(1, Math.floor(GROWTH_V3_WEAPONS[this.gun(a.id).selectedId].magazine * .25)))) p.scavenged.push(corpse.id);
        }
        if (this.tick >= a.supplyReady && this.battle.mission.spawns[a.team - 1].some(s => distance(a.movement, s) < 65)) {
          if (this.supply(a.id)) this.battle.journal.emit({ tick: this.tick, kind: 'supply', actorId: a.id });
          a.supplyReady = this.tick + 300;
        }
      }
      this.sync(a);
    }
    this.processing = false;
  }
  afterMode() {
    if (this.battle.mission.mode !== 'dom') return;
    for (const a of this.actors()) {
      const p = this.participant(a.id), objective = this.battle.mission.objective;
      const holds = a.life.alive && this.battle.objective === (a.team === 1 ? 'blue' : 'red') && Math.abs(a.movement.x - objective.x) < 85 && Math.abs(a.movement.y - objective.y) < 70;
      p.objectiveTicks = holds ? p.objectiveTicks + 1 : 0;
      if (p.objectiveTicks && p.objectiveTicks % 30 === 0) this.award(a.id, objectiveCredit(p.contributions, this.tick));
    }
  }
  visibleActors(team: 1 | 2) {
    const circles = this.gadgets.visionCircles(team, this.tick);
    const observers = this.actors().filter(a => a.team === team && a.life.alive);
    return new Set(this.actors().filter(a => !this.participant(a.id).retired && (a.team === team || a.deliveryPreviousWeapon !== undefined || inBeaconVision(chest(a), circles) || observers.some(b => distance(chest(a), chest(b)) <= VISION_RADIUS
      && this.gadgets.clearRay({ x: b.movement.x, y: b.movement.y - 42 }, chest(a), true)))).map(a => a.id));
  }
  retire(id: string) {
    const p = this.participant(id), a = this.actor(id); if (p.retired) return;
    p.retired = true; a.life.alive = false; a.life.health = 0;
    this.abilities.onDeath(id, this.tick); this.gadgets.remove(id, this.tick); this.gun(id).interrupt();
    this.pending = this.pending.filter(c => c.actorId !== id); this.finishAbilities();
  }
  privateView(id: string) {
    const p = this.participant(id);
    const preset=this.battle.mission.growthPreset ?? 'standard';
    return structuredClone({ ...p.progression, preset, ultimateTick:GROWTH_V3_PRESETS[preset].ultimateTick, classId: p.loadout.classId, abilityId: p.loadout.abilityId, gadgetId: p.loadout.gadgetId,
      perks: p.loadout.perks, armor: p.armor.remaining / 1000, healingDone: p.metrics.healingDone, healingXp: p.metrics.healingXp,
      ability: this.abilities.actorState(id), gadget: this.gadgets.inventory(id) });
  }
  actorView(id: string) {
    const p = this.participant(id), ability = this.abilities.actorState(id), weapon = this.gun(id);
    const m = this.actor(id).movement;
    const appearance = resolveGrowthWeapon(weapon.selectedId, p.loadout.attachments[weapon.selectedSlot], {
      moving: Math.abs(m.vx) > .1, airborne: m.jumping, crouching: m.crouching, stationaryTicks: p.stationary, braceTicks: p.braceTicks,
      first: false, empty: weapon.current.ammo === 0,
    });
    return { classId: p.loadout.classId, art: GROWTH_V3_OPERATORS[p.loadout.classId].art, level: p.progression.level,
      ultimate: p.progression.ultimate, ghost: this.buff(id, 'ghost'), armor: p.armor.remaining / 1000,
      abilityId: p.loadout.abilityId, gadgetId: p.loadout.gadgetId, weaponId: weapon.selectedId, slot: weapon.selectedSlot,
      charges: ability.charges, maxCharges: ability.maxCharges, casting: !!ability.pending || !!this.gadgets.inventory(id).cast,
      activeAbility: ability.active?.definition.id,
      linkTargetId: ability.active?.definition.id === 'md_link' ? ability.active.targetId ?? undefined : undefined,
      flashScale: appearance.flashScale, magazine: appearance.magazine, healing: this.buff(id, 'healingFeedback'), contrast: appearance.contrast,
      recoilDegrees: (p.recoil.shot + p.recoil.hit) / 1000,
      hitKickScale: appearance.hitKickScale * (p.loadout.classId === 'tank' && m.crouching && !m.jumping && p.braceTicks >= 24 ? .8 : 1) };
  }
  /** Unfiltered authority projection. Every network recipient must pass through visibleState. */
  worldView() {
    const entities = this.gadgets.entities().map(e => ({ id: e.id, sourceId: e.sourceId as string | undefined, team: e.team, gadgetId: e.gadgetId,
      x: e.position.x, y: e.position.y, width: e.definition.width, height: e.definition.height, health: e.health / 1000,
      maxHealth: e.definition.health, radius: e.definition.radius, expiresTick: e.expiresTick, armed: this.tick >= e.armedTick, stopped: this.tick < e.stoppedUntil }));
    const flying = this.gadgets.flying().map(f => ({ id: f.id, sourceId: f.sourceId as string | undefined, team: f.team, gadgetId: f.gadgetId,
      x: f.position.x, y: f.position.y, vx: f.vx, vy: f.vy }));
    const smoke = this.gadgets.smoke().map(s => ({ id: s.id, x: s.position.x, y: s.position.y, radius: s.radius, expiresTick: s.expiresTick }));
    const radar = this.radar.filter(r => r.kind !== 'shot' || !r.sourceId || !this.buff(r.sourceId, 'ghost')).map(r => structuredClone(r));
    return { entities, flying, smoke, radar };
  }
  checkpoint(): GrowthBattleCheckpoint {
    if (this.processing || this.damageQueue.length || this.healQueue.length || this.deaths.length || this.finished.length) throw Error('Checkpoint requires a completed growth tick');
    return structuredClone({ version: 3, stage: this.stage, participants: [...this.participants.values()],
      weapons: [...this.weapons].map(([id, gun]) => ({ id, state: gun.checkpoint() })), abilities: this.abilities.checkpoint(),
      gadgets: this.gadgets.checkpoint(), pending: this.pending, gadgetEvents: this.gadgetEvents, corpses: this.corpses, radar: this.radar,
      radarSerial: this.radarSerial, coverSupport: this.coverSupport });
  }
  static restore(battle: Battle, state: GrowthBattleCheckpoint, ports: GrowthBattlePorts) {
    if (state.version !== 3 || ![2, 5].includes(state.stage) || state.participants.length !== battle.actors.length) throw Error('Invalid growth battle checkpoint');
    const runtime = new GrowthBattleCoordinator(battle, state.stage, ports);
    for (const participant of state.participants) {
      runtime.actor(participant.id); validateGrowthLoadoutV3(participant.loadout, state.stage);
      if (runtime.participants.has(participant.id)) throw Error('Duplicate growth participant');
      runtime.participants.set(participant.id, structuredClone(participant));
    }
    for (const { id, state: weapon } of state.weapons) {
      if (!runtime.participants.has(id) || runtime.weapons.has(id) || weapon.lastTick !== battle.frame) throw Error('Invalid growth weapon checkpoint owner');
      runtime.weapons.set(id, GrowthArsenalV3.restore(weapon));
    }
    if (runtime.weapons.size !== runtime.participants.size || state.abilities.lastTick !== battle.frame || state.gadgets.finishedTick !== battle.frame) throw Error('Incomplete growth checkpoint');
    runtime.abilities = AbilitySimulation.restore(runtime.abilityPort(), state.abilities);
    runtime.gadgets = GadgetSimulation.restore(runtime.gadgetPort(), state.gadgets);
    runtime.pending = structuredClone(state.pending); runtime.gadgetEvents = structuredClone(state.gadgetEvents); runtime.corpses = structuredClone(state.corpses); runtime.radar = structuredClone(state.radar);
    runtime.radarSerial = state.radarSerial; runtime.coverSupport = structuredClone(state.coverSupport);
    for (const a of runtime.actors()) runtime.sync(a);
    return runtime;
  }
}
