import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { MAPS } from '../src/shared/content/Maps';
import { mapPreviewSvg } from '../src/client/presentation/MapPreview';
mkdirSync('artifacts/qa/maps', { recursive: true });
for (const map of MAPS) for (const debug of [false, true]) {
  let svg = mapPreviewSvg(map, debug);
  if (map.geometry.artwork) {
    const path = `/assets/reference/${map.geometry.artwork.id}.png`;
    svg = svg.replace(path, `data:image/png;base64,${readFileSync(`public${path}`).toString('base64')}`);
  }
  writeFileSync(`artifacts/qa/maps/${map.id}-${debug ? 'debug' : 'preview'}.svg`, svg);
}
console.log(`Exported ${MAPS.length} self-contained map previews and collision/navigation diagrams.`);
