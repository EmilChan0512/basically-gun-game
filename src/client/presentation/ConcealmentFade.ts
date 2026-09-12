const TRANSITION_FRAMES = 30;
const CONCEALED_ALPHA = .25;
interface Fade { from: number; to: number; start: number; last: number }

/** Visual-only one-second fade. Reversals continue from the current opacity. */
export class ConcealmentFade {
  private states = new Map<string, Fade>();
  private seen = new Set<string>();
  begin() {
    for (const id of this.states.keys()) if (!this.seen.has(id)) this.states.delete(id);
    this.seen.clear();
  }
  private value(state: Fade, frame: number) {
    const t = Math.max(0, Math.min(1, (frame - state.start) / TRANSITION_FRAMES));
    return state.from + (state.to - state.from) * t * t * (3 - 2 * t);
  }
  alpha(id: string, concealed: boolean, alive: boolean, frame: number) {
    this.seen.add(id);
    if (!alive) { this.states.delete(id); return 1; }
    let state = this.states.get(id);
    if (!state || frame < state.last) {
      state = { from: 0, to: concealed ? 1 : 0, start: frame, last: frame };
      this.states.set(id, state);
    }
    const value = this.value(state, frame), target = concealed ? 1 : 0;
    if (state.to !== target) { state.from = value; state.to = target; state.start = frame; }
    state.last = frame;
    return 1 - value * (1 - CONCEALED_ALPHA);
  }
}
