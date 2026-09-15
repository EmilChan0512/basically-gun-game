import type Phaser from 'phaser';
import type { MapGeometry } from '../../shared/content/MapTypes';
import { STATION_RAMPS } from '../../shared/content/maps/Longshot';

const assetIds = ['orbital-vista', 'deck-hull', 'hover-module', 'cargo-cell'];
export function preloadSpaceStation(scene: Phaser.Scene) {
  for (const id of assetIds) scene.load.image(`station-${id}`, `/assets/space-station/v1/${id}.png`);
}

/** Shared local/online renderer. Art fills the actual collision surfaces. */
export function drawSpaceStation(scene: Phaser.Scene, map: MapGeometry): Phaser.GameObjects.Image[] {
  const images: Phaser.GameObjects.Image[] = [];
  const place = (id: string, x: number, y: number, width: number, height: number, depth = 0) => {
    const image = scene.add.image(x, y, `station-${id}`).setOrigin(0).setDisplaySize(width, height).setDepth(depth);
    images.push(image); return image;
  };
  // One continuous planet horizon, preserving the generated image's aspect ratio.
  place('orbital-vista', 0, -900, map.width, map.width / 2, -2);
  for (const t of map.terrain) {
    const crate = t.width === 60 && t.height === 48;
    const suspended = t.y < 900 && t.width > 100;
    const id = crate ? 'cargo-cell' : suspended ? 'hover-module' : 'deck-hull';
    const tileWidth = suspended ? Math.min(t.width, t.height * 2) : crate ? t.width : 480;
    for (let x = 0; x < t.width; x += tileWidth) place(id, t.x + x, t.y, Math.min(tileWidth, t.width - x), t.height);
  }
  for (const ramp of STATION_RAMPS) {
    place('deck-hull', ramp.x, ramp.y, Math.hypot(ramp.width, ramp.rise), 16).setRotation(Math.atan2(ramp.rise, ramp.width));
  }
  return images;
}
