import { afterEach, expect, it } from 'vitest';
import { randomBytes, scryptSync } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { OnlineAccounts } from '../../server/OnlineAccounts';
import { startServer } from '../../server/server';
import { ITEMS, WEAPONS, STARTER_WEAPONS } from '../../src/game/campaign/Catalog';
import { starterEquipment } from '../../src/shared/content/OnlineProgress';
import { WebSocket } from 'ws';

const salt = randomBytes(16).toString('hex');
const config = { username: 'admin', salt, verifier: scryptSync('admin-fixture-password', salt, 64).toString('hex') };
const servers: ReturnType<typeof startServer>[] = [], folders: string[] = [];
afterEach(async () => { for (const server of servers.splice(0)) await server.close(); for (const dir of folders.splice(0)) rmSync(dir, { recursive: true, force: true }); });
const change = (store: OnlineAccounts, id: string, overrides = {}) => ({ revision: store.adminDetail(id).revision, credits: 9999,
  levels: { medic: 50, assassin: 50, commando: 50, tank: 50 }, weapons: Object.keys(WEAPONS), items: Object.keys(ITEMS), reason: '测试发放', ...overrides });
async function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'strike-admin-')); folders.push(dir);
  const file = join(dir, 'accounts.json'), store = new OnlineAccounts(file);
  const account = await store.login('register', 'AdminTestPlayer', 'player-password', 'test');
  const server = startServer(0, '127.0.0.1', 50, undefined, 60000, true, store, false, config); servers.push(server);
  await new Promise<void>(resolve => server.wss.once('listening', resolve));
  const origin = `http://127.0.0.1:${(server.wss.address() as { port: number }).port}`;
  const login = await fetch(origin + '/admin/api/login', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'admin-fixture-password' }) });
  const { csrf } = await login.json();
  const headers = { Origin: origin, 'Content-Type': 'application/json', Cookie: login.headers.get('set-cookie')!.split(';')[0], 'X-CSRF-Token': csrf };
  return { server, store, account, file, origin, headers };
}

it('persists audited grants and revocations without changing other users, and repairs invalid loadouts', async () => {
  const { store, account, file } = await fixture(), id = account.profile.id;
  const other = await store.login('register', 'OtherPlayer', 'player-password', 'other');
  const initial = store.adminDetail(id);
  store.adminUpdate(id, change(store, id), 'admin');
  store.equip(id, { ...starterEquipment('assassin'), primary: 'awp', secondary: 'katana', skill: 'cloak', item: 'frag' });
  const full = store.profile(id);
  expect(full.credits).toBe(9999); expect(full.classes.assassin.xp).toBe(7840);
  expect(() => store.authenticate(account.token)).toThrow();
  store.adminUpdate(id, change(store, id, { credits: 7, levels: { medic: 1, assassin: 1, commando: 1, tank: 1 }, weapons: STARTER_WEAPONS, items: ['medkit'], reason: '撤销测试权益' }), 'admin');
  const reopened = new OnlineAccounts(file), detail = reopened.adminDetail(id);
  expect(detail.profile.classes.assassin.equipment).toEqual(starterEquipment('assassin'));
  expect(detail.profile.credits).toBe(7); expect(reopened.profile(other.profile.id)).toEqual(other.profile);
  expect(detail.ledger[0]).toMatchObject({ reason: 'admin', actor: 'admin', detail: '撤销测试权益', before: full, after: detail.profile });
  expect(detail.ledger[1].before).toEqual(initial.profile);
  expect(JSON.stringify(detail)).not.toMatch(/verifier|salt|sessions|player-password/);
});

