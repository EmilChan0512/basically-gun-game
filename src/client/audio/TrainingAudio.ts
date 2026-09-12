import { gameAudio } from './AudioService';
export interface TrainingSoundState {
  frame: number; x: number; y: number; grounded: boolean; alive: boolean; health: number;
  weapon: string; shots: number; reload: number; ammo: number; fire: boolean; targetHealth: number; targetAlive: boolean;
}
/** Presentation adapter for both pre-session laboratories. */
export class TrainingAudio {
  private previous?: TrainingSoundState;
  private stepAt = 0;
  private emptyAt = 0;
  private resumeGeneration = 0;
  private paused = false;
  reset() { this.previous = undefined; this.stepAt = this.emptyAt = 0; gameAudio.stop(); }
  accept(s: TrainingSoundState, paused: boolean) {
    if (this.resumeGeneration !== gameAudio.resumeGeneration) { this.previous = undefined; this.resumeGeneration = gameAudio.resumeGeneration; }
    if (paused && !this.paused) gameAudio.stop();
    this.paused = paused;
    const p = this.previous; this.previous = { ...s };
    if (!p || paused) return;
    const at = performance.now();
    if (s.weapon !== p.weapon) { gameAudio.stop('reload:training'); gameAudio.cue('swap'); }
    for (let i = 0; i < Math.min(3, Math.max(0, s.shots - p.shots)); i++) gameAudio.weapon(s.weapon, 'shot');
    if (s.reload > 0 && (!p.reload || s.weapon !== p.weapon)) gameAudio.weapon(s.weapon, 'reload', { tag: 'reload:training', duration: s.reload / 30 });
    if (!s.reload || !s.alive) gameAudio.stop('reload:training');
    if (s.targetHealth < p.targetHealth) gameAudio.cue('hit');
    if (p.targetAlive && !s.targetAlive) { gameAudio.cue('death'); gameAudio.voice('kill'); }
    if (s.health < p.health) gameAudio.cue('hurt');
    if (p.alive && !s.alive) gameAudio.cue('death');
    if (!p.alive && s.alive) gameAudio.cue('respawn');
    if (s.alive && p.grounded && !s.grounded && s.y < p.y) gameAudio.cue('jump');
    if (s.alive && !p.grounded && s.grounded) gameAudio.cue('land');
    if (s.alive && s.grounded && Math.abs(s.x - p.x) > .5 && at - this.stepAt > 330) { gameAudio.cue('footstep'); this.stepAt = at; }
    if (s.alive && s.fire && !s.ammo && !s.reload && at - this.emptyAt > 400) { gameAudio.cue('empty'); this.emptyAt = at; }
  }
}
