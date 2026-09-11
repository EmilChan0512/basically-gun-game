import type { Actor, BattleInput, Difficulty } from '../../game/campaign/Battle';
import type { Mission } from '../../game/campaign/Missions';
import type { RandomSource } from '../../game/combat/Ballistics';
import { clearSight, nextWaypoint, trackedWaypoint } from '../../game/campaign/Navigation';
import type { ModeRules } from './ModeRules';
import type { PlayerAction } from '../protocol/Commands';
import { traversalJump } from './Traversal';
interface BotContext {
  actors: Actor[]; frame: number; difficulty: Difficulty; mission: Mission;
  mode: ModeRules; random: RandomSource; wall: (x: number, y: number) => boolean;
  scores: [number, number]; objective: 'neutral' | 'blue' | 'red' | 'contested';
}
export interface BotDecision { input: BattleInput; actions: PlayerAction[] }
export function botInput(context: BotContext, actor: Actor): BotDecision {
    const m = actor.movement, brain = actor.brain;
    const enemies = context.actors.filter(a => a.team !== actor.team && a.life.alive)
      .sort((a, b) => Math.abs(a.movement.x - m.x) - Math.abs(b.movement.x - m.x));
    const target = enemies.find(a => !(a.kit?.skill === 'cloak' && a.skillFrames > 0) && Math.abs(a.movement.x - m.x) < 620 && clearSight({ x: m.x, y: m.y - 42 }, { x: a.movement.x, y: a.movement.y - 33 }, context.wall));
    if (brain.target !== (target?.id ?? null)) { brain.target = target?.id ?? null; brain.acquired = context.frame; }
    const skill = actor.team === 1 ? 'normal' : context.difficulty;
    const reaction = { easy: 24, normal: 16, hard: 9 }[skill];
    if (context.frame % 12 === 0) brain.offset = (context.random() * 2 - 1) * { easy: 90, normal: 55, hard: 28 }[skill];
    const ready = !!target && context.frame - brain.acquired >= reaction;
    const distance = target ? Math.hypot(target.movement.x - m.x, target.movement.y - m.y) : Infinity;
    const special = actor.offhand && actor.offhand.kind !== 'firearm' ? actor.offhand : undefined;
    const carrying = actor.deliveryPreviousWeapon !== undefined;
    const actions: PlayerAction[] = [];
    const wantSpecial = !!special && (carrying || (special.kind === 'melee'
      ? !!target && (distance < 90 || actor.arsenal.empty)
      : !!target && actor.life.health <= actor.life.maxHealth * 0.5 && context.frame % 120 < 60));
    if (special && !carrying && special.equipped !== wantSpecial && special.canSwitch) actions.push('swap');
    const usingSpecial = !!special && (actions.includes('swap') ? wantSpecial : special.equipped);
    const usingKnife = usingSpecial && special?.kind === 'melee';
    const usingShield = usingSpecial && special?.kind === 'shield';
    const resupplying = actor.arsenal.empty && !(special?.kind === 'melee' && target);
    const goal = context.mode.botGoal(context, target?.movement ?? enemies[0]?.movement, actor);
    const destination = resupplying ? context.mission.spawns[actor.team - 1][0] : goal.destination;
    const waypoint = context.mission.collisionMask ? trackedWaypoint(context.mission.navigation, m, destination, brain.route ??= {}) : nextWaypoint(context.mission.navigation, m, destination);
    const controlling = goal.hold && Math.abs(m.x - destination.x) < 45 && Math.abs(m.y - destination.y) < 70;
    const inRange = !!target && (usingKnife ? distance < special!.reach - 14 : Math.abs(target.movement.x - m.x) < 350);
    // Keep traversing until grounded; braking over a gap just because an enemy
    // entered firing range can make an otherwise valid jump fall short.
    const stop = !m.jumping && !resupplying && (controlling || (goal.stopToFight && inRange && !usingShield));
    const dx = waypoint.x - m.x;
    const direction = Math.sign(dx);
    const stuck = Math.abs(m.x - brain.lastX) < 0.5 && !stop;
    brain.stuck = stuck ? brain.stuck + 1 : 0; brain.lastX = m.x;
    const jump = !stop && !m.jumping && (traversalJump(m, waypoint, context.wall) || brain.stuck > 12);
    const aim = target ? { x: target.movement.x, y: target.movement.y - (usingSpecial ? target.movement.crouching ? 28 : 42 : 33) + (usingSpecial ? 0 : brain.offset) } : { x: m.x + direction * 300, y: m.y - 42 };
    // Bursts give visible recovery windows; semi-auto alternates releases.
    const fire = usingKnife ? ready && distance < special!.reach - 8 && !special!.triggerHeld && special!.canSwitch
      : usingShield ? ready
      : !resupplying && ready && context.frame % 54 < 32 && (actor.arsenal.selected === 'm4' || context.frame % 10 === 0);
    if (!special && !resupplying && !actor.arsenal.gun.ammo && !actor.arsenal.gun.reserveAmmo) actions.push('swap');
    if (!usingSpecial && !target && actor.arsenal.gun.ammo < 10) actions.push('reload');
    brain.state = resupplying ? 'resupply' : usingShield ? 'defend' : usingKnife ? 'melee' : controlling ? 'hold' : inRange ? 'engage' : jump ? 'jump' : 'advance';
    return { actions, input: { left: !stop && dx < -8, right: !stop && dx > 8, crouch: !usingSpecial && !resupplying && inRange && !m.jumping && !controlling && context.frame % 120 < 35, jump, fire, aim } };
  }
