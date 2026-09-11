import { expect, it } from 'vitest';
import { radarProjection } from '../../src/client/presentation/Radar';
import { MAPS } from '../../src/shared/content/Maps';
it('fits every map without distorting world coordinates and respects alternate viewport sizes', () => {
  for (const map of MAPS) for (const [width, height] of [[260, 150], [520, 300]]) {
    const g = map.geometry, p = radarProjection(g, width, height);
    const start = p.point({ x: 0, y: 0 }), end = p.point({ x: g.width, y: g.height ?? 700 });
    expect(start.x).toBeGreaterThanOrEqual(10); expect(start.y).toBeGreaterThanOrEqual(10);
    expect(end.x).toBeLessThanOrEqual(width - 10); expect(end.y).toBeLessThanOrEqual(height - 10);
    expect((end.x - start.x) / (end.y - start.y)).toBeCloseTo(g.width / (g.height ?? 700));
    expect(p.point({ x: g.width / 2, y: (g.height ?? 700) / 2 })).toEqual({ x: width / 2, y: height / 2 });
  }
});
