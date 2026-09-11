import type { RandomSource } from '../../game/combat/Ballistics';

export interface StatefulRandom extends RandomSource { state(): number; restore(state: number): void }
export function createRandom(seed: number): StatefulRandom {
  let state = seed | 0;
  const next = (() => {
    state = (state + 0x6D2B79F5) | 0;
    let t = Math.imul(state ^ state >>> 15, 1 | state);
    t ^= t + Math.imul(t ^ t >>> 7, 61 | t);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }) as StatefulRandom;
  next.state = () => state;
  next.restore = value => {
    if (!Number.isInteger(value) || value < -2147483648 || value > 2147483647) throw new RangeError('Invalid random state');
    state = value;
  };
  return next;
}
