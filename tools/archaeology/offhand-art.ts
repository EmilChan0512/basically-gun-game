import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { SPECIAL_OFFHANDS } from '../../src/shared/content/Offhands';
import { inspectTimeline } from './timeline';

const timeline = inspectTimeline(readFileSync('archaeology/swf/sfh1_reference.swf'), 'MBFZ_fla.Guns_290');
const assets = Object.entries(SPECIAL_OFFHANDS).flatMap(([id, item]) => item.kind === 'shield' ? [[id, item.source], [`${id}-back`, `${item.source}b`]] : [[id, item.source]]).map(([id, label]) => {
  const frame = timeline.labels.find(entry => entry.name === label)?.frame;
  if (!frame) throw Error(`Missing ${label}`);
  const source = `archaeology/local/curated-export/DefineSprite_${timeline.spriteId}_MBFZ_fla.Guns_290/${frame}.png`;
  const png = readFileSync(source);
  if (png.toString('hex', 0, 8) !== '89504e470d0a1a0a') throw Error('Expected PNG');
  const file = `${id}.png`; writeFileSync(`public/assets/reference/${file}`, png);
  return { id, label, frame, symbol: timeline.spriteId, source, file,
    width: png.readUInt32BE(16), height: png.readUInt32BE(20), sha256: createHash('sha256').update(png).digest('hex') };
});
writeFileSync('public/assets/reference/offhand-manifest.json', JSON.stringify({ sourceSwf: timeline.sha256,
  method: 'Unmodified copy of existing static FFDec PNG exports; no SWF execution', assets }, null, 2));
console.log(JSON.stringify(assets));
