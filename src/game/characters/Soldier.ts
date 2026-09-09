import Phaser from 'phaser';
import type { MovementConfig } from '../config/movement';
import { terrain } from '../config/course';
import { MovementController, type MoveInput } from '../movement/MovementController';
import { findStep } from '../movement/StepAssist';

export class Soldier {
  readonly collider: Phaser.GameObjects.Rectangle;
  readonly body: Phaser.Physics.Arcade.Body;
  readonly controller = new MovementController();
  private readonly art: Phaser.GameObjects.Graphics;
  aimAngle = 0;
  dropRemaining = 0;
  lastStep = 0;
  previousBottom = 0;
  constructor(scene: Phaser.Scene, public config: MovementConfig) {
    this.collider = scene.add.rectangle(180, 580, config.bodyWidth, config.bodyHeight, 0xffffff, 0);
    scene.physics.add.existing(this.collider);
    this.body = this.collider.body as Phaser.Physics.Arcade.Body;
    this.body.setCollideWorldBounds(true);
    this.body.setMaxVelocity(600, config.maxFallSpeed);
    this.art = scene.add.graphics().setDepth(10);
  }
  reset(x: number, y: number) {
    this.body.reset(x, y);
    this.body.setVelocity(0, 0);
    this.body.setAcceleration(0, 0);
    this.body.resetFlags(true);
    this.controller.reset(); this.dropRemaining = 0; this.lastStep = 0;
    this.previousBottom = this.body.bottom;
  }
  get grounded() { return this.body.blocked.down || this.body.touching.down; }
  tick(input: MoveInput, dt: number) {
    this.previousBottom = this.body.bottom;
    this.dropRemaining = input.drop ? this.config.dropThroughMs / 1000 : Math.max(0, this.dropRemaining - dt);
    const result = this.controller.tick({ vx: this.body.velocity.x, vy: this.body.velocity.y, grounded: this.grounded }, input, dt, this.config);
    this.body.setVelocity(result.vx, result.vy);
    this.body.setGravityY(this.config.gravity);
    this.body.setMaxVelocity(Math.max(this.config.maxRunSpeed, Math.abs(result.vx)), this.config.maxFallSpeed);
    const step = findStep({ x: this.body.x, y: this.body.y, width: this.body.width, height: this.body.height }, input.axis, this.grounded && !result.jumped && this.body.velocity.y >= 0, this.config.maxStepHeight, Math.abs(result.vx) * dt + this.config.stepProbe, terrain);
    this.lastStep = step?.rise ?? 0;
    if (step) { this.body.position.y = step.y; this.body.updateCenter(); }
    return result.jumped;
  }
  render(pointer: { x: number; y: number }) {
    const x = this.body.center.x, y = this.body.center.y;
    this.aimAngle = Math.atan2(pointer.y - y + 6, pointer.x - x);
    const facing = Math.cos(this.aimAngle) >= 0 ? 1 : -1;
    this.art.clear();
    this.art.fillStyle(0x0a1015, .45).fillEllipse(x, this.body.bottom + 3, 33, 7);
    this.art.fillStyle(0x83978b).fillRoundedRect(x - 12, y - 9, 24, 23, 3);
    this.art.fillStyle(0xd6ee67).fillRoundedRect(x - 11, y - 22, 22, 16, 5);
    this.art.fillStyle(0x20312e).fillRect(x + (facing > 0 ? 0 : -12), y - 17, 12, 5);
    this.art.fillStyle(0x455851).fillRect(x - 10, y + 12, 8, 8).fillRect(x + 2, y + 12, 8, 8);
    this.art.lineStyle(6, 0xd5e2c9).lineBetween(x, y - 3, x + Math.cos(this.aimAngle) * 23, y - 3 + Math.sin(this.aimAngle) * 23);
    this.art.lineStyle(4, 0x283a42).lineBetween(x + Math.cos(this.aimAngle) * 17, y - 3 + Math.sin(this.aimAngle) * 17, x + Math.cos(this.aimAngle) * 33, y - 3 + Math.sin(this.aimAngle) * 33);
  }
}
