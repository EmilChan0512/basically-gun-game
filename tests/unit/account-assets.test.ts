import { it, expect } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, scryptSync } from 'node:crypto';
import { OnlineAccounts } from '../../server/OnlineAccounts';
import { CLASSES, MAX_XP, WEAPONS, SPECIAL_OFFHANDS, levelForXp, type ClassId } from '../../src/game/campaign/Catalog';
import { ownedEquipment, starterEquipment } from '../../src/shared/content/OnlineProgress';

const fixture = () => Object.keys(CLASSES).map((selected, i) => {
  const salt = randomBytes(16).toString('hex');
  return { name: `test_${i}`, selected: selected as ClassId, salt, verifier: scryptSync(`password-${i}`, salt, 64).toString('hex') };
});
it('provisions four isolated max-level accounts atomically and never repeats grants after a restart', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'strike-assets-')), file = join(dir, 'accounts.json');
  try {
    const store = new OnlineAccounts(file), entries = fixture(), profiles = store.provisionTests('qa_batch_001', entries);
    expect(new Set(profiles.map(p => p.id)).size).toBe(4);
    for (const [i, p] of profiles.entries()) {
      expect(p.credits).toBe(9999); expect(p.selected).toBe(entries[i].selected);
      expect(Object.values(p.classes).map(c => levelForXp(c.xp))).toEqual([50, 50, 50, 50]);
      expect(p.weapons).toHaveLength(54);
      for (const [id, w] of Object.entries(WEAPONS)) {
        const role = w.classId === 'shared' ? 'medic' : w.classId;
        expect(() => ownedEquipment(p, { ...starterEquipment(role), [w.slot]: id })).not.toThrow();
      }
      for (const [id, w] of Object.entries(SPECIAL_OFFHANDS)) expect(() => ownedEquipment(p, { ...starterEquipment(w.classId), secondary: id })).not.toThrow();
      expect((await store.login('login', p.name, `password-${i}`, p.name)).profile.id).toBe(p.id);
    }
    store.equip(profiles[0].id, { ...starterEquipment('assassin'), primary: 'awp', secondary: 'katana' });
    const before = profiles.map(p => store.assets(p.id));
    const reopened = new OnlineAccounts(file); reopened.provisionTests('qa_batch_001', entries);
    expect(profiles.map(p => reopened.assets(p.id))).toEqual(before);
    expect(() => reopened.provisionTests('qa_different_batch', entries)).toThrow('overwrite');
    expect(profiles.map(p => reopened.assets(p.id))).toEqual(before);
    expect(readFileSync(file, 'utf8')).not.toContain('password-');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
it('migrates old shared weapon saves without losing assets and repairs only invalid equipped slots', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'strike-assets-')), file = join(dir, 'accounts.json');
  try {
    const store = new OnlineAccounts(file), a = await store.login('register', 'Legacy', 'password-123', 'local');
    const data = JSON.parse(readFileSync(file, 'utf8')); data.version = 1; delete data.ledger;
    const p = data.accounts[0].profile; p.credits = 1234; p.weapons = ['m4', 'usp', 'vector', 'ak47'];
    p.classes.medic.xp = 160; p.classes.medic.equipment.primary = 'ak47'; p.classes.medic.equipment.skill = 'regenerate';
    p.classes.assassin.equipment.primary = 'vector';
    writeFileSync(file, JSON.stringify(data));
    const migrated = new OnlineAccounts(file), saved = migrated.authenticate(a.token);
    expect(saved.credits).toBe(1234); expect(saved.weapons).toEqual(expect.arrayContaining(p.weapons));
    expect(saved.classes.medic).toMatchObject({ xp: 160, equipment: { primary: 'm4', skill: 'regenerate' } });
    expect(saved.classes.assassin.equipment.primary).toBe('scout');
    expect(saved.classes.tank.equipment.primary).toBe('shotgun');
    expect(migrated.assets(a.profile.id).ledger.filter(e => e.reason === 'migration')).toHaveLength(1);
    expect(new OnlineAccounts(file).assets(a.profile.id)).toEqual(migrated.assets(a.profile.id));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
it('records purchases and settlements with bounded server-owned XP and no duplicate rewards', async () => {
  const store = new OnlineAccounts(), a = await store.login('register', 'Pilot', 'password-123', 'local');
  store.buy(a.profile.id, 'item', 'ammo');
  for (let i = 0; i < 30; i++) store.settle(`match-${i}`, [{ accountId: a.profile.id, classId: 'medic', won: true, kills: 30 }]);
  const before = store.assets(a.profile.id);
  expect(before.profile.classes.medic.xp).toBe(MAX_XP); expect(before.profile.classes.assassin.xp).toBe(0);
  expect(before.ledger.reduce((sum, e) => sum + e.creditsDelta, 0)).toBe(before.profile.credits);
  store.settle('match-0', [{ accountId: a.profile.id, classId: 'medic', won: true, kills: 30 }]);
  expect(store.assets(a.profile.id)).toEqual(before);
});
