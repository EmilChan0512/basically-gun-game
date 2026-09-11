import Phaser from 'phaser';

const assets = ['usp', 'beretta', 'vector', 'm4', 'saw', 'shotgun', 'dragunov', 'boot', 'leg', 'arm', 'torso', 'head', 'supply', 'flash', 'hills', 'clouds', 'outpost', 'aircraft'];
export function preloadReferenceArt(scene: Phaser.Scene) {
  for (const id of assets) scene.load.image(`ref-${id}`, `/assets/reference/${id}.png`);
}

/** A pooled visual rig. Animation follows simulation frames, never changes collision geometry. */
export class ReferenceArt {
  private pool: Phaser.GameObjects.Image[] = [];
  private cursor = 0;
  constructor(private scene: Phaser.Scene) {}
  begin() { this.cursor = 0; for (const image of this.pool) image.setVisible(false); }
  part(id: string, x: number, y: number, w: number, h: number, angle = 0, flip = false, tint = 0xffffff, alpha = 1) {
    const image = this.pool[this.cursor] ??= this.scene.add.image(0, 0, `ref-${id}`).setDepth(2);
    this.cursor++;
    image.setTexture(`ref-${id}`).setVisible(true).setPosition(x, y).setDisplaySize(w, h)
      .setOrigin(0.5).setRotation(angle).setFlip(flip, false).setTint(tint).setAlpha(alpha);
    return image;
  }
  soldier(x: number, y: number, crouch: boolean, vx: number, jumping: boolean, frame: number, aim: { x: number; y: number }, weapon: string, tint: number, alive: boolean, reload = false, flash = false) {
    const flip = aim.x < x, facing = flip ? -1 : 1, height = crouch ? 44 : 66;
    if (!alive) { this.part('torso', x, y - 7, 26, 23, Math.PI / 2, flip, tint, 0.45); return; }
    const stride = jumping ? 5 : Math.sin(frame * 0.6) * Math.min(7, Math.abs(vx) * 1.5);
    for (const side of [-1, 1]) {
      const foot = x + side * (5 + stride);
      this.part('leg', x + side * 5, y - (crouch ? 10 : 15), 10, crouch ? 16 : 25, side * stride * 0.06, flip);
      this.part('boot', foot + facing * 2, y - 4, 14, 10, 0, flip);
    }
    this.part('torso', x, y - height + 34, 26, crouch ? 22 : 30, 0, flip, tint);
    this.part('head', x + facing * 2, y - height + 12, 29, 29, 0, flip, tint);
    const anchorY = y - (crouch ? 28 : 42);
    const angle = Math.atan2(aim.y - anchorY, aim.x - x) + (reload ? facing * 0.45 : 0);
    const length = weapon === 'usp' || weapon === 'beretta' ? 25 : weapon === 'dragunov' || weapon === 'saw' ? 52 : 43;
    const texture = this.scene.textures.get(`ref-${weapon}`).getSourceImage();
    const gunHeight = Math.min(23, length * texture.height / texture.width);
    this.part(weapon, x + Math.cos(angle) * 17, anchorY + Math.sin(angle) * 17, length, gunHeight, flip ? angle - Math.PI : angle, flip);
    this.part('arm', x + Math.cos(angle) * 5, anchorY + 9, 12, 24, angle - Math.PI / 2, flip, tint);
    if (flash) this.part('flash', x + Math.cos(angle) * (17 + length / 2 + 9), anchorY + Math.sin(angle) * (17 + length / 2 + 9), 24, 15, angle);
  }
}
