import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import path from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
const vendor = path.join(root, 'tools/vendor/ruffle-web/package');
const swf = path.join(root, 'archaeology/swf/sfh1_reference.swf');
if (!existsSync(path.join(vendor, 'ruffle.js'))) throw Error('Install the private Ruffle web bundle as described in docs/ARCHAEOLOGY.md.');
const bytes = readFileSync(swf);
const sha256 = createHash('sha256').update(bytes).digest('hex');
if (sha256 !== '0b8d92dfae85917dd9bc0dc87997979bb825b3211d95d92f84040ffc9a1cc989') throw Error('Reference SWF hash mismatch');
const html = `<!doctype html><html><meta charset="utf-8"><title>SFH1 v1.2.1 original reference</title>
<style>body{margin:0;background:#161616;color:#ddd;font:14px monospace}#player{width:800px;height:600px}ruffle-player{width:100%;height:100%}p{margin:8px}</style>
<div id="player"></div><p>Original SWF · Ruffle web 0.6.0 · 800×600 · research only</p>
<script src="/ruffle/ruffle.js"></script><script>
const player = window.RufflePlayer.newest().createPlayer();
document.getElementById('player').appendChild(player);
player.ruffle().load({url:'/reference.swf',autoplay:'on',unmuteOverlay:'hidden',allowScriptAccess:false});
</script></html>`;
createServer((request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1');
  if (url.pathname === '/') { response.setHeader('Content-Type','text/html; charset=utf-8'); response.end(html); return; }
  if (url.pathname === '/reference.swf') { response.setHeader('Content-Type','application/x-shockwave-flash'); response.end(bytes); return; }
  const match = /^\/ruffle\/([a-zA-Z0-9._-]+\.(?:js|wasm))$/.exec(url.pathname);
  if (match) {
    const file = path.join(vendor, match[1]);
    if (existsSync(file)) { response.setHeader('Content-Type',file.endsWith('.wasm')?'application/wasm':'text/javascript'); response.end(readFileSync(file)); return; }
  }
  response.statusCode = 404; response.end('Not found');
}).listen(4180,'127.0.0.1',()=>console.log(`Original reference: http://127.0.0.1:4180 | SWF ${sha256}`));
