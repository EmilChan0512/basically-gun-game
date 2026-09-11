import { expect, it } from 'vitest';
import { SearchPatrol } from '../../tools/network/search-patrol';
it('explores public waypoints without freezing at an empty objective or leaking node internals', () => {
  const patrol = new SearchPatrol(), nodes = [{ x: 100, y: 300, links: [1] }, { x: 400, y: 300, links: [2] }, { x: 800, y: 300, links: [0] }];
  expect(patrol.target({ x: 100, y: 300 }, 0, nodes)).toEqual({ x: 400, y: 300 });
  expect(patrol.target({ x: 150, y: 300 }, 100, nodes)).toEqual({ x: 400, y: 300 });
  expect(patrol.target({ x: 150, y: 300 }, 450, nodes)).toEqual({ x: 800, y: 300 });
  expect(patrol.target({ x: 800, y: 300 }, 460, nodes)).toEqual({ x: 100, y: 300 });
  patrol.reset(); expect(patrol.target({ x: 780, y: 300 }, 500, nodes)).toEqual({ x: 100, y: 300 });
  expect(new SearchPatrol().target({ x: 0, y: 0 }, 0, [])).toBeUndefined();
});
