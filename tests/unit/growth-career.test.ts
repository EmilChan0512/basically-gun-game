import { expect, it } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { OnlineAccounts } from '../../server/OnlineAccounts';
import { defaultGrowthLoadout as legacyLoadout, GROWTH_CLASSES, type GrowthClassId } from '../../src/shared/content/GrowthCatalog';
import { defaultGrowthLoadoutV3 as defaultGrowthLoadout } from '../../src/shared/content/growth-v3/Loadout';
import { growthSlots, freshGrowthCareer as legacyCareer } from '../../src/shared/content/GrowthCareer';
import { ownedGrowthLoadoutV3 as ownedGrowthLoadout, freshGrowthCareerV3 as freshGrowthCareer } from '../../src/shared/content/growth-v3/Career';

const legacyMatrix = (Object.keys(GROWTH_CLASSES) as GrowthClassId[]).flatMap(classId =>
  GROWTH_CLASSES[classId].weapons.flatMap(primary => (['none', 'heavy', 'short', 'quickmag'] as const)
    .map(attachment => ({ classId, primary, attachment }))));

it.each(legacyMatrix)('persists v2 $classId/$primary/$attachment migration, original archive and a single byte-exact backup', async ({ classId, primary, attachment }) => {
  const folder = mkdtempSync(join(tmpdir(), 'strike-growth-')), file = join(folder, 'accounts.json');
  try {
    const store = new OnlineAccounts(file), account = await store.login('register', 'Migration matrix', 'test-password-123', 'fixture');
    const disk = JSON.parse(readFileSync(file, 'utf8'));
    const previous = legacyCareer();
    previous.xp = 2400; previous.matches = 12; previous.wins = 7;
    previous.mastery = { assault: 1100, tank: 1200, sniper: 1300, medic: 1400 };
    previous.weaponXp = { [primary]: 2000 };
    previous.metrics.shots = 123; previous.metrics.healingDone = 456;
    previous.traits = ['runner']; previous.achievements = ['notToday'];
    previous.loadouts = [legacyLoadout('assault'), { ...legacyLoadout(classId), primary, attachment, title: 'notToday', evolutions: true }];
    previous.selectedSlot = 1;
    disk.accounts[0].profile.growth = previous;
    writeFileSync(file, JSON.stringify(disk)); const original = readFileSync(file, 'utf8');
    const migrated = new OnlineAccounts(file).authenticate(account.token);
    const { growth, ...classic } = migrated;
    const { growth: _oldGrowth, ...oldClassic } = disk.accounts[0].profile;
    expect(classic).toEqual(oldClassic);
    const { version: _version, loadouts: _loadouts, legacyLoadoutArchive: archive, ...progress } = growth!;
    const { version: _oldVersion, loadouts: _oldLoadouts, ...oldProgress } = previous;
    expect(progress).toEqual(oldProgress);
    expect(growth!.version).toBe(3);
    expect(archive.map(entry => entry.original)).toEqual(previous.loadouts);
    expect(archive.map(entry => entry.slot)).toEqual([0, 1]);
    const build = growth!.loadouts[1];
    expect(build).toMatchObject({ classId, primary, secondary: 'usp', title: 'notToday' });
    const expected = attachment === 'none' || attachment === 'quickmag' && primary === 'shotgun'
      ? [] : [attachment === 'heavy' ? 'B01' : attachment === 'short' ? 'B02' : 'A01'];
    expect(build.attachments).toEqual({ primary: expected, secondary: [] });
    expect(archive[1].notices.some(message => message.includes('供弹方式不兼容')))
      .toBe(attachment === 'quickmag' && primary === 'shotgun');
    expect(new OnlineAccounts(file).authenticate(account.token)).toEqual(migrated);
    const backups = readdirSync(folder).filter(name => name.includes('growth-v3'));
    expect(backups).toHaveLength(1);
    expect(readFileSync(join(folder, backups[0]), 'utf8')).toBe(original);
  } finally { if (!folder.startsWith(join(tmpdir(), 'strike-growth-'))) throw Error('Unexpected cleanup path'); rmSync(folder, { recursive: true }); }
});

