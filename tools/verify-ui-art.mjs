import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export function verifyUIArt(directory, expectedIds = null) {
  const manifest = JSON.parse(readFileSync(resolve(directory, 'manifest.json'), 'utf8'));
  const ids = new Set();
  for (const asset of manifest.assets) {
    if (!/^[a-z0-9-]+$/.test(asset.id) || asset.file !== `${asset.id}.png` || ids.has(asset.id)) throw Error('Invalid UI asset identity');
    ids.add(asset.id);
    const bytes = readFileSync(resolve(directory, asset.file));
    if (createHash('sha256').update(bytes).digest('hex') !== asset.sha256) throw Error(`UI hash mismatch: ${asset.id}`);
    if (bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || bytes.readUInt32BE(16) !== asset.width || bytes.readUInt32BE(20) !== asset.height) throw Error(`UI dimensions mismatch: ${asset.id}`);
    for (let offset = 8; offset < bytes.length;) {
      if (['tEXt', 'zTXt', 'iTXt', 'eXIf'].includes(bytes.toString('ascii', offset + 4, offset + 8))) throw Error(`UI contains source metadata: ${asset.id}`);
      offset += bytes.readUInt32BE(offset) + 12;
      if (offset > bytes.length) throw Error('Invalid PNG');
    }
  }
  if (expectedIds ? ids.size !== expectedIds.length || expectedIds.some(id => !ids.has(id)) : ids.size !== 16) throw Error('Art collection is incomplete or contains unexpected assets');
  return { assets: ids.size, revision: manifest.revision, hashes: 'verified', metadata: 'clean' };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) console.log(JSON.stringify(verifyUIArt(resolve(process.argv[2] ?? 'public/assets/ui-v2/v1'))));
