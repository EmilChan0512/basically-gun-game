import Phaser from 'phaser';
import type { DeliveryTarget } from '../../shared/simulation/DeliveryObjectives';
import type { OffhandView } from '../../shared/simulation/Offhand';
import { WEAPONS } from './Catalog';
import type { WeaponId } from '../combat/Combat';

const assets = [...Object.keys(WEAPONS), 'knife', 'shield', 'shield-back', 'briefcase-1', 'briefcase-2', 'hijack', 'boot', 'leg', 'arm', 'torso', 'head', 'supply', 'flash', 'hills', 'clouds', 'outpost', 'aircraft'];
export function preloadReferenceArt(scene: Phaser.Scene) {
  for (const id of assets) scene.load.image(`ref-${id}`, `/assets/reference/${id}.png`);
  scene.load.once('complete', () => {
    for (const [id, weapon] of Object.entries(WEAPONS)) if (weapon.artFrame) {
      const texture = scene.textures.get(`ref-${id}`);
      if (!texture.has('equipment')) texture.add('equipment', 0, ...weapon.artFrame);
    }
  });
}

/** A pooled visual rig. Animation follows simulation frames, never changes collision geometry. */
export class ReferenceArt {
  private pool: Phaser.GameObjects.Image[] = [];
  private cursor = 0;
  constructor(private scene: Phaser.Scene) {}
  begin() { this.cursor = 0; for (const image of this.pool) image.setVisible(false); }
  delivery(targets: DeliveryTarget[] | undefined, positions: ReadonlyMap<string, { x: number; y: number }>, graphics: Phaser.GameObjects.Graphics) {
    for (const target of targets ?? []) {
      const tint = target.team === 1 ? 0x58c6ff : 0xff9748;
      graphics.lineStyle(3, tint, 0.85).strokeEllipse(target.base.x, target.base.y, 72, 20);
      const carrier = target.carrierId ? positions.get(target.carrierId) : undefined;
      if (target.carrierId && !carrier) continue;
      const point = carrier ?? target.base;
      this.part(`briefcase-${target.team}`, point.x - 14, point.y - (carrier ? 70 : 35), 112, 68).setDepth(3);
    }
  }
  part(id: string, x: number, y: number, w: number, h: number, angle = 0, flip = false, tint = 0xffffff, alpha = 1) {
    const image = this.pool[this.cursor] ??= this.scene.add.image(0, 0, `ref-${id}`).setDepth(2);
    this.cursor++;
    const frame = Object.hasOwn(WEAPONS, id) && WEAPONS[id as WeaponId].artFrame ? 'equipment' : '__BASE';
    image.setTexture(`ref-${id}`, frame).setDepth(2).setVisible(true).setPosition(x, y).setDisplaySize(w, h)
      .setOrigin(0.5).setRotation(angle).setFlip(flip, false).setTint(tint).setAlpha(alpha);
    return image;
  }
  soldier(x: number, y: number, crouch: boolean, vx: number, jumping: boolean, frame: number, aim: { x: number; y: number }, weapon: string, tint: number, alive: boolean, reload = false, flash = false, offhand?: OffhandView) {
    const flip = aim.x < x, facing = flip ? -1 : 1, height = crouch ? 44 : 66;
    if (!alive) { this.part('torso', x, y - 7, 26, 23, Math.PI / 2, flip, tint, 0.45); return; }
    const stride = jumping ? 5 : Math.sin(frame * 0.6) * Math.min(7, Math.abs(vx) * 1.5);
    for (const side of [-1, 1]) {
      const foot = x + side * (5 + stride);
      this.part('leg', x + side * 5, y - (crouch ? 10 : 15), 10, crouch ? 16 : 25, side * stride * 0.06, flip);
      this.part('boot', foot + facing * 2, y - 4, 14, 10, 0, flip);
    }
    this.part('torso', x, y - height + 34, 26, crouch ? 22 : 30, 0, flip, tint);
    this.part('head', x + facing * 2, y - height + 12, 29, 29, 0, flip, tint);
    const anchorY = y - (crouch ? 28 : 42);
    if (offhand?.equipped && offhand.kind !== 'firearm') {
      const direction = offhand.kind === 'melee' && offhand.age >= 0
        ? Math.atan2(offhand.facing.y, offhand.facing.x) : Math.atan2(aim.y - anchorY, aim.x - x);
      const swing = offhand.kind === 'melee' && offhand.age >= 0
        ? offhand.age < 4 ? -0.8 : offhand.age < 7 ? -0.8 + (offhand.age - 4) * 0.8 : Math.max(0, 0.8 * (19 - offhand.age) / 12) : 0;
      const angle = direction + swing * facing;
      this.part('arm', x + Math.cos(angle) * 9, anchorY + 7, 12, 24, angle - Math.PI / 2, flip, tint);
      // Keep the original 112x68 export canvas: its centered art is much smaller than the canvas.
      if (offhand.kind === 'melee') this.part('knife', x + Math.cos(angle) * 25, anchorY + Math.sin(angle) * 25, 112, 68, angle - Math.PI / 2);
      else this.part(flip ? 'shield-back' : 'shield', x + facing * (offhand.deployed ? 19 : 10), anchorY + (offhand.deployed ? 4 : 15),
        112, 68, offhand.deployed ? direction - (flip ? Math.PI : 0) : facing * 0.35, flip, offhand.durability > 0 ? 0xffffff : 0x777777);
      return;
    }
    const angle = Math.atan2(aim.y - anchorY, aim.x - x) + (reload ? facing * 0.45 : 0);
    const definition = Object.hasOwn(WEAPONS, weapon) ? WEAPONS[weapon as WeaponId] : WEAPONS.m4;
    if (!Object.hasOwn(WEAPONS, weapon)) weapon = 'm4';
    const length = definition.length;
    const texture = this.scene.textures.get(`ref-${weapon}`).get(definition.artFrame ? 'equipment' : '__BASE');
    const gunHeight = Math.min(23, length * texture.height / texture.width);
    this.part(weapon, x + Math.cos(angle) * 17, anchorY + Math.sin(angle) * 17, length, gunHeight, flip ? angle - Math.PI : angle, flip);
    this.part('arm', x + Math.cos(angle) * 5, anchorY + 9, 12, 24, angle - Math.PI / 2, flip, tint);
    if (flash) this.part('flash', x + Math.cos(angle) * (17 + length / 2 + 9), anchorY + Math.sin(angle) * (17 + length / 2 + 9), 24, 15, angle);
  }
}
