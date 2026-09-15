import { expect, it } from 'vitest';
import { MAPS, customMatch } from '../../src/shared/content/Maps';
import { objectiveIssues } from '../../src/shared/content/MapObjectives';
import { CollisionWorld } from '../../src/shared/content/CollisionWorld';
import { OriginalMovement } from '../../src/game/movement/OriginalMovement';
import { DeliveryObjectives } from '../../src/shared/simulation/DeliveryObjectives';
it('validates existing combat/control maps and identifies missing delivery slots', () => {
  for (const map of MAPS) {
    expect(objectiveIssues(map.geometry, 'combat')).toEqual([]);
    expect(objectiveIssues(map.geometry, 'control')).toEqual([]);
    expect(objectiveIssues(map.geometry, 'delivery').length).toBe(map.modes.includes('ctf') ? 0 : 1);
  }
});
it('rejects overlapping, nonfinite and out-of-bounds delivery slots', () => {
  const map = customMatch('hijack');
  map.deliveryBases![1] = { ...map.deliveryBases![0] };
  expect(objectiveIssues(map, 'delivery')).toContain('双方交付触碰区域重叠');
  for (const x of [NaN, Infinity, -1, map.width + 1]) {
    map.deliveryBases![1].x = x;
    expect(objectiveIssues(map, 'delivery')).toContain('缺少有效的双方交付基地');
  }
});
it('both extracted aircraft bases remain touchable after settling on real collision', () => {
  const map = customMatch('hijack'), wall = new CollisionWorld(map.terrain, map.collisionMask);
  for (let i = 0; i < 2; i++) {
    const base = map.deliveryBases![i], movement = new OriginalMovement(wall.solid);
    movement.reset(base.x, base.y);
    for (let tick = 0; tick < 90; tick++) movement.tick({ left: false, right: false, crouch: false });
    expect(movement.jumping).toBe(false);
    const targets = new DeliveryObjectives(map.deliveryBases!);
    const events = targets.tick([{ id: 'visitor', team: i === 0 ? 2 : 1, alive: true, x: movement.x, y: movement.y }]);
    expect(events).toHaveLength(1); expect(events[0].kind).toBe('pickup');
  }
});
