import Phaser from 'phaser';
import { OriginalSandbox, referenceTerrain } from '../combat/OriginalSandbox';
import { COMBAT_FRAME_MS } from '../combat/Combat';

export class OriginalSandboxScene extends Phaser.Scene {
  core = new OriginalSandbox();
  paused = false;
  slow = false;
  debugVisible = true;
  private keys = new Set<string>();
  private mouseHeld = false;
  private art!: Phaser.GameObjects.Graphics;
  private hud!: Phaser.GameObjects.Text;
  constructor() { super('OriginalSandboxScene'); }
  create() {
    this.cameras.main.setBounds(0, 0, 2400, 760);
    const background = this.add.graphics();
    background.fillStyle(0x18252e).fillRect(0, 0, 2400, 760);
    for (const terrain of referenceTerrain) {
      background.fillStyle(0x354650).fillRect(terrain.x, terrain.y, terrain.width, terrain.height);
      background.lineStyle(2, 0x728a91).lineBetween(terrain.x, terrain.y, terrain.x + terrain.width, terrain.y);
    }
    this.add.text(90, 360, 'ORIGINAL RULES\nVERIFICATION', { fontFamily: 'monospace', fontSize: '40px', color: '#3d555f' });
    this.add.text(800, 625, '28px climb    60px wall       180px gap', { fontFamily: 'monospace', fontSize: '12px', color: '#b1c2b3' });
    this.art = this.add.graphics();
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
    this.events.once('shutdown', () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur); });
    if (import.meta.env.DEV || import.meta.env.MODE === 'test') window.__originalStrike = this;
    window.dispatchEvent(new CustomEvent('strike-original-ready', { detail: this }));
  }
  private syncTrigger() { this.core.setTrigger(!this.paused && (this.keys.has('KeyF') || this.mouseHeld)); }
  reset(station = 0) {
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
    this.cameras.main.centerOn(movement.x, 390);
    this.art.clear();
    const fullHeight = movement.crouching ? 44 : 66;
    if (state.life.alive) {
      this.art.fillStyle(state.life.spawnProtectionFrames ? 0x67cfee : 0x83978b, 0.85).fillRect(movement.x - 13, movement.y - fullHeight, 26, fullHeight);
      this.art.fillStyle(0xd6ee67).fillRect(movement.x - 13, movement.y - fullHeight, 26, movement.crouching ? 16 : 22);
      const anchorY = movement.y - (movement.crouching ? 28 : 42);
      this.art.lineStyle(5, 0xd5e2c9).lineBetween(movement.x, anchorY, movement.x + this.core.aimDirection.x * 40, anchorY + this.core.aimDirection.y * 40);
    }
    const { full, body } = this.core.guns.snapshot().targetBounds;
    this.art.fillStyle(state.target.alive ? 0xd66e67 : 0x4b555b).fillRect(full.x, body.y, full.width, body.height);
    this.art.fillStyle(state.target.alive ? 0xe8b36b : 0x4b555b).fillRect(full.x, full.y, full.width, body.y - full.y);
    const shot = this.core.guns.lastShot;
    if (shot && this.debugVisible) this.art.lineStyle(2, shot.hit ? 0xf5ba70 : 0x67cfee).lineBetween(shot.origin.x, shot.origin.y, shot.end.x, shot.end.y);
    this.hud.setVisible(this.debugVisible).setText([
      `${this.paused ? 'PAUSED' : 'LIVE'} / 30 Hz / MEDIC LV1 / USP + M4`,
      `HP ${Math.ceil(state.life.health)} / 85   protection ${state.life.spawnProtectionFrames}f   respawn ${state.life.respawnFrames}f`,
      `${state.combat.weapon.toUpperCase()} ${state.combat.ammo} + ${state.combat.reserveAmmo}   reload ${state.combat.reloadFrames}f`,
      `feet ${state.x.toFixed(1)},${state.y.toFixed(1)}   velocity ${state.vx.toFixed(2)},${state.vy.toFixed(2)} px/frame`,
      `recoil ${state.recoil.dynamic.toFixed(2)} / ${state.recoil.upper.toFixed(2)}   target ${state.target.health.toFixed(2)} HP`,
      'Graybox fixtures / moving arm pose and frame dispatch under review',
    ]);
    window.dispatchEvent(new CustomEvent('strike-original-telemetry', { detail: this.snapshot() }));
  }
}
declare global { interface Window { __originalStrike?: OriginalSandboxScene } }
