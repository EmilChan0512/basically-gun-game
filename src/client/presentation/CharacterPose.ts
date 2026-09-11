import recovered from './character-poses.json';
import { WEAPONS, type ClassId } from '../../game/campaign/Catalog';
import type { WeaponId } from '../../game/combat/Combat';

export type Matrix = readonly number[];
export interface CharacterPart { id: string; name: string; matrix: Matrix }
export const CHARACTER_ART: Record<string, { x: number; y: number; w: number; h: number }> = recovered.art;
export const characterAsset = (id: string) => `/assets/characters/${id}.svg`;
type Joint = { part: string; name: string; matrix: Matrix };
const movements: Record<string, Joint[][]> = recovered.locomotion;
const arms: Record<string, { rear: Joint[][]; front: Joint[][] }> = recovered.arms;
const grip: Record<WeaponId, string> = { usp: 'pistol', beretta: 'pistol', deagle: 'magnum', vector: 'mpistol', m4: 'rifle', ak47: 'rifle', shotgun: 'shotgun', saw: 'heavy', dragunov: 'sniper' };
export const transformPoint = (m: Matrix, x: number, y: number) => ({ x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] });
export function compose(a: Matrix, b: Matrix): Matrix {
  const origin = transformPoint(a, b[4], b[5]);
  return [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], origin.x, origin.y];
}
export interface PoseOptions { frame?: number; vx?: number; crouch?: boolean; jumping?: boolean; flip?: boolean; aim?: { x: number; y: number }; reload?: number; flash?: boolean; bodyOnly?: boolean }
/** Native vector proportions and authored joints, shared by battle and armory. */
export function characterPose(role: ClassId, weapon: WeaponId, options: PoseOptions = {}) {
  const { frame = 0, vx = 0, crouch = false, jumping = false, flip = false, reload = 0 } = options;
  const facing = flip ? -1 : 1, running = Math.abs(vx) > .1, backwards = vx * facing < 0;
  const gait = role === 'tank' || role === 'commando' ? '2' : '1';
  const animation = jumping ? 'fallloop' : crouch ? running ? backwards ? 'duckrunback' : 'duckrun' : 'duckloop'
    : running ? `run${backwards ? 'back' : ''}${gait}` : 'idle';
  const frames = movements[animation], joints = frames[Math.floor(Math.max(0, frame)) % frames.length];
  const mirror = [facing, 0, 0, 1, 0, 0];
  const body = joints.filter(j => j.part !== 'shoulder').map(j => ({ id: `${role}-${j.part}`, name: j.name, matrix: compose(mirror, j.matrix) }));
  const shoulder = joints.find(j => j.part === 'shoulder')!.matrix;
  if (options.bodyOnly) {
    const root = [facing, 0, 0, 1, shoulder[4] * facing, shoulder[5]];
    const resting = recovered.restingArm.map(j => ({ id: `${role}-${j.part}`, name: j.name, matrix: compose(root, j.matrix) }));
    return { parts: [...resting, ...body], muzzle: undefined };
  }
  const aim = options.aim ?? { x: 100 * facing, y: shoulder[5] };
  const angle = Math.atan2(aim.y - shoulder[5], (aim.x - shoulder[4] * facing) * facing);
  const c = Math.cos(angle), s = Math.sin(angle), root = [facing * c, s, -facing * s, c, shoulder[4] * facing, shoulder[5]];
  const clip = arms[`${grip[weapon]}${reload > 0 ? '_reload' : options.flash ? '_fire' : ''}`];
  const progress = reload > 0 ? Math.max(0, Math.min(.9999, 1 - reload / WEAPONS[weapon].config.reloadFrames)) : 0;
  const handParts = (poses: Joint[][]) => poses[Math.floor(progress * poses.length)].map(j => ({
    id: j.part === 'weapon' ? weapon : `${role}-${j.part}`, name: j.name, matrix: compose(root, j.matrix),
  }));
  const rear = handParts(clip.rear), front = handParts(clip.front).filter(p => p.name !== 'gun');
  const gun = rear.find(p => p.id === weapon)!;
  const box = CHARACTER_ART[weapon];
  const barrel: Record<WeaponId, number> = { usp: -.273, beretta: -.273, deagle: -.295, vector: -.214, m4: -.158, ak47: -.322, shotgun: -.221, dragunov: -.043, saw: -.056 };
  return { parts: [...rear, ...body, ...front], muzzle: gun && transformPoint(gun.matrix, box.x + box.w - .5, box.y + box.h * (.5 + barrel[weapon])) };
}

/** Map a native limb's joint endpoints to the two requested world joints. */
export function jointMatrix(from: { x: number; y: number }, to: { x: number; y: number }, start: readonly number[], end: readonly number[]): Matrix {
  const dx = end[0] - start[0], dy = end[1] - start[1], tx = to.x - from.x, ty = to.y - from.y;
  const denominator = dx * dx + dy * dy, a = (tx * dx + ty * dy) / denominator, b = (ty * dx - tx * dy) / denominator;
  return [a, b, -b, a, from.x - a * start[0] + b * start[1], from.y - b * start[0] - a * start[1]];
}