it('backs up a legacy account before additive growth migration and preserves credentials, sessions and assets', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'strike-growth-')), file = join(folder, 'accounts.json');
  try {
    const store = new OnlineAccounts(file), account = await store.login('register', 'Growth migration', 'test-password-123', 'fixture');
    const old = JSON.parse(readFileSync(file, 'utf8')); delete old.accounts[0].profile.growth;
    writeFileSync(file, JSON.stringify(old)); const original = readFileSync(file, 'utf8');
    const reopened = new OnlineAccounts(file), migrated = reopened.authenticate(account.token);
    const { growth, ...legacy } = migrated;
    expect(legacy).toEqual(old.accounts[0].profile); expect(growth).toEqual(freshGrowthCareer());
    const backups = readdirSync(folder).filter(name => name.includes('growth-v3'));
    expect(backups).toHaveLength(1); expect(readFileSync(join(folder, backups[0]), 'utf8')).toBe(original);
    expect(new OnlineAccounts(file).authenticate(account.token)).toEqual(migrated);
    expect(readdirSync(folder).filter(name => name.includes('growth-v3'))).toHaveLength(1);
  } finally { if (!folder.startsWith(join(tmpdir(), 'strike-growth-'))) throw Error('Unexpected cleanup path'); rmSync(folder, { recursive: true }); }
});

it('settles growth atomically once, unlocks slots while combat choices stay equally available, and persists selected builds separately from legacy progress', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'strike-growth-')), file = join(folder, 'accounts.json');
  try {
    const store = new OnlineAccounts(file), account = await store.login('register', 'Growth build', 'test-password-123', 'fixture');
    const id = account.profile.id, reward = { accountId: id, classId: 'assault' as const, matchXp: 1500, kills: 20, won: true };
    const locked = defaultGrowthLoadout(); locked.title = 'notToday';
    expect(() => store.saveGrowth(id, 0, locked)).toThrow('解锁'); expect(() => store.saveGrowth(id, 1, defaultGrowthLoadout())).toThrow('解锁');
    store.settleGrowth('round1', [reward, reward]); const once = store.profile(id);
    expect(once.growth!.matches).toBe(1); store.settleGrowth('round1', [reward]); expect(store.profile(id)).toEqual(once);
    expect(once.credits).toBe(account.profile.credits); expect(once.classes).toEqual(account.profile.classes);
    store.settleGrowth('round2', [reward]); store.settleGrowth('round3', [reward]);
    expect(growthSlots(store.profile(id).growth!.xp)).toBe(3);
    locked.title = 'none'; locked.perks[1] = 'as_close';
    store.saveGrowth(id, 2, locked);
    const reopened = new OnlineAccounts(file); reopened.settleGrowth('round1', [reward]);
    expect(reopened.profile(id)).toEqual(store.profile(id));
    expect(reopened.profile(id).growth!.selectedSlot).toBe(2);
    expect(reopened.profile(id).growth!.loadouts[2]).toEqual(locked);
    const before = reopened.profile(id);
    expect(() => reopened.saveGrowth(id, 2, { ...locked, perks: ['pk_dressing', 'pk_dressing', 'pk_landing'] })).toThrow();
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
    const legacy = JSON.parse(readFileSync(file, 'utf8'));
    const currentBefore = legacy.accounts[0].profile.growth;
    const previous = { ...legacyCareer(), xp: currentBefore.xp, mastery: currentBefore.mastery, matches: currentBefore.matches, wins: currentBefore.wins, loadouts: [legacyLoadout('tank')] } as any;
    legacy.accounts[0].profile.growth = previous;
    previous.version = 1; delete previous.mastery.medic; delete previous.metrics.healingDone; delete previous.metrics.healingXp;
    writeFileSync(file, JSON.stringify(legacy)); const bytes = readFileSync(file, 'utf8');
    const reopened = new OnlineAccounts(file), profile = reopened.authenticate(account.token), current = profile.growth!;
    expect(current.version).toBe(3); expect(current.xp).toBe(previous.xp);
    expect(current.mastery).toEqual({ ...previous.mastery, medic: 0 });
    expect(current.metrics).toEqual({ ...previous.metrics, healingDone: 0, healingXp: 0 });
    expect(current.loadouts[0]).toMatchObject({ classId: 'tank', abilityId: 'tk_barrier', gadgetId: 'tk_cover' });
    expect(current.legacyLoadoutArchive[0].original).toEqual(previous.loadouts[0]);
    expect(profile.classes).toEqual(legacy.accounts[0].profile.classes); expect(profile.credits).toBe(legacy.accounts[0].profile.credits);
    const backups = readdirSync(folder).filter(name => name.includes('growth-v3'));
    expect(backups).toHaveLength(1); expect(readFileSync(join(folder, backups[0]), 'utf8')).toBe(bytes);
    expect(new OnlineAccounts(file).authenticate(account.token)).toEqual(profile);
    reopened.saveGrowth(profile.id, 0, defaultGrowthLoadout('medic'));
    expect(new OnlineAccounts(file).authenticate(account.token).growth!.loadouts[0].primary).toBe('famas');
  } finally { if (!folder.startsWith(join(tmpdir(), 'strike-growth-'))) throw Error('Unexpected cleanup path'); rmSync(folder, { recursive: true }); }
});
