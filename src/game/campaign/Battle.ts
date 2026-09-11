import { OriginalMovement } from '../movement/OriginalMovement';
import { OriginalLife } from '../combat/OriginalLife';
import { COMBAT_FRAME_MS, type WeaponId } from '../combat/Combat';
import type { BulletTrace, Point, RandomSource, UnitHitbox } from '../combat/Ballistics';
import { Arsenal } from './Arsenal';
import { clearSight, nextWaypoint } from './Navigation';
import { wallFor, type Mission } from './Missions';
import { CLASSES, SKILLS, ITEMS, defaultLoadout, loadoutStats, type Loadout } from './Catalog';

export type Difficulty = 'easy' | 'normal' | 'hard';
export interface BattleInput { left: boolean; right: boolean; crouch: boolean; jump: boolean; fire: boolean; aim: Point }
export const idleInput = (): BattleInput => ({ left: false, right: false, crouch: false, jump: false, fire: false, aim: { x: 900, y: 555 } });
export interface Actor {
  id: string; name: string; team: 1 | 2; human: boolean; movement: OriginalMovement; life: OriginalLife;
  arsenal: Arsenal; aim: Point; kills: number; supplyReady: number;
  kit: Loadout | null; skillCooldown: number; skillFrames: number; itemCharges: number; itemCooldown: number;
  brain: { target: string | null; acquired: number; offset: number; lastX: number; stuck: number; state: string };
}
export interface BattleEvent { frame: number; text: string; team: number }
export interface ShotEffect { frame: number; trace: BulletTrace; team: number; damage: number; killed: boolean }
export interface Grenade { source: Actor; x: number; y: number; vx: number; vy: number; fuse: number }

