import { startServer } from './server';
const port = Number(process.env.PORT ?? 4180), host = process.env.HOST ?? '127.0.0.1';
if (!Number.isInteger(port) || port < 0 || port > 65535) throw Error('PORT must be an integer from 0 to 65535');
const server = startServer(port, host);
server.wss.on('listening', () => {
  const address = server.wss.address();
  console.log(`Project Strike multiplayer: ws://${host}:${typeof address === 'object' && address ? address.port : port}`);
});
process.once('SIGINT', () => { void server.close(); });
process.once('SIGTERM', () => { void server.close(); });
