import { freshWeaponMetrics } from '../../shared/content/GrowthRecords';
import { GrowthBattleCoordinator, type GrowthBattleCheckpoint, type GrowthBattlePorts } from '../../shared/simulation/growth-v3/BattleCoordinator';
import type { GrowthLoadoutV3 } from '../../shared/content/growth-v3/Loadout';
import type { ContentStage } from '../../shared/content/growth-v3/Core';
import { medicPulse } from '../../shared/simulation/GrowthMedic';
import { growthSpeed, growthSpread, growthReloadScale, growthIncoming, growthReserve } from '../../shared/simulation/GrowthCombat';
import { OriginalMovement } from '../movement/OriginalMovement';
import { GROWTH_RULES, GROWTH_WEAPONS, growthWeaponConfigs, type GrowthWeaponId, GROWTH_CLASSES, defaultGrowthLoadout, validateGrowthLoadout, type GrowthLoadout } from '../../shared/content/GrowthCatalog';
import { newGrowth, awardGrowth, selectGrowth, rerollGrowth, type GrowthState } from '../../shared/simulation/Growth';
import { randomId } from '../../shared/simulation/RandomId';
import { OriginalLife } from '../combat/OriginalLife';
import { COMBAT_FRAME_MS, type WeaponId } from '../combat/Combat';
import { traceBulletLine, type BulletTrace, type Point, type RandomSource } from '../combat/Ballistics';
import { Arsenal } from './Arsenal';
import { launchProjectile, stepProjectile, type WeaponProjectile } from '../../shared/simulation/WeaponProjectile';
import { WEAPONS } from './Catalog';
import { stepStealth } from '../../shared/simulation/Stealth';
import { botInput } from '../../shared/simulation/BotController';
import { EventJournal } from '../../shared/simulation/Events';
import { createMode, resolveResult, type ModeRules, type MatchResult } from '../../shared/simulation/ModeRules';
import { createRandom, type StatefulRandom } from '../../shared/simulation/Random';
import { HitboxHistory, type HistoricalHitbox } from '../../shared/simulation/HitboxHistory';
import { WaveDirector } from '../../shared/simulation/WaveDirector';
import { coopSpawn } from '../../shared/simulation/CoopSpawn';
import type { DeliveryEvent } from '../../shared/simulation/DeliveryObjectives';
import { validateDamageContext, type DamageContext } from '../../shared/simulation/DamageContext';
import { interceptShield, type ShieldState } from '../../shared/simulation/Shield';
import { OffhandController } from '../../shared/simulation/Offhand';
import { validateEquipment, type EquipmentLoadout } from '../../shared/content/Equipment';
import { clearSight } from './Navigation';
import type { RouteState } from './Navigation';
import { wallFor, type Mission } from './Missions';
import { CLASSES, SKILLS, ITEMS, SPECIAL_OFFHANDS, isSpecialOffhand, canEquipOffhand, defaultLoadout, loadoutStats, type Loadout } from './Catalog';

export type Difficulty = 'easy' | 'normal' | 'hard';
export interface BattleInput { left: boolean; right: boolean; crouch: boolean; jump: boolean; fire: boolean; aim: Point }
export const idleInput = (): BattleInput => ({ left: false, right: false, crouch: false, jump: false, fire: false, aim: { x: 900, y: 555 } });
export interface Actor {
  growth?: GrowthState;
  id: string; name: string; team: 1 | 2; human: boolean; movement: OriginalMovement; life: OriginalLife;
  arsenal: Arsenal; aim: Point; kills: number; supplyReady: number; stealthFrames: number;
  deliveryPreviousWeapon?: WeaponId;
  deathInfo?: { sourceName: string; cause: string };
  shield?: ShieldState;
  offhand?: OffhandController;
  equipment?: EquipmentLoadout;
  deliveryPreviousOffhand?: boolean;
  kit: Loadout | null; skillCooldown: number; skillFrames: number; itemCharges: number; itemCooldown: number;
  brain: { target: string | null; acquired: number; offset: number; lastX: number; stuck: number; state: string; route?: RouteState };
}
export interface BattleEvent { frame: number; text: string; team: number }
export interface ShotEffect { reflected?: boolean; frame: number; actorId?: string; trace: BulletTrace; team: number; damage: number; killed: boolean }
export interface Grenade { source: Actor; x: number; y: number; vx: number; vy: number; fuse: number }

export function seededRandom(seed: number): RandomSource {
  return createRandom(seed);
}

