import { describe, expect, it } from 'vitest';
import { defaults } from '../../src/game/config/movement';
import { MovementController } from '../../src/game/movement/MovementController';
import { findStep } from '../../src/game/movement/StepAssist';

const none = { axis: 0, jumpPressed: false, drop: false };
describe('movement rules', () => {
  it('accelerates and reverses consistently for multiple timesteps', () => {
    for (const hz of [30, 60, 120, 144]) {
      const controller = new MovementController();
      let state = { vx: defaults.maxRunSpeed, vy: 0, grounded: true };
      for (let tick = 0; tick < hz; tick++) state = { ...state, ...controller.tick(state, { ...none, axis: -1 }, 1 / hz, defaults) };
      expect(state.vx).toBe(-defaults.maxRunSpeed);
    }
  });
  it('permits a coyote jump, but prevents a second airborne jump', () => {
    const c = new MovementController();
    c.tick({ vx: 0, vy: 0, grounded: true }, none, 1 / 120, defaults);
    expect(c.tick({ vx: 0, vy: 0, grounded: false }, { ...none, jumpPressed: true }, .03, defaults).jumped).toBe(true);
    expect(c.tick({ vx: 0, vy: -100, grounded: false }, { ...none, jumpPressed: true }, .01, defaults).jumped).toBe(false);
  });
  it('expires coyote time and clears buffered input on reset', () => {
    const c = new MovementController();
    c.tick({ vx: 0, vy: 0, grounded: true }, none, .01, defaults);
    expect(c.tick({ vx: 0, vy: 0, grounded: false }, { ...none, jumpPressed: true }, .1, defaults).jumped).toBe(false);
    c.reset();
    expect(c.tick({ vx: 0, vy: 0, grounded: true }, none, .01, defaults).jumped).toBe(false);
  });
  it('buffers a jump before landing; zero grace still allows a standing jump', () => {
    const c = new MovementController();
    c.tick({ vx: 0, vy: 100, grounded: false }, { ...none, jumpPressed: true }, .01, defaults);
    expect(c.tick({ vx: 0, vy: 0, grounded: true }, none, .01, defaults).jumped).toBe(true);
    c.reset();
    expect(c.tick({ vx: 0, vy: 0, grounded: true }, { ...none, jumpPressed: true }, .01, { ...defaults, coyoteTimeMs: 0, jumpBufferMs: 0 }).jumped).toBe(true);
  });
  it('preserves airborne momentum without input and caps fall velocity', () => {
    const c = new MovementController();
    expect(c.tick({ vx: 290, vy: 900, grounded: false }, none, .01, defaults)).toMatchObject({ vx: 290, vy: 800 });
  });
});
describe('bounded ledge assistance', () => {
  const body = { x: 0, y: 62, width: 22, height: 38 };
  it('accepts a small step and rejects tall steps and midair assists', () => {
    const step = { id: 'step', x: 25, y: 84, width: 50, height: 16 };
    expect(findStep(body, 1, true, 18, 5, [step])?.rise).toBe(16);
    expect(findStep(body, 1, true, 12, 5, [step])).toBeNull();
    expect(findStep(body, 1, false, 18, 5, [step])).toBeNull();
  });
  it('does not push a soldier into a low ceiling', () => {
    const terrain = [{ id: 'step', x: 25, y: 84, width: 50, height: 16 }, { id: 'ceiling', x: 0, y: 40, width: 80, height: 20 }];
    expect(findStep(body, 1, true, 18, 5, terrain)).toBeNull();
  });
});
