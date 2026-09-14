import Phaser from 'phaser';
import { visionPolygon, type Point } from './VisionPolygon';
import { VISION_RADIUS } from '../../shared/simulation/Vision';

/** A low-resolution canvas mask, cached in world space. Reproject every render
 * so camera motion never exposes a stale screen-space mask. */
export const VISION_TRAIL_MS = 360;
const TRAIL_SAMPLE_MS = 60;
type Sight = { origin: Point; polygon: Point[] };

export class VisionOverlay {
  private texture: Phaser.Textures.CanvasTexture;
  private mask: Phaser.Textures.CanvasTexture;
  private trails: { id: string; sight: Sight; at: number }[] = [];
  private sampledAt = new Map<string, number>();
  private image: Phaser.GameObjects.Image;
  private cache = new Map<string, { origin: Point; polygon: Point[] }>();
  private drawnKey = '';
  private readonly key = `online-vision-${Phaser.Utils.String.UUID()}`;
  constructor(private scene: Phaser.Scene, private wall: (x: number, y: number) => boolean) {
    this.texture = scene.textures.createCanvas(this.key, 560, 310)!;
    this.mask = scene.textures.createCanvas(`${this.key}-mask`, 560, 310)!;
    // Keep authority-revealed actors/objectives above terrain shading, including
    // enemies exposed by firing or carrying a public objective outside sight.
    this.image = scene.add.image(0, 0, this.key).setOrigin(0).setScrollFactor(0).setDepth(1).setDisplaySize(1120, 620);
    scene.events.once('shutdown', () => { this.image.destroy(); scene.textures.remove(this.key); this.scene.textures.remove(`${this.key}-mask`); this.cache.clear(); this.trails = []; this.sampledAt.clear(); });
  }
  draw(observers: readonly (Point & { id: string })[], now = performance.now()) {
    const camera = this.scene.cameras.main;
    const width = this.scene.scale.width, height = this.scene.scale.height;
    const zoom = camera.zoom;
    const left = camera.scrollX + width * (1 - 1/zoom) / 2;
    const top = camera.scrollY + height * (1 - 1/zoom) / 2;
    this.image.setDisplaySize(width/zoom, height/zoom);
    this.image.setPosition(width*(1-1/zoom)/2, height*(1-1/zoom)/2);
    const visible: { id: string; origin: Point; polygon: Point[] }[] = [];
    const active = new Set(observers.map(o => o.id));
    for (const id of this.cache.keys()) if (!active.has(id)) { this.cache.delete(id); this.sampledAt.delete(id); }
    this.trails = this.trails.filter(t => active.has(t.id) && now >= t.at && now-t.at < VISION_TRAIL_MS);
    for (const observer of observers) {
      if (observer.x + VISION_RADIUS < left || observer.x - VISION_RADIUS > left + width/zoom
        || observer.y + VISION_RADIUS < top || observer.y - VISION_RADIUS > top + height/zoom) continue;
      let cached = this.cache.get(observer.id);
      if (!cached || Math.hypot(cached.origin.x - observer.x, cached.origin.y - observer.y) >= 4) {
        if (cached && now-(this.sampledAt.get(observer.id) ?? now) >= TRAIL_SAMPLE_MS) {
          this.trails.push({ id: observer.id, sight: cached, at: now });
          this.sampledAt.set(observer.id, now);
        }
        if (!cached) this.sampledAt.set(observer.id, now);
        cached = { origin: { x: observer.x, y: observer.y }, polygon: visionPolygon(observer, this.wall) };
        this.cache.set(observer.id, cached);
      }
      visible.push({ id: observer.id, ...cached });
    }
    // A stationary mask need not be rasterized and uploaded to WebGL every frame.
    // Include the camera so movement always reprojects the world-space polygons.
    const key = JSON.stringify([width, height, camera.scrollX, camera.scrollY, camera.zoom,
      visible.map(p => [p.id, p.origin.x, p.origin.y]),
      this.trails.map(t => [t.id, t.at, Math.floor((now-t.at)/16)])]);
    if (key === this.drawnKey) return;
    this.drawnKey = key;
    const sx = 560 / width, sy = 310 / height;
    const mask = this.mask.context;
    mask.setTransform(1, 0, 0, 1, 0, 0);
    mask.filter = 'none'; mask.globalCompositeOperation = 'source-over';
    mask.fillStyle = '#000'; mask.fillRect(0, 0, 560, 310);
    mask.setTransform(sx*zoom, 0, 0, sy*zoom, -left*sx*zoom, -top*sy*zoom);
    // Maximum coverage: overlapping teammate trails never compound into full sight.
    mask.globalCompositeOperation = 'lighten';

    const paint = (sight: Sight, strength: number) => {
      const shade = Math.round(255*strength);
      mask.fillStyle = `rgb(${shade},${shade},${shade})`;
      mask.beginPath(); sight.polygon.forEach((p, index) => index ? mask.lineTo(p.x,p.y) : mask.moveTo(p.x,p.y));
      mask.closePath(); mask.fill();
    };
    for (const trail of this.trails) {
      const age = Math.floor((now-trail.at)/16)*16/VISION_TRAIL_MS;
      paint(trail.sight, .8*(1-age)*(1-age));
    }
    for (const sight of visible) paint(sight, 1);
    mask.filter = 'none'; mask.globalCompositeOperation = 'source-over';
    // Convert grayscale coverage into fog alpha. History affects terrain shading only;
    // enemy positions still come exclusively from the current authority snapshot.
    const ctx = this.texture.context;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over'; ctx.clearRect(0, 0, 560, 310);
    // Blur the combined field once, rather than every teammate/history polygon.
    ctx.filter = `blur(${Math.max(1, 18*sx*zoom)}px)`;
    ctx.drawImage(this.mask.canvas, 0, 0);
    ctx.filter = 'none';
    const pixels = ctx.getImageData(0, 0, 560, 310);
    for (let i=0;i<pixels.data.length;i+=4) {
      const coverage=pixels.data[i]/255;
      pixels.data[i]=5; pixels.data[i+1]=12; pixels.data[i+2]=23;
      pixels.data[i+3]=Math.round(194*(1-coverage));
    }
    ctx.putImageData(pixels, 0, 0);
    this.texture.refresh();
  }
}
