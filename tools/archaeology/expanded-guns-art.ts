import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { inspectTimeline } from './timeline';
const timeline = inspectTimeline(readFileSync('archaeology/swf/sfh1_reference.swf'), 'MBFZ_fla.Guns_290');
const assets = [['ak47', 'AK 47'], ['deagle', 'Desert Eagle']].map(([id, label]) => {
  const frame = timeline.labels.find(entry => entry.name === label)?.frame;
  if (!frame) throw Error(`Missing ${label}`);
  const source = `archaeology/local/curated-export/DefineSprite_${timeline.spriteId}_MBFZ_fla.Guns_290/${frame}.png`;
  const png = readFileSync(source), file = `${id}.png`;
  if (png.toString('hex', 0, 8) !== '89504e470d0a1a0a') throw Error('Expected PNG');
  writeFileSync(`public/assets/reference/${file}`, png);
  return { id, label, frame, symbol: timeline.spriteId, source, file, sha256: createHash('sha256').update(png).digest('hex') };
});
writeFileSync('public/assets/reference/expanded-guns-manifest.json', JSON.stringify({ sourceSwf: timeline.sha256,
  method: 'Unmodified static FFDec export; display frame bounds are registered in Catalog; no SWF execution', assets }, null, 2));
console.log(JSON.stringify(assets));
