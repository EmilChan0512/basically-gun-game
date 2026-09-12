import type { IncomingMessage, ServerResponse } from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';

export function createGameHandler(root: string) {
  const base = resolve(root);
  const types: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.webp': 'image/webp', '.woff2': 'font/woff2' };
  return async (request: IncomingMessage, response: ServerResponse) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    if (!['GET', 'HEAD'].includes(request.method ?? '')) { response.writeHead(405, { Allow: 'GET, HEAD' }).end(); return; }
    try {
      const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname).replaceAll('\\', '/');
      if (pathname.split('/').some(segment => segment.startsWith('.'))) { response.writeHead(403).end(); return; }
      const target = resolve(base, '.' + (pathname === '/' ? '/index.html' : pathname));
      if (!target.startsWith(base + sep)) { response.writeHead(403).end(); return; }
      const [actualBase, actualTarget] = await Promise.all([realpath(base), realpath(target)]);
      if (!actualTarget.startsWith(actualBase + sep)) { response.writeHead(403).end(); return; }
      const info = await stat(actualTarget);
      if (!info.isFile()) { response.writeHead(404).end(); return; }
      const contents = request.method === 'HEAD' ? undefined : await readFile(actualTarget);
      response.writeHead(200, { 'Content-Type': types[extname(target)] ?? 'application/octet-stream', 'Content-Length': info.size, 'Cache-Control': 'no-cache' });
      response.end(contents);
    } catch { response.writeHead(404).end('Not found'); }
  };
}
