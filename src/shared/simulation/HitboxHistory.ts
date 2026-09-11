import type { UnitHitbox } from '../../game/combat/Ballistics';

export interface HistoricalHitbox extends UnitHitbox { generation: number; protected: boolean }
/** Whole-tick history: four 30Hz ticks (133.3ms), strictly below the 150ms cap.
 * Callers supply authority-selected frames, never unchecked client timestamps. */
export class HitboxHistory {
  private frames: { tick: number; units: HistoricalHitbox[] }[] = [];
  record(tick: number, units: HistoricalHitbox[]) {
    this.frames = this.frames.filter(frame => frame.tick < tick && frame.tick >= tick - 4);
    this.frames.push({ tick, units: structuredClone(units) });
  }
  resolve(now: number, requested: number | undefined, current: HistoricalHitbox[]): UnitHitbox[] {
    if (requested === undefined || !Number.isSafeInteger(requested) || requested < now - 4 || requested >= now) return current;
    const frame = this.frames.find(frame => frame.tick === requested);
    if (!frame) return current;
    return current.map(unit => {
      const old = frame.units.find(old => old.id === unit.id);
      // A different life must never be hit through its previous position. A unit
      // absent/dead/protected at the requested time has no historical hitbox.
      if (!old || !old.alive || old.protected || old.generation !== unit.generation) return { ...unit, alive: false };
      return { ...old, alive: unit.alive && !unit.protected };
    });
  }
  checkpoint() { return structuredClone(this.frames); }
  restore(frames: ReturnType<HitboxHistory['checkpoint']>) { this.frames = structuredClone(frames); }
}