/** Offline 30Hz team battle. Difficulty changes bot perception, reaction and aim, never damage. */
export class Battle {
  growthV3?: GrowthBattleCoordinator;
  readonly id: string;
  actors: Actor[] = [];
  frame = 0;
  phase: 'running' | 'won' | 'lost' = 'running';
  reason = '';
  scores: [number, number] = [0, 0];
  objective: 'neutral' | 'blue' | 'red' | 'contested' = 'neutral';
  private mode: ModeRules;
  private matchResult: MatchResult | null = null;
  private phaseMs = 0;
  private jumpHeld = new Map<string, boolean>();
  private hitboxHistory = new HitboxHistory();
  private waves?: WaveDirector;
  effects: ShotEffect[] = [];
  events: BattleEvent[] = [];
  readonly journal = new EventJournal();
  grenades: Grenade[] = [];
  projectiles: WeaponProjectile[] = [];
  bursts: { x: number; y: number; frame: number; radius: number; color: number }[] = [];
  notice = ''; noticeFrame = 0;
  readonly wall: (x: number, y: number) => boolean;
  constructor(readonly mission: Mission, readonly difficulty: Difficulty = 'normal', readonly startingWeapon: WeaponId = 'm4', private random: RandomSource = createRandom(Math.floor(Math.random() * 0x100000000)), readonly loadout: Loadout | null = null, id: string = randomId()) {
    this.id = id; this.mode = createMode(mission.mode, mission.deliveryBases, mission.deliveryZones);
    this.wall = wallFor(mission);
    this.addActor('player', '你', 1, true, 0);
    for (let i = 0; i < mission.allies; i++) this.addActor(`ally-${i}`, ['回声', '北斗'][i] ?? `队员${i}`, 1, false, i + 1);
    for (let i = 0; i < mission.enemies; i++) this.addActor(`enemy-${i}`, ['哨兵', '猎隼', '铁卫'][i] ?? `守卫${i}`, 2, false, i);
    if (mission.mode === 'coop') this.waves = new WaveDirector(mission.allies + 1, mission.scenario);
  }
  get player() { return this.actors[0]; }
  /** The complete roster switches together. Lobby exposure follows protocol/UI migration. */
  enableGrowthV3(loadouts: Readonly<Record<string, GrowthLoadoutV3>>, stage: ContentStage = 2) {
    if (this.growthV3) throw Error('Growth battle is already configured');
    const runtime = new GrowthBattleCoordinator(this, stage, this.growthV3Ports());
    runtime.install(loadouts); this.growthV3 = runtime;
  }
  private growthV3Ports(): GrowthBattlePorts {
    return { random: () => this.random(), spawn: actor => this.spawn(actor), death: (target, source) => this.mode.onDeath(this, target, source),
      hitboxes: frame => this.hitboxHistory.resolve(this.frame, frame, this.hitboxes()) };
  }
  /** Authority-only growth setup: independent class and weapon balance, with no legacy kit bonuses. */
  equipGrowth(actor: Actor, value: GrowthLoadout = defaultGrowthLoadout()) {
    const loadout = validateGrowthLoadout(value), definition = GROWTH_CLASSES[loadout.classId];
    this.equipActor(actor, { classId: 'medic', primary: 'm4', secondary: 'usp', skill: 'heal', item: 'frag' });
    // Presentation maps the growth class to existing art; legacy passives and stats are removed.
    actor.kit = null; actor.equipment = undefined;
    actor.life = new OriginalLife(definition.health);
    actor.arsenal = new Arsenal(loadout.primary, loadout.primary, 'usp', GROWTH_RULES.ammo, growthWeaponConfigs(loadout));
    actor.growth = newGrowth(loadout); actor.movement.speedScale = definition.speed;
  }
  growthChoice(actorId: string, batch: number, upgrade: unknown, reroll = false) {
    if (this.growthV3) return this.growthV3.choice(actorId, batch, upgrade, reroll);
    const actor = this.actors.find(a => a.id === actorId);
    if (this.phase !== 'running' || !actor?.growth) return false;
    const accepted = reroll ? rerollGrowth(actor.growth, batch, this.random, this.frame)
      : selectGrowth(actor.growth, batch, upgrade, this.random, this.frame);
    if (accepted && !reroll && upgrade === 'grenadePouch') actor.itemCharges++;
    return accepted;
  }
  /** Trusted lobby setup only; never permits in-match replacement or refilling. */
  equipActor(actor: Actor, value: EquipmentLoadout) {
    if (this.growthV3) throw Error('Cannot install classic equipment in a growth battle');
    if (this.frame !== 0 || this.phase !== 'running' || !this.actors.includes(actor)) throw Error('Cannot change equipment during battle');
    this.installEquipment(actor, validateEquipment(value));
  }
  /** Explicit debug-only reset; validation precedes every mutation. Keeps position and score. */
  reconfigureDebugActor(actor: Actor, value: EquipmentLoadout) {
    if (this.growthV3) throw Error('Use growth loadout validation for growth debug rooms');
    if (!this.mission.debug || this.phase !== 'running' || !this.actors.includes(actor)) throw Error('Only debug rooms allow live equipment changes');
    const equipment = validateEquipment(value), deaths = actor.life.deaths, wasAlive = actor.life.alive;
    this.releaseObjective(actor.id);
    this.forgetActorInput(actor.id);
    this.grenades = this.grenades.filter(grenade => grenade.source.id !== actor.id);
    this.projectiles = this.projectiles.filter(p => p.sourceId !== actor.id);
    this.installEquipment(actor, equipment);
    actor.life.deaths = deaths;
    if (!wasAlive) this.spawn(actor);
  }
  private installEquipment(actor: Actor, equipment: EquipmentLoadout) {
    actor.equipment = equipment;
    actor.kit = { ...defaultLoadout(equipment.classId ?? 'medic'), primary: equipment.primary, secondary: equipment.secondary };
    actor.kit.skill = equipment.skill ?? actor.kit.skill;
    actor.kit.item = equipment.item ?? actor.kit.item;
    actor.life = new OriginalLife(loadoutStats(actor.kit).health);
    actor.stealthFrames = 0;
    actor.skillFrames = 0; actor.skillCooldown = 0; actor.itemCooldown = 0;
    actor.itemCharges = ITEMS[actor.kit.item].charges;
    actor.shield = undefined;
    actor.arsenal = new Arsenal(equipment.primary, equipment.primary, isSpecialOffhand(equipment.secondary) ? equipment.primary : equipment.secondary);
    actor.offhand = isSpecialOffhand(equipment.secondary) ? new OffhandController(SPECIAL_OFFHANDS[equipment.secondary].kind, equipment.secondary) : undefined;
  }
  /** Internal trusted checkpoint, separate from the public rendering snapshot. */
  checkpoint() {
    const rng = this.random as StatefulRandom;
    if (typeof rng.state !== 'function') throw Error('A stateful random source is required');
    return structuredClone({ version: 1 as const, id: this.id, mission: this.mission, difficulty: this.difficulty,
      startingWeapon: this.startingWeapon, loadout: this.loadout, random: rng.state(), frame: this.frame,
      phase: this.phase, reason: this.reason, scores: this.scores, objective: this.objective, waves: this.waves?.snapshot(),
      modeState: this.mode.checkpoint(), matchResult: this.matchResult, phaseMs: this.phaseMs, jumpHeld: [...this.jumpHeld], hitboxHistory: this.hitboxHistory.checkpoint(),
      effects: this.effects, events: this.events, journal: this.journal.checkpoint(), bursts: this.bursts, notice: this.notice, noticeFrame: this.noticeFrame,
      grenades: this.grenades.map(({ source, ...g }) => ({ ...g, sourceId: source.id })),
      projectiles: this.projectiles, growthV3: this.growthV3?.checkpoint() as GrowthBattleCheckpoint | undefined,
      actors: this.actors.map(({ movement, life, arsenal, offhand, ...a }) => ({ ...a, offhand: offhand?.checkpoint(), movement: movement.checkpoint(),
        life: { ...life.snapshot(), maxHealth: life.maxHealth }, arsenal: arsenal.checkpoint() })) });
  }
  static restore(saved: ReturnType<Battle['checkpoint']>) {
    if (saved.version !== 1) throw Error('Unsupported checkpoint version');
    const state = structuredClone(saved), rng = createRandom(0); rng.restore(state.random);
    const battle = new Battle(state.mission, state.difficulty, state.startingWeapon, rng, state.loadout, state.id);
    battle.actors = state.actors.map(({ movement, life, arsenal, offhand, ...a }) => ({ ...a, offhand: offhand ? OffhandController.restore(offhand) : undefined,
      movement: Object.assign(new OriginalMovement(battle.wall, battle.mission.stairTreads, battle.mission.portals), movement),
      life: Object.assign(new OriginalLife(life.maxHealth), life), arsenal: Arsenal.restore(arsenal) }));
    battle.frame = state.frame; battle.phase = state.phase; battle.reason = state.reason;
    battle.scores = state.scores; battle.objective = state.objective; battle.mode.restore(state.modeState); battle.matchResult = state.matchResult;
    battle.phaseMs = state.phaseMs; battle.jumpHeld = new Map(state.jumpHeld);
    battle.hitboxHistory.restore(state.hitboxHistory ?? []);
    if (state.waves) battle.waves!.restore(state.waves);
    battle.effects = state.effects; battle.events = state.events; battle.bursts = state.bursts;
    battle.journal.restore(state.journal);
    battle.notice = state.notice; battle.noticeFrame = state.noticeFrame;
    battle.projectiles = state.projectiles ?? [];
    battle.grenades = state.grenades.map(({ sourceId, ...g }) => {
      const source = battle.actors.find(a => a.id === sourceId);
      if (!source) throw Error('Missing grenade source');
      return { ...g, source };
    });
    if (state.growthV3) battle.growthV3 = GrowthBattleCoordinator.restore(battle, state.growthV3, battle.growthV3Ports());
    return battle;
  }
  /** Neutral result for sessions; phase remains the legacy blue-side campaign adapter. */
  get result() { return this.matchResult; }
  objectiveBotGoal(actor: Actor) { return this.mode.botGoal(this, undefined, actor); }
  releaseObjective(actorId: string) { this.applyObjectiveEvents(this.mode.releaseActor?.(actorId) ?? []); }
  private applyObjectiveEvents(events: DeliveryEvent[]) {
    for (const event of events) {
      const carrier = this.actors.find(a => a.id === event.actorId);
      if (carrier) {
        if (event.kind === 'pickup') this.growthV3?.carryObjective(carrier.id);
        if (event.kind === 'pickup') {
          carrier.stealthFrames = 0;
          carrier.deliveryPreviousWeapon = carrier.arsenal.selected;
          if (carrier.offhand) {
            carrier.deliveryPreviousOffhand = carrier.offhand.equipped;
            carrier.offhand.select(true, carrier.offhand.triggerHeld, true);
          }
          if (carrier.kit?.skill === 'cloak') carrier.skillFrames = 0;
          if (carrier.arsenal.selected !== carrier.arsenal.secondary) carrier.arsenal.swap();
        } else {
          if (carrier.deliveryPreviousWeapon !== undefined && carrier.arsenal.selected !== carrier.deliveryPreviousWeapon) carrier.arsenal.swap();
          delete carrier.deliveryPreviousWeapon;
          if (carrier.offhand && carrier.deliveryPreviousOffhand !== undefined) carrier.offhand.select(carrier.deliveryPreviousOffhand, carrier.offhand.triggerHeld, true);
          delete carrier.deliveryPreviousOffhand;
        }
      }
      this.journal.emit({ tick: this.frame,
        kind: event.kind === 'pickup' ? 'objective-pickup' : event.kind === 'delivery' ? 'objective-delivery' : 'objective-return',
        actorId: event.actorId, targetId: `delivery-${event.targetTeam}` });
    }
  }
  endMatch(winner: 1 | 2 | null, reason: string) {
    if (this.matchResult) return;
    this.matchResult = { winner, draw: winner === null, reason, tick: this.frame };
    this.phase = winner === 1 ? 'won' : 'lost'; this.reason = reason;
    this.journal.emit({ tick: this.frame, kind: 'result' }); this.releaseInput();
  }
  /** Server-owned public debug room admission; IDs come from authenticated connections. */
  addDebugPlayer(id: string, name: string, team: 1 | 2) {
    if (this.growthV3) throw Error('Growth roster is locked for this match');
    if (!this.mission.debug || this.actors.some(a => a.id === id)) throw Error('Invalid debug admission');
    this.addActor(id, name, team, true, this.actors.filter(a => a.team === team).length);
    this.reconfigureDebugActor(this.actors.find(a => a.id === id)!, { classId: 'medic', primary: 'm4', secondary: 'usp' });
  }
  private addActor(id: string, name: string, team: 1 | 2, human: boolean, index: number, location?: Point) {
    const spawn = location ?? this.mission.spawns[team - 1][index % this.mission.spawns[team - 1].length];
    const movement = new OriginalMovement(this.wall, this.mission.stairTreads, this.mission.portals); movement.reset(spawn.x, spawn.y);
    const kit = human && this.loadout ? structuredClone(this.loadout) : null;
    if (kit && isSpecialOffhand(kit.secondary) && !canEquipOffhand(kit.classId, kit.secondary)) throw Error('Offhand is not allowed for this class');
    const stats = kit ? loadoutStats(kit) : { health: 85, aim: 0.7, ammo: 0.9 };
    this.actors.push({ id, name, team, human, movement, life: new OriginalLife(stats.health),
      arsenal: kit ? new Arsenal(kit.primary, kit.primary, isSpecialOffhand(kit.secondary) ? kit.primary : kit.secondary, stats.ammo) : new Arsenal(human ? this.startingWeapon : 'm4'),
      offhand: kit && isSpecialOffhand(kit.secondary) ? new OffhandController(SPECIAL_OFFHANDS[kit.secondary].kind, kit.secondary) : undefined,
      kit, stealthFrames: 0, skillCooldown: 0, skillFrames: 0, itemCharges: kit ? ITEMS[kit.item].charges : 0, itemCooldown: 0,
      aim: { x: spawn.x + (team === 1 ? 300 : -300), y: spawn.y - 42 }, kills: 0, supplyReady: 0,
      brain: { target: null, acquired: 0, offset: 0, lastX: spawn.x, stuck: 0, state: 'advance' } });
  }
  swap(actor = this.player) {
    if (this.growthV3) { this.growthV3.enqueue(actor.id, 'swap'); return; }
    if (this.phase !== 'running' || !actor.life.alive || actor.deliveryPreviousWeapon !== undefined) return;
    if (actor.offhand && actor.offhand.kind !== 'firearm') {
      if (actor.offhand.select(!actor.offhand.equipped, actor.offhand.triggerHeld)) actor.arsenal.gun.cancelReload();
    } else actor.arsenal.swap();
    if (actor.growth) actor.growth.metrics.switches++;
    if (actor.growth?.perks.includes('preparedSidearm') && actor.arsenal.selected === 'usp' && this.frame >= (actor.growth.cooldowns.preparedSidearm ?? 0)) {
      const gun = actor.arsenal.gun, rounds = Math.min(2, gun.reserveAmmo, gun.weapon.magazineSize - gun.ammo);
      gun.ammo += rounds; gun.reserveAmmo -= rounds; actor.growth.cooldowns.preparedSidearm = this.frame + 150;
    }
    this.journal.emit({ tick: this.frame, kind: 'swap', actorId: actor.id, weapon: actor.arsenal.selected });
    if (actor.arsenal.gun.reloadFrames) this.reloadEvent(actor);
  }
  private reloadEvent(actor: Actor) {
    if (actor.growth) { if (actor.arsenal.gun.ammo > 0) actor.growth.metrics.tacticalReloads++; else actor.growth.metrics.emptyReloads++; }
    this.journal.emit({ tick: this.frame, kind: 'reload', actorId: actor.id, weapon: actor.arsenal.selected, duration: actor.arsenal.gun.reloadFrames, emptyMagazine: actor.arsenal.gun.ammo === 0 }); }
  reload(actor = this.player) {
    if (this.growthV3) { this.growthV3.enqueue(actor.id, 'reload'); return; }
    if (this.phase === 'running' && actor.life.alive && (!actor.offhand || actor.offhand.permitsGunfire)
      && actor.arsenal.gun.reload()) {
      if (actor.growth) actor.arsenal.gun.reloadFrames = Math.ceil(actor.arsenal.gun.reloadFrames * growthReloadScale(actor));
      actor.stealthFrames = 0; this.reloadEvent(actor);
    }
  }
  private say(message: string) { this.notice = message; this.noticeFrame = this.frame; }
  useSkill(actor = this.player) {
    if (this.growthV3) return this.growthV3.enqueue(actor.id, 'skill');
    if (actor.growth) {
      if (this.phase !== 'running' || !actor.life.alive || actor.skillCooldown) return false;
      if (actor.growth.classId === 'medic') return medicPulse(this, actor, this.random);
      const definition = GROWTH_CLASSES[actor.growth.classId], quick = actor.growth.selected.includes('quickScope');
      actor.skillCooldown = Math.ceil(definition.cooldown * (quick ? .8 : 1)); actor.skillFrames = quick ? 60 : definition.duration;
      if (actor.growth.selected.includes('combatRecovery')) actor.life.health = Math.min(actor.life.maxHealth, actor.life.health + 6);
      if (actor.growth.selected.includes('rollingReserve')) growthReserve(actor, 6);
      if (actor.growth.selected.includes('focusReserve')) growthReserve(actor, 2);
      if (actor.growth.selected.includes('slideReload')) {
        const gun = actor.arsenal.gun, rounds = Math.min(3, gun.reserveAmmo, gun.weapon.magazineSize - gun.ammo);
        gun.ammo += rounds; gun.reserveAmmo -= rounds;
      }
      this.journal.emit({ tick: this.frame, kind: 'skill', actorId: actor.id, ability: actor.growth.classId === 'assault' ? 'combatRoll' : actor.growth.classId === 'tank' ? 'barrier' : 'focus' });
      this.bursts.push({ x: actor.movement.x, y: actor.movement.y - 30, frame: this.frame, radius: 45, color: 0x65d8ef });
      return true;
    }
    if (this.phase !== 'running' || !actor.life.alive || !actor.kit) return false;
    if (SKILLS[actor.kit.skill].passive) return false;
    if (actor.deliveryPreviousWeapon !== undefined && actor.kit.skill === 'cloak') return false;
    if (actor.skillCooldown) { if (actor.human) this.say('技能冷却中'); return false; }
    const skill = SKILLS[actor.kit.skill];
    const nearby = this.actors.filter(a => a.team === actor.team && a.life.alive && Math.hypot(a.movement.x - actor.movement.x, a.movement.y - actor.movement.y) < 180);
    let changed = true;
    if (actor.kit.skill === 'heal') {
      changed = false;
      for (const ally of nearby) if (ally.life.health < ally.life.maxHealth) { ally.life.health = Math.min(ally.life.maxHealth, ally.life.health + 40); changed = true; }
    } else if (actor.kit.skill === 'supply') {
      changed = false; for (const ally of nearby) changed = ally.arsenal.resupply() || changed;
    }
    if (!changed) { if (actor.human) this.say('当前无需治疗或补给'); return false; }
    actor.skillCooldown = skill.cooldown; actor.skillFrames = skill.duration;
    this.journal.emit({ tick: this.frame, kind: 'skill', actorId: actor.id, ability: actor.kit.skill });
    this.bursts.push({ x: actor.movement.x, y: actor.movement.y - 30, frame: this.frame, radius: 70, color: CLASSES[actor.kit.classId].color });
    if (actor.human) this.say(`${skill.name}已发动`); return true;
  }
  useItem(aim: Point = this.player.aim, actor = this.player) {
    if (this.growthV3) return this.growthV3.enqueue(actor.id, 'item', aim);
    if (this.phase !== 'running' || !actor.life.alive || !actor.kit && !actor.growth || actor.itemCooldown) return false;
    if (actor.itemCharges <= 0) { this.say('本次出战道具已耗尽'); return false; }
    const item = actor.growth ? 'frag' : actor.kit!.item;
    if (item === 'medkit') {
      if (actor.life.health >= actor.life.maxHealth) { this.say('生命已满'); return false; }
      actor.life.health = Math.min(actor.life.maxHealth, actor.life.health + 40);
    } else if (item === 'ammo') {
      if (!actor.arsenal.resupply()) { this.say('备用弹药已满'); return false; }
    } else {
      const origin = { x: actor.movement.x, y: actor.movement.y - 40 };
      const angle = Math.atan2(aim.y - origin.y, aim.x - origin.x);
      this.grenades.push({ source: actor, ...origin, vx: Math.cos(angle) * 13, vy: Math.sin(angle) * 13 - 5, fuse: 45 });
    }
    actor.itemCharges--; actor.itemCooldown = 30;
    this.journal.emit({ tick: this.frame, kind: 'item', actorId: actor.id, ability: item });
    this.say(`${ITEMS[item].name}已使用`); return true;
  }
  forgetActorInput(id: string) { this.jumpHeld.delete(id); }
  releaseInput() { for (const actor of this.actors) { actor.arsenal.setTrigger(false); actor.offhand?.releaseTrigger(); } this.jumpHeld.clear(); }
  private hitboxes(): HistoricalHitbox[] {
    return this.actors.map(a => ({ id: a.id, team: a.team, position: { x: a.movement.x, y: a.movement.y }, alive: a.life.alive,
      crouching: a.movement.crouching, generation: a.life.deaths, protected: a.life.spawnProtectionFrames > 0 }));
  }
  private spawn(actor: Actor) {
    this.journal.emit({ tick: this.frame, kind: 'respawn', actorId: actor.id });
    actor.stealthFrames = 0;
    const enemies = this.actors.filter(a => a.team !== actor.team && a.life.alive);
    const safety = (p: Point) => Math.min(...enemies.map(a => Math.hypot(a.movement.x - p.x, a.movement.y - p.y)), 9999);
    const occupied = (p: Point) => this.actors.some(a => a !== actor && a.life.alive && Math.abs(a.movement.x - p.x) < 36 && Math.abs(a.movement.y - p.y) < 70);
    const choices = [...this.mission.spawns[actor.team - 1]].sort((a, b) => Number(occupied(a)) - Number(occupied(b)) || safety(b) - safety(a));
    const spawn = choices[0]; actor.movement.reset(spawn.x, spawn.y);
    actor.arsenal = actor.kit ? new Arsenal(actor.kit.primary, actor.kit.primary, isSpecialOffhand(actor.kit.secondary) ? actor.kit.primary : actor.kit.secondary, loadoutStats(actor.kit).ammo) : new Arsenal(actor.human ? this.startingWeapon : 'm4');
    if (actor.equipment) {
      const e = actor.equipment;
      actor.arsenal = new Arsenal(e.primary, e.primary, isSpecialOffhand(e.secondary) ? e.primary : e.secondary);
    }
    actor.skillFrames = 0;
    if (actor.growth) { actor.arsenal = new Arsenal(actor.growth.primary, actor.growth.primary, 'usp', GROWTH_RULES.ammo, growthWeaponConfigs({ ...actor.growth })); actor.movement.speedScale = GROWTH_CLASSES[actor.growth.classId].speed;
      for (const stat of Object.values(actor.growth.weaponMetrics)) stat.magazineKills = 0; }
    if (actor.offhand) actor.offhand = new OffhandController(actor.offhand.kind, actor.offhand.id);
    actor.aim = { x: spawn.x + (actor.team === 1 ? 300 : -300), y: spawn.y - 42 };
    actor.brain.target = null; actor.brain.stuck = 0;
    actor.brain.route = undefined;
  }
  /** Shared damage path for bullets and environmental falls. */
  damage(target: Actor, amount: number, source?: Actor, explosive = false) {
    return this.applyDamage(target, { kind: source ? explosive ? 'explosion' : 'bullet' : 'environment', amount,
      sourceId: source?.id, origin: source ? { x: source.movement.x, y: source.movement.y } : undefined,
      hitPoint: { x: target.movement.x, y: target.movement.y } });
  }
  private reflectShot(defender: Actor, damage: DamageContext) {
    const center = { x: defender.movement.x, y: defender.movement.y - (defender.movement.crouching ? 28 : 42) };
    const normalAngle = Math.atan2(defender.aim.y - center.y, defender.aim.x - center.x);
    const incomingAngle = Math.atan2(center.y - damage.origin!.y, center.x - damage.origin!.x);
    // Reflect about the shield normal, with the original +/-10 degree scatter.
    const angle = 2 * normalAngle - incomingAngle + Math.PI + (this.random() * 20 - 10) * Math.PI / 180;
    const origin = { ...damage.hitPoint! };
    const trace = traceBulletLine({ origin, aim: { x: origin.x + Math.cos(angle) * 100, y: origin.y + Math.sin(angle) * 100 },
      source: defender.id, sourceTeam: defender.team, units: this.hitboxes(),
      rangeUnits: this.actors.find(a => a.id === damage.sourceId)?.arsenal.gun.weapon.rangeUnits ?? 60, random: this.random,
      isOpaqueWall: point => this.wall(point.x, point.y) });
    const hit = trace.hit;
    const victim = hit?.type === 'unit' ? this.actors.find(a => a.id === hit.target) : undefined;
    const before = victim?.life.health ?? 0;
    const killed = victim ? this.applyDamage(victim, { ...damage, sourceId: defender.id, origin, hitPoint: trace.end, reflected: true }) : false;
    // Preserve source identity for visibility filtering; render from the impact.
    this.effects.push({ frame: this.frame, actorId: defender.id, reflected: true, team: defender.team, trace, damage: before - (victim?.life.health ?? 0), killed });
  }
  applyDamage(target: Actor, context: DamageContext) {
    if (this.phase !== 'running') return false;
    if (this.growthV3) return this.growthV3.directDamage(target, context);
    validateDamageContext(context);
    const source = context.sourceId ? this.actors.find(actor => actor.id === context.sourceId) : undefined;
    if (context.sourceId && !source) throw Error('Damage source is not in this match');
    let amount = context.amount;
    const explosive = context.kind === 'explosion';
    if (this.phase !== 'running' || (source && source.team === target.team)) return false;
    const shield = target.offhand?.kind === 'shield' ? target.offhand.shield : target.shield;
    if (shield && target.life.alive && !target.life.spawnProtectionFrames) {
      const definition = target.offhand?.definition;
      const defense = interceptShield(shield, { x: target.movement.x, y: target.movement.y - (target.movement.crouching ? 28 : 42) }, target.aim, context,
        definition?.kind === 'shield' ? definition : undefined, this.random);
      amount = defense.amount;
      if (defense.blocked > 0) {
        this.bursts.push({ ...context.hitPoint!, frame: this.frame, radius: 12, color: 0xb9eaff });
        this.journal.emit({ tick: this.frame, kind: 'block', actorId: source?.id, targetId: target.id });
      }
      if (defense.reflected) this.reflectShot(target, context);
    }
    if (source && target.life.alive && !target.life.spawnProtectionFrames && target.kit) {
      if (explosive && target.kit.classId === 'tank') amount *= 0.7;
      if (target.skillFrames && target.kit.skill === 'barrier') amount *= 0.5;
      if (target.skillFrames && target.kit.skill === 'iron' && amount > 0) { amount *= 0.2; target.skillFrames = 0; }
      if (target.kit.skill === 'cloak' && amount > 0) target.skillFrames = 0;
    }
    if (target.growth && source && target.life.alive && !target.life.spawnProtectionFrames && amount > 0) {
      const before = amount; amount = growthIncoming(target, amount, explosive, this.frame);
      target.growth.lastDamageTick = this.frame;
      if (amount < before) { this.journal.emit({ tick: this.frame, kind: 'block', actorId: target.id }); this.bursts.push({ x: target.movement.x, y: target.movement.y - 30, frame: this.frame, radius: 22, color: 0x88ddee }); }
    }
    const beforeHealth = target.life.health;
    if (target.growth) target.growth.healableDamage = Math.min(target.growth.healableDamage, target.life.maxHealth - beforeHealth);
    const killed = target.life.damage(amount, !source);
    if (target.growth && source && source.team !== target.team && target.life.health < beforeHealth) target.growth.healableDamage += beforeHealth - target.life.health;
    if (target.growth && source && target.life.health < beforeHealth) target.growth.attackers[source.id] = this.frame;
    // Coarse incoming sector, never the hidden attacker's precise position.
    const direction = context.origin ? Math.round(Math.atan2(context.origin.y - target.movement.y, context.origin.x - target.movement.x) / (Math.PI / 4)) * 45 : undefined;
    const cause = context.kind === 'environment' ? '战场环境' : context.weapon ? WEAPONS[context.weapon].name : context.kind === 'explosion' ? '破片手雷 / 爆炸'
      : context.kind === 'melee' ? (source?.offhand?.id ? SPECIAL_OFFHANDS[source.offhand.id].name : '近战') : source ? WEAPONS[source.arsenal.selected].name : '未知武器';
    if (target.life.health < beforeHealth) this.journal.emit({ tick: this.frame, kind: 'damage', actorId: source?.id, targetId: target.id, amount: beforeHealth - target.life.health, direction });
    if (target.kit?.classId === 'medic' && target.life.regenDelay > 60) target.life.regenDelay = 60;
    if (killed) {
      if (target.growth) {
        target.growth.healableDamage = 0;
        for (const participant of this.actors) {
          if (!participant.growth || participant.team === target.team) continue;
          const contributed = participant === source || this.frame - (target.growth.attackers[participant.id] ?? -1000) <= 240;
          if (!contributed) continue;
          this.awardGrowthXp(participant, participant === source ? GROWTH_RULES.killXp : GROWTH_RULES.assistXp);
          if (participant === source && this.mission.mode === 'dom' && Math.hypot(target.movement.x - this.mission.objective.x, target.movement.y - this.mission.objective.y) < 120) this.awardGrowthXp(participant, 80);
        }
        target.growth.attackers = {}; target.growth.momentumUntil = 0; target.growth.armor = 0; target.growth.ghostUntil = 0; target.growth.landingUntil = 0; target.growth.killStreak = 0; target.growth.headshotStreak = 0; target.growth.stationaryTicks = 0; target.movement.speedScale = GROWTH_CLASSES[target.growth.classId].speed;
      }
      if (source?.growth && source.life.alive) {
        const g = source.growth;
        g.killStreak++; g.metrics.bestKillStreak = Math.max(g.metrics.bestKillStreak, g.killStreak);
        g.headshotStreak = context.headshot ? g.headshotStreak + 1 : 0;
        g.metrics.bestHeadshotStreak = Math.max(g.metrics.bestHeadshotStreak, g.headshotStreak);
        if (context.headshot) g.metrics.headshotKills++;
        if (Math.abs(source.movement.vx) > .5) g.metrics.movingKills++;
        if (source.life.health < source.life.maxHealth * .25) g.metrics.lowHealthKills++;
        if (source.life.health < source.life.maxHealth * .1) g.metrics.criticalHealthKills++;
        if (context.kind === 'bullet' && context.weapon && Object.hasOwn(GROWTH_WEAPONS, context.weapon)) {
          const stat = g.weaponMetrics[context.weapon as GrowthWeaponId] ??= freshWeaponMetrics(); stat.kills++; stat.magazineKills++;
          g.metrics.bestMagazineKills = Math.max(g.metrics.bestMagazineKills, stat.magazineKills);
          if (context.weapon === 'usp') { const saved = source.arsenal.checkpoint(); if (saved.guns.find(gun => gun.id === source.arsenal.primary)?.state.ammo === 0) g.metrics.sidearmKills++; }
        }
        if (g.perks.includes('fieldDressing') && source.life.health < source.life.maxHealth / 2 && this.frame >= (g.cooldowns.fieldDressing ?? 0)) { source.life.health = Math.min(source.life.maxHealth, source.life.health + 5); g.cooldowns.fieldDressing = this.frame + 300; }
        if (g.selected.includes('reserveDrill')) growthReserve(source, 10);
        if (g.selected.includes('momentum') || g.selected.includes('relocate')) g.momentumUntil = this.frame + 90;
        if (g.classId === 'assault' && g.ultimate && this.frame >= g.berserkerReady) {
          source.life.health = Math.min(source.life.maxHealth, source.life.health + 15);
          g.momentumUntil = this.frame + 90; g.berserkerReady = this.frame + 150;
          this.bursts.push({ x: source.movement.x, y: source.movement.y - 30, frame: this.frame, radius: 65, color: 0xf6a552 });
        }
      }
      target.stealthFrames = 0;
      if (this.waves && target.team === 1) this.waves.reserveRevive(target.id);
      target.deathInfo = { sourceName: source?.name ?? '环境伤害', cause };
      this.journal.emit({ tick: this.frame, kind: 'death', actorId: source?.id, targetId: target.id, ...target.deathInfo });
      target.skillFrames = 0;
      if (source) {
        source.kills++;
      }
      this.mode.onDeath(this, target, source);
      this.events.unshift({ frame: this.frame, text: source ? `${source.name} 击败 ${target.name}` : `${target.name} 掉出了战场`, team: source?.team ?? 0 });
      this.events.length = Math.min(this.events.length, 4);
    }
    return killed;
  }
  advance(deltaMs: number, input: BattleInput) {
    if (!Number.isFinite(deltaMs) || deltaMs < 0) throw new RangeError('Invalid battle delta');
    if (this.phase !== 'running') return;
    this.phaseMs += deltaMs;
    while (this.phaseMs + 1e-7 >= COMBAT_FRAME_MS && this.phase === 'running') { this.phaseMs -= COMBAT_FRAME_MS; this.tick(input); }
  }
  tick(input: BattleInput) { this.tickPlayers(new Map([[this.player.id, input]])); }
  /** Missing human commands are neutral; AI retains its own controller. */
  tickPlayers(inputs: ReadonlyMap<string, BattleInput>, shotFrames: ReadonlyMap<string, number> = new Map(), instantHumanAim = false) {
    if (this.phase !== 'running') return;
    this.hitboxHistory.record(this.frame, this.hitboxes());
    this.frame++;
    this.effects = this.effects.filter(effect => this.frame - effect.frame < 20);
    this.bursts = this.bursts.filter(b => this.frame - b.frame < 18);
    if (this.growthV3) {
      this.growthV3.step(inputs, shotFrames);
      const events = this.mode.tick(this);
      if (events) this.applyObjectiveEvents(events);
      this.growthV3.afterMode();
      const result = resolveResult(this);
      if (result) this.endMatch(result.winner, result.reason);
      return;
    }
    for (const actor of this.actors) {
      const input = inputs.get(actor.id) ?? { ...idleInput(), aim: actor.aim };
      const growth = actor.growth;
      if (growth) {
        // Bots use the same authority-generated offers and selection effects.
        if (!actor.human && growth.offer) this.growthChoice(actor.id, growth.offer.batch,
          growth.offer.cards[Math.floor(this.random() * growth.offer.cards.length)]);
        if (!growth.ultimate && this.frame >= GROWTH_RULES.ultimateTick) {
          growth.ultimate = true;
          this.bursts.push({ x: actor.movement.x, y: actor.movement.y - 30, frame: this.frame, radius: 90, color: 0xf6a552 });
        }
        actor.movement.speedScale = actor.life.alive ? growthSpeed(actor, this.frame) : GROWTH_CLASSES[growth.classId].speed;
        if (this.frame >= growth.armorUntil) growth.armor = 0;
        if (actor.life.alive && growth.selected.includes('anchorArmor') && growth.stationaryTicks >= 60 && this.frame >= (growth.cooldowns.anchorArmor ?? 0)) { growth.armor = Math.max(growth.armor, 10); growth.armorUntil = this.frame + 90; growth.cooldowns.anchorArmor = this.frame + 450; }
        if (actor.life.alive && growth.selected.includes('fieldRepair') && this.frame - growth.lastDamageTick >= 180 && growth.stationaryTicks >= 30) actor.life.health = Math.min(actor.life.maxHealth, actor.life.health + .1);
        if (actor.life.alive && growth.selected.includes('scavenger')) for (const corpse of this.actors) {
          if (corpse.life.alive || corpse.team === actor.team || growth.scavenged[corpse.id] === corpse.life.deaths
            || Math.hypot(actor.movement.x - corpse.movement.x, actor.movement.y - corpse.movement.y) > 80) continue;
          const gun = actor.arsenal.gun, max = Math.ceil(gun.weapon.magazineSize * (gun.weapon.spareMagazines + 1) * GROWTH_RULES.ammo) - gun.weapon.magazineSize;
          if (gun.reserveAmmo >= max) continue;
          gun.reserveAmmo = Math.min(max, gun.reserveAmmo + Math.ceil(gun.weapon.magazineSize / 2));
          growth.scavenged[corpse.id] = corpse.life.deaths;
          this.journal.emit({ tick: this.frame, kind: 'supply', actorId: actor.id });
        }
      }
      const heldJump = this.jumpHeld.get(actor.id) ?? false;
      this.jumpHeld.set(actor.id, input.jump);
      if (actor.skillCooldown) actor.skillCooldown--;
      if (actor.itemCooldown) actor.itemCooldown--;
      if (!actor.life.alive) {
        actor.offhand?.releaseTrigger();
        if (this.waves && (actor.team === 2 || !this.waves.canRevive(actor.id))) continue;
        if (actor.life.tick()) { this.spawn(actor); this.waves?.revived(actor.id); if (actor.human && input.fire) { actor.arsenal.setTrigger(true); actor.arsenal.swap(); actor.arsenal.swap(); } }
        continue;
      }
      actor.life.tick();
      if (growth) growth.healableDamage = Math.min(growth.healableDamage, actor.life.maxHealth - actor.life.health);
      if (actor.skillFrames && actor.kit?.skill === 'regenerate') actor.life.health = Math.min(actor.life.maxHealth, actor.life.health + 1 / 3);
      const decision = actor.human ? { input, actions: [] } : botInput({ ...this, mode: this.mode, random: this.random }, actor);
      for (const action of decision.actions) { if (action === 'swap') this.swap(actor); if (action === 'reload') this.reload(actor); }
      const control = decision.input;
      if (growth) {
        growth.stationaryTicks = !control.left && !control.right && !actor.movement.jumping && Math.abs(actor.movement.vx) < .1 ? growth.stationaryTicks + 1 : 0;
        if (!actor.human && (actor.brain.target || growth.classId === 'medic') && !actor.skillCooldown && (growth.classId !== 'assault' || !control.fire)) this.useSkill(actor);
        if (growth.selected.includes('quickHands') && (control.left || control.right) && Math.abs(actor.movement.vx) > .5 && this.frame % 3 === 0 && actor.arsenal.gun.reloadFrames > 1) actor.arsenal.gun.reloadFrames--;
      }
      const previousX = actor.movement.x, previousY = actor.movement.y;
      const wasJumping = actor.movement.jumping;
      const wasReloading = actor.arsenal.gun.reloadFrames > 0;
      if (control.jump && (!actor.human || !heldJump)) actor.movement.jump();
      actor.movement.tick(control);
      const m = actor.movement;
      if (growth && Math.abs(m.vx) > .5) growth.metrics.movingTicks++;
      if (!wasJumping && m.jumping && m.vy < 0) this.journal.emit({ tick: this.frame, kind: 'jump', actorId: actor.id });
      if (wasJumping && !m.jumping && growth) growth.landingUntil = this.frame + 30;
      if (wasJumping && !m.jumping) this.journal.emit({ tick: this.frame, kind: 'land', actorId: actor.id });
      if (!m.jumping && !m.crouching && Math.abs(m.x - previousX) > .5 && this.frame % 10 === 0) this.journal.emit({ tick: this.frame, kind: 'footstep', actorId: actor.id });
      m.x = Math.max(20, Math.min(this.mission.width - 20, m.x));
      if (m.y > (this.mission.killY ?? (this.mission.height ?? 700) + 140)) { this.damage(actor, 9999); continue; }
      actor.aim.x += (control.aim.x - actor.aim.x) * (actor.human && instantHumanAim ? 1 : 0.5);
      actor.aim.y += (control.aim.y - actor.aim.y) * (actor.human && instantHumanAim ? 1 : 0.5);
      const offhand = actor.offhand, attackSerial = offhand?.attackSerial;
      const meleeHits = offhand?.tick({ alive: actor.life.alive, fire: control.fire, sourceId: actor.id, team: actor.team,
        origin: { x: m.x, y: m.y - (m.crouching ? 28 : 42) }, aim: actor.aim, wall: this.wall,
        targets: this.actors.map(a => ({ id: a.id, team: a.team, alive: a.life.alive,
          position: { x: a.movement.x, y: a.movement.y - (a.movement.crouching ? 28 : 42) } })) }) ?? [];
      if (offhand && offhand.attackSerial !== attackSerial) {
        this.journal.emit({ tick: this.frame, kind: 'melee', actorId: actor.id });
        if (this.waves) actor.life.spawnProtectionFrames = 0;
        if (actor.kit?.skill === 'cloak') actor.skillFrames = 0;
      }
      for (const hit of meleeHits) {
        const target = this.actors.find(a => a.id === hit.targetId);
        if (target) { this.applyDamage(target, hit.damage); this.journal.emit({ tick: this.frame, kind: 'melee-hit', actorId: actor.id, targetId: target.id }); }
      }
      actor.arsenal.setTrigger(control.fire && (!growth || growth.classId !== 'assault' || !actor.skillFrames) && (!offhand || offhand.permitsGunfire));
      const traces = actor.arsenal.tick(actor.id, actor.team, { x: m.x, y: m.y - (m.crouching ? 28 : 42) }, actor.aim,
        { crouching: m.crouching, airborne: m.jumping, moving: m.vx !== 0, aimStat: growth ? GROWTH_CLASSES[growth.classId].aim : actor.kit ? loadoutStats(actor.kit).aim : 0.7 },
        this.hitboxHistory.resolve(this.frame, actor.human ? shotFrames.get(actor.id) : undefined, this.hitboxes()), this.wall, this.random,
        growth ? growthSpread(actor, this.frame)
          : actor.skillFrames && actor.kit?.skill === 'focus' ? 0.25 : 1);
      const weaponStat = growth ? growth.weaponMetrics[actor.arsenal.selected as GrowthWeaponId] ??= freshWeaponMetrics() : undefined;
      if (traces.length && growth) { growth.ghostUntil = 0; growth.metrics.shots++; weaponStat!.shots++; }
      if (traces.length) this.journal.emit({ tick: this.frame, kind: 'shot', actorId: actor.id, weapon: actor.arsenal.selected });
      if (!wasReloading && actor.arsenal.gun.reloadFrames) this.reloadEvent(actor);
      if (wasReloading && !actor.arsenal.gun.reloadFrames) {
        if (weaponStat) weaponStat.magazineKills = 0;
        this.journal.emit({ tick: this.frame, kind: 'reload-end', actorId: actor.id });
      }
      if (control.fire && (!offhand || offhand.permitsGunfire) && actor.arsenal.gun.ammo === 0 && !actor.arsenal.gun.reloadFrames && this.frame % 12 === 0) this.journal.emit({ tick: this.frame, kind: 'empty', actorId: actor.id });
      // Cooperative arrivals retain a safe entry window until they attack.
      // Apply equally to players and reinforcements, only on an actual shot.
      if (traces.length && this.waves) actor.life.spawnProtectionFrames = 0;
      if (traces.length && actor.kit?.skill === 'cloak') actor.skillFrames = 0;
      actor.stealthFrames = stepStealth(actor.stealthFrames ?? 0,
        actor.kit?.classId === 'assassin' && actor.kit.skill === 'stealth' && actor.deliveryPreviousWeapon === undefined,
        Math.abs(m.x - previousX) < .01 && Math.abs(m.y - previousY) < .01 && m.vx === 0 && m.vy === 0,
        m.crouching, m.jumping || m.climb !== 0,
        traces.length > 0 || !!offhand && offhand.attackSerial !== attackSerial,
        wasReloading || actor.arsenal.gun.reloadFrames > 0);
      let shotHit = false, shotHeadshot = false;
      for (const trace of traces) {
        if (WEAPONS[actor.arsenal.selected].projectile) {
          this.projectiles.push(launchProjectile(actor.id, actor.team, actor.arsenal.selected, trace.origin, trace.end, this.random,
            actor.skillFrames && actor.kit?.skill === 'overdrive' ? 1.2 : 1));
          // A zero-length effect drives the shared muzzle flash and shot animation without a hitscan tracer.
          this.effects.push({ frame: this.frame, actorId: actor.id, team: actor.team, trace: { ...trace, end: { ...trace.origin } }, damage: 0, killed: false });
          continue;
        }
        const targetId = trace.hit?.type === 'unit' ? trace.hit.target : null;
        const victim = this.actors.find(a => a.id === targetId);
        let amount = victim && !victim.life.spawnProtectionFrames ? actor.arsenal.gun.weapon.damage * (trace.headMarked ? 1.45 : 1) : 0;
        if (trace.headMarked && actor.kit?.classId === 'assassin') amount *= 1.25;
        if (actor.skillFrames && actor.kit?.skill === 'overdrive') amount *= 1.2;
        const before = victim?.life.health ?? 0;
        const killed = victim ? this.applyDamage(victim, { kind: 'bullet', amount, headshot: trace.headMarked, sourceId: actor.id, weapon: actor.arsenal.selected,
          origin: trace.origin, hitPoint: trace.end, attackId: `${actor.id}:${this.frame}:${actor.arsenal.shots}` }) : false;
        if (growth && victim && victim.life.health < before) { shotHit = true; shotHeadshot ||= trace.headMarked; growth.metrics.hitDistance += Math.round(Math.hypot(victim.movement.x - m.x, victim.movement.y - m.y)); }
        if (growth && trace.headMarked && victim && victim.life.health < before) {
          if (growth.selected.includes('hunterRecovery') && this.frame >= (growth.cooldowns.hunterRecovery ?? 0)) { actor.life.health = Math.min(actor.life.maxHealth, actor.life.health + 5); growth.cooldowns.hunterRecovery = this.frame + 90; }
          if (growth.selected.includes('precisionCycle') && this.frame >= (growth.cooldowns.precisionCycle ?? 0)) { actor.skillCooldown = Math.max(0, actor.skillCooldown - 60); growth.cooldowns.precisionCycle = this.frame + 30; }
          if (killed && growth.classId === 'sniper' && growth.ultimate && this.frame >= (growth.cooldowns.ghost ?? 0)) { growth.ghostUntil = this.frame + 90; growth.cooldowns.ghost = this.frame + 240; this.bursts.push({ x: m.x, y: m.y - 30, frame: this.frame, radius: 60, color: 0xbfa4ff }); }
        }
        this.effects.push({ frame: this.frame, actorId: actor.id, trace, team: actor.team, damage: before - (victim?.life.health ?? 0), killed });
      }
      if (growth && shotHit) { growth.metrics.hits++; weaponStat!.hits++; if (shotHeadshot) growth.metrics.headshots++; }
      const supply = this.mission.spawns[actor.team - 1][0];
      if (this.frame >= actor.supplyReady && Math.abs(m.x - supply.x) < 70 && Math.abs(m.y - supply.y) < 40) {
        const reloadBefore = actor.arsenal.gun.reloadFrames;
        if (actor.arsenal.resupply()) {
          this.journal.emit({ tick: this.frame, kind: 'supply', actorId: actor.id });
          if (growth?.perks.includes('resourceful')) actor.skillCooldown = Math.max(0, actor.skillCooldown - 30);
          if (growth?.perks.includes('supplyRunner')) growth.momentumUntil = this.frame + 60;
        }
        if (!reloadBefore && actor.arsenal.gun.reloadFrames) this.reloadEvent(actor);
        actor.supplyReady = this.frame + 300;
      }
    }
    for (const projectile of this.projectiles) {
      const impact = stepProjectile(projectile, this.hitboxes(), this.wall);
      if (!impact) continue;
      const definition = WEAPONS[projectile.weapon], rules = definition.projectile!;
      this.journal.emit({ tick: this.frame, kind: 'explosion', actorId: projectile.sourceId, position: { x: projectile.x, y: projectile.y }, weapon: projectile.weapon });
      this.bursts.push({ x: projectile.x, y: projectile.y, radius: rules.radius, frame: this.frame, color: 0xf5b267 });
      for (const target of this.actors) {
        const center = { x: target.movement.x, y: target.movement.y - 40 }, direct = target.id === impact.targetId;
        if (!target.life.alive || target.team === projectile.team || !direct && (Math.hypot(center.x - projectile.x, center.y - projectile.y) >= rules.radius || !clearSight(projectile, center, this.wall))) continue;
        this.applyDamage(target, { kind: 'explosion', sourceId: projectile.sourceId, weapon: projectile.weapon, origin: { x: projectile.x, y: projectile.y }, hitPoint: center,
          amount: definition.config.damage * projectile.damageScale * (direct ? 1 : rules.splashMultiplier) });
      }
    }
    this.projectiles = this.projectiles.filter(p => p.fuse > 0);
    for (const grenade of this.grenades) {
      const nx = grenade.x + grenade.vx, ny = grenade.y + grenade.vy;
      if (this.wall(nx, grenade.y) || nx < 0 || nx > this.mission.width) grenade.vx *= -0.5; else grenade.x = nx;
      if (this.wall(grenade.x, ny)) { grenade.vy = -Math.abs(grenade.vy) * 0.4; grenade.vx *= 0.8; } else grenade.y = ny;
      grenade.vy += 0.5;
      if (--grenade.fuse === 0) {
        this.journal.emit({ tick: this.frame, kind: 'explosion', actorId: grenade.source.id, position: { x: grenade.x, y: grenade.y } });
        this.bursts.push({ x: grenade.x, y: grenade.y, frame: this.frame, radius: 120, color: 0xf5b267 });
        for (const target of this.actors) {
          const center = { x: target.movement.x, y: target.movement.y - 30 };
          const distance = Math.hypot(center.x - grenade.x, center.y - grenade.y);
          if (target.team !== grenade.source.team && target.life.alive && distance < 120 && clearSight(grenade, center, this.wall)) this.applyDamage(target,
            { kind: 'explosion', amount: 65 * (1 - distance / 150), sourceId: grenade.source.id,
              origin: { x: grenade.x, y: grenade.y }, hitPoint: center });
        }
      }
    }
    this.grenades = this.grenades.filter(g => g.fuse > 0);
    // Resolve all actors and explosions before expiring effects on their final active frame.
    for (const actor of this.actors) if (actor.skillFrames) actor.skillFrames--;
    const objectiveEvents = this.mode.tick(this);
    if (objectiveEvents) this.applyObjectiveEvents(objectiveEvents);
    if (this.mission.mode === 'dom') for (const actor of this.actors) {
      const g = actor.growth; if (!g) continue;
      const holds = actor.life.alive && this.objective === (actor.team === 1 ? 'blue' : 'red') && Math.abs(actor.movement.x - this.mission.objective.x) < 85 && Math.abs(actor.movement.y - this.mission.objective.y) < 70;
      if (!holds) { g.objectiveTicks = 0; continue; }
      if (++g.objectiveTicks === 30 && this.frame >= g.captureReady) { this.awardGrowthXp(actor, 120); g.captureReady = this.frame + 900; }
      if (g.objectiveTicks % 150 === 0) this.awardGrowthXp(actor, 10);
    }
    if (this.waves) {
      // Keep grenade sources until their last projectile resolves so checkpoint
      // restoration never loses its source actor.
      this.actors = this.actors.filter(a => a.team === 1 || a.life.alive || this.grenades.some(g => g.source.id === a.id) || this.projectiles.some(p => p.sourceId === a.id));
      const players = this.actors.filter(a => a.team === 1);
      const needsSpawn = this.waves.advance(players.map(a => ({ id: a.id, alive: a.life.alive })), this.actors.filter(a => a.team === 2 && a.life.alive).length);
      if (needsSpawn) {
        const scenario = this.waves.snapshot().scenario;
        const location = coopSpawn(this.mission.spawns, this.actors.map(a => ({ team: a.team, alive: a.life.alive, position: a.movement })), scenario);
        if (location) {
          const serial = this.waves.spawned();
          this.addActor(`wave-enemy-${serial}`, `突击兵 ${serial}`, 2, false, 0, location);
        } else this.waves.blocked();
      }
      const wave = this.waves.snapshot();
      if (wave.phase === 'won') this.endMatch(1, '全部波次已清除');
      if (wave.phase === 'lost' || this.frame >= this.mission.seconds * 30) this.endMatch(2, '团队已无可用复活或行动超时');
    }
    const result = resolveResult(this);
    if (result) {
      this.matchResult = result;
      this.journal.emit({ tick: this.frame, kind: 'result' });
      this.phase = result.winner === 1 ? 'won' : 'lost';
      this.reason = result.reason; this.releaseInput();
    }
  }
  private awardGrowthXp(actor: Actor, xp: number) {
    const states = this.actors.flatMap(a => a.growth ? [a.growth] : []), average = states.reduce((sum, g) => sum + g.level, 0) / states.length;
    awardGrowth(actor.growth!, Math.round(xp * (average - actor.growth!.level >= 2 ? 1.1 : 1)), this.random, this.frame);
  }
  snapshot() {
    return { mission: this.mission.id, phase: this.phase, frame: this.frame, scores: [...this.scores], objective: this.objective, reason: this.reason, waves: this.waves?.snapshot(),
      ...(this.growthV3 ? { growthWorld: this.growthV3.worldView() } : {}),
      deliveryTargets: this.mission.mode === 'ctf' ? this.mode.checkpoint().delivery : undefined,
      seconds: Math.max(0, Math.ceil(this.mission.seconds - this.frame / 30)),
      actors: this.actors.filter(a => !this.growthV3?.participant(a.id).retired).map(a => ({ id: a.id, team: a.team, x: a.movement.x, y: a.movement.y, vx: a.movement.vx, vy: a.movement.vy,
        crouching: a.movement.crouching, jumping: a.movement.jumping, life: a.life.snapshot(), weapon: a.arsenal.selected,
        offhand: a.offhand?.view(), deathInfo: !a.life.alive ? a.deathInfo : undefined,
        ammo: a.arsenal.gun.ammo, reserve: a.arsenal.gun.reserveAmmo, reload: a.arsenal.gun.reloadFrames, kills: a.kills, shots: a.arsenal.shots, ai: a.brain.state,
        ...(this.growthV3 ? { growthV3: this.growthV3.actorView(a.id) } : {}),
        growth: this.growthV3 ? (({ classId, level, ultimate, ghost, armor }) => ({ classId, level, ultimate, ghost, armor }))(this.growthV3.actorView(a.id))
          : a.growth ? { classId: a.growth.classId, level: a.growth.level, ultimate: a.growth.ultimate, ghost: a.growth.ghostUntil > this.frame, armor: a.growth.armor } : undefined,
        classId: this.growthV3 ? this.growthV3.actorView(a.id).art : a.growth ? GROWTH_CLASSES[a.growth.classId].art : a.kit?.classId ?? null, stealthFrames: a.stealthFrames, maxHealth: a.life.maxHealth, skill: a.kit?.skill ?? null, skillCooldown: a.skillCooldown, skillFrames: a.skillFrames, item: a.growth ? 'frag' as const : a.kit?.item ?? null, itemCharges: a.itemCharges, itemCooldown: a.itemCooldown })) };
  }
}
