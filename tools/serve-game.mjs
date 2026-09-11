import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const defaultRoot = fileURLToPath(new URL('../dist/', import.meta.url));
export function createGameServer(root = defaultRoot) {
  const base = resolve(root);
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };
  return createServer(async (request, response) => {
    if (!['GET', 'HEAD'].includes(request.method ?? '')) { response.writeHead(405).end(); return; }
    try {
      // Normalize decoded Windows separators before the containment check on
      // every host, including Linux CI. URL parsing runs before percent decoding.
      const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname).replaceAll('\\', '/');
      const target = resolve(base, '.' + (pathname === '/' ? '/index.html' : pathname));
      if (!target.startsWith(base + sep)) { response.writeHead(403).end(); return; }
      const info = await stat(target);
      if (!info.isFile()) { response.writeHead(404).end(); return; }
      const contents = await readFile(target);
      response.writeHead(200, { 'Content-Type': types[extname(target)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
      response.end(request.method === 'HEAD' ? undefined : contents);
    } catch { response.writeHead(404).end('Not found'); }
  });
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  if (!existsSync(resolve(defaultRoot, 'index.html'))) { console.error('Build missing. Run npm run build first.'); process.exit(1); }
  const option = process.argv.indexOf('--port');
  const port = option === -1 ? 4175 : Number(process.argv[option + 1]);
  if (!Number.isInteger(port) || port < 1 || port > 65535) { console.error('Invalid port'); process.exit(1); }
  const server = createGameServer();
  server.on('error', error => { console.error(`Cannot start game: ${error.message}`); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => console.log(`Project Strike: http://127.0.0.1:${port}/\nOffline local game. Keep this terminal open; Ctrl+C to stop.`));
}
