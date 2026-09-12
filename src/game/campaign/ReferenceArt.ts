import Phaser from 'phaser';
import type { DeliveryTarget } from '../../shared/simulation/DeliveryObjectives';
import type { OffhandView } from '../../shared/simulation/Offhand';
import { WEAPONS, type ClassId } from './Catalog';
import offhandFrames from '../../client/presentation/offhand-frames.json';
import type { WeaponId } from '../combat/Combat';
import type { BulletTrace, Point } from '../combat/Ballistics';
import { CHARACTER_ART, characterAsset, characterPose, jointMatrix, transformPoint, type CharacterPart } from '../../client/presentation/CharacterPose';

const assets = ['usp', 'm4', 'vector', 'shotgun', 'dragunov', 'saw', 'beretta', 'ak47', 'deagle', ...Object.keys(offhandFrames), 'briefcase-1', 'briefcase-2', 'hijack', 'supply', 'flash', 'hills', 'clouds', 'outpost', 'aircraft'];
export function preloadReferenceArt(scene: Phaser.Scene) {
  for (const id of Object.keys(CHARACTER_ART)) scene.load.svg(`actor-${id}`, characterAsset(id), { scale: 4 });
  for (const id of assets) scene.load.image(`ref-${id}`, `/assets/reference/${id}.png`);
  scene.load.once('complete', () => {
    for (const [id, bounds] of Object.entries(offhandFrames)) {
      const texture = scene.textures.get(`ref-${id}`);
      if (!texture.has('equipment')) texture.add('equipment', 0, bounds[0], bounds[1], bounds[2], bounds[3]);
    }
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
  private muzzles = new Map<string, Point>();
  constructor(private scene: Phaser.Scene) {}
  begin() { this.cursor = 0; this.muzzles.clear(); for (const image of this.pool) image.setVisible(false); }
  tracer(graphics: Phaser.GameObjects.Graphics, trace: BulletTrace, actorId: string | undefined, age = 0, weapon = 'm4') {
    if (age < 0 || age >= 3) return;
    const start = (actorId ? this.muzzles.get(actorId) : undefined) ?? trace.origin;
    // Never draw backwards through a barrel when a wall is inside muzzle pre-travel.
    if ((trace.end.x - start.x) * (trace.end.x - trace.origin.x) + (trace.end.y - start.y) * (trace.end.y - trace.origin.y) <= 0) return;
    const fade = 1 - age / 3;
    // Stats_Guns.params: broad translucent line + thin bright core.
    graphics.lineStyle(3.5, weapon === 'dragunov' ? 0xcccccc : 0xffffc4, 0.3 * fade).lineBetween(start.x, start.y, trace.end.x, trace.end.y);
    graphics.lineStyle(1.5, weapon === 'dragunov' ? 0xeeeeee : 0xffffc4, 0.6 * fade).lineBetween(start.x, start.y, trace.end.x, trace.end.y);
  }
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
    const frame = Object.hasOwn(offhandFrames, id) || Object.hasOwn(WEAPONS, id) && WEAPONS[id as WeaponId].artFrame ? 'equipment' : '__BASE';
    image.setTexture(`ref-${id}`, frame).setDepth(2).setVisible(true).setPosition(x, y).setDisplaySize(w, h)
      .setOrigin(0.5).setRotation(angle).setFlip(flip, false).setTint(tint).setAlpha(alpha);
    return image;
  }
  private actorPart(part: CharacterPart, x: number, y: number) {
    const box = CHARACTER_ART[part.id], m = part.matrix;
    const center = transformPoint(m, box.x + box.w / 2, box.y + box.h / 2);
    const scaleX = Math.hypot(m[0], m[1]), scaleY = (m[0] * m[3] - m[1] * m[2]) / scaleX;
    const image = this.pool[this.cursor] ??= this.scene.add.image(0, 0, `actor-${part.id}`);
    this.cursor++;
    image.setTexture(`actor-${part.id}`).setDepth(2).setVisible(true).setOrigin(.5)
      .setPosition(x + center.x, y + center.y).setDisplaySize(box.w * scaleX, box.h * Math.abs(scaleY))
      .setRotation(Math.atan2(m[1], m[0])).setFlip(false, scaleY < 0).setTint(0xffffff).setAlpha(1);
    return image;
  }
  soldier(x: number, y: number, crouch: boolean, vx: number, jumping: boolean, frame: number, aim: { x: number; y: number }, weapon: string, tint: number, alive: boolean, reload = 0, flash = false, offhand?: OffhandView, role: ClassId = 'medic', actorId = 'player') {
    const skin = (part: string) => `${role}-${part}`;
    const flip = offhand?.equipped && offhand.kind === 'melee' && offhand.age >= 0 ? offhand.facing.x < 0 : aim.x < x;
    if (!alive) { this.actorPart({ id: skin('torso'), name: 'fallen', matrix: [0, 1, -1, 0, 0, -5] }, x, y).setAlpha(.45); return; }
    const special = !!offhand?.equipped && offhand.kind !== 'firearm';
    const selectedWeapon = Object.hasOwn(WEAPONS, weapon) ? weapon as WeaponId : 'm4';
    const pose = characterPose(role, selectedWeapon, { frame, vx, jumping, crouch, flip, reload, flash,
      aim: offhand?.equipped && offhand.kind === 'melee' && offhand.age >= 0
        ? { x: offhand.facing.x * 10000, y: -(crouch ? 28 : 42) + offhand.facing.y * 10000 }
        : { x: aim.x - x, y: aim.y - y }, bodyOnly: special,
      melee: offhand?.equipped && offhand.kind === 'melee' ? { id: offhand.id ?? 'knife', age: offhand.age } : undefined });
    for (const part of pose.parts) this.actorPart(part, x, y);
    if (offhand?.equipped && offhand.kind === 'melee') return;
    if (!special) {
      if (pose.muzzle) {
        const muzzle = { x: x + pose.muzzle.x, y: y + pose.muzzle.y }; this.muzzles.set(actorId, muzzle);
        if (flash) { const angle = Math.atan2(aim.y - muzzle.y, aim.x - muzzle.x); this.part('flash', muzzle.x + Math.cos(angle) * 8, muzzle.y + Math.sin(angle) * 8, 20, 12, angle); }
      }
      return;
    }
    const anchorY = y - (crouch ? 28 : 42);
    if (offhand?.equipped && offhand.kind !== 'firearm') {
      const id = offhand.id ?? (offhand.kind === 'melee' ? 'knife' : 'shield');
      const direction = offhand.kind === 'melee' && offhand.age >= 0
        ? Math.atan2(offhand.facing.y, offhand.facing.x) : Math.atan2(aim.y - anchorY, aim.x - x);
      const side = Math.cos(direction) < 0 ? -1 : 1;
      const arm = (hand: Point, bend: number) => {
        const elbow = { x: x + (hand.x - x) * 0.5 - Math.sin(direction) * bend,
          y: anchorY + (hand.y - anchorY) * 0.5 + Math.cos(direction) * bend };
        this.actorPart({ id: skin('upperarm'), name: 'offhand-upperarm', matrix: jointMatrix({ x, y: anchorY + 3 }, elbow, [-3, 0], [6, 10]) }, 0, 0);
        this.actorPart({ id: skin('forearm'), name: 'offhand-forearm', matrix: jointMatrix(elbow, hand, [-1, 0], [10, -3]) }, 0, 0);
        const rotation = direction;
        this.actorPart({ id: skin('hand'), name: 'offhand-hand', matrix: [Math.cos(rotation), Math.sin(rotation), -Math.sin(rotation), Math.cos(rotation), hand.x - 4 * Math.cos(rotation), hand.y - 4 * Math.sin(rotation)] }, 0, 0);
      };
      {
        const distance = offhand.deployed ? 24 : 16;
        const hand = { x: x + Math.cos(direction) * distance, y: anchorY + Math.sin(direction) * distance + (offhand.deployed ? 0 : 10) };
        arm(hand, side * 7);
        const textureId = side < 0 ? `${id}-back` : id;
        const bounds = offhandFrames[textureId as keyof typeof offhandFrames];
        // Translate AND rotate about the same aim origin used by interceptShield.
        this.part(textureId, hand.x, hand.y, bounds[2], bounds[3], direction - (side < 0 ? Math.PI : 0), side < 0);
      }
      return;
    }
  }
}