it('rejects stale edits, invalid values and starter revocation without partial writes', async () => {
  const { store, account } = await fixture(), id = account.profile.id;
  const stale = change(store, id);
  store.settle('simultaneous-reward', [{ accountId: id, classId: 'medic', won: true, kills: 1 }]);
  const before = store.adminDetail(id);
  expect(() => store.adminUpdate(id, stale, 'admin')).toThrow('资产已发生变化');
  for (const invalid of [{ credits: -1 }, { credits: 1.5 }, { credits: 10000001 }, { levels: { medic: 51, assassin: 1, tank: 1, commando: 1 } }, { weapons: [] }, { items: [] }, { weapons: ['__proto__'] }, { reason: ' ' }, { password: 'surprise' }]) {
    expect(() => store.adminUpdate(id, change(store, id, invalid), 'admin')).toThrow();
    expect(store.adminDetail(id)).toEqual(before);
  }
  store.adminUpdate(id, change(store, id, { levels: { medic: 1, assassin: 1, commando: 1, tank: 1 } }), 'admin');
  expect(store.profile(id).classes.medic.xp).toBe(before.profile.classes.medic.xp);
});

it('requires independent admin credentials, cookie and CSRF; rejects cross-origin writes and expires logout', async () => {
  const { origin, headers, account, store } = await fixture(), path = '/admin/api/users/' + account.profile.id;
  expect((await fetch(origin + '/admin/api/users')).status).toBe(401);
  expect((await fetch(origin + '/admin/api/catalog')).status).toBe(401);
  const leaked = await (await fetch(origin + '/admin/api/users', { headers })).text();
  expect(leaked).toContain('AdminTestPlayer'); expect(leaked).not.toMatch(/verifier|salt|sessions/);
  const login = { username: 'AdminTestPlayer', password: 'player-password' };
  expect((await fetch(origin + '/admin/api/login', { method: 'POST', headers, body: JSON.stringify(login) })).status).toBe(401);
  const body = JSON.stringify(change(store, account.profile.id));
  expect((await fetch(origin + path, { method: 'PATCH', headers: { ...headers, Origin: 'https://evil.example' }, body })).status).toBe(403);
  expect((await fetch(origin + path, { method: 'PATCH', headers: { ...headers, 'X-CSRF-Token': '' }, body })).status).toBe(403);
  expect((await fetch(origin + path, { method: 'PATCH', headers, body })).status).toBe(200);
  expect((await fetch(origin + path, { method: 'PATCH', headers, body })).status).toBe(409);
  expect(store.profile(account.profile.id).credits).toBe(9999);
  expect((await fetch(origin + '/admin/api/logout', { method: 'POST', headers, body: '{}' })).status).toBe(200);
  expect((await fetch(origin + '/admin/api/users', { headers })).status).toBe(401);
});

it('rate limits admin login attempts', async () => {
  const { origin, headers } = await fixture();
  let status = 0;
  for (let i = 0; i < 9; i++) status = (await fetch(origin + '/admin/api/login', { method: 'POST', headers, body: JSON.stringify({ username: 'admin', password: 'incorrect-password' }) })).status;
  expect(status).toBe(429);
});

it('revokes a connected game session and removes its room seat when rights change', async () => {
  const { server, origin, headers, account, store } = await fixture();
  const socket = new WebSocket(origin.replace('http:', 'ws:'));
  const messages: any[] = []; socket.on('message', raw => messages.push(JSON.parse(String(raw))));
  const until = async (predicate: () => boolean) => { for (let i = 0; i < 200; i++) { if (predicate()) return; await new Promise(r => setTimeout(r, 10)); } throw Error('Socket wait timed out'); };
  try {
    await until(() => messages.some(m => m.type === 'welcome'));
    const welcome = messages.find(m => m.type === 'welcome');
    const send = (value: object) => socket.send(JSON.stringify({ protocol: 1, content: welcome.content, ...value }));
    send({ type: 'auth', mode: 'restore', token: account.token }); await until(() => messages.some(m => m.type === 'authenticated'));
    send({ type: 'create', name: account.profile.name }); await until(() => messages.some(m => m.type === 'credential'));
    const room = [...server.rooms.values()].find(r => !r.debug)!;
    const close = new Promise<number>(resolve => socket.once('close', code => resolve(code)));
    expect((await fetch(origin + '/admin/api/users/' + account.profile.id, { method: 'PATCH', headers, body: JSON.stringify(change(store, account.profile.id)) })).status).toBe(200);
    expect(await close).toBe(4001); expect(room.players.size).toBe(0);
    expect(() => store.authenticate(account.token)).toThrow();
  } finally { socket.terminate(); }
});
