import { M4, GunController, applyDamage, respawn, USP, type Combatant, type DamageEvent, type WeaponConfig, type LabWeaponId, type WeaponId, type ShotClock } from './Combat';
import { traceBulletLine, unitHitRects, type BulletTrace, type Point, type RandomSource, type UnitHitbox } from './Ballistics';
import { Recoil, type ShootingPose } from './Recoil';
export class GunLab {
  private readonly shotClock: ShotClock = { remainingFrames: 0, phaseMs: 0 };
  private readonly guns: Record<LabWeaponId, GunController>;
  private triggerHeld = false;
  private shotPressed = false;
  combatFrame = 0;
  shotsFired = 0;
  lastShotFrame: number | null = null;
  lastShot: BulletTrace | null = null;
  targetCrouching = false;
  readonly recoil = new Recoil(USP.recoil);
  pose: ShootingPose = { crouching: false, airborne: false, moving: false, aimStat: 1 };
  isOpaqueWall?: (point: Point) => boolean;
  resolveDamage?: (event: DamageEvent) => DamageEvent;
  lastSpreadDegrees = 0;
  gun: GunController; weapon: WeaponConfig = USP; readonly target: Combatant = { id: 'target-dummy', health: 100, maxHealth: 100, alive: true, respawnAtMs: null }; readonly targetPoint: Point = { x: 700, y: 540 }; score = 0; lastEvent: DamageEvent | null = null;
  constructor(readonly ammoMultiplier = 1, private readonly random: RandomSource = Math.random, readonly ballisticsMode: 'post-muzzle' | 'original' = 'post-muzzle') {
    this.guns = { usp: new GunController(USP, this.shotClock, ammoMultiplier), m4: new GunController(M4, this.shotClock, ammoMultiplier) };
    this.gun = this.guns.usp;
  }
  setTrigger(held: boolean) {
    this.triggerHeld = held;
    if (!held) this.shotPressed = false;
  }
  select(id: WeaponId) {
    if (id !== 'usp' && id !== 'm4') throw new RangeError('Weapon is not available in this laboratory');
    if (id === this.weapon.id) return;
    this.gun.cancelReload();
    this.gun = this.guns[id];
    this.weapon = this.gun.weapon;
    this.recoil.switchWeapon(this.weapon.recoil);
    if (this.triggerHeld) this.shotPressed = true;
    // Guns.swapGuns preserves the shared shootDelay, cancels reload, then checks the new clip.
    this.gun.checkReload();
  }
  get targetHitbox(): UnitHitbox {
    return { id: this.target.id, position: { x: this.targetPoint.x, y: this.targetPoint.y + 33 }, alive: this.target.alive, crouching: this.targetCrouching };
  }
  fire(timeMs: number, origin: Point = { x: 180, y: 580 }, aim: Point = this.targetPoint): boolean {
    // Rejected trigger attempts must not advance the random stream or replace shot telemetry.
    if (!this.gun.canFire) return false;
    let shotAim = aim;
    if (this.ballisticsMode === 'original') {
      this.lastSpreadDegrees = this.recoil.sampleDegrees(this.random);
      const angle = Math.atan2(aim.y - origin.y, aim.x - origin.x) + this.lastSpreadDegrees * Math.PI / 180;
      shotAim = { x: origin.x + Math.cos(angle) * 1000, y: origin.y + Math.sin(angle) * 1000 };
    }
    this.lastShot = traceBulletLine({ origin, aim: shotAim, rangeUnits: this.weapon.rangeUnits, random: this.random, source: 'player', units: [this.targetHitbox], isOpaqueWall: this.isOpaqueWall,
      muzzle: this.ballisticsMode === 'original' ? { xOff: this.weapon.xOff, yOff: this.weapon.yOff, facing: aim.x >= origin.x ? 1 : -1 } : undefined });
    const hit = this.lastShot.hit;
    const rawEvent = this.gun.fire('player', hit?.type === 'unit' ? this.target : null, timeMs, this.lastShot.headMarked ? 'head' : 'body');
    const event = rawEvent && this.resolveDamage ? this.resolveDamage(rawEvent) : rawEvent;
    if (this.ballisticsMode === 'original') this.recoil.afterShot();
    this.lastEvent = event;
    this.shotsFired++;
    this.lastShotFrame = this.combatFrame;
    if (!event) return false;
    if (applyDamage(this.target, event)) this.score++;
    return true;
  }
  tick(deltaMs: number, timeMs: number, origin?: Point, aim?: Point, afterShotAttempt?: () => void) {
    this.gun.tick(deltaMs, offsetMs => {
      this.combatFrame++;
      const frameTime = timeMs - deltaMs + offsetMs;
      respawn(this.target, frameTime);
      if (this.triggerHeld && !this.shotPressed) {
        const before = this.shotsFired;
        this.fire(frameTime, origin, aim);
        if (this.shotsFired > before && !this.weapon.automatic) this.shotPressed = true;
      }
      afterShotAttempt?.();
      if (this.ballisticsMode === 'original') this.recoil.tick(this.pose);
    });
    respawn(this.target,timeMs);
  }
  snapshot() { return { weapon:this.weapon.id, ammo:this.gun.ammo, reserveAmmo:this.gun.reserveAmmo, ammoMultiplier:this.ammoMultiplier, cooldownFrames:this.gun.cooldownFrames, cooldownMs:this.gun.cooldownMs, combatFrame:this.combatFrame, shotsFired:this.shotsFired, lastShotFrame:this.lastShotFrame, reloadFrames:this.gun.reloadFrames, reloadMs:this.gun.reloadMs, health:this.target.health, alive:this.target.alive, score:this.score, lastEvent:this.lastEvent, lastShot:this.lastShot, targetBounds:unitHitRects(this.targetHitbox), targetCrouching:this.targetCrouching }; }
}
