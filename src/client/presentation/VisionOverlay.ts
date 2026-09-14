import Phaser from 'phaser';
import { visionPolygon, type Point } from './VisionPolygon';
import { VISION_RADIUS } from '../../shared/simulation/Vision';

/** A low-resolution canvas mask, cached in world space. Reproject every render
 * so camera motion never exposes a stale screen-space mask. */
export class VisionOverlay {
  private texture: Phaser.Textures.CanvasTexture;
  private image: Phaser.GameObjects.Image;
  private cache = new Map<string, { origin: Point; polygon: Point[] }>();
  private drawnKey = '';
  private readonly key = `online-vision-${Phaser.Utils.String.UUID()}`;
  constructor(private scene: Phaser.Scene, private wall: (x: number, y: number) => boolean) {
    this.texture = scene.textures.createCanvas(this.key, 560, 310)!;
    // Keep authority-revealed actors/objectives above terrain shading, including
    // enemies exposed by firing or carrying a public objective outside sight.
    this.image = scene.add.image(0, 0, this.key).setOrigin(0).setScrollFactor(0).setDepth(1).setDisplaySize(1120, 620);
    scene.events.once('shutdown', () => { this.image.destroy(); scene.textures.remove(this.key); this.cache.clear(); });
  }
  draw(observers: readonly (Point & { id: string })[]) {
    const camera = this.scene.cameras.main;
    const width = this.scene.scale.width, height = this.scene.scale.height;
    const zoom = camera.zoom;
    const left = camera.scrollX + width * (1 - 1/zoom) / 2;
    const top = camera.scrollY + height * (1 - 1/zoom) / 2;
    this.image.setDisplaySize(width/zoom, height/zoom);
    this.image.setPosition(width*(1-1/zoom)/2, height*(1-1/zoom)/2);
    const visible: { id: string; origin: Point; polygon: Point[] }[] = [];
    const active = new Set(observers.map(o => o.id));
    for (const id of this.cache.keys()) if (!active.has(id)) this.cache.delete(id);
    for (const observer of observers) {
      if (observer.x + VISION_RADIUS < left || observer.x - VISION_RADIUS > left + width/zoom
        || observer.y + VISION_RADIUS < top || observer.y - VISION_RADIUS > top + height/zoom) continue;
      let cached = this.cache.get(observer.id);
      if (!cached || Math.hypot(cached.origin.x - observer.x, cached.origin.y - observer.y) >= 4) {
        cached = { origin: { x: observer.x, y: observer.y }, polygon: visionPolygon(observer, this.wall) };
        this.cache.set(observer.id, cached);
      }
      visible.push({ id: observer.id, ...cached });
    }
    // A stationary mask need not be rasterized and uploaded to WebGL every frame.
    // Include the camera so movement always reprojects the world-space polygons.
    const key = JSON.stringify([width, height, camera.scrollX, camera.scrollY, camera.zoom,
      visible.map(p => [p.id, p.origin.x, p.origin.y])]);
    if (key === this.drawnKey) return;
    this.drawnKey = key;
    const sx = 560 / width, sy = 310 / height;
    const ctx = this.texture.context;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over'; ctx.clearRect(0, 0, 560, 310);
    ctx.fillStyle = 'rgba(5, 12, 23, 0.76)'; ctx.fillRect(0, 0, 560, 310);
    ctx.setTransform(sx*zoom, 0, 0, sy*zoom, -left*sx*zoom, -top*sy*zoom);
    ctx.globalCompositeOperation = 'destination-out';
    for (const cached of visible) {
      ctx.beginPath(); cached.polygon.forEach((p, index) => index ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath();
      // Feather only the boundary; unknown terrain remains readable underneath.
      ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(0,0,0,0.22)'; ctx.lineWidth = 24; ctx.stroke();
      ctx.lineWidth = 12; ctx.stroke(); ctx.fillStyle = '#000'; ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    this.texture.refresh();
  }
}
