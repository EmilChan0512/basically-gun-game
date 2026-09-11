import { Battle, seededRandom } from '../../game/campaign/Battle';
import { customMatch } from '../content/Maps';
import { MatchSession } from './MatchSession';
import type { PlayerCommand } from '../protocol/Commands';
import { validateEquipment, type EquipmentLoadout } from '../content/Equipment';

export interface RoomPlayer { id: string; name: string; team: 1 | 2; ready: boolean; connected: boolean; spectator: boolean; equipment: EquipmentLoadout }
/** Authority-only lobby. Network connections own player identities; commands never choose actors. */
export class Room {
  readonly instanceId = crypto.randomUUID();
  readonly players = new Map<string, RoomPlayer>();
  session: MatchSession | null = null;
  hostId: string | null = null;
  round = 0;
  constructor(readonly id: string, public mapId = 'hijack', public mode: import('./ModeRules').ModeId = 'tdm') {}
  join(id: string, name: string) {
    if (this.players.size >= 8) throw Error('Room is full');
    if (this.players.has(id) || !id || !name.trim() || name.length > 24) throw Error('Invalid player');
    const count = (team: number) => [...this.players.values()].filter(p => p.team === team).length;
    this.players.set(id, { id, name: name.trim(), team: this.mode === 'coop' || count(1) <= count(2) ? 1 : 2, ready: false, connected: true, spectator: !!this.session, equipment: { primary: 'm4', secondary: 'usp' } });
    this.hostId ??= id;
  }
  configure(id: string, mapId: string, mode: import('./ModeRules').ModeId) {
    if (id !== this.hostId || this.session) throw Error('Only lobby host can configure');
    customMatch(mapId, mode); this.mapId = mapId; this.mode = mode;
    [...this.players.values()].forEach((player, i) => { player.ready = false; player.team = mode === 'coop' || i % 2 === 0 ? 1 : 2; });
  }
  ready(id: string, ready: boolean) {
    const player = this.players.get(id);
    if (!player || this.session || !player.connected) throw Error('Cannot ready');
    player.ready = ready;
  }
  equip(id: string, value: unknown) {
    const player = this.players.get(id);
    if (!player || !player.connected || this.session) throw Error('Cannot change equipment');
    const equipment = validateEquipment(value);
    player.equipment = equipment; player.ready = false;
  }
  start(id: string, seed: number) {
    if (id !== this.hostId || this.session || this.players.size < (this.mode === 'coop' ? 1 : 2) || [...this.players.values()].some(p => !p.ready || !p.connected)) throw Error('Room not ready');
    const map = customMatch(this.mapId, this.mode);
    const roster = [...this.players.values()].sort((a, b) => a.team - b.team);
    const blue = roster.filter(p => p.team === 1).length, red = roster.length - blue;
    if (!blue || (this.mode !== 'coop' && !red)) throw Error('Both teams required');
    const battle = new Battle({ ...map, allies: blue - 1, enemies: red }, 'normal', 'm4', seededRandom(seed), null, `${this.id}:${++this.round}`);
    this.session = new MatchSession(battle);
    roster.forEach((player, i) => { player.spectator = false; battle.actors[i].name = player.name;
      battle.equipActor(battle.actors[i], player.equipment); this.session!.bind(player.id, battle.actors[i].id); });
  }
  command(id: string, command: PlayerCommand, authorityShotFrame?: number) { return this.players.get(id)?.connected ? this.session?.submit(id, command, authorityShotFrame) ?? false : false; }
  disconnect(id: string) {
    const player = this.players.get(id); if (!player) return;
    if (this.session) { player.connected = false; this.session.disconnect(id); }
    else { this.players.delete(id); if (this.hostId === id) this.hostId = this.players.keys().next().value ?? null; }
  }
  reconnect(id: string) {
    const player = this.players.get(id);
    if (!this.session || !player || player.connected) throw Error('Cannot reconnect');
    player.connected = true;
  }
  expire(id: string) {
    const player = this.players.get(id); if (!player || player.connected) return;
    const actorId = this.session?.actorId(id);
    if (actorId) this.session?.battle.releaseObjective(actorId);
    if (this.session) {
      this.session.battle.actors = this.session.battle.actors.filter(a => a.id !== actorId);
      this.session.battle.grenades = this.session.battle.grenades.filter(g => g.source.id !== actorId);
    }
    this.players.delete(id);
    if (this.hostId === id) this.hostId = this.players.keys().next().value ?? null;
    const teams = new Set([...this.players.values()].filter(p => !p.spectator).map(p => p.team));
    if (this.session && this.mode !== 'coop' && teams.size < 2) this.session.battle.endMatch(teams.size ? [...teams][0] : null, '对方队伍已全部离场');
    if (this.session && this.mode === 'coop' && !teams.size) this.session.battle.endMatch(2, '合作队伍已全部离场');
  }
  returnToLobby(id: string) {
    if (id !== this.hostId || !this.session?.battle.result) throw Error('Only host can return after match');
    for (const [key, player] of this.players) { if (!player.connected) this.players.delete(key); else { player.ready = false; player.spectator = false; } }
    this.session = null;
  }
  lobby() { return { id: this.id, instanceId: this.instanceId, round: this.round, hostId: this.hostId, mapId: this.mapId, mode: this.mode, phase: this.session ? 'playing' : 'lobby', players: [...this.players.values()].map(p => ({ ...p, equipment: { ...p.equipment } })) }; }
}
