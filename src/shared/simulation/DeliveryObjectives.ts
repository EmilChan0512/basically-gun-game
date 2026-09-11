export interface ObjectivePoint { x: number; y: number }
export interface ObjectiveActor extends ObjectivePoint { id: string; team: 1 | 2; alive: boolean }
export interface DeliveryTarget { team: 1 | 2; base: ObjectivePoint; carrierId: string | null }
export type DeliveryEvent =
  | { kind: 'pickup' | 'delivery'; targetTeam: 1 | 2; actorId: string; team: 1 | 2 }
  | { kind: 'return'; targetTeam: 1 | 2; actorId: string; reason: 'carrier-unavailable' };
/** Original CTF delivery rules: death returns immediately; own target may be
 * away during delivery. No storage, rendering, damage or networking ownership. */
export class DeliveryObjectives {
  private targets: [DeliveryTarget, DeliveryTarget];
  constructor(bases: [ObjectivePoint, ObjectivePoint]) {
    if (bases.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) throw Error('Invalid objective bases');
    this.targets = [{ team: 1, base: { ...bases[0] }, carrierId: null }, { team: 2, base: { ...bases[1] }, carrierId: null }];
  }
  snapshot() { return structuredClone(this.targets); }
  release(actorId: string): DeliveryEvent[] {
    const target = this.targets.find(t => t.carrierId === actorId);
    if (!target) return [];
    target.carrierId = null;
    return [{ kind: 'return', targetTeam: target.team, actorId, reason: 'carrier-unavailable' }];
  }
  restore(targets: [DeliveryTarget, DeliveryTarget]) {
    if (!Array.isArray(targets) || targets.length !== 2 || targets.some((t, i) => !t || t.team !== i + 1
      || t.base.x !== this.targets[i].base.x || t.base.y !== this.targets[i].base.y
      || (t.carrierId !== null && (typeof t.carrierId !== 'string' || !t.carrierId)))
      || (targets[0].carrierId !== null && targets[0].carrierId === targets[1].carrierId)) throw Error('Invalid delivery checkpoint');
    this.targets = structuredClone(targets);
  }
  tick(actors: readonly ObjectiveActor[]): DeliveryEvent[] {
    const events: DeliveryEvent[] = [];
    const eligible = actors.filter(a => a.alive && Number.isFinite(a.x) && Number.isFinite(a.y))
      .slice().sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    const touching = (actor: ObjectiveActor, base: ObjectivePoint) => actor.x >= base.x - 40
      && actor.x <= base.x + 40 && actor.y >= base.y - 70 && actor.y <= base.y + 25;
    for (const target of this.targets) {
      if (target.carrierId && !eligible.some(a => a.id === target.carrierId && a.team !== target.team)) {
        events.push({ kind: 'return', targetTeam: target.team, actorId: target.carrierId, reason: 'carrier-unavailable' });
        target.carrierId = null;
      }
    }
    for (const actor of eligible) {
      const carried = this.targets.find(t => t.carrierId === actor.id);
      if (carried) {
        if (touching(actor, this.targets[actor.team - 1].base)) {
          carried.carrierId = null;
          events.push({ kind: 'delivery', targetTeam: carried.team, actorId: actor.id, team: actor.team });
        }
        continue;
      }
      const enemy = this.targets[actor.team === 1 ? 1 : 0];
      if (!enemy.carrierId && touching(actor, enemy.base)) {
        enemy.carrierId = actor.id;
        events.push({ kind: 'pickup', targetTeam: enemy.team, actorId: actor.id, team: actor.team });
      }
    }
    return events;
  }
}
