import type Phaser from 'phaser';
import type { MapGeometry } from '../../shared/content/MapTypes';
import { STATION_RAMPS } from '../../shared/content/maps/Longshot';

const assetIds = ['orbital-vista', 'deck-hull', 'hover-module', 'cargo-cell', 'observation-bay'];
export function preloadSpaceStation(scene: Phaser.Scene) {
  for (const id of assetIds) scene.load.image(`station-${id}`, `/assets/space-station/v1/${id}.png`);
}

/** Shared local/online renderer. Art fills the actual collision surfaces. */
export function drawSpaceStation(scene: Phaser.Scene, map: MapGeometry): Phaser.GameObjects.GameObject[] {
  const images: Phaser.GameObjects.GameObject[] = [];
  const place = (id: string, x: number, y: number, width: number, height: number, depth = 0) => {
    const image = scene.add.image(x, y, `station-${id}`).setOrigin(0).setDisplaySize(width, height).setDepth(depth);
    images.push(image); return image;
  };
  // One continuous planet horizon, preserving the generated image's aspect ratio.
  place('orbital-vista', 0, -900, map.width, map.width / 2, -2);
  place('observation-bay', 1800, 120, 1200, 240, -1);
  for (const t of map.terrain) {
    const crate = t.width === 60 && t.height === 48 || t.width === 80 && t.height === 56;
    const suspended = t.y >= 360 && t.y < 900 && t.width > 100;
    const id = crate ? 'cargo-cell' : suspended ? 'hover-module' : 'deck-hull';
    const tileWidth = suspended ? Math.min(t.width, t.height * 2) : crate ? t.width : 480;
    for (let x = 0; x < t.width; x += tileWidth) place(id, t.x + x, t.y, Math.min(tileWidth, t.width - x), t.height);
  }
  for (const ramp of STATION_RAMPS) {
    place('deck-hull', ramp.x, ramp.y, Math.hypot(ramp.width, ramp.rise), 16).setRotation(Math.atan2(ramp.rise, ramp.width));
  }
  const gates = scene.add.graphics().setDepth(2); images.push(gates);
  for (const portal of map.portals ?? []) {
    const up = portal.id.endsWith('-up'), { x, y } = portal.entrance, color = up ? 0x69ebff : 0xffc783;
    gates.fillStyle(color, .12).fillEllipse(x, y - 40, 52, 84);
    gates.lineStyle(4, color, .9).strokeEllipse(x, y - 40, 44, 80);
    gates.lineStyle(1, 0xe3ffff, .85).strokeEllipse(x, y - 40, 32, 68);
    gates.lineStyle(3, color).lineBetween(x - 30, y, x + 30, y);
    const label = scene.add.text(x, y - 104, up ? 'S 传送至高舱' : 'S 返回下层', {
      fontFamily: 'Segoe UI, Microsoft YaHei, sans-serif', fontSize: '14px', color: up ? '#9af1ff' : '#ffce91',
      backgroundColor: '#071421cc', padding: { x: 5, y: 3 },
    }).setOrigin(.5).setDepth(2); images.push(label);
  }
  images.push(scene.add.text(2400, 152, '轨道观测舱 · 争夺高地', { fontFamily: 'Segoe UI, Microsoft YaHei, sans-serif', fontSize: '20px', color: '#b5eeff', backgroundColor: '#071421bb', padding: { x: 12, y: 5 } }).setOrigin(.5).setDepth(0));
  return images;
}
