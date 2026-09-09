import { describe, expect, it } from 'vitest';
import { GunLab } from '../../src/game/combat/GunLab';
describe('GunLab', () => { it('exposes a playable fire loop', () => { const lab = new GunLab(); expect(lab.fire(0)).toBe(true); expect(lab.snapshot()).toMatchObject({ ammo: 11, health: 85, alive: true }); lab.tick(250, 250); expect(lab.fire(250)).toBe(true); expect(lab.snapshot().health).toBe(70); }); });