export function seededRandom(seed: number): RandomSource {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t ^= t + Math.imul(t ^ t >>> 7, 61 | t); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

/** Offline 30Hz team battle. Difficulty changes bot perception, reaction and aim, never damage. */
export class Battle {
  readonly id = crypto.randomUUID();
  actors: Actor[] = [];
  frame = 0;
  phase: 'running' | 'won' | 'lost' = 'running';
  reason = '';
  scores: [number, number] = [0, 0];
  objective: 'neutral' | 'blue' | 'red' | 'contested' = 'neutral';
  private captureFrames: [number, number] = [0, 0];
  private phaseMs = 0;
  private jumpHeld = false;
  effects: ShotEffect[] = [];
  events: BattleEvent[] = [];
  grenades: Grenade[] = [];
  bursts: { x: number; y: number; frame: number; radius: number; color: number }[] = [];
  notice = ''; noticeFrame = 0;
  readonly wall: (x: number, y: number) => boolean;
  constructor(readonly mission: Mission, readonly difficulty: Difficulty = 'normal', readonly startingWeapon: WeaponId = 'm4', private random: RandomSource = Math.random, readonly loadout: Loadout | null = null) {
    this.wall = wallFor(mission);
    this.addActor('player', '你', 1, true, 0);
    for (let i = 0; i < mission.allies; i++) this.addActor(`ally-${i}`, ['回声', '北斗'][i] ?? `队员${i}`, 1, false, i + 1);
    for (let i = 0; i < mission.enemies; i++) this.addActor(`enemy-${i}`, ['哨兵', '猎隼', '铁卫'][i] ?? `守卫${i}`, 2, false, i);
  }
  get player() { return this.actors[0]; }
  private addActor(id: string, name: string, team: 1 | 2, human: boolean, index: number) {
    const spawn = this.mission.spawns[team - 1][index % this.mission.spawns[team - 1].length];
    const movement = new OriginalMovement(this.wall); movement.reset(spawn.x, spawn.y);
    const kit = human && this.loadout ? structuredClone(this.loadout) : null;
    const stats = kit ? loadoutStats(kit) : { health: 85, aim: 0.7, ammo: 0.9 };
    this.actors.push({ id, name, team, human, movement, life: new OriginalLife(stats.health),
      arsenal: kit ? new Arsenal(kit.primary, kit.primary, kit.secondary, stats.ammo) : new Arsenal(human ? this.startingWeapon : 'm4'),
      kit, skillCooldown: 0, skillFrames: 0, itemCharges: kit ? ITEMS[kit.item].charges : 0, itemCooldown: 0,
      aim: { x: spawn.x + (team === 1 ? 300 : -300), y: spawn.y - 42 }, kills: 0, supplyReady: 0,
      brain: { target: null, acquired: 0, offset: 0, lastX: spawn.x, stuck: 0, state: 'advance' } });
  }
  swap() { if (this.phase === 'running' && this.player.life.alive) this.player.arsenal.swap(); }
  reload() { if (this.phase === 'running' && this.player.life.alive) this.player.arsenal.gun.reload(); }
  private say(message: string) { this.notice = message; this.noticeFrame = this.frame; }
  useSkill(actor = this.player) {
    if (this.phase !== 'running' || !actor.life.alive || !actor.kit) return false;
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
    this.bursts.push({ x: actor.movement.x, y: actor.movement.y - 30, frame: this.frame, radius: 70, color: CLASSES[actor.kit.classId].color });
    if (actor.human) this.say(`${skill.name}已发动`); return true;
  }
  useItem(aim: Point = this.player.aim) {
    const actor = this.player;
    if (this.phase !== 'running' || !actor.life.alive || !actor.kit || actor.itemCooldown) return false;
    if (actor.itemCharges <= 0) { this.say('本次出战道具已耗尽'); return false; }
    const item = actor.kit.item;
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
    this.say(`${ITEMS[item].name}已使用`); return true;
  }
  releaseInput() { this.player.arsenal.setTrigger(false); this.jumpHeld = false; }
  private hitboxes(): UnitHitbox[] {
    return this.actors.map(a => ({ id: a.id, team: a.team, position: a.movement, alive: a.life.alive, crouching: a.movement.crouching }));
  }
  private spawn(actor: Actor) {
    const enemies = this.actors.filter(a => a.team !== actor.team && a.life.alive);
    const safety = (p: Point) => Math.min(...enemies.map(a => Math.hypot(a.movement.x - p.x, a.movement.y - p.y)), 9999);
    const choices = [...this.mission.spawns[actor.team - 1]].sort((a, b) => safety(b) - safety(a));
    const spawn = choices[0]; actor.movement.reset(spawn.x, spawn.y);
    actor.arsenal = actor.kit ? new Arsenal(actor.kit.primary, actor.kit.primary, actor.kit.secondary, loadoutStats(actor.kit).ammo) : new Arsenal(actor.human ? this.startingWeapon : 'm4');
    actor.skillFrames = 0;
    actor.aim = { x: spawn.x + (actor.team === 1 ? 300 : -300), y: spawn.y - 42 };
    actor.brain.target = null; actor.brain.stuck = 0;
  }
  private botInput(actor: Actor): BattleInput {
    const m = actor.movement, brain = actor.brain;
    const enemies = this.actors.filter(a => a.team !== actor.team && a.life.alive)
      .sort((a, b) => Math.abs(a.movement.x - m.x) - Math.abs(b.movement.x - m.x));
    const target = enemies.find(a => !(a.kit?.skill === 'cloak' && a.skillFrames > 0) && Math.abs(a.movement.x - m.x) < 620 && clearSight({ x: m.x, y: m.y - 42 }, { x: a.movement.x, y: a.movement.y - 33 }, this.wall));
    if (brain.target !== (target?.id ?? null)) { brain.target = target?.id ?? null; brain.acquired = this.frame; }
    const skill = actor.team === 1 ? 'normal' : this.difficulty;
    const reaction = { easy: 24, normal: 16, hard: 9 }[skill];
    if (this.frame % 12 === 0) brain.offset = (this.random() * 2 - 1) * { easy: 90, normal: 55, hard: 28 }[skill];
    const resupplying = actor.arsenal.empty;
    const destination = resupplying ? this.mission.spawns[actor.team - 1][0] : this.mission.mode === 'dom' ? this.mission.objective : target?.movement ?? enemies[0]?.movement ?? this.mission.objective;
    const waypoint = nextWaypoint(this.mission.navigation, m, destination);
    const controlling = this.mission.mode === 'dom' && Math.abs(m.x - destination.x) < 45 && Math.abs(m.y - destination.y) < 70;
    const inRange = !!target && Math.abs(target.movement.x - m.x) < 350;
    const stop = !resupplying && (controlling || (this.mission.mode === 'tdm' && inRange));
    const dx = waypoint.x - m.x;
    const direction = Math.sign(dx);
    const stuck = Math.abs(m.x - brain.lastX) < 0.5 && !stop;
    brain.stuck = stuck ? brain.stuck + 1 : 0; brain.lastX = m.x;
    const obstacle = this.wall(m.x + direction * 45, m.y - 20);
    const rising = waypoint.y < m.y - 35 && Math.abs(dx) < 260;
    const jump = !stop && !m.jumping && (obstacle || rising || brain.stuck > 12);
    const aim = target ? { x: target.movement.x, y: target.movement.y - 33 + brain.offset } : { x: m.x + direction * 300, y: m.y - 42 };
    const ready = !!target && this.frame - brain.acquired >= reaction;
    // Bursts give visible recovery windows; semi-auto alternates releases.
    const fire = !resupplying && ready && this.frame % 54 < 32 && (actor.arsenal.selected === 'm4' || this.frame % 10 === 0);
    if (!resupplying && !actor.arsenal.gun.ammo && !actor.arsenal.gun.reserveAmmo) actor.arsenal.swap();
    if (!target && actor.arsenal.gun.ammo < 10) actor.arsenal.gun.reload();
    brain.state = resupplying ? 'resupply' : controlling ? 'hold' : inRange ? 'engage' : jump ? 'jump' : 'advance';
    return { left: !stop && dx < -8, right: !stop && dx > 8, crouch: !resupplying && inRange && !m.jumping && !controlling && this.frame % 120 < 35, jump, fire, aim };
  }
  /** Shared damage path for bullets and environmental falls. */
  damage(target: Actor, amount: number, source?: Actor, explosive = false) {
    if (this.phase !== 'running' || (source && source.team === target.team)) return false;
    if (source && target.life.alive && !target.life.spawnProtectionFrames && target.kit) {
      if (explosive && target.kit.classId === 'tank') amount *= 0.7;
      if (target.skillFrames && target.kit.skill === 'barrier') amount *= 0.5;
      if (target.skillFrames && target.kit.skill === 'iron' && amount > 0) { amount *= 0.2; target.skillFrames = 0; }
      if (target.kit.skill === 'cloak' && amount > 0) target.skillFrames = 0;
    }
    const killed = target.life.damage(amount, !source);
    if (target.kit?.classId === 'medic' && target.life.regenDelay > 60) target.life.regenDelay = 60;
    if (killed) {
      target.skillFrames = 0;
      if (source) {
        source.kills++;
        if (this.mission.mode === 'tdm') this.scores[source.team - 1]++;
      } else if (this.mission.mode === 'tdm') this.scores[target.team === 1 ? 1 : 0]++;
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
  tick(input: BattleInput) {
    if (this.phase !== 'running') return;
    this.frame++;
    this.effects = this.effects.filter(effect => this.frame - effect.frame < 20);
    this.bursts = this.bursts.filter(b => this.frame - b.frame < 18);
    for (const actor of this.actors) {
      if (actor.skillCooldown) actor.skillCooldown--;
      if (actor.itemCooldown) actor.itemCooldown--;
      if (!actor.life.alive) { if (actor.life.tick()) { this.spawn(actor); if (actor.human && input.fire) { actor.arsenal.setTrigger(true); actor.arsenal.swap(); actor.arsenal.swap(); } } continue; }
      actor.life.tick();
      if (actor.skillFrames && actor.kit?.skill === 'regenerate') actor.life.health = Math.min(actor.life.maxHealth, actor.life.health + 1 / 3);
      const control = actor.human ? input : this.botInput(actor);
      if (control.jump && (!actor.human || !this.jumpHeld)) actor.movement.jump();
      actor.movement.tick(control);
      const m = actor.movement;
      m.x = Math.max(20, Math.min(this.mission.width - 20, m.x));
      if (m.y > 840) { this.damage(actor, 9999); continue; }
      actor.aim.x += (control.aim.x - actor.aim.x) * 0.5;
      actor.aim.y += (control.aim.y - actor.aim.y) * 0.5;
      actor.arsenal.setTrigger(control.fire);
      const traces = actor.arsenal.tick(actor.id, actor.team, { x: m.x, y: m.y - (m.crouching ? 28 : 42) }, actor.aim,
        { crouching: m.crouching, airborne: m.jumping, moving: m.vx !== 0, aimStat: actor.kit ? loadoutStats(actor.kit).aim : 0.7 }, this.hitboxes(), this.wall, this.random,
        actor.skillFrames && actor.kit?.skill === 'focus' ? 0.25 : 1);
      if (traces.length && actor.kit?.skill === 'cloak') actor.skillFrames = 0;
      for (const trace of traces) {
        const targetId = trace.hit?.type === 'unit' ? trace.hit.target : null;
        const victim = this.actors.find(a => a.id === targetId);
        let amount = victim && !victim.life.spawnProtectionFrames ? actor.arsenal.gun.weapon.damage * (trace.headMarked ? 1.45 : 1) : 0;
        if (trace.headMarked && actor.kit?.classId === 'assassin') amount *= 1.25;
        if (actor.skillFrames && actor.kit?.skill === 'overdrive') amount *= 1.2;
        const before = victim?.life.health ?? 0;
        const killed = victim ? this.damage(victim, amount, actor) : false;
        this.effects.push({ frame: this.frame, trace, team: actor.team, damage: before - (victim?.life.health ?? 0), killed });
      }
      const supply = this.mission.spawns[actor.team - 1][0];
      if (this.frame >= actor.supplyReady && Math.abs(m.x - supply.x) < 70 && Math.abs(m.y - supply.y) < 40) {
        actor.arsenal.resupply(); actor.supplyReady = this.frame + 300;
      }
    }
    for (const grenade of this.grenades) {
      const nx = grenade.x + grenade.vx, ny = grenade.y + grenade.vy;
      if (this.wall(nx, grenade.y) || nx < 0 || nx > this.mission.width) grenade.vx *= -0.5; else grenade.x = nx;
      if (this.wall(grenade.x, ny)) { grenade.vy = -Math.abs(grenade.vy) * 0.4; grenade.vx *= 0.8; } else grenade.y = ny;
      grenade.vy += 0.5;
      if (--grenade.fuse === 0) {
        this.bursts.push({ x: grenade.x, y: grenade.y, frame: this.frame, radius: 120, color: 0xf5b267 });
        for (const target of this.actors) {
          const center = { x: target.movement.x, y: target.movement.y - 30 };
          const distance = Math.hypot(center.x - grenade.x, center.y - grenade.y);
          if (target.team !== grenade.source.team && target.life.alive && distance < 120 && clearSight(grenade, center, this.wall)) this.damage(target, 65 * (1 - distance / 150), grenade.source, true);
        }
      }
    }
    this.grenades = this.grenades.filter(g => g.fuse > 0);
    // Resolve all actors and explosions before expiring effects on their final active frame.
    for (const actor of this.actors) if (actor.skillFrames) actor.skillFrames--;
    this.jumpHeld = input.jump;
    if (this.mission.mode === 'dom') {
      const present = [1, 2].map(team => this.actors.some(a => a.team === team && a.life.alive && Math.abs(a.movement.x - this.mission.objective.x) < 85 && Math.abs(a.movement.y - this.mission.objective.y) < 70));
      this.objective = present[0] && present[1] ? 'contested' : present[0] ? 'blue' : present[1] ? 'red' : 'neutral';
      if (present[0] !== present[1]) {
        const index = present[0] ? 0 : 1;
        if (++this.captureFrames[index] === 30) { this.scores[index]++; this.captureFrames[index] = 0; }
      }
    }
    if (this.scores.some(score => score >= this.mission.goal)) this.finish(this.scores[0] >= this.mission.goal, '目标分数已达成');
    else if (this.frame >= this.mission.seconds * 30) this.finish(this.scores[0] > this.scores[1], this.scores[0] === this.scores[1] ? '时间耗尽，平局未能完成任务' : '行动时间结束');
  }
  private finish(won: boolean, reason: string) { this.phase = won ? 'won' : 'lost'; this.reason = reason; this.releaseInput(); }
  snapshot() {
    return { mission: this.mission.id, phase: this.phase, frame: this.frame, scores: [...this.scores], objective: this.objective, reason: this.reason,
      seconds: Math.max(0, Math.ceil(this.mission.seconds - this.frame / 30)),
      actors: this.actors.map(a => ({ id: a.id, team: a.team, x: a.movement.x, y: a.movement.y, vx: a.movement.vx, vy: a.movement.vy,
        crouching: a.movement.crouching, jumping: a.movement.jumping, life: a.life.snapshot(), weapon: a.arsenal.selected,
        ammo: a.arsenal.gun.ammo, reserve: a.arsenal.gun.reserveAmmo, reload: a.arsenal.gun.reloadFrames, kills: a.kills, shots: a.arsenal.shots, ai: a.brain.state,
        classId: a.kit?.classId ?? null, maxHealth: a.life.maxHealth, skill: a.kit?.skill ?? null, skillCooldown: a.skillCooldown, skillFrames: a.skillFrames, item: a.kit?.item ?? null, itemCharges: a.itemCharges })) };
  }
}
