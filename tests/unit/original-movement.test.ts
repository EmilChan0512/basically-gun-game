import { describe, expect, it } from 'vitest';
import { OriginalMovement } from '../../src/game/movement/OriginalMovement';
const idle = { left: false, right: false, crouch: false };
const flat = () => new OriginalMovement((_x, y) => y >= 600);
describe('original 30Hz movement on opaque dry terrain', () => {
  it('accelerates by 1.8 to 9.5 and brakes with the original final snap', () => {
    const movement = flat(), speeds = [];
    for (let i = 0; i < 6; i++) { movement.tick({ ...idle, right: true }); speeds.push(movement.vx); }
    expect(speeds).toEqual([1.8, 3.6, 5.4, 7.2, 9, 9.5]);
    for (let i = 0; i < 4; i++) movement.tick(idle);
    expect(movement.vx).toBeCloseTo(2.7);
    movement.tick(idle); expect(movement.vx).toBe(0);
  });
  it('gives left input precedence and uses crouch speed 4', () => {
    const movement = flat();
    for (let i = 0; i < 10; i++) movement.tick({ left: true, right: true, crouch: true });
    expect(movement.vx).toBe(-4); expect(movement.crouching).toBe(true);
    expect(movement.jump()).toBe(false);
  });
  it('applies the six-pixel jump boost before displacement, then gravity after displacement', () => {
    const movement = flat();
    expect(movement.jump()).toBe(true);
    expect(movement.y).toBe(593.5); expect(movement.vy).toBe(-13);
    movement.tick(idle);
    expect(movement.y).toBe(580.5); expect(movement.vy).toBe(-12.2);
    expect(movement.jump()).toBe(false);
    let minimum = movement.y;
    for (let i = 0; i < 40; i++) { movement.tick(idle); minimum = Math.min(minimum, movement.y); }
    expect(599.5 - minimum).toBeCloseTo(118.2);
    expect(movement.jumping).toBe(false);
    // Half-pixel depenetration keeps the fractional remainder accumulated in flight.
    expect(movement.y).toBeGreaterThanOrEqual(599.5); expect(movement.y).toBeLessThan(600);
  });
  it('uses air acceleration 1.4 and air braking 0.4 rather than retaining inertia forever', () => {
    const movement = flat(); movement.jump(); movement.tick({ ...idle, right: true });
    expect(movement.vx).toBe(1.4);
    movement.tick(idle); expect(movement.vx).toBeCloseTo(1);
  });
  it('auto-climbs a 28px opaque ledge and rejects a 60px wall', () => {
    for (const height of [28, 60]) {
      const movement = new OriginalMovement((x, y) => y >= 600 || (x >= 220 && x < 400 && y >= 600 - height));
      let climbed = false;
      for (let i = 0; i < 25; i++) { movement.tick({ ...idle, right: true }); climbed ||= movement.climb !== 0; }
      expect(climbed).toBe(height === 28);
      if (height === 28) expect(movement.x).toBeGreaterThan(220);
      else expect(movement.x).toBeLessThan(204);
    }
  });
  it('does not allow a crouched character to stand inside a low ceiling', () => {
    const movement = new OriginalMovement((_x, y) => y >= 600 || (y >= 550 && y <= 557));
    movement.crouching = true; movement.tick(idle);
    expect(movement.crouching).toBe(true);
  });
});
