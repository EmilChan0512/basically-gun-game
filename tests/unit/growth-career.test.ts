import { expect, it } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { OnlineAccounts } from '../../server/OnlineAccounts';
import { defaultGrowthLoadout } from '../../src/shared/content/GrowthCatalog';
import { growthSlots, ownedGrowthLoadout, freshGrowthCareer } from '../../src/shared/content/GrowthCareer';

it('backs up a legacy account before additive growth migration and preserves credentials, sessions and assets', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'strike-growth-')), file = join(folder, 'accounts.json');
  try {
    const store = new OnlineAccounts(file), account = await store.login('register', 'Growth migration', 'test-password-123', 'fixture');
    const old = JSON.parse(readFileSync(file, 'utf8')); delete old.accounts[0].profile.growth;
    writeFileSync(file, JSON.stringify(old)); const original = readFileSync(file, 'utf8');
    const reopened = new OnlineAccounts(file), migrated = reopened.authenticate(account.token);
    const { growth, ...legacy } = migrated;
    expect(legacy).toEqual(old.accounts[0].profile); expect(growth).toEqual(freshGrowthCareer());
    const backups = readdirSync(folder).filter(name => name.includes('growth-v1'));
    expect(backups).toHaveLength(1); expect(readFileSync(join(folder, backups[0]), 'utf8')).toBe(original);
    expect(new OnlineAccounts(file).authenticate(account.token)).toEqual(migrated);
    expect(readdirSync(folder).filter(name => name.includes('growth-v1'))).toHaveLength(1);
  } finally { if (!folder.startsWith(join(tmpdir(), 'strike-growth-'))) throw Error('Unexpected cleanup path'); rmSync(folder, { recursive: true }); }
});

it('settles growth atomically once, unlocks alternatives and slots, and persists selected builds separately from legacy progress', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'strike-growth-')), file = join(folder, 'accounts.json');
  try {
    const store = new OnlineAccounts(file), account = await store.login('register', 'Growth build', 'test-password-123', 'fixture');
    const id = account.profile.id, reward = { accountId: id, classId: 'assault' as const, matchXp: 1500, kills: 20, won: true };
    const locked = defaultGrowthLoadout(); locked.pool![0] = 'combatRecovery';
    expect(() => store.saveGrowth(id, 0, locked)).toThrow('解锁'); expect(() => store.saveGrowth(id, 1, defaultGrowthLoadout())).toThrow('解锁');
    store.settleGrowth('round1', [reward, reward]); const once = store.profile(id);
    expect(once.growth!.matches).toBe(1); store.settleGrowth('round1', [reward]); expect(store.profile(id)).toEqual(once);
    expect(once.credits).toBe(account.profile.credits); expect(once.classes).toEqual(account.profile.classes);
    store.settleGrowth('round2', [reward]); store.settleGrowth('round3', [reward]);
    expect(growthSlots(store.profile(id).growth!.xp)).toBe(3);
    locked.pool![1] = 'rollingReserve'; locked.perks![0] = 'resourceful';
    store.saveGrowth(id, 2, locked);
    const reopened = new OnlineAccounts(file); reopened.settleGrowth('round1', [reward]);
    expect(reopened.profile(id)).toEqual(store.profile(id));
    expect(reopened.profile(id).growth!.selectedSlot).toBe(2);
    expect(reopened.profile(id).growth!.loadouts[2]).toEqual(locked);
    const before = reopened.profile(id);
    expect(() => reopened.saveGrowth(id, 2, { ...locked, perks: ['fieldDressing', 'fieldDressing', 'steadyLanding'] })).toThrow();
    expect(reopened.profile(id)).toEqual(before);
  } finally { if (!folder.startsWith(join(tmpdir(), 'strike-growth-'))) throw Error('Unexpected cleanup path'); rmSync(folder, { recursive: true }); }
});

it('rejects foreign-class pools, duplicate cards, incomplete builds and locked perks', () => {
  const career = freshGrowthCareer(), loadout = defaultGrowthLoadout();
  expect(() => ownedGrowthLoadout(career, { ...loadout, pool: [...loadout.pool!.slice(1), 'brace'] })).toThrow();
  expect(() => ownedGrowthLoadout(career, { ...loadout, pool: Array(8).fill('momentum') })).toThrow();
  expect(() => ownedGrowthLoadout(career, { ...loadout, perks: ['supplyRunner', 'resourceful', 'cautiousReload'] })).toThrow();
  expect(() => ownedGrowthLoadout(career, { ...loadout, pool: [] })).toThrow();
});

it('backs up released three-class careers before adding Medic without resetting progress or selected builds', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'strike-growth-')), file = join(folder, 'accounts.json');
  try {
    const store = new OnlineAccounts(file), account = await store.login('register', 'Growth expansion', 'test-password-123', 'fixture');
    store.settleGrowth('existing-round', [{ accountId: account.profile.id, classId: 'tank', matchXp: 900, kills: 4, won: true }]);
    store.saveGrowth(account.profile.id, 0, defaultGrowthLoadout('tank'));
    const legacy = JSON.parse(readFileSync(file, 'utf8')), previous = legacy.accounts[0].profile.growth;
    previous.version = 1; delete previous.mastery.medic; delete previous.metrics.healingDone; delete previous.metrics.healingXp;
    writeFileSync(file, JSON.stringify(legacy)); const bytes = readFileSync(file, 'utf8');
    const reopened = new OnlineAccounts(file), profile = reopened.authenticate(account.token), current = profile.growth!;
    expect(current).toEqual({ ...previous, version: 2, mastery: { ...previous.mastery, medic: 0 }, metrics: { ...previous.metrics, healingDone: 0, healingXp: 0 } });
    expect(profile.classes).toEqual(legacy.accounts[0].profile.classes); expect(profile.credits).toBe(legacy.accounts[0].profile.credits);
    const backups = readdirSync(folder).filter(name => name.includes('growth-v2'));
    expect(backups).toHaveLength(1); expect(readFileSync(join(folder, backups[0]), 'utf8')).toBe(bytes);
    expect(new OnlineAccounts(file).authenticate(account.token)).toEqual(profile);
    reopened.saveGrowth(profile.id, 0, defaultGrowthLoadout('medic'));
    expect(new OnlineAccounts(file).authenticate(account.token).growth!.loadouts[0].primary).toBe('famas');
  } finally { if (!folder.startsWith(join(tmpdir(), 'strike-growth-'))) throw Error('Unexpected cleanup path'); rmSync(folder, { recursive: true }); }
});
