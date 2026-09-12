import { Battle, idleInput, type BattleInput } from '../../game/campaign/Battle';
import { COMBAT_FRAME_MS } from '../../game/combat/Combat';
import { validCommand, type PlayerCommand } from '../protocol/Commands';
const newStats = () => ({ received: 0, coalesced: 0, timeouts: 0, firePresses: 0, fireHeldTicks: 0, shots: 0,
  hitShots: 0, damagingShots: 0, wallShots: 0, missShots: 0, reloadTicks: 0, emptyTicks: 0, cooldownTicks: 0, deadFireTicks: 0, offhandTicks: 0, maxQueue: 0 });

interface Controller {
  actorId: string;
  received: number;
  processed: number;
  lastTick: number;
  input: BattleInput;
  pending: (PlayerCommand & { shotFrame?: number })[];
  stats: ReturnType<typeof newStats>;
}

/** Shared by a local host and a future server. Ownership is assigned outside commands. */
export class MatchSession {
  private controllers = new Map<string, Controller>();
  private phaseMs = 0;
  constructor(readonly battle: Battle, readonly inputTimeoutTicks = 9) {}
  bind(playerId: string, actorId: string) {
    const actor = this.battle.actors.find(a => a.id === actorId);
    if (!playerId || !actor || this.controllers.has(playerId) || [...this.controllers.values()].some(c => c.actorId === actorId)) throw Error('Invalid or occupied controller');
    if (this.controllers.size >= 8) throw Error('Room is full');
    actor.human = true;
    this.controllers.set(playerId, { actorId, received: -1, processed: -1, lastTick: this.battle.frame, input: { ...idleInput(), aim: { ...actor.aim } }, pending: [], stats: newStats() });
  }
  rejectionReason(playerId: string, command: PlayerCommand) {
    const controller = this.controllers.get(playerId);
    if (!controller) return 'not-controlled';
    if (!validCommand(command)) return 'malformed-command';
    if (this.battle.phase !== 'running') return 'match-ended';
    if (command.sequence <= controller.received) return 'stale-sequence';
    if (controller.pending.length >= 32) return 'input-queue-full';
    return null;
  }
  submit(playerId: string, command: PlayerCommand, authorityShotFrame?: number) {
    const controller = this.controllers.get(playerId);
    if (!controller || this.rejectionReason(playerId, command)) return false;
    // Copy only public command fields. In particular, a client-supplied
    // shotFrame property must never become trusted queued metadata.
    controller.pending.push({ sequence: command.sequence, input: structuredClone(command.input), actions: [...command.actions],
      ...(Number.isSafeInteger(authorityShotFrame) && authorityShotFrame! >= 0 && authorityShotFrame! <= this.battle.frame
        ? { shotFrame: authorityShotFrame } : {}) });
    controller.received = command.sequence;
    controller.stats.received++;
    controller.stats.maxQueue = Math.max(controller.stats.maxQueue, controller.pending.length);
    // A TCP stall releases a burst. Do not replay every obsolete continuous
    // control at 30Hz forever. Keep action and fire/jump transitions in order.
    while (controller.pending.length > 3) {
      const index = controller.pending.findIndex((c, i, queue) => i < queue.length - 1 && !c.actions.length
        && c.input.fire === queue[i + 1].input.fire && c.input.jump === queue[i + 1].input.jump);
      if (index < 0) break;
      controller.pending.splice(index, 1); controller.stats.coalesced++;
    }
    return true;
  }
  disconnect(playerId: string) {
    const controller = this.controllers.get(playerId);
    if (!controller) return;
    controller.pending = [];
    controller.input = { ...idleInput(), aim: { ...controller.input.aim } };
    this.battle.actors.find(a => a.id === controller.actorId)?.arsenal.setTrigger(false);
  }
  reconfigureDebugPlayer(playerId: string, equipment: import('../content/Equipment').EquipmentLoadout) {
    const controller = this.controllers.get(playerId);
    const actor = this.battle.actors.find(a => a.id === controller?.actorId);
    if (!controller || !actor) throw Error('Player does not control an actor');
    this.battle.reconfigureDebugActor(actor, equipment);
    this.disconnect(playerId);
    // Dropped old-kit commands are acknowledged so prediction cannot replay them.
    controller.processed = controller.received;
    controller.lastTick = this.battle.frame;
  }
  unbind(playerId: string) { this.controllers.delete(playerId); }
  acknowledgements() { return Object.fromEntries([...this.controllers].map(([id, c]) => [id, c.processed])); }
  actorId(playerId: string) { return this.controllers.get(playerId)?.actorId ?? null; }
  nextSequence(playerId: string) { return (this.controllers.get(playerId)?.received ?? -1) + 1; }
  jumpHeld(playerId: string) { return this.controllers.get(playerId)?.input.jump ?? false; }
  diagnostics(playerId: string) {
    const c = this.controllers.get(playerId);
    return c ? { ...c.stats, queue: c.pending.length, ack: c.processed, receivedSequence: c.received, inputAgeTicks: this.battle.frame - c.lastTick } : null;
  }
  checkpoint() { return structuredClone({ version: 1 as const, battle: this.battle.checkpoint(), inputTimeoutTicks: this.inputTimeoutTicks, phaseMs: this.phaseMs, controllers: [...this.controllers] }); }
  static restore(saved: ReturnType<MatchSession['checkpoint']>) {
    if (saved.version !== 1) throw Error('Unsupported session checkpoint');
    const state = structuredClone(saved);
    const session = new MatchSession(Battle.restore(state.battle), state.inputTimeoutTicks);
    session.phaseMs = state.phaseMs; session.controllers = new Map(state.controllers);
    for (const c of session.controllers.values()) c.stats ??= newStats();
    return session;
  }
  tick() {
    if (this.battle.phase !== 'running') return;
    const inputs = new Map<string, BattleInput>();
    const shotFrames = new Map<string, number>();
    // Actor order fixes action ordering regardless of packet arrival order between players.
    for (const actor of this.battle.actors) {
      const controller = [...this.controllers.values()].find(c => c.actorId === actor.id);
      if (!controller) continue;
      const command = controller.pending.shift();
      if (command) {
        if (command.shotFrame !== undefined) shotFrames.set(actor.id, command.shotFrame);
        if (command.input.fire && !controller.input.fire) controller.stats.firePresses++;
        controller.input = command.input; controller.lastTick = this.battle.frame; controller.processed = command.sequence;
        for (const action of command.actions) {
          if (action === 'swap') this.battle.swap(actor);
          if (action === 'reload') this.battle.reload(actor);
          if (action === 'skill' && !this.battle.useSkill(actor)) this.battle.journal.emit({ tick: this.battle.frame, kind: 'error', actorId: actor.id });
          if (action === 'item' && !this.battle.useItem(command.input.aim, actor)) this.battle.journal.emit({ tick: this.battle.frame, kind: 'error', actorId: actor.id });
        }
      }
      if (this.battle.frame - controller.lastTick === this.inputTimeoutTicks) controller.stats.timeouts++;
      if (this.battle.frame - controller.lastTick >= this.inputTimeoutTicks) controller.input = { ...idleInput(), aim: { ...controller.input.aim } };
      if (controller.input.fire) {
        controller.stats.fireHeldTicks++;
        if (actor.arsenal.gun.reloadFrames) controller.stats.reloadTicks++;
        if (!actor.arsenal.gun.ammo) controller.stats.emptyTicks++;
        if (actor.arsenal.gun.cooldownFrames > 1) controller.stats.cooldownTicks++;
        if (!actor.life.alive) controller.stats.deadFireTicks++;
        if (actor.offhand && !actor.offhand.permitsGunfire) controller.stats.offhandTicks++;
      }
      inputs.set(actor.id, controller.input);
    }
    const shotsBefore = new Map(this.battle.actors.map(a => [a.id, a.arsenal.shots]));
    this.battle.tickPlayers(inputs, shotFrames, true);
    for (const c of this.controllers.values()) {
      const actor = this.battle.actors.find(a => a.id === c.actorId);
      if (actor) {
        const fired = actor.arsenal.shots - (shotsBefore.get(actor.id) ?? actor.arsenal.shots);
        c.stats.shots += fired;
        if (fired) {
          const effects = this.battle.effects.filter(e => e.actorId === actor.id && e.frame === this.battle.frame);
          if (effects.some(e => e.trace.hit?.type === 'unit')) c.stats.hitShots++;
          if (effects.some(e => e.damage > 0)) c.stats.damagingShots++;
          if (effects.length && effects.every(e => e.trace.hit?.type === 'wall')) c.stats.wallShots++;
          if (effects.length && effects.every(e => !e.trace.hit)) c.stats.missShots++;
        }
      }
    }
  }
  advance(deltaMs: number, beforeTick?: () => void) {
    if (!Number.isFinite(deltaMs) || deltaMs < 0) throw new RangeError('Invalid session delta');
    this.phaseMs += deltaMs;
    while (this.phaseMs + 1e-7 >= COMBAT_FRAME_MS) { this.phaseMs -= COMBAT_FRAME_MS; beforeTick?.(); this.tick(); }
  }
}
