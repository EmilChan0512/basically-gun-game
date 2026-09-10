import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
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
<style>body{margin:0;background:#161616;color:#ddd;font:14px monospace}#player{width:min(800px,100vw);aspect-ratio:4/3}ruffle-player{width:100%;height:100%}p{margin:8px}</style>
<div id="player"></div><p>Original SWF · Ruffle web 0.6.0 · 800×600 · research only</p>
<p><button id="record">开始录像</button> <button id="stop" disabled>停止并归档</button> <span id="capture-status">记录原版画面和输入时间，不修改SWF</span></p>
<script src="/ruffle/ruffle.js"></script><script>
const player = window.RufflePlayer.newest().createPlayer();
document.getElementById('player').appendChild(player);
player.ruffle().load({url:'/reference.swf',autoplay:'on',unmuteOverlay:'hidden',allowScriptAccess:false});
let recorder, inputs = [], startedAt, startedClock, upload = Promise.resolve(), part = 0, captureId;
const status = document.getElementById('capture-status');
for (const event of ['keydown','keyup','mousedown','mouseup','mousemove']) {
  window.addEventListener(event, e => {
    if (recorder?.state === 'recording') inputs.push({type:event,t:performance.now()-startedClock,code:e.code,x:e.clientX,y:e.clientY});
  },true);
}
document.getElementById('record').onclick = () => {
  try {
    const canvas = player.shadowRoot?.querySelector('canvas');
    if (!canvas) throw Error('Ruffle canvas unavailable');
    inputs = []; startedAt = new Date().toISOString(); startedClock = performance.now(); part = 0; upload = Promise.resolve();
    captureId = 'capture-' + startedAt.replace(/[:.]/g,'-');
    recorder = new MediaRecorder(canvas.captureStream(30), {mimeType:'video/webm;codecs=vp8',videoBitsPerSecond:2000000});
    recorder.ondataavailable = e => {
      if(!e.data.size) return;
      const metadata = {captureId,part:part++,startedAt,durationMs:performance.now()-startedClock,inputs:inputs.slice(),canvas:{width:canvas.width,height:canvas.height},runner:'Ruffle web 0.6.0',mimeType:recorder.mimeType,complete:recorder.state==='inactive'};
      upload = upload.then(async () => {
        const reader = new FileReader();
        const video = await new Promise(resolve => {reader.onload=()=>resolve(reader.result.split(',')[1]);reader.readAsDataURL(e.data);});
        const result = await fetch('/capture',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({video,...metadata})});
        if(!result.ok) throw Error(await result.text());
        await result.text();
      });
      upload.catch(e => {status.textContent=String(e);});
    };
    recorder.onstop = async () => {
      try { await upload; status.textContent='已归档：'+captureId; } catch(e) {status.textContent=String(e);}
      document.getElementById('record').disabled=false;
    };
    recorder.start(1000); document.getElementById('record').disabled=true;
    document.getElementById('stop').disabled=false; status.textContent='录像中（30fps采集；原版实际帧率需另核）';
  } catch(e) {status.textContent=String(e);}
};
document.getElementById('stop').onclick = () => {
  if(recorder?.state === 'recording') {recorder.stop();recorder.stream.getTracks().forEach(t=>t.stop());}
  document.getElementById('stop').disabled=true;
};
</script></html>`;
const captureParts = new Map();
createServer((request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1');
  if (url.pathname === '/capture' && request.method === 'POST') {
    if (request.headers.origin !== 'http://127.0.0.1:4180') { response.writeHead(403); response.end('Same-origin capture only'); return; }
    const chunks = []; let size = 0;
    request.on('data', chunk => { size += chunk.length; if(size > 64 * 1024 * 1024) request.destroy(); else chunks.push(chunk); });
    request.on('end', () => {
      try {
        const { video, ...metadata } = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if(typeof video !== 'string' || !Array.isArray(metadata.inputs) || !/^capture-[0-9TZ-]+$/.test(metadata.captureId) || metadata.part !== (captureParts.get(metadata.captureId) ?? 0)) throw Error('Invalid capture or chunk order');
        const content = Buffer.from(video,'base64');
        if(metadata.part === 0 && content.readUInt32BE(0) !== 0x1a45dfa3) throw Error('Expected WebM capture');
        const name = metadata.captureId;
        const directory = path.join(root,'archaeology/local/phase3-runtime'); mkdirSync(directory,{recursive:true});
        const videoFile = path.join(directory,name+'.webm');
        if(metadata.part === 0) writeFileSync(videoFile, content, {flag:'wx'}); else appendFileSync(videoFile,content);
        captureParts.set(name,metadata.part+1);
        writeFileSync(path.join(directory,name+'.json'), JSON.stringify({...metadata,swfSha256:sha256,videoSha256:createHash('sha256').update(readFileSync(videoFile)).digest('hex')},null,2));
        response.end(name);
      } catch(e) {response.writeHead(400); response.end(String(e));}
    }); return;
  }
  if (url.pathname === '/') { response.setHeader('Content-Type','text/html; charset=utf-8'); response.end(html); return; }
  if (url.pathname === '/reference.swf') { response.setHeader('Content-Type','application/x-shockwave-flash'); response.end(bytes); return; }
  const match = /^\/ruffle\/([a-zA-Z0-9._-]+\.(?:js|wasm))$/.exec(url.pathname);
  if (match) {
    const file = path.join(vendor, match[1]);
    if (existsSync(file)) { response.setHeader('Content-Type',file.endsWith('.wasm')?'application/wasm':'text/javascript'); response.end(readFileSync(file)); return; }
  }
  response.statusCode = 404; response.end('Not found');
}).listen(4180,'127.0.0.1',()=>console.log(`Original reference: http://127.0.0.1:4180 | SWF ${sha256}`));
