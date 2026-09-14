import type { BattleInput } from '../../game/campaign/Battle';
import { Room } from '../../shared/simulation/Room';
import { defaultGrowthLoadoutV3, type GrowthLoadoutV3 } from '../../shared/content/growth-v3/Loadout';
import { GROWTH_CLASS_IDS } from '../../shared/content/growth-v3/Core';
import { GROWTH_V3_OPERATORS } from '../../shared/content/growth-v3/Operators';
import type { GrowthPresetId } from '../../shared/content/growth-v3/Presets';
import type { PlayerAction } from '../../shared/protocol/Commands';
import type { StateMessage } from '../../shared/protocol/State';
import { visibleState } from '../../shared/protocol/VisibleState';
import { Interpolation } from './Interpolation';
import { Prediction } from './Prediction';
import { ShotPresentation } from './ShotPresentation';
import type { BattlePresentationSession } from './BattlePresentationSession';

/** Disposable 4v4 authority. No accounts, remote connections or career settlement. */
export class OfflineGrowthSession implements BattlePresentationSession {
  readonly authority: Room;
  readonly playerId = 'local-player';
  readonly socket = { readyState: 1, bufferedAmount: 0 };
  readonly audioGeneration = 0;
  interpolation = new Interpolation();
  prediction = new Prediction();
  shots = new ShotPresentation();
  state: StateMessage | null = null;
  lastStateAt = 0;
  paused = false;
  onChange: () => void = () => {};
  private actions = new Set<PlayerAction>();
  private sequence = 0;
  private eventCursor = 0;
  private disposed = false;
  get room() { return this.authority.lobby(); }
  get battle() { return this.authority.session!.battle; }
  constructor(loadout: GrowthLoadoutV3, mapId = 'hijack', preset: GrowthPresetId = 'standard', mode: 'tdm' | 'dom' = 'tdm', seed = 43191) {
    this.authority = new Room('offline-' + crypto.randomUUID(), mapId, mode, false, 'growth');
    this.authority.join(this.playerId, '本地玩家', undefined, structuredClone(loadout));
    for (let i = 1; i < 8; i++) {
      const classId = GROWTH_CLASS_IDS[Math.floor(i / 2) % 4];
      this.authority.join('bot-' + i, GROWTH_V3_OPERATORS[classId].name + '机器人 ' + i, undefined, defaultGrowthLoadoutV3(classId));
    }
    this.authority.configure(this.playerId, mapId, mode, preset);
    for (const id of this.authority.players.keys()) this.authority.ready(id, true);
    this.authority.start(this.playerId, seed);
    for (const id of this.authority.players.keys()) {
      if (id === this.playerId) continue;
      const actorId = this.authority.session!.actorId(id)!;
      this.authority.session!.unbind(id);
      this.battle.actors.find(actor => actor.id === actorId)!.human = false;
    }
    this.publish();
  }
  action(action: PlayerAction) { if (!this.paused && !this.disposed && !this.battle.result) this.actions.add(action); }
  clearActions() { this.actions.clear(); }
  input(input: BattleInput) {
    if (this.paused || this.disposed || this.battle.result) { this.clearActions(); return; }
    const sequence = this.sequence++;
    if (this.authority.command(this.playerId, { sequence, input, actions: [...this.actions] })) this.prediction.input(sequence, input);
    this.clearActions();
  }
  advance(delta: number) {
    if (this.disposed) return;
    const frame = this.battle.frame;
    if (!this.paused) this.authority.session!.advance(delta);
    if (this.battle.frame !== frame) this.publish();
    else this.lastStateAt = performance.now();
  }
  setPaused(paused: boolean) {
    this.paused = paused; this.clearActions(); this.authority.session!.disconnect(this.playerId);
    this.prediction = new Prediction(); this.interpolation = new Interpolation(); this.shots = new ShotPresentation();
    this.publish();
  }
  choose(value: unknown) {
    if (this.disposed || !value || typeof value !== 'object') return false;
    const message = value as Record<string, unknown>;
    if (!['growthChoice', 'growthReroll'].includes(String(message.type)) || message.roomId !== this.authority.id || message.round !== this.authority.round || !Number.isSafeInteger(message.batch)) return false;
    const accepted = this.battle.growthChoice(this.authority.session!.actorId(this.playerId)!, message.batch as number, message.upgrade, message.type === 'growthReroll');
    if (accepted) this.publish();
    return accepted;
  }
  dispose() { this.disposed = true; this.clearActions(); this.onChange = () => {}; }
  private publish() {
    const session = this.authority.session!, battle = this.battle, actorId = session.actorId(this.playerId)!;
    const actor = battle.actors.find(a => a.id === actorId)!;
    const message: StateMessage = {
      type: 'state', roomId: this.authority.id, round: this.authority.round, actorId, mapId: this.authority.mapId, mode: this.authority.mode,
      state: battle.snapshot(), result: battle.result, ack: session.acknowledgements()[this.playerId] ?? -1,
      poses: battle.actors.map(a => ({ id: a.id, name: a.name, aim: { ...a.aim } })), effects: battle.effects, bursts: battle.bursts,
      grenades: [], projectiles: [], events: battle.journal.since(this.eventCursor), movement: actor.movement.checkpoint(),
      jumpHeld: session.jumpHeld(this.playerId), growthV3: battle.growthV3!.privateView(actorId),
    };
    this.state = visibleState(message, battle.growthV3!.visibleActors(actor.team), actor.team, battle.wall, (a, b) => battle.growthV3!.gadgets.smokeBlocks(a, b));
    this.eventCursor = battle.journal.cursor; this.lastStateAt = performance.now();
    this.shots.accept(this.state, this.lastStateAt); this.interpolation.push(this.state, this.lastStateAt); this.prediction.accept(this.state);
    this.onChange();
  }
}
