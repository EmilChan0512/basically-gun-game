// Node.js 22.12+: check the actual WebSocket protocol and packaged content.
import { readFileSync } from 'node:fs';
const manifest = JSON.parse(readFileSync(new URL('./manifest.json', import.meta.url), 'utf8'));
if (manifest.webRoot) {
  const url = new URL(process.argv[2] ?? 'ws://127.0.0.1:4180');
  url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:';
  const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!response.ok || !(await response.text()).includes('<html')) throw Error('Game web page unavailable');
}
const socket = new WebSocket(process.argv[2] ?? 'ws://127.0.0.1:4180');
const timer = setTimeout(() => { console.error('WebSocket welcome timeout'); process.exit(1); }, 5000);
socket.addEventListener('error', () => { console.error('WebSocket connection failed'); process.exit(1); });
socket.addEventListener('message', ({ data }) => {
  try {
    const message = JSON.parse(data);
    if (message.type !== 'welcome' || message.protocol !== 1 || message.content !== manifest.contentVersion) {
      throw Error('Unexpected protocol or content version');
    }
    clearTimeout(timer);
    socket.close();
    console.log(`Healthy: ${message.content}`);
  } catch (error) { console.error(error.message); process.exit(1); }
}, { once: true });
