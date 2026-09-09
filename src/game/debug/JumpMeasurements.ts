export class JumpMeasurements {
  private active?: { time: number; x: number; feet: number; minFeet: number; apexTime: number };
  latest?: { airtimeMs: number; apexMs: number; heightPx: number; distancePx: number };
  start(time: number, x: number, feet: number) { this.active = { time, x, feet, minFeet: feet, apexTime: time }; }
  reset() { this.active = undefined; }
  tick(time: number, x: number, feet: number, grounded: boolean) {
    const a = this.active;
    if (!a) return;
    if (feet < a.minFeet) { a.minFeet = feet; a.apexTime = time; }
    if (grounded && time - a.time > 0.04) {
      this.latest = { airtimeMs: Math.round((time - a.time) * 1000), apexMs: Math.round((a.apexTime - a.time) * 1000), heightPx: Math.round((a.feet - a.minFeet) * 10) / 10, distancePx: Math.round((x - a.x) * 10) / 10 };
      this.active = undefined;
    }
  }
}
