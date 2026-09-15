import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { toWorkflow } from './ui-art.mjs';
import { verifyUIArt } from './verify-ui-art.mjs';

const catalog = JSON.parse(readFileSync('art/space-station/assets.json', 'utf8'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const command = process.argv[2] ?? 'verify';
if (command === 'prepare') {
  const response = await fetch('http://127.0.0.1:8188/object_info', { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw Error('Local ComfyUI is unavailable');
  const info = await response.json();
  const template = JSON.parse(readFileSync('art/ui-v2/workflow-api.json', 'utf8'));
  mkdirSync('art/space-station/workflows', { recursive: true });
  for (const [index, asset] of catalog.assets.entries()) {
    const graph = structuredClone(template);
    graph['1'].inputs.unet_name = catalog.models.unet;
    graph['2'].inputs.clip_name = catalog.models.clip;
    graph['10'].inputs.vae_name = catalog.models.vae;
    graph['3'].inputs.text = `${catalog.style}\n${asset.prompt}`;
    graph['3']._meta = { title: `Space station / ${asset.id}` };
    graph['5'].inputs.noise_seed = 531000 + index;
    Object.assign(graph['7'].inputs, { steps: catalog.steps, width: asset.width, height: asset.height });
    Object.assign(graph['8'].inputs, { width: asset.width, height: asset.height });
    graph['12'].inputs.filename_prefix = `project-strike/space-station/v1/${asset.id}`;
    const base = `art/space-station/workflows/${asset.id}`;
    writeFileSync(`${base}.api.json`, JSON.stringify(graph, null, 2) + '\n');
    writeFileSync(`${base}.workflow.json`, JSON.stringify(toWorkflow(graph, info), null, 2) + '\n');
  }
  console.log(`Prepared ${catalog.assets.length} independent local ComfyUI API and editable UI workflows.`);
} else if (command === 'finish') {
  const journalPath = 'artifacts/comfy-ui/space-station/v1/jobs.json';
  const journal = JSON.parse(readFileSync(journalPath, 'utf8'));
  const job = journal.jobs['hover-module'];
  if (job?.status !== 'complete') throw Error('Generate hover-module first');
  const result = spawnSync('python', ['tools/station-alpha.py', job.original, job.file], { encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) throw Error(result.stderr || 'Local alpha preparation failed');
  const transform = JSON.parse(result.stdout);
  const bytes = readFileSync(job.file);
  Object.assign(job, transform, { sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length });
  writeFileSync(journalPath, JSON.stringify(journal, null, 2) + '\n');
  const manifestPath = 'public/assets/space-station/v1/manifest.json';
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  Object.assign(manifest.assets.find(a => a.id === 'hover-module'), { width: job.width, height: job.height, sha256: job.sha256 });
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  const selected = Object.fromEntries(Object.entries(journal.jobs).map(([id, value]) => [id, {
    seed: value.seed, graphSha256: value.graphHash, originalSha256: value.originalSha256,
    sha256: value.sha256, width: value.width, height: value.height,
    ...(value.transform ? { transform: value.transform, sourceBounds: value.sourceBounds } : {}),
  }]));
  writeFileSync('art/space-station/selected.json', JSON.stringify(selected, null, 2) + '\n');
  console.log(JSON.stringify(transform));
} else if (command === 'verify') {
  const directory = resolve(process.argv[3] ?? 'public/assets/space-station/v1');
  const verified = verifyUIArt(directory, catalog.assets.map(a => a.id));
  const selected = JSON.parse(readFileSync('art/space-station/selected.json', 'utf8'));
  for (const asset of catalog.assets) {
    const graph = JSON.parse(readFileSync(`art/space-station/workflows/${asset.id}.api.json`, 'utf8'));
    if (sha(JSON.stringify(graph)) !== selected[asset.id]?.graphSha256) throw Error(`Selected workflow changed: ${asset.id}`);
    if (sha(readFileSync(resolve(directory, `${asset.id}.png`))) !== selected[asset.id]?.sha256) throw Error(`Selected pixels changed: ${asset.id}`);
  }
  console.log(JSON.stringify({ ...verified, pipelines: catalog.assets.length }));
} else throw Error('Use prepare, finish or verify [production-directory]');
