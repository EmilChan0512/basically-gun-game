import type { Portal } from '../../shared/content/MapTypes';
/** SFH1 Movement ordinary dry-terrain rules. Coordinates are feet, velocities px / 30Hz frame. */
export interface OriginalMoveInput { left: boolean; right: boolean; crouch: boolean }
export type WallMask = (x: number, y: number) => boolean;
type Tread = { x: number; y: number; width: number; height: number };
/** Authored treads are immutable; share the broad-phase index across actors and prediction. */
const treadIndexes = new WeakMap<readonly Tread[], Map<number, Tread[]>>();
function indexTreads(treads: readonly Tread[]) {
  let index = treadIndexes.get(treads);
  if (!index) {
    index = new Map();
    for (const tread of treads) for (let cell = Math.floor(tread.x / 64); cell <= Math.floor((tread.x + tread.width) / 64); cell++) {
      const bucket = index.get(cell) ?? []; bucket.push(tread); index.set(cell, bucket);
    }
    treadIndexes.set(treads, index);
  }
  return index;
}
export class OriginalMovement {
  x = 180; y = 599.5;
  vx = 0; vy = 0;
  jumping = false;
  crouching = false;
  manualJump = false;
  fallFrames = 0;
  climb = 0;
  climbFrames = 0;
  hardLandingFrames = 0;
  rotation = 0;
  speedScale = 1;
  portalCooldown = 0;
  portalSerial = 0;
  private droppingStairs = false;
  private readonly treadIndex: Map<number, Tread[]>;
  constructor(readonly wall: WallMask, stairTreads: readonly Tread[] = [], private readonly portals: readonly Portal[] = []) {
    this.treadIndex = indexTreads(stairTreads);
  }
  checkpoint() {
    return { x: this.x, y: this.y, vx: this.vx, vy: this.vy, jumping: this.jumping, crouching: this.crouching,
      manualJump: this.manualJump, fallFrames: this.fallFrames, climb: this.climb, climbFrames: this.climbFrames,
      hardLandingFrames: this.hardLandingFrames, rotation: this.rotation, speedScale: this.speedScale,
      portalCooldown: this.portalCooldown, portalSerial: this.portalSerial };
  }
  reset(x: number, y: number) {
    this.x = x; this.y = y; this.vx = this.vy = 0;
    this.jumping = this.crouching = this.manualJump = false;
    this.fallFrames = this.climb = this.climbFrames = this.hardLandingFrames = this.rotation = 0;
    this.portalCooldown = this.portalSerial = 0;
    this.droppingStairs = false;
  }
  private hit(x: number, y: number) { const px=Math.trunc(this.x+x),py=Math.trunc(this.y+y);
    return this.wall(px,py)||!this.droppingStairs&&!this.crouching&&(this.treadIndex.get(Math.floor(px/64)) ?? []).some(t=>this.y<=t.y+28&&px>=t.x&&px<t.x+t.width&&py>=t.y&&py<t.y+t.height); }
  shouldDescendStairs(target:{x:number;y:number}) {
    if (target.y < this.y - 1) return false;
    for (let cell = Math.floor((this.x - 64) / 64); cell <= Math.floor((this.x + 64) / 64); cell++) {
      if (this.treadIndex.get(cell)?.some(t => Math.abs(this.y-t.y)<32 && this.x>=t.x-64 && this.x<=t.x+t.width+64)) return true;
    }
    return false;
  }
  jump() {
    if (this.crouching || this.climb || this.hardLandingFrames || this.jumping) return false;
    this.y -= 6;
    this.vy -= 13;
    this.jumping = this.manualJump = true;
    return true;
  }
  tick(input: OriginalMoveInput) {
    this.portalCooldown = Math.max(0, this.portalCooldown - 1);
    this.droppingStairs = input.crouch;
    // UnitMC frame396/408/449 callbacks release these movement locks.
    if (this.climbFrames > 0 && --this.climbFrames === 0) this.climb = 0;
    if (this.hardLandingFrames > 0) this.hardLandingFrames--;
    this.crouching = (!this.jumping && input.crouch && !this.hardLandingFrames)
      || (this.crouching && (this.hit(-17, -45) || this.hit(17, -45)));
    const direction = this.hardLandingFrames ? 0 : input.left ? -1 : input.right ? 1 : 0;
    if (direction) {
      this.vx += direction * (this.jumping ? 1.4 : 1.8) * this.speedScale;
      const maximum = (this.crouching ? 4 : 9.5) * this.speedScale;
      if (direction < 0 && this.vx < -maximum) this.vx = -maximum;
      if (direction > 0 && this.vx > maximum) this.vx = maximum;
    } else {
      const brake = this.jumping ? 0.4 : this.crouching ? 0.5 : 1.7;
      if (this.vx > brake) this.vx -= brake;
      if (this.vx < -brake) this.vx += brake;
      if (this.vx > -brake - 0.1 && this.vx < brake + 0.1) this.vx = 0;
    }
    if (this.climb) this.vx = this.climb * 5;
    this.x += this.vx;
    this.y += this.vy;
    // Guard malformed/infinite custom masks; real finite bitmaps terminate these loops.
    const resolve = (condition: () => boolean, change: () => void) => {
      let count = 0;
      while (condition()) { if (++count > 6000) throw Error('Wall mask cannot resolve movement'); change(); }
    };
    resolve(() => this.hit(0, this.climb ? 6 : 8) && !this.hit(0, -1), () => { this.y += 0.5; });
    if (this.hit(0, 1)) {
      if (this.fallFrames >= 39) this.hardLandingFrames = 40;
      this.manualJump = this.jumping = false;
      this.vy = this.fallFrames = 0;
    } else {
      if (this.vy > 0) this.fallFrames++;
      this.jumping = true;
      this.vy = Math.min(20, this.vy + 0.8);
    }
    resolve(() => this.hit(0, -50), () => { this.y++; if (this.vy < 0) this.vy = 0; });
    let climbDirection = 0, climbSize = 0;
    for (const direction of [1, -1]) {
      const held = direction > 0 ? input.right : input.left;
      if (held && !this.hit(direction * 17, -55)) {
        if (this.hit(direction * 17, -40)) { climbDirection = direction; climbSize = 2; }
        else if (this.hit(direction * 17, -20)) { climbDirection = direction; climbSize = 1; }
      }
      const heights = this.crouching ? [-20, -25, -35] : [-20, -25, -35, -45];
      resolve(() => heights.some(y => this.hit(direction * 17, y)), () => { this.x -= direction; });
    }
    resolve(() => this.hit(0, 0), () => { this.y -= 0.5; });
    if (climbDirection && !this.climb && !this.crouching && !this.hardLandingFrames) {
      this.climb = climbDirection;
      this.climbFrames = climbSize === 1 ? 4 : 11;
      this.vy = climbSize === 1 ? -7 : -10;
    }
    let slope = 0;
    if (!this.jumping) {
      const sample = (x: number) => { let y = -10; for (let i = 0; i < 30 && !this.hit(x, y); i++) y++; return y; };
      const left = sample(-10), right = sample(10);
      if (left < 20 && right < 20) slope = Math.atan2(right - left, 20) * 180 / Math.PI;
    }
    this.rotation += (slope - this.rotation) * 0.3;
    const portal = !this.portalCooldown && this.portals.find(p => (!p.requiresCrouch || input.crouch) && Math.abs(this.x - p.entrance.x) < 30 && Math.abs(this.y - p.entrance.y) < 42);
    if (portal) {
      const serial = this.portalSerial + 1;
      this.reset(portal.exit.x, portal.exit.y);
      this.portalSerial = serial; this.portalCooldown = 90;
    }
  }
}
