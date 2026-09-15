import { verifyGunsmith } from './verify-gunsmith-art.mjs';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { once } from 'node:events';
import { verifyUIArt } from './verify-ui-art.mjs';

const folder = resolve(process.argv[2]);
console.log(`Portable station art: ${JSON.stringify(verifyUIArt(join(folder, 'dist/assets/space-station/v1'), ['orbital-vista', 'deck-hull', 'hover-module', 'cargo-cell']))}`);
console.log(`Portable UI art: ${JSON.stringify(verifyUIArt(join(folder, 'dist/assets/ui-v2/v1')))}`);
const uiKitIds = JSON.parse(readFileSync(new URL('../art/ui-kit/assets.json', import.meta.url), 'utf8')).assets.map(asset => asset.id);
console.log(`Portable UI kit: ${JSON.stringify(verifyUIArt(join(folder, 'dist/assets/ui-kit/v1'), uiKitIds))}`);
console.log(`Portable gunsmith art: ${JSON.stringify(verifyGunsmith(join(folder, 'dist/assets/gunsmith/v2')))}`);
const child = spawn(join(folder, 'runtime/node.exe'), ['tools/start-friends.mjs', '--test', '--solo'],
  { cwd: folder, windowsHide: true, env: { ...process.env, PATH: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
const closed = once(child, 'exit');
try {
  const url = await new Promise((resolveUrl, reject) => {
    const timer = setTimeout(() => reject(Error('Portable server timeout')), 10000);
    let output = '';
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('exit', () => { clearTimeout(timer); reject(Error('Portable server exited before listening')); });
    child.stdout.on('data', data => {
      output += data;
      const match = output.match(/http:\/\/127\.0\.0\.1:\d+\/\?offline/);
      if (match) { clearTimeout(timer); resolveUrl(match[0]); }
    });
  });
  const response = await fetch(url), html = await response.text();
  if (!response.ok || html !== readFileSync(join(folder, 'dist/index.html'), 'utf8')) throw Error('Portable entry mismatch');
  const assets = [...html.matchAll(/(?:src|href)="(\.?\/assets\/[^" ]+)"/g)].map(match => match[1]);
  if (!assets.length) throw Error('No production assets');
  for (const asset of assets) {
    const result = await fetch(new URL(asset, url));
    if (!result.ok || !Buffer.from(await result.arrayBuffer()).equals(readFileSync(join(folder, 'dist', asset)))) throw Error(`Asset mismatch: ${asset}`);
  }
  console.log(`Portable Windows runtime verified without PATH: ${assets.length} production assets; offline entry OK.`);
  const audioManifest = JSON.parse(readFileSync(join(folder, 'dist/assets/audio/manifest.json'), 'utf8'));
  for (const asset of Object.values(audioManifest.assets)) {
    const response = await fetch(new URL(`/assets/audio/${asset.file}`, url));
    if (!response.ok || !Buffer.from(await response.arrayBuffer()).equals(readFileSync(join(folder, 'dist/assets/audio', asset.file)))) throw Error(`Audio asset mismatch: ${asset.file}`);
  }
  console.log(`Portable audio verified: ${Object.keys(audioManifest.assets).length} clips served locally.`);
} finally { child.kill(); await closed; }
