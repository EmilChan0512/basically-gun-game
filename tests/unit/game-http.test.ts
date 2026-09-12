import { expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { randomBytes, scryptSync } from 'node:crypto';
import { WebSocket } from 'ws';
import { startServer } from '../../server/server';

it('serves web assets, admin and WebSocket on one port without exposing private files', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'strike-web-'));
  const web = join(dir, 'dist'); mkdirSync(web);
  writeFileSync(join(web, 'index.html'), '<html>Game</html>');
  writeFileSync(join(web, 'game.js'), 'console.log(1)');
  writeFileSync(join(dir, 'accounts.json'), 'private');
  writeFileSync(join(web, '.env'), 'private');
  const salt = randomBytes(16).toString('hex');
  const server = startServer(0, '127.0.0.1', undefined, undefined, undefined, undefined, undefined, false,
    { username: 'admin', salt, verifier: scryptSync('fixture-password', salt, 64).toString('hex') }, web);
  try {
    await once(server.wss, 'listening');
    const address = server.wss.address() as { port: number };
    const url = `http://127.0.0.1:${address.port}`;
    expect(await (await fetch(url + '/?offline')).text()).toBe('<html>Game</html>');
    expect((await fetch(url + '/game.js')).headers.get('content-type')).toContain('text/javascript');
    const head = await fetch(url, { method: 'HEAD' }); expect(head.status).toBe(200); expect(await head.text()).toBe('');
    expect((await fetch(url, { method: 'POST' })).status).toBe(405);
    for (const path of ['/accounts.json', '/server.cjs', '/.env', '/%2e%2e%5caccounts.json', '/missing.js']) {
      const response = await fetch(url + path); expect(response.status).toBeGreaterThanOrEqual(400); expect(await response.text()).not.toContain('private');
    }
    expect((await fetch(url + '/admin/')).status).toBe(200);
    expect((await fetch(url + '/admin/api/users')).status).toBe(401);
    const socket = new WebSocket(url.replace('http:', 'ws:'));
    const [data] = await once(socket, 'message'); expect(JSON.parse(data.toString()).type).toBe('welcome');
    socket.terminate();
  } finally { await server.close(); rmSync(dir, { recursive: true, force: true }); }
});
