import { WebSocket, WebSocketServer } from 'ws';

/** Application-message delay over real ordered WebSockets. A periodic stall
 * models head-of-line blocking; it is not a TCP packet-loss simulator. */
export async function delayedProxy(upstream: string, rttMs: number, jitterMs = 10, stallEvery = 23, stallMs = 80) {
  const listener = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  const sockets = new Set<WebSocket>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const stats = { forwarded: 0, stalls: 0, maxPending: 0, pending: 0 };
  listener.on('connection', downstream => {
    const remote = new WebSocket(upstream); sockets.add(downstream); sockets.add(remote);
    const forward = (source: WebSocket, target: WebSocket) => {
      let sequence = 0, previousDue = 0;
      const queue: { due: number; payload: Buffer; binary: boolean }[] = [];
      let active: ReturnType<typeof setTimeout> | undefined;
      const schedule = () => {
        if (active || !queue.length) return;
        active = setTimeout(() => {
          timers.delete(active!); active = undefined;
          while (queue.length && queue[0].due <= performance.now()) {
            const next = queue.shift()!; stats.pending--;
            if (target.readyState === WebSocket.OPEN) { target.send(next.payload, { binary: next.binary }); stats.forwarded++; }
          }
          schedule();
        }, Math.max(1, Math.ceil(queue[0].due - performance.now())));
        timers.add(active);
      };
      source.on('message', (raw, binary) => {
        const payload = Buffer.from(raw as Buffer);
        const index = ++sequence;
        const jitter = ((index * 17) % 21 / 10 - 1) * jitterMs;
        const stalled = stallEvery > 0 && index % stallEvery === 0;
        if (stalled) stats.stalls++;
        const due = Math.max(previousDue, performance.now() + Math.max(0, rttMs / 2 + jitter) + (stalled ? stallMs : 0));
        previousDue = due;
        if (++stats.pending > 4096) { source.terminate(); target.terminate(); stats.pending--; return; }
        stats.maxPending = Math.max(stats.maxPending, stats.pending);
        queue.push({ due, payload, binary }); schedule();
      });
    };
    // Clients wait for the upstream welcome before sending application messages.
    forward(remote, downstream); forward(downstream, remote);
    const close = () => { downstream.terminate(); remote.terminate(); sockets.delete(downstream); sockets.delete(remote); };
    downstream.on('close', close); remote.on('close', close);
    downstream.on('error', close); remote.on('error', close);
  });
  await new Promise<void>(resolve => listener.once('listening', resolve));
  const address = listener.address(); if (!address || typeof address === 'string') throw Error('Missing proxy address');
  return { url: `ws://127.0.0.1:${address.port}`, stats, close: async () => {
    for (const timer of timers) clearTimeout(timer); timers.clear();
    for (const socket of sockets) socket.terminate();
    await new Promise<void>(resolve => listener.close(() => resolve()));
  } };
}
