import recovered from './character-poses.json';
import { WEAPONS, type ClassId } from '../../game/campaign/Catalog';
import type { WeaponId } from '../../game/combat/Combat';
import { SPECIAL_OFFHANDS, type SpecialOffhandId } from '../../shared/content/Offhands';

export type Matrix = readonly number[];
export interface CharacterPart { id: string; name: string; matrix: Matrix }
export const CHARACTER_ART: Record<string, { x: number; y: number; w: number; h: number }> = recovered.art;
export const characterAsset = (id: string) => `/assets/characters/${id}.svg`;
type Joint = { part: string; name: string; matrix: Matrix };
const movements: Record<string, Joint[][]> = recovered.locomotion;
const arms: Record<string, { rear: Joint[][]; front: Joint[][] }> = recovered.arms;
export const transformPoint = (m: Matrix, x: number, y: number) => ({ x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] });
export function compose(a: Matrix, b: Matrix): Matrix {
  const origin = transformPoint(a, b[4], b[5]);
  return [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], origin.x, origin.y];
}
export interface PoseOptions { recoilDegrees?: number; frame?: number; vx?: number; crouch?: boolean; jumping?: boolean; flip?: boolean; aim?: { x: number; y: number }; reload?: number; flash?: boolean; bodyOnly?: boolean; melee?: { id: SpecialOffhandId; age: number } }
export const IDLE_CYCLE_FRAMES = movements.idle.length * 3;
function sample(poses: Joint[][], frame: number): Joint[] {
  const base = Math.floor(frame), fraction = frame - base;
  const current = poses[base % poses.length], next = poses[(base + 1) % poses.length];
  return current.map(j => {
    const end = next.find(p => p.name === j.name) ?? j;
    return { ...j, matrix: j.matrix.map((value, i) => value + (end.matrix[i] - value) * fraction) };
  });
}
function blendGrip(from: Joint[], to: Joint[], t: number): Joint[] {
  return to.map(j => {
    const a = from.find(p => p.name === j.name)?.matrix ?? j.matrix, b = j.matrix;
    const matrix = [0, 0, 0, 0, a[4] + (b[4] - a[4]) * t, a[5] + (b[5] - a[5]) * t];
    for (const axis of [0, 2]) {
      const angle = Math.atan2(a[axis + 1], a[axis]);
      const delta = Math.atan2(Math.sin(Math.atan2(b[axis + 1], b[axis]) - angle), Math.cos(Math.atan2(b[axis + 1], b[axis]) - angle));
      const length = Math.hypot(a[axis], a[axis + 1]) * (1 - t) + Math.hypot(b[axis], b[axis + 1]) * t;
      matrix[axis] = Math.cos(angle + delta * t) * length; matrix[axis + 1] = Math.sin(angle + delta * t) * length;
    }
    return { ...j, matrix };
  });
}
/** Native vector proportions and authored joints, shared by battle and armory. */
export function characterPose(role: ClassId, weapon: WeaponId, options: PoseOptions = {}) {
  const { frame = 0, vx = 0, crouch = false, jumping = false, flip = false, reload = 0 } = options;
  const facing = flip ? -1 : 1, running = Math.abs(vx) > .1, backwards = vx * facing < 0;
  const gait = role === 'tank' || role === 'commando' ? '2' : '1';
  const animation = jumping ? 'fallloop' : crouch ? running ? backwards ? 'duckrunback' : 'duckrun' : 'duckloop'
    : running ? `run${backwards ? 'back' : ''}${gait}` : 'idle';
  const frames = movements[animation], joints = sample(frames, Math.max(0, frame) / (!running && !jumping ? 3 : 1));
  const mirror = [facing, 0, 0, 1, 0, 0];
  const body = joints.filter(j => j.part !== 'shoulder').map(j => ({ id: `${role}-${j.part}`, name: j.name, matrix: compose(mirror, j.matrix) }));
  const shoulder = joints.find(j => j.part === 'shoulder')!.matrix;
  if (options.bodyOnly && !options.melee) {
    const root = [facing, 0, 0, 1, shoulder[4] * facing, shoulder[5]];
    const resting = recovered.restingArm.map(j => ({ id: `${role}-${j.part}`, name: j.name, matrix: compose(root, j.matrix) }));
    return { parts: [...resting, ...body], muzzle: undefined };
  }
  const aim = options.aim ?? { x: 100 * facing, y: shoulder[5] };
  const angle = Math.atan2(aim.y - shoulder[5], (aim.x - shoulder[4] * facing) * facing) - (options.recoilDegrees ?? 0) * Math.PI / 180;
  const c = Math.cos(angle), s = Math.sin(angle), root = [facing * c, s, -facing * s, c, shoulder[4] * facing, shoulder[5]];
  const definition = WEAPONS[weapon];
  if (options.melee) {
    const { id, age } = options.melee, melee = SPECIAL_OFFHANDS[id];
    if (melee.kind !== 'melee') throw Error('Expected melee equipment');
    const clip = arms[`${melee.style}${age >= 0 ? '_fire' : ''}`];
    // Original fire clips begin at contact. Add our simulation's windup before
    // playing contact, follow-through and recovery, retaining authored grips.
    const index = age < 0 ? 0 : Math.max(0, age - 1);
    const grip = (side: 'rear' | 'front') => {
      const poses = clip[side], idle = arms[melee.style][side][0];
      if (age < 0) return idle;
      if (index < melee.windup) return blendGrip(idle, poses[0], index / melee.windup);
      const activeIndex = index - melee.windup;
      const sourceFrame = activeIndex < melee.active ? activeIndex
        : melee.active + (activeIndex - melee.active) * (poses.length - 1 - melee.active) / (melee.recovery - 1);
      const low = Math.min(poses.length - 1, Math.floor(sourceFrame)), high = Math.min(poses.length - 1, low + 1);
      return blendGrip(poses[low], poses[high], sourceFrame - Math.floor(sourceFrame));
    };
    const parts = (side: 'rear' | 'front') => grip(side).map(j => ({
      id: j.part === 'weapon' ? id : `${role}-${j.part}`, name: j.name, matrix: compose(root, j.matrix),
    }));
    return { parts: [...parts('rear'), ...body, ...parts('front').filter(p => p.name !== 'gun')], muzzle: undefined };
  }
  const clip = arms[reload > 0 ? `${definition.reloadGrip}_reload` : options.flash && options.recoilDegrees === undefined ? `${definition.fireGrip}_fire` : definition.grip];
  const progress = reload > 0 ? Math.max(0, Math.min(.9999, 1 - reload / WEAPONS[weapon].config.reloadFrames)) : 0;
  const handParts = (poses: Joint[][]) => poses[Math.floor(progress * poses.length)].map(j => ({
    id: j.part === 'weapon' ? weapon : `${role}-${j.part}`, name: j.name, matrix: compose(root, j.matrix),
  }));
  const rear = handParts(clip.rear), front = handParts(clip.front).filter(p => p.name !== 'gun');
  const gun = rear.find(p => p.id === weapon)!;
  const box = CHARACTER_ART[weapon];
  const barrel: Partial<Record<WeaponId, number>> = { usp: -.273, beretta: -.273, deagle: -.295, vector: -.214, m4: -.158, ak47: -.322, shotgun: -.221, dragunov: -.043, saw: -.056 };
  return { parts: [...rear, ...body, ...front], muzzle: gun && transformPoint(gun.matrix, box.x + box.w - .5, box.y + box.h * (.5 + (barrel[weapon] ?? -.18))) };
}

/** Map a native limb's joint endpoints to the two requested world joints. */
export function jointMatrix(from: { x: number; y: number }, to: { x: number; y: number }, start: readonly number[], end: readonly number[]): Matrix {
  const dx = end[0] - start[0], dy = end[1] - start[1], tx = to.x - from.x, ty = to.y - from.y;
  const denominator = dx * dx + dy * dy, a = (tx * dx + ty * dy) / denominator, b = (ty * dx - tx * dy) / denominator;
  return [a, b, -b, a, from.x - a * start[0] + b * start[1], from.y - b * start[0] - a * start[1]];
}
