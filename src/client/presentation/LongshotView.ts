import type Phaser from 'phaser';

/** Distant desert silhouettes and recessed gantries; all collidable edges are drawn separately. */
export function drawLongshotBackdrop(g: Phaser.GameObjects.Graphics) {
  g.fillStyle(0xd8c48d, .35).fillCircle(2440, 230, 90);
  for (let x = -300; x < 5100; x += 600) {
    g.fillStyle(0x344d58).fillTriangle(x, 890, x + 260, 390 + (x % 400), x + 720, 890);
    g.fillStyle(0x405762).fillTriangle(x + 100, 960, x + 420, 660, x + 850, 960);
  }
  g.fillStyle(0x1c303b).fillRect(0, 880, 4800, 80);
  for (const [left, color] of [[600, 0x58c4c1], [3240, 0xe58c71]]) {
    g.fillStyle(0x20343e).fillRect(left, 744, 960, 168);
    g.lineStyle(8, 0x314852);
    for (let x = left + 60; x < left + 960; x += 180) {
      g.lineBetween(x, 748, x, 950);
      g.lineBetween(x, 750, x + 150, 910);
      g.lineBetween(x + 150, 750, x, 910);
    }
    g.fillStyle(color, .5).fillRect(left + 360, 768, 240, 8);
    for (let x = left + 380; x < left + 600; x += 40) g.fillStyle(color, .25).fillRect(x, 795, 18, 55);
  }
  // Ground approach markers remain visually distinct from the solid cover blocks.
  for (let x = 2100; x <= 2700; x += 60) g.fillStyle(0xe1c68a, .25).fillRect(x, 949, 28, 5);
}
