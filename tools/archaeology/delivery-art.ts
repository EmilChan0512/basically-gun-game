import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { inspectTimeline } from './timeline';

// Copy existing static FFDec frame exports. Never executes SWF frame scripts.
const timeline = inspectTimeline(readFileSync('archaeology/swf/sfh1_reference.swf'), 'MBFZ_fla.Guns_290');
const output = 'public/assets/reference'; mkdirSync(output, { recursive: true });
const assets = [1, 2].map(team => {
  const label = `flag${team}`, frame = timeline.labels.find(entry => entry.name === label)?.frame;
  if (!frame) throw Error(`Missing ${label}`);
  const source = `archaeology/local/curated-export/DefineSprite_375_MBFZ_fla.Guns_290/${frame}.png`;
  const png = readFileSync(source);
  if (png.toString('hex', 0, 8) !== '89504e470d0a1a0a') throw Error('Expected PNG');
  const file = `briefcase-${team}.png`; writeFileSync(`${output}/${file}`, png);
  return { team, label, frame, symbol: 375, file, source, width: png.readUInt32BE(16), height: png.readUInt32BE(20),
    sha256: createHash('sha256').update(png).digest('hex') };
});
writeFileSync(`${output}/briefcase-manifest.json`, JSON.stringify({ sourceSwf: timeline.sha256,
  method: 'Unmodified copy of existing static FFDec PNG exports; no SWF execution', assets }, null, 2));
console.log(JSON.stringify(assets));
