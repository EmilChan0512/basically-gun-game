import { beaconCircles, inBeaconVision } from '../simulation/BeaconVision';
import type { StateMessage } from './State';
import { clearSight } from '../../game/campaign/Navigation';
import { SCREEN_VISION_RADIUS as VISION_RADIUS, VISION_EYE_HEIGHT } from '../simulation/Vision';
/** Filter every coordinate-bearing channel, not only radar actor markers. */
export function visibleState(message: StateMessage, visible: ReadonlySet<string>, team: 1 | 2, wall: (x: number, y: number) => boolean,
  smokeBlocks?: (a: { x: number; y: number }, b: { x: number; y: number }) => boolean): StateMessage {
  const observers = message.state.actors.filter(a => a.team === team && a.life.alive);
  const circles = beaconCircles(message.state.growthWorld?.entities ?? [], team, message.state.frame);
  const pointVisible = (p: { x: number; y: number }, ignoreSmoke = false) => inBeaconVision(p, circles) || observers.some(a => Math.hypot(p.x - a.x, p.y - a.y) <= VISION_RADIUS
    && clearSight({ x: a.x, y: a.y - VISION_EYE_HEIGHT }, p, wall)
    && (ignoreSmoke || !smokeBlocks?.({ x: a.x, y: a.y - VISION_EYE_HEIGHT }, p)));
  const world = message.state.growthWorld;
  const hitVisible = (hit: StateMessage['effects'][number]['trace']['hit']) => !hit || hit.type === 'wall' || visible.has(hit.target);
  const worldEvents = new Set(['gadgetReleased','deployableCreated','deployableDamaged','deployableDestroyed','intercept','smokeStarted','smokeEnded']);
  const redactIds = (event: StateMessage['events'][number]) => ({ ...event,
    actorId:event.actorId&&visible.has(event.actorId)?event.actorId:undefined,
    targetId:event.targetId&&visible.has(event.targetId)?event.targetId:undefined });
  return { ...message,
    state: { ...message.state, actors: message.state.actors.filter(a => visible.has(a.id)).map(a => a.growthV3?.linkTargetId && !visible.has(a.growthV3.linkTargetId)
      ? { ...a, growthV3: { ...a.growthV3, linkTargetId: undefined } } : a),
      ...(world ? { growthWorld: {
        entities: world.entities.filter(e => e.team === team || pointVisible(e)).map(e => ({ ...e, sourceId: e.sourceId && visible.has(e.sourceId) ? e.sourceId : undefined })),
        flying: world.flying.filter(e => pointVisible(e)).map(e => ({ ...e, sourceId: e.sourceId && visible.has(e.sourceId) ? e.sourceId : undefined })),
        smoke: world.smoke.filter(e => pointVisible(e, true)),
        radar: world.radar.filter(r => r.team === team).map(r => ({ ...r, sourceId: r.sourceId && visible.has(r.sourceId) ? r.sourceId : undefined })),
      } } : {}) },
    poses: message.poses.filter(p => visible.has(p.id)),
    effects: message.effects.flatMap(e => {
      if (!e.actorId || !visible.has(e.actorId) || !pointVisible(e.trace.origin)) return [];
      // Keep the visible prefix of a shot even when its target is concealed.
      const { origin, end } = e.trace;
      const length = Math.hypot(end.x - origin.x, end.y - origin.y);
      const samples = Math.max(1, Math.ceil(length / 16));
      let endpoint = origin, clipped = false;
      for (let i = 1; i <= samples; i++) {
        const fraction = length ? Math.min(i*16, length)/length : 0;
        const p = { x: origin.x + (end.x-origin.x)*fraction, y: origin.y + (end.y-origin.y)*fraction };
        if (!pointVisible(p)) { clipped = true; break; }
        endpoint = p;
      }
      const redact = clipped || !hitVisible(e.trace.hit) || !hitVisible(e.trace.initialHit);
      return [{ ...e, ...(redact ? { damage: 0, killed: false } : {}), trace: { ...e.trace, end: endpoint,
        ...(redact ? { hit: null, initialHit: null, headMarked: false, steps: Math.ceil(Math.hypot(endpoint.x-origin.x,endpoint.y-origin.y)/10) } : {}) } }];
    }),
    bursts: message.bursts.filter(p => pointVisible(p)), grenades: message.grenades.filter(p => pointVisible(p)), projectiles: message.projectiles?.filter(p => pointVisible(p)),
    events: message.events.filter(e => e.kind !== 'tactical-sound' && e.kind !== 'intelPing' && !worldEvents.has(e.kind)).filter(e => (e.targetId === message.actorId && ['damage', 'death'].includes(e.kind)) || (!e.position || pointVisible(e.position)) && (e.kind.startsWith('objective-') || e.kind === 'result'
      || (!e.actorId || visible.has(e.actorId)) && (!e.targetId || visible.has(e.targetId))))
      .map(e => e.actorId && !visible.has(e.actorId) ? { ...e, actorId: undefined, position: undefined } : e)
      .concat(message.events.filter(e=>worldEvents.has(e.kind)&&!!e.position&&pointVisible(e.position,e.kind==='smokeStarted'||e.kind==='smokeEnded')).map(redactIds))
      .concat(message.events.filter(e=>e.kind==='intelPing'&&e.team===team).map(e=>({id:e.id,tick:e.tick,kind:e.kind,
        position:e.position?{...e.position}:undefined,team:e.team,expiresTick:e.expiresTick})))
      .concat(message.events.filter(e => e.kind === 'tactical-sound').flatMap(e => {
        const listenerId = message.actorId ?? observers[0]?.id;
        const sample = e.soundRecipients?.find(s => s.id === listenerId);
        return sample ? [{ id: e.id, tick: e.tick, kind: 'tactical-sound' as const,
          sound: { cue: sample.cue, pan: sample.pan, distance: sample.distance, ...(sample.weapon ? { weapon: sample.weapon } : {}) } }] : [];
      })).sort((a, b) => a.id - b.id),
  };
}
