import { OriginalMovement, type OriginalMoveInput } from '../movement/OriginalMovement';
import { GunLab } from './GunLab';
import { MEDIC_LEVEL_ONE, OriginalLife, chooseSpawn, originalDamage } from './OriginalLife';
import { COMBAT_FRAME_MS } from './Combat';
import type { Point, RandomSource } from './Ballistics';

export const referenceTerrain = [
  { x: 0, y: 600, width: 1200, height: 160 },
  { x: 1380, y: 600, width: 1020, height: 160 },
  { x: 800, y: 572, width: 80, height: 28 },
  { x: 950, y: 540, width: 100, height: 60 },
  { x: 1560, y: 500, width: 170, height: 18 },
];
/** Graybox fixtures use the same opaque-pixel predicate for movement and bullets. */
export function referenceWall(x: number, y: number) {
  x = Math.trunc(x); y = Math.trunc(y);
  return referenceTerrain.some(t => x >= t.x && x < t.x + t.width && y >= t.y && y < t.y + t.height);
}

/** Ordinary Medic L1 / USP + M4 / FFA / no skills or match modifiers. */
export class OriginalSandbox {
  readonly movement = new OriginalMovement(referenceWall);
  readonly life = new OriginalLife();
  readonly targetLife = new OriginalLife();
  guns: GunLab;
  frame = 0;
  private phaseMs = 0;
  private held = false;
  aim: Point = { x: 380, y: 550 };
  aimDirection: Point = { x: 1, y: 0 };
  /** Product feedback uses simulation frames so pause and slow motion remain coherent. */
  feedback: { frame: number; amount: number; head: boolean; killed: boolean } | null = null;
  constructor(private readonly random: RandomSource = Math.random) {
    this.guns = this.makeGuns();
    this.targetLife.spawnProtectionFrames = 0;
  }
  private makeGuns() {
    const guns = new GunLab(MEDIC_LEVEL_ONE.ammo, this.random, 'original');
    guns.select('m4');
    guns.pose.aimStat = MEDIC_LEVEL_ONE.aim;
    guns.isOpaqueWall = point => referenceWall(point.x, point.y);
    guns.target.maxHealth = guns.target.health = 85;
    guns.targetPoint.y = 566.5;
    guns.resolveDamage = event => {
      const damage = originalDamage(guns.weapon.damage, {
        self: false, sourceHuman: true, targetHuman: false, sourceDifficulty: 0,
        campaign: false, headMarked: !!guns.lastShot?.headMarked, criticalChance: MEDIC_LEVEL_ONE.criticalChance,
      }, this.random);
      return { ...event, amount: this.targetLife.spawnProtectionFrames ? 0 : damage.amount };
    };
    return guns;
  }
  setTrigger(held: boolean) { this.held = held; this.guns.setTrigger(held); }
  swap() { if (this.life.alive) this.guns.select(this.guns.weapon.id === 'usp' ? 'm4' : 'usp'); }
  reload() { if (this.life.alive) this.guns.gun.reload(); }
  jump() { return this.life.alive && this.movement.jump(); }
  /** Explicit environment-damage fixture for death/respawn verification, not an original key binding. */
  lethalFixture() { this.life.damage(9999, true); }
  advance(deltaMs: number, input: OriginalMoveInput, pointer: Point) {
    if (!Number.isFinite(deltaMs) || deltaMs < 0) throw new RangeError('Invalid frame delta');
    this.phaseMs += deltaMs;
    while (this.phaseMs + 1e-7 >= COMBAT_FRAME_MS) {
      this.phaseMs -= COMBAT_FRAME_MS;
      this.tick(input, pointer);
    }
  }
  tick(input: OriginalMoveInput, pointer: Point) {
    this.frame++;
    if (!this.life.alive) {
      if (this.life.tick()) {
        const spawn = chooseSpawn([{ x: 180, y: 599.5 }, { x: 1500, y: 599.5 }], this.random);
        this.movement.reset(spawn.x, spawn.y);
        this.guns = this.makeGuns();
        this.guns.setTrigger(this.held);
        // Guns.reset -> swapGuns latches an already-held mouse until release.
        if (this.held) { this.guns.select('usp'); this.guns.select('m4'); }
        this.aim = { x: spawn.x + 200, y: spawn.y - 50 };
        this.aimDirection = { x: 1, y: 0 };
      }
    } else {
      this.aim.x += (pointer.x - this.aim.x) * 0.5;
      this.aim.y += (pointer.y - this.aim.y) * 0.5;
      // Idle arm1hold: UnitMC sprite 669 frame1 has y=-42. Moving pose timing is still under review.
      const origin = { x: this.movement.x + this.movement.rotation * 1.2, y: this.movement.y - (this.movement.crouching ? 28 : 42) };
      const shotAim = { x: origin.x + this.aimDirection.x * 1000, y: origin.y + this.aimDirection.y * 1000 };
      this.guns.pose.crouching = this.movement.crouching;
      this.guns.pose.airborne = this.movement.jumping;
      this.guns.pose.moving = this.movement.vx !== 0;
      const shots = this.guns.shotsFired;
      this.guns.tick(COMBAT_FRAME_MS, this.frame * COMBAT_FRAME_MS, origin, shotAim, () => { this.life.tick(); });
      if (this.guns.shotsFired !== shots && this.guns.lastEvent) {
        const killed = this.targetLife.damage(this.guns.lastEvent.amount);
        if (this.guns.lastEvent.amount > 0) this.feedback = {
          frame: this.frame, amount: this.guns.lastEvent.amount,
          head: !!this.guns.lastShot?.headMarked, killed,
        };
        this.guns.target.respawnAtMs = null;
      }
      this.movement.tick(input);
      const dx = this.aim.x - (this.movement.x + 0.3 + this.movement.rotation * 1.2);
      const dy = this.aim.y - (this.movement.y - (this.movement.crouching ? 28 : 42));
      const distance = Math.hypot(dx, dy) || 1;
      this.aimDirection = { x: dx / distance, y: dy / distance };
      // Our graybox ends at 2400 × 760; do not leave the player falling offscreen for seconds.
      if (this.movement.x < 0 || this.movement.x > 2400 || this.movement.y > 840) this.lethalFixture();
    }
    this.targetLife.tick();
    this.guns.target.health = this.targetLife.health;
    this.guns.target.alive = this.targetLife.alive;
  }
  snapshot() {
    return { frame: this.frame, time: this.frame / 30, x: this.movement.x, y: this.movement.y,
      vx: this.movement.vx, vy: this.movement.vy, jumping: this.movement.jumping, crouching: this.movement.crouching,
      climb: this.movement.climb, life: this.life.snapshot(), target: this.targetLife.snapshot(),
      combat: this.guns.snapshot(), kills: this.targetLife.deaths, feedback: this.feedback,
      recoil: { dynamic: this.guns.recoil.dynamic, upper: this.guns.recoil.upper, spread: this.guns.lastSpreadDegrees } };
  }
}
