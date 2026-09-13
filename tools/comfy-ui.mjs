import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

const command = process.argv[2] ?? 'status';
const option = (name, fallback) => { const i = process.argv.indexOf(name); return i < 0 ? fallback : process.argv[i + 1]; };
const endpoint = new URL(option('--url', 'http://127.0.0.1:8188'));
if (!['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname) || endpoint.protocol !== 'http:') throw Error('Only local ComfyUI HTTP endpoints are supported');
const revision = option('--revision', 'v1'), only = option('--id', null);
if (!/^v[1-9][0-9]*$/.test(revision)) throw Error('Revision must be v1, v2, ...');
const manifest = JSON.parse(readFileSync('art/ui-v2/assets.json', 'utf8'));
const template = JSON.parse(readFileSync('art/ui-v2/workflow-api.json', 'utf8'));
const directory = resolve('artifacts/comfy-ui', revision), publicDirectory = resolve('public/assets/ui-v2', revision);
mkdirSync(directory, { recursive: true }); mkdirSync(publicDirectory, { recursive: true });
const journalPath = resolve(directory, 'jobs.json');
const journal = existsSync(journalPath) ? JSON.parse(readFileSync(journalPath, 'utf8')) : { version: 1, revision, models: manifest.models, jobs: {} };
const save = () => { writeFileSync(journalPath + '.tmp', JSON.stringify(journal, null, 2)); renameSync(journalPath + '.tmp', journalPath); };
const api = async (path, body) => {
  const response = await fetch(new URL(path, endpoint), { ...(body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw Error(`ComfyUI ${path}: ${response.status} ${await response.text()}`);
  return response.json();
};
const hash = value => createHash('sha256').update(value).digest('hex');
// Preserve original ComfyUI bytes locally; only remove non-pixel metadata in production.
const publish = bytes => {
  const chunks = [bytes.subarray(0, 8)];
  for (let offset = 8; offset < bytes.length;) {
    const end = offset + 12 + bytes.readUInt32BE(offset);
    if (end > bytes.length) throw Error('Invalid PNG chunk');
    if (!['tEXt', 'zTXt', 'iTXt', 'eXIf'].includes(bytes.toString('ascii', offset + 4, offset + 8))) chunks.push(bytes.subarray(offset, end));
    offset = end;
  }
  return Buffer.concat(chunks);
};
const savePublicManifest = () => writeFileSync(resolve(publicDirectory, 'manifest.json'), JSON.stringify({ version: 1, revision, generator: 'Local ComfyUI / FLUX.2 Klein 4B', assets: Object.entries(journal.jobs).filter(([, value]) => value.status === 'complete').map(([id, value]) => ({ id, file: `${id}.png`, width: value.width, height: value.height, sha256: value.sha256 })) }, null, 2));
if (command === 'publish') {
  for (const [id, job] of Object.entries(journal.jobs)) {
    if (job.status !== 'complete') throw Error(`${id}: incomplete`);
    const bytes = readFileSync(job.file);
    if (hash(bytes) !== job.sha256) throw Error(`${id}: output changed`);
    const original = resolve(directory, `${id}.original.png`);
    if (!existsSync(original)) writeFileSync(original, bytes);
    const production = publish(bytes); writeFileSync(job.file, production);
    Object.assign(job, { original, originalSha256: hash(readFileSync(original)), sha256: hash(production), bytes: production.length }); save();
  }
  savePublicManifest(); console.log(`Published ${Object.keys(journal.jobs).length} assets without workflow metadata; pixels unchanged.`); process.exit(0);
}
if (command === 'status') { console.log(JSON.stringify(journal, null, 2)); process.exit(0); }
const info = await api('/object_info');
for (const node of Object.values(template)) if (!info[node.class_type]) throw Error(`Missing ComfyUI node: ${node.class_type}`);
for (const [node, field, file] of [['UNETLoader', 'unet_name', manifest.models.unet], ['CLIPLoader', 'clip_name', manifest.models.clip], ['VAELoader', 'vae_name', manifest.models.vae]]) {
  if (!info[node].input.required[field][0].includes(file)) throw Error(`Missing local model: ${file}`);
}
if (command === 'doctor') { console.log(JSON.stringify({ ready: true, endpoint: endpoint.origin, models: manifest.models, assets: manifest.assets.length })); process.exit(0); }
if (command !== 'generate') throw Error('Use doctor, status or generate [--id asset-id] [--revision v1]');
if (only && !manifest.assets.some(asset => asset.id === only)) throw Error('Unknown asset id');
for (const [index, asset] of manifest.assets.entries()) {
  if (only && asset.id !== only) continue;
  if (!/^[a-z0-9-]+$/.test(asset.id) || asset.width % 16 || asset.height % 16) throw Error('Invalid asset specification');
  const graph = structuredClone(template), seed = 531000 + index + (Number(revision.slice(1)) - 1) * 1000;
  graph['1'].inputs.unet_name = manifest.models.unet; graph['2'].inputs.clip_name = manifest.models.clip; graph['10'].inputs.vae_name = manifest.models.vae;
  graph['3'].inputs.text = `${manifest.style} ${asset.prompt}`; graph['5'].inputs.noise_seed = seed;
  Object.assign(graph['7'].inputs, { steps: manifest.steps, width: asset.width, height: asset.height });
  Object.assign(graph['8'].inputs, { width: asset.width, height: asset.height });
  graph['12'].inputs.filename_prefix = `project-strike/ui-v2/${revision}/${asset.id}`;
  const graphHash = hash(JSON.stringify(graph));
  let job = journal.jobs[asset.id];
  if (job && job.graphHash !== graphHash) throw Error(`${asset.id}: specification changed; use a new --revision to preserve the first result`);
  if (job?.status === 'complete') {
    if (!existsSync(job.file) || hash(readFileSync(job.file)) !== job.sha256) throw Error(`${asset.id}: generated file missing or changed`);
    console.log(`${asset.id}: already complete`); continue;
  }
  if (job && !job.promptId) throw Error(`${asset.id}: ambiguous prior submission; inspect jobs.json and ComfyUI history before retrying`);
  if (!job) {
    journal.jobs[asset.id] = job = { status: 'submitting', graphHash, seed, width: asset.width, height: asset.height, startedAt: new Date().toISOString() }; save();
    writeFileSync(resolve(directory, `${asset.id}.api.json`), JSON.stringify(graph, null, 2));
    const submitted = await api('/prompt', { prompt: graph, client_id: `project-strike-ui-${revision}`, extra_data: { project: 'project-strike', asset: asset.id, revision } });
    if (!submitted.prompt_id) throw Error(JSON.stringify(submitted));
    job.promptId = submitted.prompt_id; job.status = 'queued'; save();
    console.log(`${asset.id}: submitted ${job.promptId}`);
  }
  let result;
  while (!result) {
    const history = await api(`/history/${job.promptId}`); const entry = history[job.promptId];
    if (entry?.status?.status_str === 'error') { job.status = 'failed'; job.error = entry.status.messages; save(); throw Error(`${asset.id}: ComfyUI execution failed; see jobs.json`); }
    if (entry?.outputs?.['12']?.images?.length) { result = entry; break; }
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  const images = result.outputs['12'].images;
  if (images.length !== 1) throw Error('Expected exactly one image; no automatic candidate selection is performed');
  const image = images[0], query = new URLSearchParams({ filename: image.filename, subfolder: image.subfolder, type: image.type });
  const response = await fetch(new URL(`/view?${query}`, endpoint), { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw Error('Could not fetch ComfyUI output');
  const original = Buffer.from(await response.arrayBuffer());
  const bytes = publish(original);
  if (bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || bytes.readUInt32BE(16) !== asset.width || bytes.readUInt32BE(20) !== asset.height) throw Error(`${asset.id}: output format/dimensions mismatch`);
  const file = resolve(publicDirectory, `${asset.id}.png`);
  if (existsSync(file)) throw Error(`${asset.id}: refusing to overwrite an unrecorded output`);
  const originalPath = resolve(directory, `${asset.id}.original.png`); writeFileSync(originalPath, original);
  writeFileSync(file, bytes); writeFileSync(resolve(directory, `${asset.id}.history.json`), JSON.stringify(result, null, 2));
  Object.assign(job, { status: 'complete', file, original: originalPath, originalSha256: hash(original), sha256: hash(bytes), bytes: bytes.length, completedAt: new Date().toISOString() }); save();
  savePublicManifest();
  console.log(`${asset.id}: saved ${bytes.length} bytes`);
}
