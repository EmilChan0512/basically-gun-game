import type { StateMessage } from '../../shared/protocol/State';
import { NETWORK_TICK_MS, REMOTE_INTERPOLATION_MS } from '../../shared/protocol/Timing';
type Actor = StateMessage['state']['actors'][number];
export class Interpolation {
  private snapshots: StateMessage[] = [];
  private offsets: number[] = [];
  private rendered = -Infinity;
  push(state: StateMessage, now: number) {
    const latest = this.snapshots.at(-1);
    if (latest && (state.roomId !== latest.roomId || state.round !== latest.round)) {
      this.snapshots = []; this.offsets = []; this.rendered = -Infinity;
    } else if (latest && state.state.frame <= latest.state.frame) return;
    this.snapshots.push(state); if (this.snapshots.length > 32) this.snapshots.shift();
    // Lowest recent arrival offset suppresses extra jitter delay. This estimates
    // a server timeline plus path latency, not a synchronized wall clock.
    this.offsets.push(now - state.state.frame * NETWORK_TICK_MS);
    if (this.offsets.length > 32) this.offsets.shift();
  }
  frame(now: number) {
    if (!this.snapshots.length) return null;
    const desired = (now - Math.min(...this.offsets) - REMOTE_INTERPOLATION_MS) / NETWORK_TICK_MS;
    this.rendered = Math.min(this.snapshots.at(-1)!.state.frame,
      Math.max(this.rendered, this.snapshots[0].state.frame, desired));
    return this.rendered;
  }
  position(actor: Actor, now: number) {
    const frame = this.frame(now);
    if (frame === null) return { x: actor.x, y: actor.y };
    const upper = this.snapshots.findIndex(s => s.state.frame >= frame);
    const after = this.snapshots[upper < 0 ? this.snapshots.length - 1 : upper];
    const before = this.snapshots[Math.max(0, upper - 1)];
    const a = before.state.actors.find(a => a.id === actor.id), b = after.state.actors.find(a => a.id === actor.id);
    if (!a || !b || a.life.deaths !== actor.life.deaths || b.life.deaths !== actor.life.deaths
      || a.life.alive !== actor.life.alive || b.life.alive !== actor.life.alive || Math.hypot(b.x - a.x, b.y - a.y) > 150) return { x: actor.x, y: actor.y };
    const span = after.state.frame - before.state.frame;
    const fraction = span > 0 ? Math.max(0, Math.min(1, (frame - before.state.frame) / span)) : 1;
    return { x: a.x + (b.x - a.x) * fraction, y: a.y + (b.y - a.y) * fraction };
  }
}
