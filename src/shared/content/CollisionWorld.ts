export interface RectTerrain { x: number; y: number; width: number; height: number }
export interface RasterMask { width: number; height: number; x: number; y: number; rows: number[][] }
/** Per-row inclusive-start/exclusive-end runs. Requires no image/DOM on the server. */
export class CollisionWorld {
  constructor(readonly rectangles: readonly RectTerrain[], readonly raster?: RasterMask) {
    if (raster && (raster.rows.length !== raster.height || raster.rows.some(row => row.length % 2 !== 0 || row.some((x, i) => !Number.isInteger(x) || x < 0 || x > raster.width || i > 0 && x < row[i - 1])))) throw Error('Invalid collision mask');
  }
  solid = (x: number, y: number): boolean => {
    if (this.rectangles.some(t => x >= t.x && x < t.x + t.width && y >= t.y && y < t.y + t.height)) return true;
    if (!this.raster) return false;
    const px = Math.trunc(x - this.raster.x), py = Math.trunc(y - this.raster.y);
    if (px < 0 || py < 0 || px >= this.raster.width || py >= this.raster.height) return false;
    const row = this.raster.rows[py];
    for (let i = 0; i < row.length; i += 2) { if (px < row[i]) return false; if (px < row[i + 1]) return true; }
    return false;
  };
}
