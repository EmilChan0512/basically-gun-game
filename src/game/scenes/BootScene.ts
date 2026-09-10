import Phaser from 'phaser';
export class BootScene extends Phaser.Scene {
  constructor() { super('BootScene'); }
  create() { this.scene.start(new URLSearchParams(location.search).get('rules') === 'original' ? 'OriginalSandboxScene' : 'MovementLabScene'); }
}
