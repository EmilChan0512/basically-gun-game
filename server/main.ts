import { startServer } from './server';
import { createLogger } from './Logger';
import { CONTENT_VERSION } from '../src/shared/protocol/ContentVersion';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
let revision = 'development';
try { revision = readFileSync(resolve('REVISION'), 'utf8').trim().slice(0, 40); } catch { /* Source checkout has no release marker. */ }
const context = { contentVersion: CONTENT_VERSION, revision };
let logger = createLogger({ context });
process.on('uncaughtException', error => {
  logger.log('error', 'process.fatal', { errorType: error.name, message: error.message, stack: error.stack });
  process.exit(1);
});
process.on('unhandledRejection', error => {
  logger.log('error', 'process.unhandled_rejection', { errorType: error instanceof Error ? error.name : 'Unknown',
    message: error instanceof Error ? error.message : 'Non-error rejection', stack: error instanceof Error ? error.stack : undefined });
  process.exit(1);
});
logger = createLogger({ level: process.env.LOG_LEVEL, context });
const port = Number(process.env.PORT ?? 4180), host = process.env.HOST ?? '127.0.0.1';
if (!Number.isInteger(port) || port < 0 || port > 65535) throw Error('PORT must be an integer from 0 to 65535');
const metricsIntervalMs = Number(process.env.LOG_METRICS_INTERVAL_MS ?? 60000);
if (!Number.isInteger(metricsIntervalMs) || metricsIntervalMs < 1000) throw Error('LOG_METRICS_INTERVAL_MS must be an integer >= 1000');
const server = startServer(port, host, 30000, logger, metricsIntervalMs);
server.wss.on('error', error => {
  logger.log('error', 'server.listen_error', { errorType: error.name, message: error.message, code: (error as NodeJS.ErrnoException).code });
  process.exit(1);
});
server.wss.on('listening', () => {
  const address = server.wss.address();
  logger.log('info', 'server.started', { url: `ws://${host}:${typeof address === 'object' && address ? address.port : port}`, metricsIntervalMs });
});
let stopping = false;
async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  logger.log('info', 'server.stopping', { signal, rooms: server.rooms.size });
  const deadline = setTimeout(() => { logger.log('error', 'server.shutdown_timeout'); process.exit(1); }, 10000);
  deadline.unref();
  await server.close();
  clearTimeout(deadline);
  logger.log('info', 'server.stopped', { signal });
}
process.once('SIGINT', () => { void shutdown('SIGINT'); });
process.once('SIGTERM', () => { void shutdown('SIGTERM'); });
