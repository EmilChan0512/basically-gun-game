import type { NetworkSession } from './NetworkSession';

/** Shared presentation contract; a local match need not create a WebSocket. */
export type BattlePresentationSession = Pick<NetworkSession,
  'action' | 'audioGeneration' | 'clearActions' | 'input' | 'interpolation' |
  'lastStateAt' | 'playerId' | 'prediction' | 'room' | 'shots' | 'state'> & {
  socket: Pick<WebSocket, 'readyState' | 'bufferedAmount'>;
  paused?: boolean;
  advance?(delta: number): void;
};
