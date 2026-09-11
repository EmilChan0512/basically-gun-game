import { Battle, type BattleInput } from '../../game/campaign/Battle';
import { MatchSession } from '../../shared/simulation/MatchSession';
import type { PlayerAction } from '../../shared/protocol/Commands';

/** Samples held input once per simulation tick, not once per display frame. */
export class LocalSession {
  readonly host: MatchSession;
  private sequence = 0;
  private actions: PlayerAction[] = [];
  constructor(readonly battle: Battle) {
    this.host = new MatchSession(battle);
    this.host.bind('local', battle.player.id);
  }
  action(action: PlayerAction) {
    if (!this.actions.includes(action)) this.actions.push(action);
  }
  clearInput() { this.actions = []; this.host.disconnect('local'); this.battle.releaseInput(); }
  advance(delta: number, input: () => BattleInput, consumed?: () => void) {
    this.host.advance(delta, () => {
      this.host.submit('local', { sequence: this.sequence++, input: input(), actions: this.actions });
      this.actions = []; consumed?.();
    });
  }
}
