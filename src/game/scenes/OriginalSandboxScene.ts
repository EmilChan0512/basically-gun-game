import Phaser from 'phaser';
import { TrainingAudio } from '../../client/audio/TrainingAudio';
import { ReferenceArt, preloadReferenceArt } from '../campaign/ReferenceArt';
import { OriginalSandbox, referenceTerrain } from '../combat/OriginalSandbox';
import { COMBAT_FRAME_MS } from '../combat/Combat';

export class OriginalSandboxScene extends Phaser.Scene {
  private audio = new TrainingAudio();
  core = new OriginalSandbox();
  paused = false;
  slow = false;
  debugVisible = true;
  private keys = new Set<string>();
  private mouseHeld = false;
  private rig!: ReferenceArt;
  private art!: Phaser.GameObjects.Graphics;
  private hud!: Phaser.GameObjects.Text;
  private combatHud!: Phaser.GameObjects.Text;
  private hitLabel!: Phaser.GameObjects.Text;
  constructor() { super('OriginalSandboxScene'); }
  preload() { preloadReferenceArt(this); }
  create() {
    this.rig = new ReferenceArt(this);
    this.cameras.main.setBounds(0, 0, 2400, 760);
    const background = this.add.graphics();
    background.fillStyle(0x18252e).fillRect(0, 0, 2400, 760);
    for (const terrain of referenceTerrain) {
      background.fillStyle(0x354650).fillRect(terrain.x, terrain.y, terrain.width, terrain.height);
      background.lineStyle(2, 0x728a91).lineBetween(terrain.x, terrain.y, terrain.x + terrain.width, terrain.y);
    }
    this.add.text(90, 360, 'PROJECT STRIKE\nCOMBAT SANDBOX', { fontFamily: 'monospace', fontSize: '40px', color: '#3d555f' });
    this.add.text(800, 625, '28px climb    60px wall       180px gap', { fontFamily: 'monospace', fontSize: '12px', color: '#b1c2b3' });
    this.art = this.add.graphics().setDepth(3);
    this.combatHud = this.add.text(16, 550, '', { fontFamily: 'monospace', fontSize: '18px', color: '#ffffff', backgroundColor: '#132029dd', padding: { x: 12, y: 8 } }).setScrollFactor(0);
    this.hitLabel = this.add.text(700, 490, '', { fontFamily: 'monospace', fontSize: '18px', color: '#ffe09b' }).setOrigin(0.5);
    this.hud = this.add.text(16, 16, '', { fontFamily: 'monospace', fontSize: '12px', color: '#d6ee67', backgroundColor: '#132029dd', padding: { x: 10, y: 9 }, lineSpacing: 5 }).setScrollFactor(0);
    const down = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement)?.matches('input,textarea,select,button,a')) return;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault();
      this.keys.add(event.code);
      if (event.repeat) return;
      if (event.code === 'KeyP') this.togglePause();
      if (event.code === 'Period') this.step();
      if (event.code === 'KeyT') this.slow = !this.slow;
      if (event.code === 'KeyH') this.debugVisible = !this.debugVisible;
      if (event.code === 'KeyR') this.reset();
      if (/^Digit[1-4]$/.test(event.code)) this.reset(Number(event.code.slice(-1)) - 1);
      if (!this.paused) {
        if (['Space', 'KeyW', 'ArrowUp'].includes(event.code)) this.core.jump();
        if (event.code === 'KeyQ') this.core.swap();
        if (event.code === 'KeyL') this.core.reload();
        if (event.code === 'KeyK') this.core.lethalFixture();
      }
      this.syncTrigger();
    };
    const up = (event: KeyboardEvent) => { this.keys.delete(event.code); this.syncTrigger(); };
    const blur = () => { this.keys.clear(); this.mouseHeld = false; this.syncTrigger(); };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', blur);
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => { if (pointer.leftButtonDown()) { this.mouseHeld = true; this.syncTrigger(); } });
    const release = () => { this.mouseHeld = false; this.syncTrigger(); };
    this.input.on('pointerup', release); this.input.on('pointerupoutside', release);
    this.events.once('shutdown', () => { this.audio.reset(); window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur); });
    if (import.meta.env.DEV || import.meta.env.MODE === 'test') window.__originalStrike = this;
    window.dispatchEvent(new CustomEvent('strike-original-ready', { detail: this }));
  }
  private syncTrigger() { this.core.setTrigger(!this.paused && (this.keys.has('KeyF') || this.mouseHeld)); }
  reset(station = 0) {
    this.audio.reset();
    this.core = new OriginalSandbox();
    const positions = [180, 730, 1100, 1480];
    this.core.movement.reset(positions[Math.max(0, Math.min(3, station))], 599.5);
    this.keys.clear(); this.mouseHeld = false;
  }
  togglePause() { this.paused = !this.paused; this.syncTrigger(); }
  step() { this.paused = true; this.syncTrigger(); this.core.advance(COMBAT_FRAME_MS, this.inputState(), this.pointer()); }
  private inputState() {
    return { left: this.keys.has('KeyA') || this.keys.has('ArrowLeft'), right: this.keys.has('KeyD') || this.keys.has('ArrowRight'), crouch: this.keys.has('KeyS') || this.keys.has('ArrowDown') };
  }
  private pointer() { return this.input.activePointer.positionToCamera(this.cameras.main) as Phaser.Math.Vector2; }
  snapshot() { return { ...this.core.snapshot(), paused: this.paused, slow: this.slow }; }
  update(_time: number, deltaMs: number) {
    if (!this.paused) this.core.advance(Math.min(deltaMs, 100) * (this.slow ? 0.25 : 1), this.inputState(), this.pointer());
    const state = this.core.snapshot(), movement = this.core.movement;
    this.audio.accept({ frame: state.frame, x: movement.x, y: movement.y, grounded: !movement.jumping, alive: state.life.alive, health: state.life.health,
      weapon: state.combat.weapon, shots: state.combat.shotsFired, reload: state.combat.reloadFrames, ammo: state.combat.ammo,
      fire: this.mouseHeld || this.keys.has('KeyF'), targetHealth: state.target.health, targetAlive: state.target.alive }, this.paused);
    this.cameras.main.centerOn(movement.x, 390);
    this.art.clear(); this.rig.begin();
    const aim = { x: movement.x + this.core.aimDirection.x * 100, y: movement.y - (movement.crouching ? 28 : 42) + this.core.aimDirection.y * 100 };
    this.rig.soldier(movement.x, movement.y, movement.crouching, movement.vx, movement.jumping, state.frame, aim, state.combat.weapon, 0xb7e8de, state.life.alive, state.combat.reloadFrames,
      state.combat.lastShotFrame !== null && state.combat.combatFrame - state.combat.lastShotFrame < 2);
    const { full } = this.core.guns.snapshot().targetBounds;
    this.rig.soldier(full.x + full.width / 2, full.y + full.height, false, 0, false, state.frame, { x: 0, y: full.y + 24 }, 'm4', 0xf1b0a0, state.target.alive, 0, false, undefined, 'commando', 'target');
    this.art.fillStyle(0x18252e).fillRect(full.x - 9, full.y - 12, 44, 5);
    this.art.fillStyle(state.target.spawnProtectionFrames ? 0x67cfee : 0xd6ee67).fillRect(full.x - 9, full.y - 12, 44 * state.target.health / 85, 5);
    const shot = this.core.guns.lastShot;
    const shotAge = state.combat.lastShotFrame === null ? Infinity : state.combat.combatFrame - state.combat.lastShotFrame;
    if (shot && state.life.alive && (this.debugVisible || shotAge < 3)) this.rig.tracer(this.art, shot, 'player', this.debugVisible ? 0 : shotAge, state.combat.weapon);
    const feedback = state.feedback;
    this.hitLabel.setVisible(!!feedback && state.frame - feedback.frame < 24);
    if (feedback) this.hitLabel.setPosition(this.core.guns.targetPoint.x, full.y - 32 - Math.min(24, state.frame - feedback.frame))
      .setText(`${feedback.killed ? 'ELIMINATED' : feedback.head ? 'HEAD' : 'HIT'}  ${feedback.amount.toFixed(1)}`);
    const pointer = this.pointer();
    this.art.lineStyle(1, 0xd6ee67).strokeCircle(pointer.x, pointer.y, 5);
    const reload = state.combat.reloadFrames > 0 ? ` / RELOADING ${(state.combat.reloadFrames / 30).toFixed(1)}s` : state.combat.ammo === 0 ? ' / EMPTY · Q SWITCH' : '';
    this.combatHud.setText(state.life.alive
      ? `HP ${Math.ceil(state.life.health)} / 85  |  ${state.combat.weapon.toUpperCase()} ${state.combat.ammo} + ${state.combat.reserveAmmo}${reload}\nKILLS ${state.kills}  /  DEATHS ${state.life.deaths}${state.life.spawnProtectionFrames ? '  /  SPAWN PROTECTION' : ''}`
      : `RESPAWN IN ${((state.life.respawnFrames + 1) / 30).toFixed(1)}s\nKILLS ${state.kills}  /  DEATHS ${state.life.deaths}`);
    this.hud.setVisible(this.debugVisible).setText([
      `${this.paused ? 'PAUSED' : 'LIVE'} / 30 Hz / MEDIC LV1 / USP + M4`,
      `HP ${Math.ceil(state.life.health)} / 85   protection ${state.life.spawnProtectionFrames}f   respawn ${state.life.respawnFrames}f`,
      `${state.combat.weapon.toUpperCase()} ${state.combat.ammo} + ${state.combat.reserveAmmo}   reload ${state.combat.reloadFrames}f`,
      `feet ${state.x.toFixed(1)},${state.y.toFixed(1)}   velocity ${state.vx.toFixed(2)},${state.vy.toFixed(2)} px/frame`,
      `recoil ${state.recoil.dynamic.toFixed(2)} / ${state.recoil.upper.toFixed(2)}   target ${state.target.health.toFixed(2)} HP`,
      'Project Strike / reference-informed mechanics / reference texture pass',
    ]);
    window.dispatchEvent(new CustomEvent('strike-original-telemetry', { detail: this.snapshot() }));
  }
}
declare global { interface Window { __originalStrike?: OriginalSandboxScene } }
