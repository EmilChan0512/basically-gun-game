export interface MovementConfig {
  runAcceleration: number; maxRunSpeed: number; groundDeceleration: number;
  airAcceleration: number; jumpVelocity: number; gravity: number; maxFallSpeed: number;
  coyoteTimeMs: number; jumpBufferMs: number; maxStepHeight: number; stepProbe: number;
  dropThroughMs: number; bodyWidth: number; bodyHeight: number;
}
/** TUNED initial lab values. No original SFH values have been recovered. */
export const defaults: Readonly<MovementConfig> = Object.freeze({
  runAcceleration: 2200, maxRunSpeed: 290, groundDeceleration: 2600,
  airAcceleration: 1000, jumpVelocity: 520, gravity: 1500, maxFallSpeed: 800,
  coyoteTimeMs: 65, jumpBufferMs: 75, maxStepHeight: 18, stepProbe: 5,
  dropThroughMs: 200, bodyWidth: 22, bodyHeight: 38,
});
export const simulation = { fixedHz: 120, maxFrameSeconds: 0.1, slowScale: 0.25, worldWidth: 2400, worldHeight: 760, respawnY: 715 } as const;
export const tuningControls: { key: keyof MovementConfig; label: string; min: number; max: number; step: number }[] = [
  { key: 'maxRunSpeed', label: '最大速度 · px/s', min: 150, max: 450, step: 10 },
  { key: 'jumpVelocity', label: '起跳速度 · px/s', min: 300, max: 700, step: 10 },
  { key: 'gravity', label: '重力 · px/s²', min: 800, max: 2400, step: 50 },
  { key: 'airAcceleration', label: '空中加速 · px/s²', min: 200, max: 2000, step: 100 },
  { key: 'maxStepHeight', label: '台阶辅助 · px', min: 0, max: 24, step: 1 },
];
