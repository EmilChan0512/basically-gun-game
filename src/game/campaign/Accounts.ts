import { SAVE_KEY, type SaveStorage } from './Progress';

export const ACCOUNTS_KEY = 'project-strike-accounts-v1';
export const SESSION_KEY = 'project-strike-session-v1';
interface Account { id: string; name: string; normalized: string; salt: string; verifier: string; save: string | null }
interface Registry { version: 1; accounts: Account[]; migrated: boolean }
const hex = (data: Uint8Array) => Array.from(data, n => n.toString(16).padStart(2, '0')).join('');
const unhex = (value: string) => new Uint8Array(value.match(/.{2}/g)!.map(n => parseInt(n, 16)));

/** Legacy format retained for compatibility tests only; no application entry point uses local login. Local device profiles. Passwords gate the UI; this is not server-side authentication. */
export class Accounts {
  private registry: Registry = { version: 1, accounts: [], migrated: false };
  private activeId: string | null = null;
  private revision = 0;
  available = true;
  constructor(private storage?: SaveStorage, private session?: SaveStorage) {
    this.read();
    try { const id = session?.getItem(SESSION_KEY); if (this.registry.accounts.some(a => a.id === id)) this.activeId = id!; } catch { /* Login is still available. */ }
  }
  private read() {
    try {
      if (!this.storage) { this.available = false; return; }
      const raw = JSON.parse(this.storage.getItem(ACCOUNTS_KEY) ?? 'null');
      if (raw?.version === 1 && Array.isArray(raw.accounts)) {
        this.registry = { version: 1, migrated: raw.migrated === true, accounts: raw.accounts.filter((a: Account) =>
          a && typeof a.id === 'string' && typeof a.name === 'string' && typeof a.normalized === 'string' && /^[a-f0-9]{32}$/.test(a.salt) && /^[a-f0-9]{64}$/.test(a.verifier) && (a.save === null || typeof a.save === 'string')) };
      }
    } catch { this.available = false; }
  }
  private write() {
    if (!this.storage) throw Error('本机存储不可用，请使用临时试玩。');
    try { this.storage.setItem(ACCOUNTS_KEY, JSON.stringify(this.registry)); this.available = true; }
    catch { this.available = false; throw Error('保存失败：本机存储不可用或空间不足。'); }
  }
  get active() { const a = this.registry.accounts.find(a => a.id === this.activeId); return a ? { id: a.id, name: a.name } : null; }
  get names() { return this.registry.accounts.map(a => a.name); }
  private async hash(password: string, salt: string) {
    const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
    return hex(new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: unhex(salt), iterations: 210000 }, material, 256)));
  }
  private activate(id: string) { this.activeId = id; try { this.session?.setItem(SESSION_KEY, id); } catch { /* Session may require login after refresh. */ } }
  async register(name: string, password: string) {
    name = name.normalize('NFKC').trim();
    if (!/^[\p{L}\p{N}_ -]{2,24}$/u.test(name)) throw Error('账号名需2—24个汉字、字母、数字、空格或下划线。');
    if (password.length < 6 || password.length > 128) throw Error('密码需6—128个字符。');
    const normalized = name.toLocaleLowerCase();
    this.read();
    if (this.registry.accounts.some(a => a.normalized === normalized)) throw Error('这个账号名已存在。');
    const revision = this.revision;
    const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
    const verifier = await this.hash(password, salt);
    if (revision !== this.revision) throw Error('登录操作已取消。');
    this.read();
    if (this.registry.accounts.some(a => a.normalized === normalized)) throw Error('这个账号名已存在。');
    let legacy: string | null = null;
    if (!this.registry.migrated) { try { legacy = this.storage?.getItem(SAVE_KEY) ?? null; } catch { /* New account can still be created. */ } }
    const previous = structuredClone(this.registry);
    const account: Account = { id: crypto.randomUUID(), name, normalized, salt, verifier, save: legacy };
    this.registry.accounts.push(account); this.registry.migrated = true;
    try { this.write(); } catch (error) { this.registry = previous; throw error; }
    this.activate(account.id);
  }
  async login(name: string, password: string) {
    this.read();
    const account = this.registry.accounts.find(a => a.normalized === name.normalize('NFKC').trim().toLocaleLowerCase());
    if (!account || password.length > 128) throw Error('账号或密码不正确。');
    const revision = this.revision;
    const actual = await this.hash(password, account.salt);
    if (revision !== this.revision) throw Error('登录操作已取消。');
    let difference = 0; for (let i = 0; i < actual.length; i++) difference |= actual.charCodeAt(i) ^ account.verifier.charCodeAt(i);
    if (difference !== 0) throw Error('账号或密码不正确。');
    this.activate(account.id);
  }
  logout() { this.revision++; this.activeId = null; try { this.session?.setItem(SESSION_KEY, ''); } catch { /* No active session in memory. */ } }
  profileStorage(): SaveStorage {
    const id = this.active?.id;
    if (!id) throw Error('请先登录。');
    return {
      getItem: () => this.registry.accounts.find(a => a.id === id)?.save ?? null,
      setItem: (_key, save) => {
        if (this.activeId !== id) throw Error('账号已切换。');
        this.read(); const account = this.registry.accounts.find(a => a.id === id);
        if (!account) throw Error('账号不存在。');
        const previous = account.save; account.save = save;
        try { this.write(); } catch (error) { account.save = previous; throw error; }
      },
    };
  }
}
