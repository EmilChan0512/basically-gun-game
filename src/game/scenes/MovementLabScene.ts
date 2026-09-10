import Phaser from 'phaser';
import { defaults, simulation, type MovementConfig } from '../config/movement';
import { stations, terrain } from '../config/course';
import { Soldier } from '../characters/Soldier';
import { JumpMeasurements } from '../debug/JumpMeasurements';
import type { MoveInput } from '../movement/MovementController';
import { GunLab } from '../combat/GunLab';

export class MovementLabScene extends Phaser.Scene {
  soldier!: Soldier;
  config: MovementConfig = { ...defaults };
  measurements = new JumpMeasurements();
  readonly gunLab = new GunLab();
  private targetArt!: Phaser.GameObjects.Graphics;
  paused = false;
  slow = false;
  debugVisible = true;
  simTime = 0;
  private accumulator = 0;
  private pendingJump = false;
  private mouseHeld = false;
  private singleSteps = 0;
  private keys = new Set<string>();
  private overlay!: Phaser.GameObjects.Graphics;
  private hud!: Phaser.GameObjects.Text;
  private station = 0;
  private telemetryTimer = 0;
  constructor() { super('MovementLabScene'); }
  create() {
    this.physics.disableUpdate();
    this.physics.world.setBounds(0, 0, simulation.worldWidth, simulation.worldHeight);
    this.cameras.main.setBounds(0, 0, simulation.worldWidth, simulation.worldHeight);
    const bg = this.add.graphics();
    bg.fillStyle(0x18252e).fillRect(0, 0, simulation.worldWidth, simulation.worldHeight);
    bg.lineStyle(1, 0x253640, .65);
    for (let x = 0; x < simulation.worldWidth; x += 40) bg.lineBetween(x, 0, x, simulation.worldHeight);
    for (let y = 0; y < simulation.worldHeight; y += 40) bg.lineBetween(0, y, simulation.worldWidth, y);
    this.add.text(75, 295, 'MOVEMENT\nTEST FACILITY', { fontFamily: 'monospace', fontSize: '48px', color: '#2c3f49', lineSpacing: 4 });
    this.add.text(78, 419, 'PROJECT STRIKE  /  SWF RULES IN REVIEW · MUZZLE / RECOIL TUNED', { fontFamily: 'monospace', fontSize: '10px', color: '#526b78' });
    const platforms = this.physics.add.staticGroup();
    for (const t of terrain) {
      const visual = this.add.rectangle(t.x + t.width / 2, t.y + t.height / 2, t.width, t.height, t.oneWay ? 0x435957 : 0x354650);
      platforms.add(visual);
      visual.setData('terrain', t);
      if (t.oneWay) {
        const b = visual.body as Phaser.Physics.Arcade.StaticBody;
        b.checkCollision.down = b.checkCollision.left = b.checkCollision.right = false;
      }
      bg.lineStyle(2, t.oneWay ? 0xc5d96b : 0x728a91).lineBetween(t.x, t.y, t.x + t.width, t.y);
    }
    const textStyle = { fontFamily: 'monospace', fontSize: '11px', color: '#a4b4ac' };
    for (const [i, s] of stations.entries()) {
      this.add.text(s.x - 60, 666, s.label, textStyle);
      this.add.text(s.x - 10, 628, `0${i + 1}`, { ...textStyle, fontSize: '22px', color: '#5f797d' });
    }
    this.add.text(570, 550, '8 px', textStyle); this.add.text(700, 539, '16 px', textStyle); this.add.text(840, 523, '28 px\nJUMP', textStyle);
    this.add.text(1292, 649, '180 px GAP', { ...textStyle, color: '#d6ee67' });
    this.add.text(1680, 480, 'S / ↓ DROP', textStyle);
    this.add.text(1885, 395, 'ONE-WAY', textStyle);
    this.soldier = new Soldier(this, this.config);
    this.physics.add.collider(this.soldier.collider, platforms, undefined, (_actor, object) => {
      const t = (object as Phaser.GameObjects.Rectangle).getData('terrain');
      return !t.oneWay || (this.soldier.dropRemaining <= 0 && this.soldier.body.velocity.y >= 0 && this.soldier.previousBottom <= t.y + 1);
    });
    this.targetArt = this.add.graphics().setDepth(12);
    this.overlay = this.add.graphics().setDepth(20);
    this.hud = this.add.text(16, 16, '', { fontFamily: 'monospace', fontSize: '11px', color: '#d6ee67', backgroundColor: '#132029dd', padding: { x: 10, y: 9 }, lineSpacing: 5 }).setScrollFactor(0).setDepth(30);
    const down = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement)?.matches('input,textarea,select')) return;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault();
      this.keys.add(event.code);
      if (event.repeat) return;
      if (['Space', 'KeyW', 'ArrowUp'].includes(event.code) && !this.paused) this.pendingJump = true;
      if (event.code === 'KeyR') this.reset();
      if (event.code === 'KeyP') this.togglePause();
      if (event.code === 'KeyT') this.slow = !this.slow;
      if (event.code === 'KeyH') this.debugVisible = !this.debugVisible;
      if (event.code === 'KeyF' && !this.paused) this.syncTrigger();
      if (event.code === 'KeyL' && !this.paused) this.gunLab.gun.reload();
      if (event.code === 'KeyQ' && !this.paused) {
        this.gunLab.select(this.gunLab.weapon.id === 'usp' ? 'm4' : 'usp');
      }
      if (event.code === 'Period') this.step();
      if (/^Digit[1-4]$/.test(event.code)) this.reset(Number(event.code.slice(-1)) - 1);
    };
    const up = (event: KeyboardEvent) => {
      this.keys.delete(event.code);
      this.syncTrigger();
    };
    const blur = () => { this.keys.clear(); this.pendingJump = false; this.mouseHeld = false; this.gunLab.setTrigger(false); };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', blur);
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.leftButtonDown()) {
        this.mouseHeld = true;
        if (!this.paused) this.syncTrigger();
      }
    });
    const pointerUp = () => {
      this.mouseHeld = false;
      this.syncTrigger();
    };
    this.input.on('pointerup', pointerUp);
    this.input.on('pointerupoutside', pointerUp);
    this.events.once('shutdown', () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur); });
    this.reset();
    window.dispatchEvent(new CustomEvent('strike-ready', { detail: this }));
    if (import.meta.env.DEV || import.meta.env.MODE === 'test') window.__strike = this;
  }
  reset(station = this.station) {
    this.station = Math.max(0, Math.min(stations.length - 1, station));
    const point = stations[this.station];
    this.soldier.reset(point.x, point.y);
    this.keys.clear(); this.pendingJump = false; this.accumulator = 0; this.singleSteps = 0;
    this.mouseHeld = false; this.gunLab.setTrigger(false);
    this.measurements.reset();
    this.cameras.main.centerOn(point.x, 405);
  }
  togglePause() { this.paused = !this.paused; this.accumulator = 0; this.pendingJump = false; }
  private syncTrigger() { this.gunLab.setTrigger(!this.paused && (this.keys.has('KeyF') || this.mouseHeld)); }
  step() { this.paused = true; this.singleSteps++; }
  snapshot() {
    const b = this.soldier.body;
    return { time: this.simTime, x: b.center.x, y: b.center.y, vx: b.velocity.x, vy: b.velocity.y, grounded: this.soldier.grounded, state: this.soldier.grounded ? Math.abs(b.velocity.x) > 1 ? 'RUN' : 'IDLE' : b.velocity.y < 0 ? 'RISE' : 'FALL', paused: this.paused, slow: this.slow, step: this.soldier.lastStep, config: { ...this.config }, measurement: this.measurements.latest, combat: this.gunLab.snapshot() };
  }
  simulate(input: MoveInput) {
    const dt = 1 / simulation.fixedHz;
    this.soldier.body.preUpdate(false, dt);
    const jumped = this.soldier.tick(input, dt);
    if (jumped) this.measurements.start(this.simTime, this.soldier.body.center.x, this.soldier.body.bottom);
    this.soldier.body.resetFlags();
    this.physics.world.step(dt);
    // Synchronize each fixed step, rather than accumulating body deltas across render frames.
    this.physics.world.postUpdate();
    this.simTime += dt;
    const aim = this.input.activePointer.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
    this.gunLab.tick(dt * 1000, this.simTime * 1000, { x: this.soldier.body.center.x, y: this.soldier.body.center.y }, aim);
    this.measurements.tick(this.simTime, this.soldier.body.center.x, this.soldier.body.bottom, this.soldier.grounded);
    if (this.soldier.body.y > simulation.respawnY) this.reset();
  }
  update(_time: number, deltaMs: number) {
    const axis = Number(this.keys.has('KeyD') || this.keys.has('ArrowRight')) - Number(this.keys.has('KeyA') || this.keys.has('ArrowLeft'));
    const drop = this.keys.has('KeyS') || this.keys.has('ArrowDown');
    if (!this.paused) this.accumulator += Math.min(deltaMs / 1000, simulation.maxFrameSeconds) * (this.slow ? simulation.slowScale : 1);
    while (this.accumulator + 1e-10 >= 1 / simulation.fixedHz || this.singleSteps > 0) {
      if (this.singleSteps > 0) this.singleSteps--; else this.accumulator -= 1 / simulation.fixedHz;
      this.simulate({ axis, jumpPressed: this.pendingJump, drop }); this.pendingJump = false;
    }
    this.cameras.main.centerOn(this.soldier.body.center.x, 405);
    const pointer = this.input.activePointer.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
    this.soldier.render(pointer);
    this.drawTarget();
    this.drawDebug(pointer);
    this.telemetryTimer += deltaMs;
    if (this.telemetryTimer > 75) { this.telemetryTimer = 0; window.dispatchEvent(new CustomEvent('strike-telemetry', { detail: this.snapshot() })); }
  }
  private drawTarget() {
    const s = this.gunLab.snapshot(); this.targetArt.clear();
    const { full, body } = s.targetBounds;
    this.targetArt.fillStyle(s.alive ? 0xd66e67 : 0x4b555b, .95).fillRect(full.x, body.y, full.width, body.height);
    this.targetArt.fillStyle(s.alive ? 0xe8b36b : 0x4b555b, .95).fillRect(full.x, full.y, full.width, body.y - full.y);
    this.targetArt.lineStyle(1, 0xd6ee67).strokeRect(full.x, full.y, full.width, full.height);
    this.targetArt.fillStyle(0x18252e).fillRect(full.x - 22, full.y + full.height + 6, 70, 6);
    this.targetArt.fillStyle(0xd6ee67).fillRect(full.x - 22, full.y + full.height + 6, 70 * s.health / this.gunLab.target.maxHealth, 6);
  }
  private drawDebug(pointer: Phaser.Math.Vector2) {
    this.overlay.clear(); this.hud.setVisible(this.debugVisible);
    if (!this.debugVisible) return;
    const b = this.soldier.body;
    const shot = this.gunLab.lastShot;
    if (shot) {
      this.overlay.lineStyle(2, shot.hit ? 0xf5ba70 : 0x67cfee, .7).lineBetween(shot.origin.x, shot.origin.y, shot.end.x, shot.end.y);
      this.overlay.strokeCircle(shot.end.x, shot.end.y, 3);
    }
    this.overlay.lineStyle(1, 0xd6ee67, .8).strokeRect(b.x, b.y, b.width, b.height);
    this.overlay.lineStyle(1, 0x67cfee, .8).lineBetween(b.center.x, b.center.y, b.center.x + b.velocity.x * .17, b.center.y + b.velocity.y * .17);
    this.overlay.lineStyle(1, 0xd6ee67, .25).lineBetween(b.center.x, b.center.y, pointer.x, pointer.y);
    this.overlay.lineStyle(1, 0xf5ba70, .9).strokeRect(b.x - this.config.stepProbe, b.bottom - this.config.maxStepHeight, b.width + this.config.stepProbe * 2, this.config.maxStepHeight);
    this.overlay.lineStyle(1, 0xd6ee67).strokeCircle(pointer.x, pointer.y, 6);
    const c = this.config;
    this.hud.setText([
      `${this.paused ? 'PAUSED' : this.slow ? 'SLOW 0.25x' : 'LIVE'}  |  MOVE 120 Hz / GUN 30 Hz  |  ${this.snapshot().state}`,
      `x ${b.center.x.toFixed(1)}  y ${b.center.y.toFixed(1)}  vx ${b.velocity.x.toFixed(1)}  vy ${b.velocity.y.toFixed(1)}  ground ${this.soldier.grounded}`,
      `TUNED: accel ${c.runAcceleration}  decel ${c.groundDeceleration}  speed ${c.maxRunSpeed}  air ${c.airAcceleration}`,
      `jump ${c.jumpVelocity}  gravity ${c.gravity}  fall ${c.maxFallSpeed}  step ${c.maxStepHeight}/${c.stepProbe}px`,
      `coyote ${c.coyoteTimeMs}ms  buffer ${c.jumpBufferMs}ms  drop ${c.dropThroughMs}ms  body ${c.bodyWidth}x${c.bodyHeight}`,
      `weapon ${this.gunLab.weapon.id.toUpperCase()}  ammo ${this.gunLab.gun.ammo}/${this.gunLab.weapon.magazineSize} + ${this.gunLab.gun.reserveAmmo} reserve  reload ${this.gunLab.gun.reloadFrames}f  target ${this.gunLab.target.health}hp  score ${this.gunLab.score}`,
      `last shot ${shot ? `${shot.steps} x 10px / range ${shot.maxDistance}px / ${shot.hit?.type === 'unit' ? shot.hit.region : shot.hit?.type ?? 'miss'}` : 'none'}  head x1.45 (no skills)`,
      `ammo multiplier ${this.gunLab.ammoMultiplier}  delay ${this.gunLab.gun.cooldownFrames} ticks  EXTRACTED: reload / range / hitbox  TUNED: muzzle / recoil; wall mask OFF`,
    ]);
  }
}
declare global { interface Window { __strike?: MovementLabScene } }
