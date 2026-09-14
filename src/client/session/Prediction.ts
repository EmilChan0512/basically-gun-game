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
  private previous: { x: number; y: number } | null = null;
  private correction = { x: 0, y: 0 };
  private lifeKey = '';
  accept(state: StateMessage) {
    if (!state.movement) return;
    const before = this.movement && { x: this.movement.x, y: this.movement.y };
    const actor = state.state.actors.find(a => a.id === state.actorId);
    const lifeKey = `${state.roomId}:${state.round}:${state.actorId}:${actor?.life.deaths}:${actor?.life.alive}`;
    const reset = this.mapId !== state.mapId || this.lifeKey !== lifeKey;
    if (this.mapId !== state.mapId || !this.movement) {
      const map = customMatch(state.mapId, state.mode);
      this.mapId = state.mapId; this.width = map.width;
      this.killY = map.killY ?? (map.height ?? 700) + 140;
      this.movement = new OriginalMovement(wallFor(map), map.stairTreads); this.pending = [];
    }
    Object.assign(this.movement, state.movement);
    this.jumpHeld = state.jumpHeld ?? false;
    this.alive = state.state.actors.find(a => a.id === state.actorId)?.life.alive ?? false;
    this.pending = this.pending.filter(command => command.sequence > state.ack);
    for (const command of this.pending) this.step(command.input);
    const dx = before ? this.movement.x - before.x : 0, dy = before ? this.movement.y - before.y : 0;
    if (reset || !this.previous || Math.hypot(dx, dy) > 150) {
      this.previous = { x: this.movement.x, y: this.movement.y }; this.correction = { x: 0, y: 0 };
    } else {
      // Authority changes physics immediately; preserve the displayed position
      // and ease only the visual error, never feed it back into simulation.
      this.previous.x += dx; this.previous.y += dy;
      this.correction.x -= dx; this.correction.y -= dy;
      if (Math.hypot(this.correction.x, this.correction.y) > 150) this.correction = { x: 0, y: 0 };
    }
    this.lifeKey = lifeKey;
  }
  input(sequence: number, input: BattleInput) {
    if (!this.movement) return;
    this.pending.push({ sequence, input: structuredClone(input) });
    if (this.pending.length > 90) this.pending.shift();
    this.previous = { x: this.movement.x, y: this.movement.y };
    this.step(input);
  }
  position(alpha: number, deltaMs: number) {
    if (!this.movement) return null;
    const previous = this.previous ?? this.movement;
    const decay = Math.exp(-Math.max(0, deltaMs) / 85);
    this.correction.x *= decay; this.correction.y *= decay;
    const t = Math.max(0, Math.min(1, alpha));
    return { x: previous.x + (this.movement.x - previous.x) * t + this.correction.x,
      y: previous.y + (this.movement.y - previous.y) * t + this.correction.y };
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
