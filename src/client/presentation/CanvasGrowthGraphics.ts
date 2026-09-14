import type { GrowthGraphics } from './GrowthWorldView';

/** Canvas implementation of the same drawing vocabulary as the live battlefield. */
export class CanvasGrowthGraphics implements GrowthGraphics {
  constructor(private ctx: CanvasRenderingContext2D) {}
  private color(color: number, alpha = 1) { return `rgba(${color >> 16 & 255},${color >> 8 & 255},${color & 255},${alpha})`; }
  fillStyle(color: number, alpha = 1) { this.ctx.fillStyle = this.color(color, alpha); return this; }
  lineStyle(width: number, color: number, alpha = 1) { this.ctx.lineWidth = width; this.ctx.strokeStyle = this.color(color, alpha); return this; }
  fillRect(x: number, y: number, width: number, height: number) { this.ctx.fillRect(x, y, width, height); return this; }
  strokeRect(x: number, y: number, width: number, height: number) { this.ctx.strokeRect(x, y, width, height); return this; }
  fillCircle(x: number, y: number, radius: number) { this.ctx.beginPath(); this.ctx.arc(x, y, radius, 0, Math.PI * 2); this.ctx.fill(); return this; }
  strokeCircle(x: number, y: number, radius: number) { this.ctx.beginPath(); this.ctx.arc(x, y, radius, 0, Math.PI * 2); this.ctx.stroke(); return this; }
  strokeEllipse(x: number, y: number, width: number, height: number) { this.ctx.beginPath(); this.ctx.ellipse(x, y, width / 2, height / 2, 0, 0, Math.PI * 2); this.ctx.stroke(); return this; }
  lineBetween(x1: number, y1: number, x2: number, y2: number) { this.ctx.beginPath(); this.ctx.moveTo(x1, y1); this.ctx.lineTo(x2, y2); this.ctx.stroke(); return this; }
  beginPath() { this.ctx.beginPath(); return this; }
  arc(x: number, y: number, radius: number, start: number, end: number, anticlockwise = false) { this.ctx.arc(x, y, radius, start, end, anticlockwise); return this; }
  strokePath() { this.ctx.stroke(); return this; }
}
