import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, renameSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash, randomInt } from 'node:crypto';
import { createServer } from 'node:http';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { verifyUIArt } from './verify-ui-art.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = join(root, 'art/ui-kit'), output = join(root, 'public/assets/ui-kit/v1');
const history = join(root, 'artifacts/ui-kit');
const catalog = JSON.parse(readFileSync(join(source, 'assets.json'), 'utf8'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const json = path => JSON.parse(readFileSync(path, 'utf8'));
const save = (path, value) => { mkdirSync(resolve(path, '..'), { recursive: true }); writeFileSync(path + '.tmp', JSON.stringify(value, null, 2) + '\n'); renameSync(path + '.tmp', path); };
const assetFor = id => { const asset = catalog.assets.find(a => a.id === id); if (!asset) throw Error('Unknown asset: ' + id); return asset; };
const validCandidate = value => { if (!/^[a-zA-Z0-9-]{1,90}$/.test(value)) throw Error('Invalid candidate'); return value; };
const api = async (path, body) => {
  const response = await fetch('http://127.0.0.1:8188' + path, { signal: AbortSignal.timeout(30000), ...(body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
  if (!response.ok) throw Error(`ComfyUI ${response.status}: ${await response.text()}`);
  return response.json();
};

/** Production keeps pixels; editable workflows and source metadata stay in art/ and artifacts/. */
export function cleanPNG(bytes) {
  if (bytes.length < 33 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw Error('Expected PNG');
  const chunks = [bytes.subarray(0, 8)];
  for (let offset = 8; offset < bytes.length;) {
    const end = offset + bytes.readUInt32BE(offset) + 12;
    if (end > bytes.length) throw Error('Invalid PNG chunk');
    if (!['tEXt', 'iTXt', 'zTXt', 'eXIf'].includes(bytes.toString('ascii', offset + 4, offset + 8))) chunks.push(bytes.subarray(offset, end));
    offset = end;
  }
  return Buffer.concat(chunks);
}

/** Standard ComfyUI UI graph: opens directly by dragging the JSON into ComfyUI. */
export function toWorkflow(graph, info) {
  const links = [], nodes = Object.entries(graph).map(([key, node], order) => {
    const definition = info[node.class_type];
    if (!definition) throw Error('Missing ComfyUI node: ' + node.class_type);
    const widgets = [], inputs = [];
    for (const [name, schema] of Object.entries({ ...definition.input.required, ...definition.input.optional })) {
      const value = node.inputs[name];
      if (value === undefined) continue;
      if (Array.isArray(value) && typeof value[0] === 'string' && graph[value[0]]) {
        const type = Array.isArray(schema[0]) ? 'COMBO' : schema[0];
        const link = links.length + 1;
        links.push([link, Number(value[0]), value[1], Number(key), inputs.length, type]);
        inputs.push({ name, type, link });
      } else {
        widgets.push(value);
        if (schema[1]?.control_after_generate) widgets.push('fixed');
      }
    }
    return { id: Number(key), type: node.class_type, pos: [70 + order % 4 * 360, 70 + Math.floor(order / 4) * 350], size: [320, node.class_type === 'CLIPTextEncode' ? 290 : 220], flags: {}, order, mode: 0, inputs,
      outputs: (definition.output ?? []).map((type, slot) => ({ name: definition.output_name?.[slot] ?? type, type, links: [], slot_index: slot })),
      properties: { 'Node name for S&R': node.class_type }, widgets_values: widgets, title: node._meta?.title ?? node.class_type };
  });
  for (const [id, origin, slot] of links) nodes.find(n => n.id === origin).outputs[slot].links.push(id);
  return { last_node_id: Math.max(...nodes.map(n => n.id)), last_link_id: links.length, nodes, links, groups: [], config: {}, extra: { ds: { scale: .65, offset: [30, 30] } }, version: .4 };
}

async function prepare() {
  const info = await api('/object_info');
  const template = json(join(root, 'art/ui-v2/workflow-api.json'));
  for (const [index, asset] of catalog.assets.entries()) {
    const file = join(source, 'workflows', asset.id + '.api.json');
    let graph;
    if (existsSync(file)) graph = json(file);
    else {
      graph = structuredClone(template);
      graph['1'].inputs.unet_name = catalog.models.unet;
      graph['2'].inputs.clip_name = catalog.models.clip;
      graph['10'].inputs.vae_name = catalog.models.vae;
      graph['3'].inputs.text = `${catalog.style}\n${asset.prompt}`;
      graph['3']._meta = { title: asset.name + ' · 独立提示词' };
      graph['5'].inputs.noise_seed = 915000 + index;
      Object.assign(graph['7'].inputs, { steps: catalog.steps, width: asset.width, height: asset.height });
      Object.assign(graph['8'].inputs, { width: asset.width, height: asset.height });
      graph['12'].inputs.filename_prefix = `project-strike/ui-kit/${asset.id}`;
      save(file, graph);
    }
    save(join(source, 'workflows', asset.id + '.workflow.json'), toWorkflow(graph, info));
  }
  console.log(`Prepared ${catalog.assets.length} independent API + ComfyUI workflows; existing API edits preserved.`);
}

async function generate(id, options = {}) {
  const asset = assetFor(id), file = join(source, 'workflows', id + '.api.json');
  if (!existsSync(file)) throw Error('Run npm run art:ui:prepare first');
  const candidate = validCandidate(options.candidate ?? new Date().toISOString().replace(/[^0-9]/g, '') + '-' + randomInt(10000));
  const directory = join(history, id, candidate), recordPath = join(directory, 'record.json');
  let record, graph;
  if (existsSync(recordPath)) {
    record = json(recordPath); graph = json(join(directory, 'workflow.api.json'));
    if (record.status === 'complete') { checkCandidate(id, candidate); return record; }
    if (!record.promptId) throw Error('Prior submission uncertain; inspect record and ComfyUI history before retrying.');
    if (record.status === 'failed') throw Error('Candidate failed; use a new candidate after correcting workflow.');
  } else {
    graph = json(file);
    const seed = options.seed === undefined ? randomInt(2 ** 48 - 1) : Number(options.seed);
    if (!Number.isSafeInteger(seed) || seed < 0) throw Error('Invalid seed');
    graph['5'].inputs.noise_seed = seed;
    if (options.prompt !== undefined) {
      if (typeof options.prompt !== 'string' || options.prompt.length > 16000) throw Error('Invalid prompt');
      graph['3'].inputs.text = options.prompt;
    }
    graph['12'].inputs.filename_prefix = `project-strike/ui-kit/${id}/${candidate}`;
    const info = await api('/object_info');
    save(join(directory, 'workflow.api.json'), graph);
    save(join(directory, 'workflow.json'), toWorkflow(graph, info));
    record = { id, candidate, status: 'submitting', seed, width: asset.width, height: asset.height, graphSha256: sha(JSON.stringify(graph)), startedAt: new Date().toISOString() };
    save(recordPath, record);
    const submitted = await api('/prompt', { prompt: graph, client_id: 'project-strike-ui-kit', extra_data: { extra_pnginfo: { workflow: toWorkflow(graph, info) } } });
    if (!submitted.prompt_id) throw Error('ComfyUI did not return prompt_id');
    record.promptId = submitted.prompt_id; record.status = 'queued'; save(recordPath, record);
  }
  console.log(`${id}: ${candidate} queued (${record.seed})`);
  const deadline = Date.now() + 30 * 60 * 1000;
  while (Date.now() < deadline) {
    const result = (await api('/history/' + record.promptId))[record.promptId];
    if (result?.status?.status_str === 'error') {
      record.status = 'failed'; record.error = result.status.messages; save(recordPath, record); throw Error(`${id} failed; inspect candidate record`);
    }
    const images = result?.outputs?.['12']?.images;
    if (images?.length) {
      if (images.length !== 1) throw Error('Keep one output per candidate (batch_size=1).');
      const response = await fetch('http://127.0.0.1:8188/view?' + new URLSearchParams(images[0]), { signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw Error('Cannot download generated image');
      const original = Buffer.from(await response.arrayBuffer()), bytes = cleanPNG(original);
      if (bytes.readUInt32BE(16) !== asset.width || bytes.readUInt32BE(20) !== asset.height) throw Error('Image dimensions differ from asset contract');
      writeFileSync(join(directory, 'original.png'), original); writeFileSync(join(directory, 'image.png'), bytes);
      save(join(directory, 'history.json'), result);
      Object.assign(record, { status: 'complete', sha256: sha(bytes), originalSha256: sha(original), completedAt: new Date().toISOString() });
      save(recordPath, record); console.log(`${id}: saved ${candidate}`); return record;
    }
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  throw Error('Timed out waiting; resume with the same --candidate, without resubmitting.');
}

function checkCandidate(id, candidate) {
  assetFor(id); validCandidate(candidate);
  const directory = join(history, id, candidate), record = json(join(directory, 'record.json'));
  if (record.status !== 'complete' || record.id !== id || record.candidate !== candidate) throw Error('Candidate incomplete');
  const bytes = readFileSync(join(directory, 'image.png'));
  if (sha(bytes) !== record.sha256) throw Error('Candidate hash mismatch');
  return { directory, record, bytes };
}

function select(id, candidate) {
  const { directory, record, bytes } = checkCandidate(id, candidate);
  const selectionPath = join(source, 'selected.json');
  const selection = existsSync(selectionPath) ? json(selectionPath) : {};
  mkdirSync(output, { recursive: true });
  writeFileSync(join(output, id + '.png'), bytes);
  save(join(source, 'selected', id + '.api.json'), json(join(directory, 'workflow.api.json')));
  save(join(source, 'selected', id + '.workflow.json'), json(join(directory, 'workflow.json')));
  selection[id] = { candidate, seed: record.seed, sha256: record.sha256, graphSha256: record.graphSha256, selectedAt: new Date().toISOString() };
  save(selectionPath, selection);
  save(join(output, 'manifest.json'), { version: 1, revision: 'v1', generator: 'Local ComfyUI / FLUX.2 Klein 4B', assets: catalog.assets.filter(a => selection[a.id]).map(a => ({ id: a.id, file: a.id + '.png', width: a.width, height: a.height, sha256: selection[a.id].sha256 })) });
  console.log(`${id}: selected ${candidate}`);
}

function list() {
  const selection = existsSync(join(source, 'selected.json')) ? json(join(source, 'selected.json')) : {};
  return catalog.assets.map(asset => ({ ...asset, prompt: existsSync(join(source, 'workflows', asset.id + '.api.json')) ? json(join(source, 'workflows', asset.id + '.api.json'))['3'].inputs.text : catalog.style + '\n' + asset.prompt,
    selected: selection[asset.id]?.candidate, candidates: existsSync(join(history, asset.id)) ? readdirSync(join(history, asset.id)).filter(candidate => existsSync(join(history, asset.id, candidate, 'record.json'))).map(candidate => json(join(history, asset.id, candidate, 'record.json'))).sort((a, b) => b.startedAt.localeCompare(a.startedAt)) : [] }));
}

function studio() {
  let busy = false, lastError = '';
  const server = createServer(async (req, res) => {
    const send = (status, body, type = 'application/json') => { res.writeHead(status, { 'Content-Type': type + '; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(type === 'application/json' ? JSON.stringify(body) : body); };
    try {
      if (!['127.0.0.1:8190', 'localhost:8190'].includes(req.headers.host)) return send(403, { error: 'Local host required' });
      const url = new URL(req.url, 'http://127.0.0.1:8190');
      if (req.method === 'GET' && url.pathname === '/') return send(200, readFileSync(join(root, 'tools/ui-art-studio.html')), 'text/html');
      if (req.method === 'GET' && url.pathname === '/catalog') return send(200, { assets: list(), busy, error: lastError });
      if (req.method === 'GET' && url.pathname === '/image') {
        const { bytes } = checkCandidate(url.searchParams.get('id'), url.searchParams.get('candidate')); return send(200, bytes, 'image/png');
      }
      if (req.method === 'GET' && url.pathname === '/workflow') {
        const id = url.searchParams.get('id'); assetFor(id);
        const candidate = url.searchParams.get('candidate');
        const file = candidate ? join(checkCandidate(id, candidate).directory, 'workflow.json') : join(source, 'workflows', id + '.workflow.json');
        res.setHeader('Content-Disposition', `attachment; filename="${id}.workflow.json"`); return send(200, json(file));
      }
      if (req.method !== 'POST' || !['/generate', '/select'].includes(url.pathname)) return send(404, { error: 'Not found' });
      if (!['http://127.0.0.1:8190', 'http://localhost:8190'].includes(req.headers.origin) || !req.headers['content-type']?.startsWith('application/json')) return send(403, { error: 'Local studio origin required' });
      let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 20000) return send(413, { error: 'Body too large' }); }
      const data = JSON.parse(body); assetFor(data.id);
      if (busy) return send(409, { error: '正在生成，请等待本轮完成。' });
      if (url.pathname === '/select') { select(data.id, data.candidate); return send(200, { ok: true }); }
      const count = Number(data.count ?? 1);
      if (!Number.isInteger(count) || count < 1 || count > 4) throw Error('每轮可生成 1–4 张');
      busy = true; lastError = '';
      send(202, { ok: true });
      (async () => { try { for (let i = 0; i < count; i++) await generate(data.id, { prompt: data.prompt, ...(data.seed === '' || data.seed === undefined ? {} : { seed: Number(data.seed) + i }) }); } catch (error) { lastError = error.message; console.error(error); } finally { busy = false; } })();
    } catch (error) { send(400, { error: error.message }); }
  });
  server.listen(8190, '127.0.0.1', () => console.log('素材工作台 http://127.0.0.1:8190 · 游戏预览请另运行 npm run dev'));
}

async function main() {
  const command = process.argv[2] ?? 'status';
  const option = key => { const i = process.argv.indexOf(key); if (i >= 0) { if (!process.argv[i + 1] || process.argv[i + 1].startsWith('--')) throw Error('Missing value: ' + key); return process.argv[i + 1]; } };
  if (command === 'prepare') return prepare();
  if (command === 'studio') return studio();
  if (command === 'status') return console.log(JSON.stringify(list(), null, 2));
  if (command === 'verify') {
    const result = verifyUIArt(output, catalog.assets.map(a => a.id));
    const selection = json(join(source, 'selected.json'));
    for (const asset of catalog.assets) {
      const graph = json(join(source, 'selected', asset.id + '.api.json'));
      if (sha(JSON.stringify(graph)) !== selection[asset.id]?.graphSha256) throw Error('Selected workflow mismatch: ' + asset.id);
      if (sha(readFileSync(join(output, asset.id + '.png'))) !== selection[asset.id].sha256) throw Error('Selection mismatch: ' + asset.id);
    }
    return console.log(JSON.stringify({ ...result, pipelines: catalog.assets.length }));
  }
  if (command === 'select') return select(option('--id'), option('--candidate'));
  if (command === 'generate') {
    const assets = process.argv.includes('--all') ? catalog.assets : [assetFor(option('--id'))];
    for (const asset of assets) {
      const record = await generate(asset.id, { candidate: option('--candidate'), seed: option('--seed') });
      if (process.argv.includes('--select')) select(asset.id, record.candidate);
    }
    return;
  }
  throw Error('Use prepare | studio | generate --id ID [--candidate NAME] [--seed N] [--select] | select --id ID --candidate NAME | verify | status');
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(error => { console.error(error); process.exitCode = 1; });
