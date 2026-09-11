import { Battle, idleInput, type BattleInput } from '../../game/campaign/Battle';
import { COMBAT_FRAME_MS } from '../../game/combat/Combat';
import { validCommand, type PlayerCommand } from '../protocol/Commands';

interface Controller {
  actorId: string;
  received: number;
  processed: number;
  lastTick: number;
  input: BattleInput;
  pending: (PlayerCommand & { shotFrame?: number })[];
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
    this.controllers.set(playerId, { actorId, received: -1, processed: -1, lastTick: this.battle.frame, input: { ...idleInput(), aim: { ...actor.aim } }, pending: [] });
  }
  submit(playerId: string, command: PlayerCommand, authorityShotFrame?: number) {
    const controller = this.controllers.get(playerId);
    if (!controller || !validCommand(command) || command.sequence <= controller.received || controller.pending.length >= 32 || this.battle.phase !== 'running') return false;
    // Copy only public command fields. In particular, a client-supplied
    // shotFrame property must never become trusted queued metadata.
    controller.pending.push({ sequence: command.sequence, input: structuredClone(command.input), actions: [...command.actions],
      ...(Number.isSafeInteger(authorityShotFrame) && authorityShotFrame! >= 0 && authorityShotFrame! <= this.battle.frame
        ? { shotFrame: authorityShotFrame } : {}) });
    controller.received = command.sequence;
    return true;
  }
  disconnect(playerId: string) {
    const controller = this.controllers.get(playerId);
    if (!controller) return;
    controller.pending = [];
    controller.input = { ...idleInput(), aim: { ...controller.input.aim } };
    this.battle.actors.find(a => a.id === controller.actorId)?.arsenal.setTrigger(false);
  }
  acknowledgements() { return Object.fromEntries([...this.controllers].map(([id, c]) => [id, c.processed])); }
  actorId(playerId: string) { return this.controllers.get(playerId)?.actorId ?? null; }
  nextSequence(playerId: string) { return (this.controllers.get(playerId)?.received ?? -1) + 1; }
  jumpHeld(playerId: string) { return this.controllers.get(playerId)?.input.jump ?? false; }
  checkpoint() { return structuredClone({ version: 1 as const, battle: this.battle.checkpoint(), inputTimeoutTicks: this.inputTimeoutTicks, phaseMs: this.phaseMs, controllers: [...this.controllers] }); }
  static restore(saved: ReturnType<MatchSession['checkpoint']>) {
    if (saved.version !== 1) throw Error('Unsupported session checkpoint');
    const state = structuredClone(saved);
    const session = new MatchSession(Battle.restore(state.battle), state.inputTimeoutTicks);
    session.phaseMs = state.phaseMs; session.controllers = new Map(state.controllers);
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
        controller.input = command.input; controller.lastTick = this.battle.frame; controller.processed = command.sequence;
        for (const action of command.actions) {
          if (action === 'swap') this.battle.swap(actor);
          if (action === 'reload') this.battle.reload(actor);
          if (action === 'skill') this.battle.useSkill(actor);
          if (action === 'item') this.battle.useItem(command.input.aim, actor);
        }
      }
      if (this.battle.frame - controller.lastTick >= this.inputTimeoutTicks) controller.input = { ...idleInput(), aim: { ...controller.input.aim } };
      inputs.set(actor.id, controller.input);
    }
    this.battle.tickPlayers(inputs, shotFrames);
  }
  advance(deltaMs: number, beforeTick?: () => void) {
    if (!Number.isFinite(deltaMs) || deltaMs < 0) throw new RangeError('Invalid session delta');
    this.phaseMs += deltaMs;
    while (this.phaseMs + 1e-7 >= COMBAT_FRAME_MS) { this.phaseMs -= COMBAT_FRAME_MS; beforeTick?.(); this.tick(); }
  }
}
