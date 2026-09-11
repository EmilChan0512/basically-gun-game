import type { IncomingMessage, ServerResponse } from 'node:http';
import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { CLASSES, WEAPONS, ITEMS, STARTER_WEAPONS, SPECIAL_OFFHANDS, SKILLS } from '../src/game/campaign/Catalog';
import type { OnlineAccounts } from './OnlineAccounts';
import { ADMIN_PAGE } from './AdminPage';

export interface AdminConfig { username: string; salt: string; verifier: string; origin?: string }
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export function createAdminHandler(accounts: OnlineAccounts, config: AdminConfig, changed: (id: string) => void = () => {}) {
  if (!/^[a-zA-Z0-9_-]{2,32}$/.test(config.username) || !/^[a-f0-9]{32}$/.test(config.salt) || !/^[a-f0-9]{128}$/.test(config.verifier)) throw Error('Invalid administrator credentials');
  if (config.origin && new URL(config.origin).origin !== config.origin) throw Error('Invalid administrator origin');
  const sessions = new Map<string, { expires: number; csrf: string }>();
  const attempts = new Map<string, { count: number; until: number }>();
  let hashing = 0;
  const json = (response: ServerResponse, status: number, body: unknown) => {
    response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); response.end(JSON.stringify(body));
  };
  async function body(request: IncomingMessage): Promise<Record<string, unknown>> {
    if (!request.headers['content-type']?.startsWith('application/json')) throw Error('需要JSON请求');
    let data = '';
    for await (const chunk of request) {
      data += chunk.toString(); if (Buffer.byteLength(data) > 16384) throw Error('请求过大');
    }
    const result = JSON.parse(data);
    if (!result || typeof result !== 'object' || Array.isArray(result)) throw Error('无效请求');
    return result;
  }
  return async (request: IncomingMessage, response: ServerResponse) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Referrer-Policy', 'no-referrer');
    const nonce = randomBytes(18).toString('base64');
    response.setHeader('Content-Security-Policy', `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'`);
    try {
      const url = new URL(request.url ?? '/', 'http://localhost');
      if (request.method === 'GET' && ['/admin', '/admin/'].includes(url.pathname)) {
        response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        response.end(ADMIN_PAGE.replaceAll('__NONCE__', nonce)); return;
      }
      if (!url.pathname.startsWith('/admin/api/')) { json(response, 404, { error: 'Not found' }); return; }
      const now = Date.now();
      for (const [key, value] of sessions) if (value.expires <= now) sessions.delete(key);
      for (const [key, value] of attempts) if (value.until <= now) attempts.delete(key);
      const origin = config.origin ?? `http://${request.headers.host}`;
      if (request.method !== 'GET' && request.headers.origin !== origin) { json(response, 403, { error: '请求来源不匹配，请从后台页面操作' }); return; }
      const cookie = request.headers.cookie?.split(';').map(v => v.trim()).find(v => v.startsWith('strike_admin='))?.slice(13) ?? '';
      const session = sessions.get(hash(cookie));
      const cookieOptions = `Path=/admin; HttpOnly; SameSite=Strict${origin.startsWith('https:') ? '; Secure' : ''}`;
      if (url.pathname === '/admin/api/login' && request.method === 'POST') {
        const address = request.socket.remoteAddress ?? 'unknown';
        const attempt = attempts.get(address) ?? { count: 0, until: now + 60000 };
        if (attempts.size >= 10000 || ++attempt.count > 8 || hashing >= 2) { json(response, 429, { error: '登录尝试过于频繁，请一分钟后重试' }); return; }
        attempts.set(address, attempt);
        const value = await body(request);
        if (typeof value.password !== 'string' || value.password.length < 8 || value.password.length > 128) { json(response, 401, { error: '管理员账号或密码不正确' }); return; }
        hashing++;
        let derived: Buffer;
        try { derived = await new Promise<Buffer>((resolve, reject) => scrypt(value.password as string, config.salt, 64, { N: 16384, r: 8, p: 1 }, (error, key) => error ? reject(error) : resolve(key))); }
        finally { hashing--; }
        if (!timingSafeEqual(derived, Buffer.from(config.verifier, 'hex')) || value.username !== config.username) { json(response, 401, { error: '管理员账号或密码不正确' }); return; }
        if (session) sessions.delete(hash(cookie));
        while (sessions.size >= 10) sessions.delete(sessions.keys().next().value!);
        const token = randomBytes(32).toString('hex'), csrf = randomBytes(32).toString('hex');
        sessions.set(hash(token), { csrf, expires: now + 4 * 3600000 });
        response.setHeader('Set-Cookie', `strike_admin=${token}; ${cookieOptions}; Max-Age=14400`);
        json(response, 200, { username: config.username, csrf }); return;
      }
      if (!session) { json(response, 401, { error: '请登录管理员账号' }); return; }
      if (request.method !== 'GET' && request.headers['x-csrf-token'] !== session.csrf) { json(response, 403, { error: '会话校验失败，请刷新页面' }); return; }
      if (url.pathname === '/admin/api/session' && request.method === 'GET') { json(response, 200, { username: config.username, csrf: session.csrf }); return; }
      if (url.pathname === '/admin/api/logout' && request.method === 'POST') {
        sessions.delete(hash(cookie)); response.setHeader('Set-Cookie', `strike_admin=; ${cookieOptions}; Max-Age=0`); json(response, 200, { ok: true }); return;
      }
      if (url.pathname === '/admin/api/catalog' && request.method === 'GET') {
        json(response, 200, { classes: CLASSES, weapons: Object.entries(WEAPONS).map(([id, w]) => ({ id, name: w.name, classId: w.classId, level: w.level, starter: STARTER_WEAPONS.some(starter => starter === id) })),
          items: Object.entries(ITEMS).map(([id, i]) => ({ id, name: i.name, level: i.level, starter: id === 'medkit' })), offhands: SPECIAL_OFFHANDS, skills: SKILLS }); return;
      }
      if (url.pathname === '/admin/api/users' && request.method === 'GET') {
        const page = Number(url.searchParams.get('page') ?? 1), query = url.searchParams.get('q') ?? '';
        if (!Number.isSafeInteger(page) || page < 1 || page > 100000 || query.length > 64) throw Error('无效搜索参数');
        json(response, 200, accounts.adminList(query, page)); return;
      }
      const match = /^\/admin\/api\/users\/([a-f0-9-]{36})$/.exec(url.pathname);
      if (match && request.method === 'GET') { json(response, 200, accounts.adminDetail(match[1])); return; }
      if (match && request.method === 'PATCH') {
        const value = await body(request), result = accounts.adminUpdate(match[1], value, config.username);
        changed(match[1]); json(response, 200, result); return;
      }
      json(response, 404, { error: 'Not found' });
    } catch (error) {
      const message = error instanceof Error ? error.message : '操作失败';
      const exposed = /[\u4e00-\u9fff]/.test(message) ? message : '请求无效或服务器暂时无法完成操作';
      if (!response.headersSent) json(response, message.includes('资产已发生变化') ? 409 : 400, { error: exposed });
      else response.end();
    }
  };
}
