import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { inspectSwf } from './swf';

const sourcePage = 'https://www.notdoppler.com/strikeforceheroes.php';
const downloadUrl = 'https://i.notdoppler.com/files/strikeforceheroes.swf?2017july3';
const expectedSha256 = '0b8d92dfae85917dd9bc0dc87997979bb825b3211d95d92f84040ffc9a1cc989';
const root = fileURLToPath(new URL('../../', import.meta.url));
const directory = path.join(root, 'archaeology/swf');
const target = path.join(directory, 'sfh1_reference.swf');
await mkdir(directory, { recursive: true });
let bytes: Buffer;
if (existsSync(target)) bytes = await readFile(target);
else {
  console.log(`Downloading the verified 2012 SFH1 v1.2.1 reference from ${downloadUrl}`);
  const response = await fetch(downloadUrl, { signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw new Error(`Reference download failed: HTTP ${response.status}`);
  bytes = Buffer.from(await response.arrayBuffer());
}
const inspection = inspectSwf(bytes);
if (inspection.sha256 !== expectedSha256) throw new Error('Reference SHA256 differs from the reviewed Not Doppler build. Existing files were not overwritten; review the source before accepting a new hash.');
if (!existsSync(target)) await writeFile(target, bytes, { flag: 'wx' });
const provenance = { sourcePage, downloadUrl, sha256: inspection.sha256, bytes: bytes.length, verifiedAt: new Date().toISOString(), identity: 'SFH1 2012 original, internal v1.2.1; not proof of launch-day revision', scriptsExecuted: false };
await writeFile(path.join(directory, 'acquisition.json'), JSON.stringify(provenance, null, 2) + '\n');
console.log(`Reference ready: ${target}\nSHA256 ${inspection.sha256}\n${inspection.stageWidthPx}x${inspection.stageHeightPx}, ${inspection.frameRate} declared fps. Private research asset; Git ignored.`);
