import type { RandomSource, Point } from './Ballistics';

export const MEDIC_LEVEL_ONE = Object.freeze({ health: 85, aim: 0.7, criticalChance: 0.06, ammo: 0.9, headBonus: 1.45, criticalBonus: 1.35 });
export interface DamageConditions {
  self: boolean;
  sourceHuman: boolean;
  targetHuman: boolean;
  sourceDifficulty: number;
  campaign: boolean;
  headMarked: boolean;
  criticalChance: number;
  headBonus?: number;
  criticalBonus?: number;
}
/** Status.damage, ordinary USP/M4, FFA, no skill/equipment/status modifiers. */
export function originalDamage(base: number, conditions: DamageConditions, random: RandomSource) {
  let amount = base;
  if (!conditions.self) {
    if (conditions.targetHuman) amount *= 0.3 + conditions.sourceDifficulty * 0.07;
    else if (!conditions.sourceHuman) amount *= conditions.campaign
      ? 0.4 + conditions.sourceDifficulty * 0.03 : 0.6 + conditions.sourceDifficulty * 0.04;
  }
  let kind: 'body' | 'head' | 'critical' = 'body';
  if (!conditions.self && conditions.headMarked) {
    amount *= conditions.headBonus ?? 1.45; kind = 'head';
  } else {
    // The source evaluates Math.random before its self-hit guard, and uses <=.
    const value = random();
    if (!Number.isFinite(value) || value < 0 || value >= 1) throw new RangeError('Invalid random sample');
    if (value <= conditions.criticalChance && !conditions.self) {
      amount *= conditions.criticalBonus ?? 1.35; kind = 'critical';
    }
  }
  return { amount, kind };
}

/** Unit.die → Player.EnterFrame → Player.spawn → Unit.unitSpawn → Status.reset. */
export class OriginalLife {
  health: number;
  alive = true;
  respawnFrames = 0;
  spawnProtectionFrames = 75;
  regenDelay = 0;
  deaths = 0;
  constructor(readonly maxHealth: number = MEDIC_LEVEL_ONE.health) { this.health = maxHealth; }
  damage(amount: number, bypassProtection = false) {
    if (!Number.isFinite(amount) || amount < 0) throw new RangeError('Invalid damage amount');
    if (!this.alive || (this.spawnProtectionFrames && !bypassProtection)) return false;
    this.health = Math.max(0, this.health - amount);
    this.regenDelay = 90;
    if (this.health > 0) return false;
    this.alive = false; this.respawnFrames = 150; this.deaths++;
    return true;
  }
  /** Returns true on the spawn branch. The 150th dead update reaches zero; the 151st spawns. */
  tick() {
    if (!this.alive) {
      if (this.respawnFrames > 0) this.respawnFrames--;
      else { this.alive = true; this.health = this.maxHealth; this.spawnProtectionFrames = 75; this.regenDelay = 0; return true; }
    } else {
      if (this.spawnProtectionFrames > 0) this.spawnProtectionFrames--;
      if (this.regenDelay > 0) this.regenDelay--;
      else this.health = Math.min(this.maxHealth, this.health + this.maxHealth * 0.001);
    }
    return false;
  }
  snapshot() { return { health: this.health, alive: this.alive, respawnFrames: this.respawnFrames, spawnProtectionFrames: this.spawnProtectionFrames, regenDelay: this.regenDelay, deaths: this.deaths }; }
}

export interface SpawnNode extends Point { initiallyUsed?: boolean }
/** FFA normal respawn; team-spawn selection belongs to match setup, not this function. */
export function chooseSpawn(nodes: readonly SpawnNode[], random: RandomSource): Point {
  if (!nodes.length) throw Error('A spawn node is required');
  const indexSample = random(), jitterSample = random();
  if ([indexSample, jitterSample].some(v => !Number.isFinite(v) || v < 0 || v >= 1)) throw new RangeError('Invalid random sample');
  const node = nodes[Math.floor(indexSample * nodes.length)];
  return { x: node.x + jitterSample * 10 - 5, y: node.y };
}
