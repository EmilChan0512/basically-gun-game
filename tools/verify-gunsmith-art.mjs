import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
export function verifyGunsmith(directory = 'public/assets/gunsmith/v2') {
 const manifest=JSON.parse(readFileSync(resolve(directory,'manifest.json'),'utf8'));
 const hash=b=>createHash('sha256').update(b).digest('hex');
 const guns=['m4','famas','mp5','shotgun','scout','saw'];
 if(manifest.version!==2||Object.keys(manifest.weapons).length!==guns.length)throw Error('Incomplete gunsmith manifest');
 let count=0;
 for(const gun of guns){const entry=manifest.weapons[gun];if(!entry||entry.source!==`/assets/characters/${gun}.svg`)throw Error('Invalid reference');
 if(hash(readFileSync(resolve(directory,'../../characters',`${gun}.svg`)))!==entry.sourceSha256)throw Error('Original weapon changed; rebuild components with a new revision');
 for(const part of ['heavy','short','quickmag']){const a=entry.parts[part];if(a.file!==`${gun}-${part}.png`)throw Error('Invalid component identity');
 const bytes=readFileSync(resolve(directory,a.file));if(hash(bytes)!==a.sha256||bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||bytes[25]!==6||bytes.readUInt32BE(16)!==a.width||bytes.readUInt32BE(20)!==a.height)throw Error('Invalid RGBA component');
 if(a.target.length!==4||!a.target.every(Number.isFinite)||a.target[2]<=0||a.target[3]<=0)throw Error('Invalid anchor');
 for(let off=8;off<bytes.length;){if(['tEXt','iTXt','zTXt','eXIf'].includes(bytes.toString('ascii',off+4,off+8)))throw Error('Source metadata in runtime PNG');off+=bytes.readUInt32BE(off)+12;if(off>bytes.length)throw Error('Invalid PNG');}count++;
 }}
 return {weapons:guns.length,components:count,references:'verified',anchors:'verified',format:'RGBA',metadata:'clean'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)console.log(JSON.stringify(verifyGunsmith(process.argv[2])));
