import { ATRIUM_TERRAIN } from '../../shared/content/maps/Atrium';
import type { MapDefinition } from '../../shared/content/Maps';

const color = (value: number) => `#${value.toString(16).padStart(6, '0')}`;
/** Geometry preview uses the same coordinates as collision and navigation. */
export function mapPreviewSvg(map: MapDefinition, debug = false) {
  const g = map.geometry, height = g.height ?? 700;
  const art = g.artwork;
  const terrain = (map.id === 'atrium' ? ATRIUM_TERRAIN : [...g.terrain, ...(g.stairTreads ?? [])]).map(t => `<rect x="${t.x}" y="${t.y}" width="${t.width}" height="${t.height}" fill="${color(g.palette.wall)}"/>`).join('');
  const backdrop = map.id === 'atrium' ? [432,768,1104,1440].map(y=>`<rect x="48" y="${y-312}" width="3504" height="312" fill="#192e3b"/><text x="80" y="${y-250}" fill="#7ab9c6" font-size="38">${5-[432,768,1104,1440].indexOf(y)-1}F</text>`).join('') : '';
  const artwork = art ? `<image href="/assets/reference/${art.id}.png" x="${art.x}" y="${art.y}" width="${art.width}" height="${art.height}"/>` : '';
  const mask = debug && g.collisionMask ? g.collisionMask.rows.map((row, y) => {
    let runs = '';
    for (let i = 0; i < row.length; i += 2) runs += `<rect x="${g.collisionMask!.x + row[i]}" y="${g.collisionMask!.y + y}" width="${row[i + 1] - row[i]}" height="1"/>`;
    return runs;
  }).join('') : '';
  const links = debug ? g.navigation.flatMap((node, from) => node.links.map(to => {
    const end = g.navigation[to];
    return `<path d="M${node.x},${node.y} L${end.x},${end.y}" stroke="#fee08b" stroke-width="3" fill="none" marker-end="url(#arrow)"/><text x="${node.x + 8}" y="${node.y - 10}" fill="white" font-size="20">${from}</text>`;
  })).join('') : '';
  const points = g.spawns.flatMap((spawns, team) => spawns.map(p => `<circle cx="${p.x}" cy="${p.y - 20}" r="${debug ? 12 : 16}" fill="${team ? '#ff897c' : '#58ead4'}" stroke="#14202d" stroke-width="3"/>`)).join('');
  const objective = `<circle cx="${g.objective.x}" cy="${g.objective.y - 20}" r="22" fill="none" stroke="#ffe595" stroke-width="5"/>`;
  const kill = debug ? `<path d="M0,${g.killY ?? height + 140} H${g.width}" stroke="#ff5566" stroke-width="4" stroke-dasharray="12 10"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="地图布局预览" viewBox="0 0 ${g.width} ${height}" style="display:block;width:100%;max-height:${debug ? 700 : 160}px;border-radius:8px;background:${color(g.palette.sky)}"><defs><marker id="arrow" markerWidth="5" markerHeight="5" refX="5" refY="2.5" orient="auto"><path d="M0,0 L5,2.5 L0,5" fill="#fee08b"/></marker></defs>${backdrop}${terrain}${artwork}<g fill="#fa4566" opacity="0.4">${mask}</g>${links}${points}${objective}${kill}</svg>`;
}
