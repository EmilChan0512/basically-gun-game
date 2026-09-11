/** Tiny locally synthesized cues; no network, samples or external assets. */
export class CombatAudio {
  private context?: AudioContext;
  enabled = true;
  unlock() {
    try { this.context ??= new AudioContext(); void this.context.resume().catch(() => {}); } catch { /* Audio is optional. */ }
  }
  cue(kind: 'shot' | 'hit' | 'win' | 'lose') {
    if (!this.enabled || !this.context || this.context.state !== 'running') return;
    const ctx = this.context, osc = ctx.createOscillator(), gain = ctx.createGain();
    const duration = kind === 'shot' ? 0.045 : kind === 'hit' ? 0.075 : 0.5;
    osc.type = kind === 'shot' ? 'sawtooth' : 'sine';
    osc.frequency.setValueAtTime({ shot: 140, hit: 650, win: 440, lose: 220 }[kind], ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(kind === 'win' ? 880 : 60, ctx.currentTime + duration);
    gain.gain.setValueAtTime(kind === 'shot' ? 0.025 : 0.06, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain); gain.connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + duration);
    osc.onended = () => { osc.disconnect(); gain.disconnect(); };
  }
}
