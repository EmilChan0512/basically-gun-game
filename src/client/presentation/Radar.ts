import type { MapGeometry } from '../../shared/content/MapTypes';
import type { StateMessage } from '../../shared/protocol/State';
const escape = (s: string) => s.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
export function radarProjection(map: MapGeometry, width = 260, height = 150) {
  const scale = Math.min((width - 20) / map.width, (height - 20) / (map.height ?? 700));
  const x = (width - map.width * scale) / 2, y = (height - (map.height ?? 700) * scale) / 2;
  return { scale, x, y, point: (p: { x: number; y: number }) => ({ x: x + p.x * scale, y: y + p.y * scale }) };
}
/** Uses only the received state; no retained enemy marker after visibility loss. */
export function radarSvg(map: MapGeometry, message: Pick<StateMessage, 'state' | 'actorId' | 'mode'>, team: 1 | 2) {
  const projection = radarProjection(map), art = map.artwork;
  const terrain = map.terrain.map(t => `<rect x="${t.x}" y="${t.y}" width="${t.width}" height="${t.height}" fill="#71818d"/>`).join('');
  const backdrop = art ? `<image href="/assets/reference/${escape(art.id)}.png" x="${art.x}" y="${art.y}" width="${art.width}" height="${art.height}" opacity="0.6"/>` : terrain;
  const markers = message.state.actors.filter(a => a.life.alive && (a.team === team || !a.growth?.ghost)).map(actor => {
    const p = projection.point(actor), self = actor.id === message.actorId;
    return `<circle data-actor="${escape(actor.id)}" cx="${p.x}" cy="${p.y}" r="${self ? 4.5 : 3}" fill="${self ? '#ffffff' : actor.team === team ? '#58ead4' : '#ff897c'}" stroke="#10202d" stroke-width="1"/>`;
  }).join('');
  const targets = (message.state.deliveryTargets ?? []).map(target => {
    const carrier = message.state.actors.find(a => a.id === target.carrierId);
    if (target.carrierId && !carrier) return '';
    const p = projection.point(carrier ?? target.base);
    return `<rect data-objective="${target.team}" x="${p.x - 4}" y="${p.y - 4}" width="8" height="8" fill="${target.team === 1 ? '#58c6ff' : '#ff9748'}" stroke="#ffffff" transform="rotate(45 ${p.x} ${p.y})"/>`;
  }).join('');
  const control = projection.point(map.objective);
  const zone = message.mode === 'dom' ? `<circle cx="${control.x}" cy="${control.y}" r="6" fill="none" stroke="#ffe595" stroke-width="2"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="战斗雷达：白色为自己，绿色为队友，红色为已暴露敌人，菱形为公文包" viewBox="0 0 260 150"><rect width="260" height="150" rx="8" fill="#10202d" fill-opacity="0.9"/><g transform="translate(${projection.x} ${projection.y}) scale(${projection.scale})">${backdrop}</g>${zone}${markers}${targets}</svg>`;
}
