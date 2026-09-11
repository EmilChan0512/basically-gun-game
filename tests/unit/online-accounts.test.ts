import { STARTER_WEAPONS } from '../../src/game/campaign/Catalog';
import { it, expect, afterEach, vi } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { OnlineAccounts } from '../../server/OnlineAccounts';
import { starterEquipment } from '../../src/shared/content/OnlineProgress';

const folders: string[] = [];
const file = () => { const dir = mkdtempSync(join(tmpdir(), 'strike-accounts-')); folders.push(dir); return join(dir, 'accounts.json'); };
afterEach(() => { vi.useRealTimers(); for (const dir of folders.splice(0)) rmSync(dir, { recursive: true, force: true }); });

it('keeps independent accounts, purchases and per-class loadouts after a fresh store is opened', async () => {
  const path = file(), store = new OnlineAccounts(path);
  const a = await store.login('register', 'Alice', 'alice-password', 'a');
  const b = await store.login('register', 'Bob', 'bob-password', 'b');
  store.settle('fixture-level3', [{ accountId: a.profile.id, classId: 'assassin', won: true, kills: 19 }]);
  store.equip(a.profile.id, starterEquipment('assassin'));
  store.buy(a.profile.id, 'weapon', 'uzi');
  store.equip(a.profile.id, { ...starterEquipment('assassin'), primary: 'scout', secondary: 'uzi' });
  const reopened = new OnlineAccounts(path);
  const alice = await reopened.login('login', 'ＡＬＩＣＥ', 'alice-password', 'a');
  expect(alice.profile).toMatchObject({ credits: 683, selected: 'assassin', weapons: [...STARTER_WEAPONS, 'uzi'] });
  expect(alice.profile.classes.assassin.equipment).toMatchObject({ primary: 'scout', secondary: 'uzi' });
  expect(reopened.authenticate(a.token).id).toBe(a.profile.id);
  expect(reopened.profile(b.profile.id)).toEqual(b.profile);
  const raw = readFileSync(path, 'utf8');
  expect(raw).not.toContain('alice-password'); expect(raw).not.toContain(a.token);
  expect(JSON.stringify(alice.profile)).not.toMatch(/verifier|salt|sessions|settled/);
});

it('enforces ownership, price, class and level without accepting arbitrary progress fields', async () => {
  const store = new OnlineAccounts(), { profile } = await store.login('register', 'Pilot', 'password-123', 'a');
  for (const equipment of [
    { ...starterEquipment(), primary: 'vector' }, { ...starterEquipment(), skill: 'regenerate' },
    { ...starterEquipment(), secondary: 'knife' }, { ...starterEquipment('assassin'), secondary: 'katana' },
    { ...starterEquipment(), credits: 90000 }, { ...starterEquipment(), level: 10 },
  ]) expect(() => store.equip(profile.id, equipment)).toThrow();
  expect(() => store.buy(profile.id, 'weapon', 'ak47')).toThrow();
  expect(() => store.buy(profile.id, 'weapon', '__proto__')).toThrow();
  expect(() => store.buy(profile.id, 'weapon', 'vector')).toThrow('等级');
  expect(() => store.buy(profile.id, 'weapon', 'vector')).toThrow();
  store.buy(profile.id, 'item', 'ammo');
  expect(store.profile(profile.id).credits).toBe(230);
  expect(store.profile(profile.id).classes.medic.equipment).toEqual(starterEquipment());
});

it('settles a server result once across restart, only advances the played class and unlocks by level', async () => {
  const path = file(), store = new OnlineAccounts(path), { profile } = await store.login('register', 'Pilot', 'password-123', 'a');
  const rewards = [{ accountId: profile.id, classId: 'assassin' as const, won: true, kills: 3 }];
  store.settle('room-instance:1', rewards);
  const reopened = new OnlineAccounts(path);
  expect(reopened.settle('room-instance:1', rewards)).toEqual([]);
  expect(reopened.profile(profile.id)).toMatchObject({ credits: 566, matches: 1, wins: 1, classes: { assassin: { xp: 160 }, medic: { xp: 0 } } });
  reopened.equip(profile.id, { ...starterEquipment('assassin'), skill: 'cloak' });
  expect(() => reopened.buy(profile.id, 'weapon', 'ak47')).toThrow('职业');
  expect(() => reopened.equip(profile.id, { ...starterEquipment('medic'), primary: 'ak47' })).toThrow();
});

it('rejects wrong passwords, duplicate normalized registration and expired or revoked tokens', async () => {
  const store = new OnlineAccounts(), account = await store.login('register', 'Pilot', 'password-123', 'a');
  await expect(store.login('login', 'Pilot', 'incorrect-123', 'a')).rejects.toThrow('账号或密码');
  const concurrent = await Promise.allSettled([store.login('register', 'New Pilot', 'password-123', 'b'), store.login('register', 'ＮＥＷ ＰＩＬＯＴ', 'password-123', 'c')]);
  expect(concurrent.filter(r => r.status === 'fulfilled')).toHaveLength(1);
  store.revoke(account.token); expect(() => store.authenticate(account.token)).toThrow();
  const login = await store.login('login', 'Pilot', 'password-123', 'a');
  vi.useFakeTimers(); vi.setSystemTime(Date.now() + 8 * 86400000);
  expect(() => store.authenticate(login.token)).toThrow();
});

it('fails closed on corrupt data and rolls back memory if an atomic write fails', async () => {
  const path = file(), store = new OnlineAccounts(path), { profile } = await store.login('register', 'Pilot', 'password-123', 'a');
  renameSync(path, `${path}.backup`); mkdirSync(path);
  expect(() => store.buy(profile.id, 'item', 'ammo')).toThrow('保存失败');
  expect(store.profile(profile.id)).toEqual(profile);
  rmSync(path, { recursive: true }); writeFileSync(path, '{broken');
  expect(() => new OnlineAccounts(path)).toThrow();
});
