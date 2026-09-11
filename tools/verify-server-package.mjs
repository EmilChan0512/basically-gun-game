import { mkdtempSync, copyFileSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { WebSocket } from 'ws';

const temporary = mkdtempSync(join(tmpdir(), 'strike-server-'));
const serverManifest = JSON.parse(readFileSync('artifacts/project-strike-server/manifest.json', 'utf8'));
const clientManifest = JSON.parse(readFileSync('artifacts/project-strike-local/manifest.json', 'utf8'));
if (!serverManifest.contentVersion || serverManifest.contentVersion !== clientManifest.contentVersion) throw Error('Package content versions differ');
if (createHash('sha256').update(readFileSync('artifacts/project-strike-server/server.cjs')).digest('hex') !== serverManifest.sha256) throw Error('Server bundle checksum mismatch');
copyFileSync('artifacts/project-strike-server/server.cjs', join(temporary, 'server.cjs'));
const child = spawn(process.execPath, ['server.cjs'], { cwd: temporary,
  env: { ...process.env, PORT: '0', HOST: '127.0.0.1', NODE_PATH: '', LOG_LEVEL: 'info' }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
let output = '', errors = '', socket, debugSocket;
child.stdout.on('data', data => output += data); child.stderr.on('data', data => errors += data);
const wait = async predicate => {
  const until = Date.now() + 8000;
  while (!predicate()) { if (child.exitCode !== null || Date.now() > until) throw Error(`Package timeout/exit: ${output} ${errors}`); await new Promise(r => setTimeout(r, 10)); }
};
try {
  await wait(() => /ws:\/\/127\.0\.0\.1:\d+/.test(output));
  const failure = spawnSync(process.execPath, ['server.cjs'], { cwd: temporary,
    env: { ...process.env, PORT: '-1', LOG_LEVEL: 'info' }, encoding: 'utf8', windowsHide: true, timeout: 8000 });
  if (failure.status !== 1 || !failure.stdout.trim().split('\n').some(line => JSON.parse(line).event === 'process.fatal')) {
    throw Error('Invalid startup did not produce fatal JSON log and exit 1');
  }
  socket = new WebSocket(output.match(/ws:\/\/127\.0\.0\.1:\d+/)[0]);
  const messages = []; socket.on('message', raw => messages.push(JSON.parse(raw.toString())));
  await wait(() => messages.some(m => m.type === 'welcome'));
  const welcome = messages.find(m => m.type === 'welcome');
  if (welcome.content !== serverManifest.contentVersion) throw Error('Runtime content differs from package manifests');
  copyFileSync('deploy/probe.mjs', join(temporary, 'probe.mjs'));
  copyFileSync('artifacts/project-strike-server/manifest.json', join(temporary, 'manifest.json'));
  const probe = () => spawnSync(process.execPath, ['probe.mjs', socket.url], {
    cwd: temporary, encoding: 'utf8', windowsHide: true, timeout: 8000 });
  const healthy = probe();
  if (healthy.status !== 0) throw Error(`Deployment probe failed: ${healthy.stderr}`);
  writeFileSync(join(temporary, 'manifest.json'), JSON.stringify({ ...serverManifest, contentVersion: 'invalid-test-version' }));
  const mismatch = probe();
  if (mismatch.status !== 1 || !mismatch.stderr.includes('Unexpected protocol or content version')) throw Error('Deployment probe did not reject content mismatch');
  const send = message => socket.send(JSON.stringify({ protocol: welcome.protocol, content: welcome.content, ...message }));
  send({ type: 'create', name: 'Package QA' }); await wait(() => messages.some(m => m.type === 'lobby'));
  const room = messages.find(m => m.type === 'lobby').room.id;
  send({ type: 'configure', mapId: 'hijack', mode: 'coop' });
  send({ type: 'equip', equipment: { classId: 'tank', primary: 'ak47', secondary: 'shield', skill: 'iron', item: 'frag' } });
  send({ type: 'ready', ready: true }); send({ type: 'start' });
  await wait(() => messages.some(m => m.type === 'state'));
  send({ type: 'input', roomId: room, round: 1, command: { sequence: 0,
    actions: ['swap'], input: { left: false, right: false, crouch: false, jump: false, fire: true, aim: { x: 900, y: 700 } } } });
  await wait(() => messages.some(m => m.type === 'state' && m.ack === 0 && m.state.actors.find(a => a.id === m.actorId)?.offhand?.deployed));
  // Exercise the bundled process's permanent debug room, not the source server.
  const debugMessages = [];
  debugSocket = new WebSocket(socket.url);
  debugSocket.on('message', raw => debugMessages.push(JSON.parse(raw.toString())));
  await wait(() => debugMessages.some(m => m.type === 'welcome'));
  const debugSend = message => debugSocket.send(JSON.stringify({ protocol: welcome.protocol, content: welcome.content, ...message }));
  debugSend({ type: 'joinDebug', name: 'Package Debug QA' });
  await wait(() => debugMessages.some(m => m.type === 'state'));
  debugSend({ type: 'equip', equipment: { classId: 'assassin', primary: 'dragunov', secondary: 'katana', skill: 'cloak', item: 'frag' } });
  await wait(() => debugMessages.some(m => m.type === 'state' && m.state.actors.find(a => a.id === m.actorId)?.offhand?.id === 'katana'));
  debugSend({ type: 'input', roomId: 'debug', round: debugMessages.find(m => m.type === 'state').round,
    command: { sequence: 0, actions: ['skill'], input: { left: false, right: false, crouch: false, jump: false, fire: false, aim: { x: 900, y: 700 } } } });
  await wait(() => debugMessages.some(m => m.type === 'state' && m.state.actors.find(a => a.id === m.actorId)?.skillFrames > 0));
  if (debugMessages.some(m => m.type === 'error' || m.type === 'rejected')) throw Error('Bundled debug loadout or skill rejected');
  const rejected = messages.filter(m => m.type === 'error' || m.type === 'rejected');
  if (rejected.length || errors) throw Error(JSON.stringify({ rejected, errors }));
  const runtimeLogs = output.trim().split('\n').map(line => JSON.parse(line));
  for (const event of ['server.started', 'client.connected', 'room.created', 'match.started']) {
    if (!runtimeLogs.some(record => record.event === event && record.contentVersion === serverManifest.contentVersion)) throw Error(`Missing runtime log: ${event}`);
  }
  if (output.includes('Package QA') || messages.some(m => m.type === 'credential' && output.includes(m.token))) throw Error('Sensitive data in runtime log');
  const report = { date: new Date().toISOString(), contentVersion: welcome.content, isolatedDirectory: temporary,
    bundle: resolve('artifacts/project-strike-server/server.cjs'), passed: true,
    checks: ['client/server/runtime content identity', 'server bundle SHA256', 'isolated bundle startup', 'deployment welcome probe', 'deployment content mismatch rejection', 'structured runtime logs', 'fatal startup log and nonzero exit', 'log privacy', 'create room', 'coop setup', 'AK47/shield loadout', 'start', 'input acknowledgement', 'deployed shield snapshot', 'permanent debug room', 'live class/katana/skill/item change', 'debug skill activation'] };
  mkdirSync('artifacts/qa', { recursive: true });
  writeFileSync('artifacts/qa/server-package.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally {
  socket?.terminate(); debugSocket?.terminate(); child.kill();
  if (child.exitCode === null) await new Promise(r => child.once('exit', r));
}
