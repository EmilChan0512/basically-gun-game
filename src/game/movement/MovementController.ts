import type { MovementConfig } from '../config/movement';
export interface MoveInput { axis: number; jumpPressed: boolean; drop: boolean }
export interface Kinematics { vx: number; vy: number; grounded: boolean }
export function approach(value: number, target: number, amount: number) {
  return value < target ? Math.min(target, value + amount) : Math.max(target, value - amount);
}
export class MovementController {
  private grace = 0;
  private buffered = 0;
  private jumpLocked = false;
  reset() { this.grace = 0; this.buffered = 0; this.jumpLocked = false; }
  tick(state: Kinematics, input: MoveInput, dt: number, c: MovementConfig) {
    if (state.grounded && state.vy >= 0) this.jumpLocked = false;
    this.grace = state.grounded && !this.jumpLocked ? c.coyoteTimeMs / 1000 : Math.max(0, this.grace - dt);
    this.buffered = input.jumpPressed ? Math.max(c.jumpBufferMs / 1000, dt) : Math.max(0, this.buffered - dt);
    const axis = Math.max(-1, Math.min(1, input.axis));
    const acceleration = state.grounded ? (axis ? c.runAcceleration : c.groundDeceleration) : c.airAcceleration;
    const vx = axis || state.grounded ? approach(state.vx, axis * c.maxRunSpeed, acceleration * dt) : state.vx;
    let vy = state.vy;
    const jumped = this.buffered > 0 && (state.grounded || this.grace > 0) && !this.jumpLocked && !input.drop;
    if (jumped) { vy = -c.jumpVelocity; this.buffered = 0; this.grace = 0; this.jumpLocked = true; }
    return { vx, vy: Math.min(c.maxFallSpeed, vy), jumped };
  }
}
