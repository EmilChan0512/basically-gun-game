import { build } from 'esbuild';
import { readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? files(join(dir, entry.name)) : [join(dir, entry.name)]);
}
// Include every shared module, including modules unreachable from today's server.
const entryPoints = files('src/shared').filter(path => path.endsWith('.ts'));
entryPoints.push('src/game/campaign/Battle.ts');
entryPoints.push('src/client/session/LocalSession.ts');
const result = await build({ entryPoints, bundle: true, write: false, outdir: 'boundary-check',
  platform: 'neutral', format: 'esm', metafile: true, logLevel: 'silent' });
const inputs = Object.keys(result.metafile.inputs).map(path => path.replaceAll('\\', '/')).sort();
const forbidden = inputs.filter(path => !(
  path.startsWith('src/shared/') ||
  path === 'src/client/session/LocalSession.ts' ||
  /^src\/game\/campaign\/(Battle|Arsenal|Catalog|Missions|Navigation)\.ts$/.test(path) ||
  /^src\/game\/combat\/(Combat|Ballistics|OriginalLife|Recoil)\.ts$/.test(path) ||
  /^src\/game\/movement\/OriginalMovement\.ts$/.test(path)
));
const external = Object.values(result.metafile.outputs).flatMap(output => output.imports.filter(item => item.external));
const report = { date: new Date().toISOString(), entryPoints, inputs, forbidden, external,
  passed: !forbidden.length && !external.length,
  scope: 'Transitive runtime imports of every shared module and Battle; neutral bundle rejects platform packages. Companion tsc config excludes DOM typings. Not a proof of deterministic simulation.' };
mkdirSync('artifacts/qa', { recursive: true });
writeFileSync('artifacts/qa/simulation-boundary.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify({ passed: report.passed, modules: inputs.length, forbidden, external }));
if (!report.passed) process.exitCode = 1;
