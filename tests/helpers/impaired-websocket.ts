import { WebSocket, WebSocketServer, type RawData } from 'ws';

/** Application-visible TCP delay: preserves ordering, including head-of-line stalls. */
export async function impairedWebSocket(target: string) {
  const server = new WebSocketServer({ port: 0, host: '127.0.0.1' });
  const connections = new Set<WebSocket>(), timers = new Set<ReturnType<typeof setTimeout>>();
  const started = performance.now();
  let forwarded = 0, stalled = 0, maxDelayMs = 0;
  server.on('connection', downstream => {
    const upstream = new WebSocket(target); connections.add(upstream); connections.add(downstream);
    const pipe = (source: WebSocket, destination: WebSocket) => {
      let deliveryAt = 0, count = 0;
      const queue: { at: number; bytes: Buffer; binary: boolean }[] = [];
      let pending = false;
      const drain = () => {
        if (pending || !queue.length) return;
        pending = true;
        const timer = setTimeout(() => {
          timers.delete(timer); pending = false;
          while (queue.length && queue[0].at <= performance.now()) {
            const packet = queue.shift()!;
            if (destination.readyState === WebSocket.OPEN) { destination.send(packet.bytes, { binary: packet.binary }); forwarded++; }
          }
          drain();
        }, Math.max(1, Math.ceil(queue[0].at - performance.now())));
        timers.add(timer);
      };
      source.on('message', (data: RawData, binary: boolean) => {
        const now = performance.now(), phase = (now - started) % 5000;
        const stall = phase > 3500 && phase < 4000 ? 4000 - phase : 0;
        const delay = 100 + (++count * 17 % 41) + stall;
        deliveryAt = Math.max(deliveryAt + .01, now + delay);
        const wait = deliveryAt - now; maxDelayMs = Math.max(maxDelayMs, wait); if (stall) stalled++;
        const bytes = Buffer.from(Array.isArray(data) ? Buffer.concat(data) : data as Buffer);
        queue.push({ at: deliveryAt, bytes, binary }); drain();
      });
    };
    // Downstream cannot send until it receives the upstream welcome through the proxy.
    pipe(upstream, downstream); pipe(downstream, upstream);
    for (const [source, peer] of [[downstream, upstream], [upstream, downstream]]) {
      source.on('error', () => peer.terminate());
      source.on('close', () => { connections.delete(source); peer.terminate(); });
    }
  });
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address(); if (!address || typeof address === 'string') throw Error('No proxy port');
  return { url: `ws://127.0.0.1:${address.port}`, metrics: () => ({ forwarded, stalled, maxDelayMs }),
    close: async () => { for (const timer of timers) clearTimeout(timer); for (const socket of connections) socket.terminate(); await new Promise<void>(resolve => server.close(() => resolve())); } };
}
