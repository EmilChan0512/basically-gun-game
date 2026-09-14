import { it, expect } from 'vitest';
import { characterPose, CHARACTER_ART } from '../../src/client/presentation/CharacterPose';
import { CLASSES, WEAPONS, type ClassId } from '../../src/game/campaign/Catalog';
import type { WeaponId } from '../../src/game/combat/Combat';

// Local-only exhaustive animation coverage.
  it.each((Object.keys(CLASSES) as ClassId[]).flatMap(role =>
    (Object.keys(WEAPONS) as WeaponId[]).map(weapon => ({ role, weapon }))))(
    'keeps $role / $weapon renderable throughout reload and locomotion', ({ role, weapon }) => {
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
  });
