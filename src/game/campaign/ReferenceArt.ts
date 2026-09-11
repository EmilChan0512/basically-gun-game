import Phaser from 'phaser';
import type { DeliveryTarget } from '../../shared/simulation/DeliveryObjectives';
import type { OffhandView } from '../../shared/simulation/Offhand';
import { WEAPONS, SPECIAL_OFFHANDS, type ClassId } from './Catalog';
import offhandFrames from '../../client/presentation/offhand-frames.json';
import type { WeaponId } from '../combat/Combat';
import type { BulletTrace, Point } from '../combat/Ballistics';

const assets = [...Object.keys(WEAPONS), ...Object.keys(offhandFrames), 'briefcase-1', 'briefcase-2', 'hijack', 'boot', 'leg', 'arm', 'torso', 'head', 'supply', 'flash', 'hills', 'clouds', 'outpost', 'aircraft'];
for (const role of ['medic', 'assassin', 'commando', 'tank']) for (const part of ['boot', 'leg', 'arm', 'torso', 'head']) assets.push(`${role}-${part}`);
export function preloadReferenceArt(scene: Phaser.Scene) {
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
  private trails: Phaser.GameObjects.Graphics;
  constructor(private scene: Phaser.Scene) { this.trails = scene.add.graphics().setDepth(3); }
  begin() { this.cursor = 0; this.trails.clear(); this.muzzles.clear(); for (const image of this.pool) image.setVisible(false); }
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
  soldier(x: number, y: number, crouch: boolean, vx: number, jumping: boolean, frame: number, aim: { x: number; y: number }, weapon: string, tint: number, alive: boolean, reload = 0, flash = false, offhand?: OffhandView, role: ClassId = 'medic', actorId = 'player') {
    const skin = (part: string) => `${role}-${part}`;
    tint = 0xffffff;
    const flip = offhand?.equipped && offhand.kind === 'melee' && offhand.age >= 0 ? offhand.facing.x < 0 : aim.x < x;
    const facing = flip ? -1 : 1, height = crouch ? 44 : 66;
    if (!alive) { this.part(skin('torso'), x, y - 7, 26, 23, Math.PI / 2, flip, tint, 0.45); return; }
    const stride = jumping ? 5 : Math.sin(frame * 0.6) * Math.min(7, Math.abs(vx) * 1.5);
    for (const side of [-1, 1]) {
      const foot = x + side * (5 + stride);
      this.part(skin('leg'), x + side * 5, y - (crouch ? 10 : 15), 10, crouch ? 16 : 25, side * stride * 0.06, flip);
      this.part(skin('boot'), foot + facing * 2, y - 4, 14, 10, 0, flip);
    }
    this.part(skin('torso'), x, y - height + 34, 26, crouch ? 22 : 30, 0, flip, tint);
    this.part(skin('head'), x + facing * 2, y - height + 12, 29, 29, 0, flip, tint);
    const anchorY = y - (crouch ? 28 : 42);
    if (offhand?.equipped && offhand.kind !== 'firearm') {
      const id = offhand.id ?? (offhand.kind === 'melee' ? 'knife' : 'shield');
      const definition = SPECIAL_OFFHANDS[id];
      const direction = offhand.kind === 'melee' && offhand.age >= 0
        ? Math.atan2(offhand.facing.y, offhand.facing.x) : Math.atan2(aim.y - anchorY, aim.x - x);
      const side = Math.cos(direction) < 0 ? -1 : 1;
      const arm = (hand: Point, bend: number) => {
        const elbow = { x: x + (hand.x - x) * 0.5 - Math.sin(direction) * bend,
          y: anchorY + (hand.y - anchorY) * 0.5 + Math.cos(direction) * bend };
        for (const [a, b] of [[{ x, y: anchorY + 3 }, elbow], [elbow, hand]])
          this.part(skin('arm'), (a.x + b.x) / 2, (a.y + b.y) / 2, 8, Math.hypot(b.x - a.x, b.y - a.y) + 4,
            Math.atan2(b.y - a.y, b.x - a.x) - Math.PI / 2, side < 0);
      };
      if (definition.kind === 'melee') {
        const age = Math.max(0, offhand.age - 1), { windup, active, recovery } = definition;
        const smooth = (t: number) => { t = Phaser.Math.Clamp(t, 0, 1); return t * t * (3 - 2 * t); };
        const attacking = offhand.age >= 0;
        const phase = age < windup ? smooth(age / windup) : age < windup + active
          ? 1 - 2 * smooth((age - windup + 1) / active) : -1 + smooth((age - windup - active) / recovery);
        const swing = attacking ? phase * (definition.style === 'sword' ? -1.25 : -0.55) : -0.22;
        const angle = direction + swing * side;
        const thrust = attacking && age >= windup && age < windup + active ? 10 : 0;
        const hand = { x: x + Math.cos(direction) * (22 + thrust), y: anchorY + Math.sin(direction) * (22 + thrust) };
        arm(hand, side * (definition.style === 'sword' ? 10 : 5));
        const bounds = offhandFrames[id as keyof typeof offhandFrames];
        const length = definition.style === 'sword' ? 57 : Math.min(43, bounds[3]);
        this.part(id, hand.x, hand.y, length * bounds[2] / bounds[3], length, angle - Math.PI / 2).setOrigin(0.5, 0.14);
        if (attacking && age >= windup && age < windup + active) {
          this.trails.lineStyle(2, 0xf4edcf, 0.45).beginPath();
          const radius = length * 0.8;
          for (let i = 0; i <= 8; i++) {
            const a = angle - side * (1 - i / 8) * (definition.style === 'sword' ? 1.8 : 0.7);
            const px = hand.x + Math.cos(a) * radius, py = hand.y + Math.sin(a) * radius;
            if (i === 0) this.trails.moveTo(px, py); else this.trails.lineTo(px, py);
          }
          this.trails.strokePath();
        }
      } else {
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
    const definition = Object.hasOwn(WEAPONS, weapon) ? WEAPONS[weapon as WeaponId] : WEAPONS.m4;
    const progress = reload > 0 ? Phaser.Math.Clamp(1 - reload / definition.config.reloadFrames, 0, 1) : 0;
    const ease = (value: number) => { const t = Phaser.Math.Clamp(value, 0, 1); return t * t * (3 - 2 * t); };
    const lower = reload > 0 ? ease(progress / 0.2) * (1 - ease((progress - 0.78) / 0.22)) : 0;
    const angle = Math.atan2(aim.y - anchorY, aim.x - x) + facing * lower * 0.65;
    if (!Object.hasOwn(WEAPONS, weapon)) weapon = 'm4';
    const length = definition.length;
    const texture = this.scene.textures.get(`ref-${weapon}`).get(definition.artFrame ? 'equipment' : '__BASE');
    const gunHeight = Math.min(23, length * texture.height / texture.width);
    this.part(weapon, x + Math.cos(angle) * 17, anchorY + Math.sin(angle) * 17, length, gunHeight, flip ? angle - Math.PI : angle, flip);
    this.part(skin('arm'), x + Math.cos(angle) * 5, anchorY + 9, 12, 24, angle - Math.PI / 2, flip, tint);
    // Support hand leaves the fore-end, reaches the belt, inserts, then returns.
    const reach = reload > 0 ? Math.sin(Math.PI * Phaser.Math.Clamp((progress - 0.15) / 0.65, 0, 1)) : 0;
    this.part(skin('arm'), x + Math.cos(angle) * (19 - reach * 13), anchorY + Math.sin(angle) * 12 + 6 + reach * 16,
      9, 20, angle - Math.PI / 2 + facing * reach * 0.9, flip, tint);
    const barrelOffsets: Record<string, number> = { usp: -0.273, m4: -0.158, vector: -0.214, shotgun: -0.221, dragunov: -0.043, saw: -0.056, ak47: -0.322, deagle: -0.295 };
    const barrelY = (barrelOffsets[weapon] ?? -0.1) * gunHeight * facing;
    const muzzle = { x: x + Math.cos(angle) * (17 + length / 2) - Math.sin(angle) * barrelY,
      y: anchorY + Math.sin(angle) * (17 + length / 2) + Math.cos(angle) * barrelY };
    this.muzzles.set(actorId, muzzle);
    if (flash) this.part('flash', muzzle.x + Math.cos(angle) * 8, muzzle.y + Math.sin(angle) * 8, 20, 12, angle);
  }
}
