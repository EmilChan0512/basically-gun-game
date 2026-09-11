import type { StateMessage } from '../../shared/protocol/State';
import { NETWORK_TICK_MS } from '../../shared/protocol/Timing';
type Effect = StateMessage['effects'][number];
/** Effects expire on the local monotonic clock even if snapshots stop. */
export class ShotPresentation {
  private scope = '';
  private seen = new Set<string>();
  private shots: { effect: Effect; expires: number }[] = [];
  accept(message: StateMessage, now: number) {
    const scope = `${message.roomId}:${message.round}`;
    if (scope !== this.scope) { this.scope = scope; this.seen.clear(); this.shots = []; }
    for (const effect of message.effects) {
      const key = `${effect.actorId}:${effect.frame}:${effect.trace.origin.x}:${effect.trace.origin.y}:${effect.trace.end.x}:${effect.trace.end.y}`;
      if (this.seen.has(key)) continue;
      this.seen.add(key);
      const age = message.state.frame - effect.frame;
      if (age >= 0 && age < 3) this.shots.push({ effect, expires: now + (3 - age) * NETWORK_TICK_MS });
    }
    while (this.seen.size > 2048) this.seen.delete(this.seen.values().next().value!);
    this.visible(now);
  }
  visible(now: number) {
    this.shots = this.shots.filter(shot => shot.expires > now);
    return this.shots.map(shot => shot.effect);
  }
}
