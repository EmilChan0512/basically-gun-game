import { randomBytes, randomUUID, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync, openSync, closeSync, fsyncSync, unlinkSync } from 'node:fs';
import { dirname } from 'node:path';
import { MAX_XP, STARTER_WEAPONS, CLASSES, ITEMS, WEAPONS, canEquipWeapon, levelForXp, type ClassId, type ItemId } from '../src/game/campaign/Catalog';
import type { WeaponId } from '../src/game/combat/Combat';
import { freshOnlineProfile, starterEquipment, ownedEquipment, type OnlineProfile } from '../src/shared/content/OnlineProgress';

interface Account { profile: OnlineProfile; salt: string; verifier: string; settled: string[] }
interface AssetEntry { id: string; accountId: string; at: string; reason: 'registration' | 'purchase' | 'match' | 'migration' | 'test-grant'; creditsDelta: number; detail: string }
interface Database { version: 2; accounts: Account[]; sessions: { hash: string; accountId: string; expires: number }[]; ledger: AssetEntry[] }
export interface TestAccountProvision { name: string; selected: ClassId; salt: string; verifier: string }
export interface OnlineReward { accountId: string; classId: ClassId; won: boolean; kills: number }
const digest = (token: string) => createHash('sha256').update(token).digest('hex');
const normalized = (name: string) => name.normalize('NFKC').trim().toLowerCase();
const derive = (password: string, salt: string) => new Promise<Buffer>((resolve, reject) => {
  scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 }, (error, value) => error ? reject(error) : resolve(value));
});

