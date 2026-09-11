import { writeFileSync, mkdirSync } from 'node:fs';
import { customMatch } from '../src/shared/content/Maps';
import { wallFor } from '../src/game/campaign/Missions';
import { OriginalMovement } from '../src/game/movement/OriginalMovement';
import { traversalJump } from '../src/shared/simulation/Traversal';

const map = customMatch('hijack'), wall = wallFor(map);
const results = [];
for (const [from, node] of map.navigation.entries()) for (const to of node.links) {
  const target = map.navigation[to], m = new OriginalMovement(wall); m.reset(node.x, node.y);
  let closest = Infinity, reached = false;
  for (let tick = 0; tick < 300; tick++) {
    const dx = target.x - m.x, direction = Math.sign(dx);
    const distance = Math.hypot(dx, target.y - m.y); closest = Math.min(closest, distance);
    if (Math.abs(dx) < 35 && Math.abs(target.y - m.y) < 45) { reached = true; break; }
    if (traversalJump(m, target, wall)) m.jump();
    m.tick({ left: dx < -8, right: dx > 8, crouch: false });
    if (m.y > map.height! + 140) break;
  }
  results.push({ from, to, reached, closest: Math.round(closest), end: { x: m.x, y: m.y } });
}
mkdirSync('artifacts/qa', { recursive: true });
writeFileSync('artifacts/qa/hijack-navigation.json', JSON.stringify(results, null, 2));
console.log(JSON.stringify({ passed: results.filter(r => r.reached).length, total: results.length, failed: results.filter(r => !r.reached).map(({ from, to, closest }) => ({ from, to, closest })) }));
