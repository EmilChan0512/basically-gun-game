import { writeSync } from 'node:fs';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
type Fields = Record<string, unknown>;
export interface Logger { log(level: LogLevel, event: string, fields?: Fields): void }
export const silentLogger: Logger = { log() {} };
const levels = { debug: 10, info: 20, warn: 30, error: 40 };
const privateKey = /token|password|secret|authorization|cookie|payload|nickname|^name$|^ip$|address/i;
function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 5) return '[truncated]';
  if (typeof value === 'string') return value.slice(0, 2000);
  if (Array.isArray(value)) return value.slice(0, 30).map(item => sanitize(item, depth + 1));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).slice(0, 50)
    .map(([key, item]) => [key, privateKey.test(key) ? '[redacted]' : sanitize(item, depth + 1)]));
  return typeof value === 'bigint' ? value.toString() : value;
}

/** JSON Lines on stdout; journald owns storage/rotation in production.
 * A synchronous sink also preserves the final fatal record before process.exit.
 */
export function createLogger(options: { level?: string; context?: Fields; sink?: (line: string) => void } = {}): Logger {
  const level = options.level ?? 'info';
  if (!Object.hasOwn(levels, level)) throw Error('LOG_LEVEL must be debug, info, warn or error');
  const sink = options.sink ?? ((line: string) => { writeSync(1, line); });
  return { log(severity, event, fields = {}) {
    if (levels[severity] < levels[level as LogLevel]) return;
    const cleaned = sanitize({ ...options.context, ...fields }) as Fields;
    sink(JSON.stringify({ ...cleaned, time: new Date().toISOString(), level: severity,
      event, service: 'project-strike', pid: process.pid }) + '\n');
  } };
}

/** Never include parser error text: Node may embed the incoming payload. */
export function requestErrorReason(error: unknown): string {
  if (error instanceof SyntaxError) return 'invalid-json';
  const known = ['Input rate exceeded', 'Protocol mismatch', 'Content version mismatch',
    'Reconnect token invalid or expired', 'Already in room', 'Name required', 'Room code required',
    'Room not found', 'Join a room first', 'Invalid ready', 'Invalid configuration', 'Match mismatch',
    'Unknown message', 'Room is full', 'Invalid player', 'Only lobby host can configure',
    'Cannot ready', 'Cannot change equipment', 'Room not ready', 'Both teams required',
    'Cannot reconnect', 'Only host can return after match'];
  return error instanceof Error && known.includes(error.message) ? error.message : 'invalid-request';
}
