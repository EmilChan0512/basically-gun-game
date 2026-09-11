import type { WebSocket } from 'ws';
import type { startServer } from '../../server/server';
import { CONTENT_VERSION } from '../../src/shared/protocol/ContentVersion';

export async function authorizeSocket(server: ReturnType<typeof startServer>, socket: WebSocket, name: string) {
  const account = await server.accounts.login('register', name, 'test-password-123', `fixture-${name}`);
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => { socket.off('message', receive); reject(Error('Auth timeout')); }, 5000);
    const receive = (raw: import('ws').RawData) => {
      const message = JSON.parse(raw.toString());
      if (message.type === 'authenticated') { clearTimeout(timeout); socket.off('message', receive); resolve(); }
    };
    socket.on('message', receive);
    socket.send(JSON.stringify({ protocol: 1, content: CONTENT_VERSION, type: 'auth', mode: 'restore', token: account.token }));
  });
  return account;
}
