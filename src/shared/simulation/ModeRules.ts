import type { Point } from '../../game/combat/Ballistics';
import { DeliveryObjectives, type DeliveryEvent, type DeliveryTarget } from './DeliveryObjectives';
export type ModeId = 'tdm' | 'dom' | 'coop' | 'ctf';
export interface ModeCheckpoint { captureFrames: [number, number]; delivery?: [DeliveryTarget, DeliveryTarget] }

export interface MatchResult { winner: 1 | 2 | null; draw: boolean; reason: string; tick: number }
export interface ModeActor { id?: string; team: 1 | 2; life: { alive: boolean }; movement: Point }
export interface ModeContext {
  frame: number; scores: [number, number]; objective: 'neutral' | 'blue' | 'red' | 'contested';
  actors: ModeActor[];
  mission: { goal: number; seconds: number; debug?: boolean; objective: Point; mode?: ModeId; deliveryBases?: [Point, Point]; killY?: number };
}
export interface ModeRules {
  readonly id: ModeId;
  botGoal(context: ModeContext, enemy?: Point, actor?: ModeActor): { destination: Point; hold: boolean; stopToFight: boolean };
  onDeath(context: ModeContext, target: ModeActor, source?: ModeActor): void;
  tick(context: ModeContext): void | DeliveryEvent[];
  checkpoint(): ModeCheckpoint;
  restore(state: ModeCheckpoint): void;
  releaseActor?(actorId: string): DeliveryEvent[];
}
class TeamDeathmatch implements ModeRules {
  readonly id: ModeRules['id'] = 'tdm';
  botGoal(context: ModeContext, enemy?: Point) { return { destination: enemy ?? context.mission.objective, hold: false, stopToFight: true }; }
  onDeath(context: ModeContext, target: ModeActor, source?: ModeActor) { context.scores[source ? source.team - 1 : target.team === 1 ? 1 : 0]++; }
  tick(_context: ModeContext) {}
  checkpoint() { return { captureFrames: [0, 0] as [number, number] }; }
  restore(_state: { captureFrames: [number, number] }) {}
}
class Domination implements ModeRules {
  readonly id = 'dom';
  botGoal(context: ModeContext) { return { destination: context.mission.objective, hold: true, stopToFight: false }; }
  private captureFrames: [number, number] = [0, 0];
  onDeath(_context: ModeContext, _target: ModeActor, _source?: ModeActor) {}
  tick(context: ModeContext) {
    const present = [1, 2].map(team => context.actors.some(a => a.team === team && a.life.alive && Math.abs(a.movement.x - context.mission.objective.x) < 85 && Math.abs(a.movement.y - context.mission.objective.y) < 70));
    context.objective = present[0] && present[1] ? 'contested' : present[0] ? 'blue' : present[1] ? 'red' : 'neutral';
    if (present[0] !== present[1]) {
      const index = present[0] ? 0 : 1;
      if (++this.captureFrames[index] === 30) { context.scores[index]++; this.captureFrames[index] = 0; }
    }
  }
  checkpoint() { return { captureFrames: [...this.captureFrames] as [number, number] }; }
  restore(state: { captureFrames: [number, number] }) { this.captureFrames = [...state.captureFrames]; }
}
class Cooperative extends TeamDeathmatch {
  override readonly id = 'coop' as const;
  override onDeath(_context: ModeContext, _target: ModeActor, _source?: ModeActor) {}
}
class CaptureDelivery implements ModeRules {
  readonly id = 'ctf';
  private objectives: DeliveryObjectives;
  constructor(bases?: [Point, Point]) {
    if (!bases) throw Error('Delivery bases required');
    this.objectives = new DeliveryObjectives(bases);
  }
  botGoal(context: ModeContext, _enemy?: Point, actor?: ModeActor) {
    if (!actor?.id) throw Error('Delivery AI requires an actor');
    const targets = this.objectives.snapshot(), own = targets[actor.team - 1], enemy = targets[actor.team === 1 ? 1 : 0];
    const carrier = context.actors.find(a => a.id === own.carrierId);
    const escort = context.actors.find(a => a.id === enemy.carrierId);
    const destination = enemy.carrierId === actor.id ? own.base : carrier?.movement ?? escort?.movement ?? enemy.base;
    return { destination, hold: false, stopToFight: false };
  }
  onDeath(_context: ModeContext, _target: ModeActor, _source?: ModeActor) {}
  tick(context: ModeContext) {
    const events = this.objectives.tick(context.actors.filter(a => !!a.id).map(a => ({
      id: a.id!, team: a.team, alive: a.life.alive && a.movement.y < (context.mission.killY ?? Infinity),
      x: a.movement.x, y: a.movement.y,
    })));
    for (const event of events) if (event.kind === 'delivery') context.scores[event.team - 1]++;
    return events;
  }
  checkpoint(): ModeCheckpoint { return { captureFrames: [0, 0], delivery: this.objectives.snapshot() }; }
  releaseActor(actorId: string) { return this.objectives.release(actorId); }
  restore(state: ModeCheckpoint) {
    if (!state.delivery) throw Error('Delivery checkpoint required');
    this.objectives.restore(state.delivery);
  }
}
export function createMode(id: ModeRules['id'], bases?: [Point, Point]): ModeRules {
  return id === 'ctf' ? new CaptureDelivery(bases) : id === 'coop' ? new Cooperative() : id === 'dom' ? new Domination() : new TeamDeathmatch();
}
export function resolveResult(context: ModeContext): MatchResult | null {
  if (context.mission.debug || context.mission.mode === 'coop') return null;
  const reached = context.scores.some(score => score >= context.mission.goal);
  if (!reached && context.frame < context.mission.seconds * 30) return null;
  const draw = context.scores[0] === context.scores[1];
  return { winner: draw ? null : context.scores[0] > context.scores[1] ? 1 : 2, draw, tick: context.frame,
    reason: reached ? '目标分数已达成' : draw ? '时间耗尽，平局未能完成任务' : '行动时间结束' };
}
