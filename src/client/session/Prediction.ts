import { OriginalMovement } from '../../game/movement/OriginalMovement';
import type { BattleInput } from '../../game/campaign/Battle';
import type { StateMessage } from '../../shared/protocol/State';
import { customMatch } from '../../shared/content/Maps';
import { wallFor } from '../../game/campaign/Missions';

export class Prediction {
  movement: OriginalMovement | null = null;
  private mapId = '';
  private pending: { sequence: number; input: BattleInput }[] = [];
  private jumpHeld = false;
  private alive = false;
  private width = 0;
  private killY = Infinity;
  accept(state: StateMessage) {
    if (!state.movement) return;
    if (this.mapId !== state.mapId || !this.movement) {
      const map = customMatch(state.mapId, state.mode);
      this.mapId = state.mapId; this.width = map.width;
      this.killY = map.killY ?? (map.height ?? 700) + 140;
      this.movement = new OriginalMovement(wallFor(map)); this.pending = [];
    }
    Object.assign(this.movement, state.movement);
    this.jumpHeld = state.jumpHeld ?? false;
    this.alive = state.state.actors.find(a => a.id === state.actorId)?.life.alive ?? false;
    this.pending = this.pending.filter(command => command.sequence > state.ack);
    for (const command of this.pending) this.step(command.input);
  }
  input(sequence: number, input: BattleInput) {
    if (!this.movement) return;
    this.pending.push({ sequence, input: structuredClone(input) });
    if (this.pending.length > 90) this.pending.shift();
    this.step(input);
  }
  private step(input: BattleInput) {
    if (this.alive && this.movement) {
      if (input.jump && !this.jumpHeld) this.movement.jump();
      this.movement.tick(input);
      this.movement.x = Math.max(20, Math.min(this.width - 20, this.movement.x));
      // Stop movement at the same fall boundary as authority. This does not
      // predict damage/death or awards; those still arrive in the snapshot.
      if (this.movement.y > this.killY) this.alive = false;
    }
    this.jumpHeld = input.jump;
  }
}