/** Single authority process. Atomic snapshots keep purchases and rewards all-or-nothing. */
export class OnlineAccounts {
  private data: Database = { version: 2, accounts: [], sessions: [], ledger: [] };
  private hashing = 0;
  private attempts = new Map<string, { count: number; until: number }>();
  constructor(private file?: string) {
    if (!file) return; // Explicit ephemeral store for isolated tests.
    mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
    try {
      const value = JSON.parse(readFileSync(file, 'utf8'));
      if (![1, 2].includes(value.version) || !Array.isArray(value.accounts) || !Array.isArray(value.sessions)) throw Error('Invalid account database');
      const migrating = value.version === 1;
      if (migrating) { value.version = 2; value.ledger = []; }
      if (!Array.isArray(value.ledger)) throw Error('Invalid asset ledger');
      for (const account of value.accounts) {
        if (!account.profile?.id || !account.profile.name || !/^[a-f0-9]{32}$/.test(account.salt)
          || !/^[a-f0-9]{128}$/.test(account.verifier) || !Array.isArray(account.settled)
          || !Number.isSafeInteger(account.profile.credits) || account.profile.credits < 0 || !Object.hasOwn(CLASSES, account.profile.selected)) throw Error('Invalid account record');
        if (migrating) {
          account.profile.weapons = [...new Set([...STARTER_WEAPONS, ...account.profile.weapons])];
          for (const classId of Object.keys(CLASSES) as ClassId[]) {
            const career = account.profile.classes[classId];
            // Preserve experience and all purchased rights; repair each invalid slot independently.
            const old = career.equipment, repaired = starterEquipment(classId);
            for (const slot of ['primary', 'secondary', 'skill', 'item'] as const) {
              try { Object.assign(repaired, ownedEquipment(account.profile, { ...repaired, [slot]: old[slot] })); } catch { /* Starter in invalid slot. */ }
            }
            career.equipment = repaired;
          }
          this.record(value, account.profile.id, 'migration', 0, 'SFH1 class pools; XP and purchased rights retained');
        }
        for (const classId of Object.keys(CLASSES) as ClassId[]) {
          const career = account.profile.classes[classId];
          if (!Number.isSafeInteger(career.xp) || career.xp < 0 || career.xp > MAX_XP || career.equipment.classId !== classId) throw Error('Invalid career');
          ownedEquipment(account.profile, career.equipment);
        }
      }
      this.data = value;
      if (migrating) {
        // Keep the previous schema for an administrator-assisted binary rollback.
        writeFileSync(`${file}.schema1-${randomUUID()}.backup`, readFileSync(file), { mode: 0o600, flag: 'wx' });
        this.commit(value);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      this.commit(this.data); // Refuse startup if the configured persistent directory is not writable.
    }
  }
  private record(next: Database, accountId: string, reason: AssetEntry['reason'], creditsDelta: number, detail: string, id: string = randomUUID()) {
    next.ledger.push({ id, accountId, at: new Date().toISOString(), reason, creditsDelta, detail });
  }
  /** Server/admin inspection only; never includes password hashes or session tokens. */
  assets(id: string) { return { profile: this.profile(id), ledger: structuredClone(this.data.ledger.filter(e => e.accountId === id)) }; }
  /** Offline administrator CLI only. Idempotent; cannot overwrite an existing user's identity or assets. */
  provisionTests(batch: string, entries: TestAccountProvision[]) {
    if (!/^[a-zA-Z0-9_-]{8,80}$/.test(batch) || entries.length !== 4 || new Set(entries.map(e => normalized(e.name))).size !== 4) throw Error('Invalid provisioning batch');
    const next = structuredClone(this.data);
    for (const entry of entries) {
      if (!/^[a-zA-Z0-9_ -]{2,24}$/.test(entry.name) || !Object.hasOwn(CLASSES, entry.selected) || !/^[a-f0-9]{32}$/.test(entry.salt) || !/^[a-f0-9]{128}$/.test(entry.verifier)) throw Error('Invalid test account');
      const operation = `${batch}:${normalized(entry.name)}`;
      if (next.ledger.some(e => e.id === operation)) continue;
      if (next.accounts.some(a => normalized(a.profile.name) === normalized(entry.name))) throw Error('Account name already exists; refusing to overwrite');
      const profile = freshOnlineProfile(randomUUID(), entry.name);
      profile.credits = 9999; profile.selected = entry.selected;
      profile.weapons = Object.keys(WEAPONS) as WeaponId[]; profile.items = Object.keys(ITEMS) as ItemId[];
      for (const career of Object.values(profile.classes)) career.xp = MAX_XP;
      next.accounts.push({ profile, salt: entry.salt, verifier: entry.verifier, settled: [] });
      this.record(next, profile.id, 'test-grant', 9999, 'Four classes Lv50; all equipment and skills unlocked', operation);
    }
    this.commit(next);
    return entries.map(entry => this.profile(next.accounts.find(a => normalized(a.profile.name) === normalized(entry.name))!.profile.id));
  }
  private commit(next: Database) {
    if (this.file) {
      const temporary = `${this.file}.${randomUUID()}.tmp`;
      try {
        writeFileSync(temporary, JSON.stringify(next), { mode: 0o600, flag: 'wx' });
        const descriptor = openSync(temporary, 'r+');
        try { fsyncSync(descriptor); } finally { closeSync(descriptor); }
        renameSync(temporary, this.file);
      } catch { try { unlinkSync(temporary); } catch { /* No incomplete file. */ } throw Error('账号保存失败，请稍后重试'); }
    }
    this.data = next;
  }
  profile(id: string) {
    const account = this.data.accounts.find(a => a.profile.id === id);
    if (!account) throw Error('请先登录联机账号');
    return structuredClone(account.profile);
  }
  authenticate(token: unknown) {
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) throw Error('登录已过期，请重新登录');
    const session = this.data.sessions.find(s => s.hash === digest(token) && s.expires > Date.now());
    if (!session) throw Error('登录已过期，请重新登录');
    return this.profile(session.accountId);
  }
  revoke(token: unknown) {
    if (typeof token !== 'string') return;
    const next = structuredClone(this.data); next.sessions = next.sessions.filter(s => s.hash !== digest(token)); this.commit(next);
  }
  async login(mode: 'register' | 'login', name: unknown, password: unknown, address: string) {
    const now = Date.now();
    for (const [key, value] of this.attempts) if (value.until < now) this.attempts.delete(key);
    const attempt = this.attempts.get(address) ?? { count: 0, until: now + 60000 };
    this.attempts.set(address, attempt);
    if (++attempt.count > 12 || this.hashing >= 4 || this.attempts.size > 10000) throw Error('登录尝试过于频繁，请稍后重试');
    if (typeof name !== 'string' || typeof password !== 'string') throw Error('请输入账号和密码');
    name = name.normalize('NFKC').trim();
    if (!/^[\p{L}\p{N}_ -]{2,24}$/u.test(name as string) || password.length < 8 || password.length > 128) throw Error('账号名需2—24个字符，密码需8—128个字符');
    const displayName = name as string;
    const existing = this.data.accounts.find(a => normalized(a.profile.name) === normalized(displayName));
    const salt = existing?.salt ?? randomBytes(16).toString('hex');
    this.hashing++;
    let verifier: Buffer;
    try { verifier = await derive(password, salt); } finally { this.hashing--; }
    if (mode === 'login' && (!existing || !timingSafeEqual(verifier, Buffer.from(existing.verifier, 'hex')))) throw Error('账号或密码不正确');
    // Recheck after asynchronous hashing: two requests cannot register the same name.
    if (mode === 'register' && this.data.accounts.some(a => normalized(a.profile.name) === normalized(displayName))) throw Error('这个联机账号名已存在');
    const next = structuredClone(this.data);
    const account = mode === 'register' ? { profile: freshOnlineProfile(randomUUID(), displayName), salt, verifier: verifier.toString('hex'), settled: [] } : next.accounts.find(a => a.profile.id === existing!.profile.id)!;
    if (mode === 'register') { next.accounts.push(account); this.record(next, account.profile.id, 'registration', account.profile.credits, 'Starter assets'); }
    const token = randomBytes(32).toString('hex');
    next.sessions = next.sessions.filter(s => s.expires > now);
    const own = next.sessions.filter(s => s.accountId === account.profile.id);
    if (own.length >= 5) next.sessions = next.sessions.filter(s => !own.slice(0, own.length - 4).includes(s));
    next.sessions.push({ hash: digest(token), accountId: account.profile.id, expires: now + 7 * 86400000 });
    this.commit(next);
    return { token, profile: structuredClone(account.profile) };
  }
  equip(id: string, value: unknown) {
    const next = structuredClone(this.data), profile = next.accounts.find(a => a.profile.id === id)?.profile;
    if (!profile) throw Error('请先登录联机账号');
    const equipment = ownedEquipment(profile, value);
    profile.selected = equipment.classId; profile.classes[equipment.classId].equipment = equipment;
    this.commit(next); return structuredClone(profile);
  }
  buy(id: string, kind: unknown, itemId: unknown) {
    if (typeof itemId !== 'string' || !['weapon', 'item'].includes(String(kind))) throw Error('无效商品');
    const next = structuredClone(this.data), profile = next.accounts.find(a => a.profile.id === id)?.profile;
    if (!profile) throw Error('请先登录联机账号');
    const catalog = kind === 'weapon' ? WEAPONS : ITEMS;
    if (!Object.hasOwn(catalog, itemId)) throw Error('无效商品');
    const item = catalog[itemId as keyof typeof catalog] as { price: number; level: number };
    if (kind === 'weapon' && !canEquipWeapon(profile.selected, itemId as WeaponId)) throw Error('武器与当前职业不匹配');
    const owned: string[] = kind === 'weapon' ? profile.weapons : profile.items;
    if (owned.includes(itemId)) throw Error('已拥有该商品');
    if (levelForXp(profile.classes[profile.selected].xp) < item.level) throw Error('当前职业等级不足');
    if (profile.credits < item.price) throw Error('金币不足');
    profile.credits -= item.price;
    if (kind === 'weapon') profile.weapons.push(itemId as WeaponId); else profile.items.push(itemId as ItemId);
    this.record(next, id, 'purchase', -item.price, `${kind}:${itemId}`);
    this.commit(next); return structuredClone(profile);
  }
  settle(matchId: string, rewards: OnlineReward[]) {
    const next = structuredClone(this.data), changed: string[] = [];
    for (const reward of rewards) {
      const account = next.accounts.find(a => a.profile.id === reward.accountId);
      if (!account || account.settled.includes(matchId)) continue;
      const kills = Math.max(0, Math.min(30, Math.trunc(reward.kills))), profile = account.profile;
      if (!Object.hasOwn(CLASSES, reward.classId) || !Number.isFinite(reward.kills)) throw Error('Invalid reward');
      const previousXp = profile.classes[reward.classId].xp, previousCredits = profile.credits;
      profile.classes[reward.classId].xp = Math.min(MAX_XP, previousXp + (reward.won ? 130 : 35) + kills * 10);
      profile.credits = Math.min(10000000, profile.credits + (reward.won ? 180 : 40) + kills * 12);
      profile.matches++; if (reward.won) profile.wins++;
      account.settled.push(matchId); changed.push(profile.id);
      this.record(next, profile.id, 'match', profile.credits - previousCredits, `${matchId};${reward.classId};xp+${profile.classes[reward.classId].xp - previousXp}`);
    }
    if (changed.length) this.commit(next);
    return changed;
  }
}
