import { describe, it, expect } from 'vitest';
import { characterPose, CHARACTER_ART } from '../../src/client/presentation/CharacterPose';
import { CLASSES, WEAPONS, type ClassId } from '../../src/game/campaign/Catalog';
import type { WeaponId } from '../../src/game/combat/Combat';
import manifest from '../../public/assets/characters/manifest.json';

describe('recovered character anatomy', () => {
  it('uses upper arms and hands, never the thigh symbol as an arm', () => {
    for (const role of Object.keys(CLASSES)) {
      const symbol = (part: string) => manifest.assets.find(asset => asset.id === `${role}-${part}`)?.symbol;
      expect(symbol('thigh')).toBe(598); expect(symbol('shin')).toBe(568);
      expect(symbol('upperarm')).toBe(298); expect(symbol('forearm')).toBe(266); expect(symbol('hand')).toBe(385);
    }
  });
  it('keeps every equipped gun and joint renderable throughout reload and locomotion', () => {
    for (const role of Object.keys(CLASSES) as ClassId[]) for (const weapon of Object.keys(WEAPONS) as WeaponId[]) {
      for (let frame = 0; frame < 40; frame++) {
        const pose = characterPose(role, weapon, { frame, crouch: frame % 3 === 0, jumping: frame % 3 === 1, vx: frame % 2 ? 4 : -4,
          reload: WEAPONS[weapon].config.reloadFrames * frame / 40, aim: { x: 80, y: -70 } });
        expect(pose.parts.filter(p => p.id === weapon)).toHaveLength(1);
        expect(pose.parts.filter(p => p.id.endsWith('-thigh'))).toHaveLength(2);
        expect(pose.parts.filter(p => p.id.endsWith('-shin'))).toHaveLength(2);
        for (const part of pose.parts) {
          expect(CHARACTER_ART[part.id]).toBeDefined();
          expect(part.matrix.every(Number.isFinite)).toBe(true);
        }
        expect(Number.isFinite(pose.muzzle?.x)).toBe(true); expect(Number.isFinite(pose.muzzle?.y)).toBe(true);
      }
    }
  });
  it('mirrors the whole grip and muzzle together when facing left', () => {
    for (const weapon of Object.keys(WEAPONS) as WeaponId[]) {
      const right = characterPose('assassin', weapon, { aim: { x: 100, y: -90 } });
      const left = characterPose('assassin', weapon, { flip: true, aim: { x: -100, y: -90 } });
      expect(left.muzzle!.x).toBeCloseTo(-right.muzzle!.x); expect(left.muzzle!.y).toBeCloseTo(right.muzzle!.y);
      for (let i = 0; i < right.parts.length; i++) {
        expect(left.parts[i].matrix[4]).toBeCloseTo(-right.parts[i].matrix[4]);
        expect(left.parts[i].matrix[5]).toBeCloseTo(right.parts[i].matrix[5]);
      }
    }
  });
});
