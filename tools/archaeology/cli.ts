import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createHash } from 'node:crypto';
import Ajv from 'ajv';
import { buildInventory, report } from './indexer';

const root = fileURLToPath(new URL('../../', import.meta.url));
const args = process.argv.slice(2);
const command = args[0] || 'pipeline';
function option(name: string, fallback: string) {
  const at = args.indexOf(name);
  if (at < 0) return fallback;
  if (!args[at + 1] || args[at + 1].startsWith('--')) throw new Error(`${name} requires a value`);
  return args[at + 1];
}
async function json(file: string, data: unknown) { await writeFile(file, JSON.stringify(data, null, 2) + '\n'); }
function run(executable: string, argv: string[]) {
  // shell:false keeps paths and untrusted filenames out of shell command interpretation.
  if (/\.(bat|cmd)$/i.test(executable)) throw new Error('Use ffdec-cli.exe or ffdec.jar instead of a batch wrapper.');
  const result = spawnSync(executable, argv, { stdio: 'inherit', shell: false, windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${path.basename(executable)} exited with ${result.status}`);
}
export async function validate() {
  const schema = JSON.parse(await readFile(path.join(root, 'archaeology/evidence.schema.json'), 'utf8'));
  const db = JSON.parse(await readFile(path.join(root, 'archaeology/reverse_engineering_db.json'), 'utf8'));
  const validator = new Ajv({ strict: false }).compile(schema);
  if (!validator(db)) throw new Error(JSON.stringify(validator.errors));
  const ids = (db as { records: { id: string }[] }).records.map(r => r.id);
  if (new Set(ids).size !== ids.length) throw new Error('Duplicate evidence id');
  const referenceCount = (db as { records: { evidenceType: string }[] }).records.filter(r => ['EXTRACTED', 'OBSERVED'].includes(r.evidenceType)).length;
  console.log(`Evidence database valid: ${ids.length} records; ${referenceCount} EXTRACTED/OBSERVED records. TUNED values are not recovered reference facts.`);
}
async function main() {
  const local = path.join(root, 'archaeology/local');
  const exports = path.join(root, 'archaeology/exported');
  for (const dir of [local, exports, path.join(root, 'archaeology/swf')]) await mkdir(dir, { recursive: true });
  const swf = path.resolve(option('--swf', path.join(root, 'archaeology/swf/sfh1_reference.swf')));
  if (command === 'validate') return validate();
  if (command === 'reference') {
    if (!existsSync(swf)) throw new Error(`Place your reference SWF at ${swf}, or pass --swf <path>.`);
    run(option('--ruffle', process.env.RUFFLE_PATH || 'ruffle'), [swf]);
    return;
  }
  if (!['pipeline', 'index'].includes(command)) throw new Error(`Unknown command: ${command}`);
  let extraction = command === 'index' ? 'SKIPPED_INDEX_ONLY' : 'AWAITING_REFERENCE';
  if (command === 'pipeline' && existsSync(swf)) {
    const bytes = await readFile(swf);
    if (!['FWS', 'CWS', 'ZWS'].includes(bytes.subarray(0, 3).toString()) || bytes.length < 8) throw new Error('Invalid SWF header');
    const ffdec = option('--ffdec', process.env.FFDEC_PATH || 'ffdec-cli.exe');
    const argv = ['-onerror', 'abort', '-exportTimeout', '600', '-export', 'script,image,sprite,shape,sound,binaryData,symbolClass', exports, swf];
    try {
      const isJar = /\.jar$/i.test(ffdec);
      run(isJar ? 'java' : ffdec, isJar ? ['-jar', ffdec, ...argv] : argv);
      extraction = 'EXPORTED';
      await json(path.join(local, 'extraction.json'), { swf, sha256: createHash('sha256').update(bytes).digest('hex'), ffdec, args: argv, timestamp: new Date().toISOString() });
    } catch (error) {
      extraction = 'EXPORT_FAILED';
      console.error(`FFDec unavailable or failed: ${String(error)}\nInstall JPEXS, set FFDEC_PATH to ffdec-cli.exe or ffdec.jar, then rerun. Existing exports will still be indexed.`);
      process.exitCode = 1;
    }
  } else if (command === 'pipeline') {
    console.log(`Reference missing. Copy a lawfully obtained SFH1 SWF to:\n${swf}\nThen run npm run archaeology. Set FFDEC_PATH to ffdec-cli.exe or ffdec.jar. See docs/ARCHAEOLOGY.md.`);
  }
  const inventory = await buildInventory(path.resolve(option('--input', exports)));
  await json(path.join(local, 'inventory.json'), inventory);
  await writeFile(path.join(local, 'first-pass-report.md'), report(inventory));
  await json(path.join(local, 'workflow-status.json'), { extraction, inventory: inventory.status, verifiedReferenceFacts: false, timestamp: new Date().toISOString() });
  await validate();
  console.log(`Inventory: ${inventory.scriptCount} scripts. Reports: archaeology/local/. Missing-reference fallback is runnable; historical facts remain pending.`);
  if (args.includes('--require-reference') && (!inventory.scriptCount || extraction === 'AWAITING_REFERENCE' || extraction === 'EXPORT_FAILED')) process.exitCode = 1;
}
main().catch(error => { console.error(String(error)); process.exitCode = 1; });
