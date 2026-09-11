import type { StateMessage } from '../../shared/protocol/State';
import type { PlayerAction } from '../../shared/protocol/Commands';
import type { BattleInput } from '../../game/campaign/Battle';
import type { Room } from '../../shared/simulation/Room';
import { Interpolation } from './Interpolation';
import { Prediction } from './Prediction';
import { CONTENT_VERSION } from '../../shared/protocol/ContentVersion';

export class NetworkSession {
  socket: WebSocket;
  playerId = '';
  state: StateMessage | null = null;
  interpolation = new Interpolation();
  prediction = new Prediction();
  private token = '';
  room: ReturnType<Room['lobby']> | null = null;
  onChange: () => void = () => {};
  onError: (message: string) => void = () => {};
  private sequence = 0;
  private actions = new Set<PlayerAction>();
  private queued: object[] = [];
  private suppressCloseError = false;
  constructor(private url: string) {
    this.socket = new WebSocket(url);
    this.socket.onopen = () => { for (const message of this.queued) this.send(message); this.queued = []; };
    this.socket.onmessage = event => {
      const message = JSON.parse(event.data);
      if (message.type === 'probe') { this.send({ type: 'probeReply', nonce: message.nonce }); return; }
      if (message.type === 'welcome') {
        if (message.protocol !== 1) { this.onError('服务器版本不兼容'); this.close(); return; }
        if (message.content !== CONTENT_VERSION) { this.onError('地图或装备版本不一致，请更新客户端与服务器'); this.close(); return; }
        this.playerId = message.playerId;
      } else if (message.type === 'credential') this.token = message.token;
      else if (message.type === 'resumed') { this.playerId = message.playerId; this.sequence = message.nextSequence; this.state = null; this.prediction = new Prediction(); }
      else if (message.type === 'lobby') {
        if (message.room.phase === 'lobby' || message.room.id !== this.room?.id || message.room.round !== this.room?.round) {
          this.state = null; this.sequence = 0; this.actions.clear(); this.prediction = new Prediction(); this.interpolation = new Interpolation();
        }
        this.room = message.room;
      }
      else if (message.type === 'state') {
        if (this.room?.phase !== 'playing' || message.roomId !== this.room.id || message.round !== this.room.round) return;
        // Ordered transport can carry a forfeit/result or roster update at the
        // same simulation frame. Only genuinely older frames are stale.
        if (!this.state || message.state.frame >= this.state.state.frame) { this.state = message; this.interpolation.push(message, performance.now()); this.prediction.accept(message); }
      } else if (message.type === 'error') this.onError(message.message);
      this.onChange();
    };
    this.socket.onerror = () => { this.suppressCloseError = true; this.onError('无法连接联机服务器'); };
    this.socket.onclose = () => { if (!this.suppressCloseError) this.onError('连接已断开'); this.onChange(); };
  }
  send(message: object) {
    if (this.socket.readyState === WebSocket.CONNECTING) { this.queued.push(message); return; }
    if (this.socket.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify({ protocol: 1, content: CONTENT_VERSION, ...message }));
  }
  action(action: PlayerAction) { if (this.state?.actorId) this.actions.add(action); }
  reconnect() {
    if (!this.token || this.socket.readyState !== WebSocket.CLOSED) { this.onError('仅已断开的战斗连接可重连'); return; }
    const previous = this.socket;
    this.suppressCloseError = false;
    this.actions.clear(); this.queued = []; this.state = null; this.prediction = new Prediction(); this.interpolation = new Interpolation();
    this.socket = new WebSocket(this.url);
    this.socket.onmessage = previous.onmessage; this.socket.onerror = previous.onerror; this.socket.onclose = previous.onclose;
    this.socket.onopen = () => this.send({ type: 'resume', token: this.token });
  }
  input(input: BattleInput) {
    if (!this.state?.actorId || this.state.result || this.socket.readyState !== WebSocket.OPEN) return;
    const sequence = this.sequence++;
    this.prediction.input(sequence, input);
    this.send({ type: 'input', roomId: this.state.roomId, round: this.state.round, command: { sequence, input, actions: [...this.actions] } });
    this.actions.clear();
  }
  close() { this.suppressCloseError = true; this.actions.clear(); this.queued = []; this.socket.close(); }
}
