import { GROWTH_ACHIEVEMENTS } from '../content/GrowthRecords';
import { Battle, seededRandom } from '../../game/campaign/Battle';
import { defaultGrowthLoadoutV3 as defaultGrowthLoadout, validateGrowthLoadoutV3, type GrowthLoadoutV3 as GrowthLoadout } from '../content/growth-v3/Loadout';
import { GROWTH_V3_STAGE } from '../content/growth-v3/Core';
import { GROWTH_V3_PRESETS, validateGrowthPreset, type GrowthPresetId } from '../content/growth-v3/Presets';
const validateGrowthLoadout = (value: unknown) => validateGrowthLoadoutV3(value, GROWTH_V3_STAGE);
import { customMatch } from '../content/Maps';
import { MatchSession } from './MatchSession';
import type { PlayerCommand } from '../protocol/Commands';
import { validateEquipment, type EquipmentLoadout } from '../content/Equipment';

export interface RoomPlayer { growthLoadout?: GrowthLoadout; id: string; name: string; team: 1 | 2; ready: boolean; connected: boolean; spectator: boolean; equipment: EquipmentLoadout }
/** Authority-only lobby. Network connections own player identities; commands never choose actors. */
export class Room {
  readonly instanceId = crypto.randomUUID();
  readonly players = new Map<string, RoomPlayer>();
  session: MatchSession | null = null;
  hostId: string | null = null;
  round = 0;
  growthPreset: GrowthPresetId = 'standard';
  constructor(readonly id: string, public mapId = 'hijack', public mode: import('./ModeRules').ModeId = 'tdm', readonly debug = false, readonly rules: 'classic' | 'growth' = 'classic') {
    if (!['classic', 'growth'].includes(rules) || rules === 'growth' && (debug || !['tdm', 'dom'].includes(mode))) throw Error('Invalid room rules');
  }
  join(id: string, name: string, equipment?: EquipmentLoadout, growthLoadout?: GrowthLoadout) {
    if (this.rules === 'growth') growthLoadout = validateGrowthLoadout(growthLoadout ?? defaultGrowthLoadout());
    if (this.rules === 'growth') equipment = { classId: 'medic', primary: 'm4', secondary: 'usp', skill: 'heal', item: 'frag' };
    if (equipment) equipment = validateEquipment(equipment);
    if (this.players.size >= 8) throw Error('Room is full');
    if (this.players.has(id) || !id || !name.trim() || name.length > 24) throw Error('Invalid player');
    const count = (team: number) => [...this.players.values()].filter(p => p.team === team).length;
    this.players.set(id, { growthLoadout: this.rules === 'growth' ? growthLoadout : undefined, id, name: name.trim(), team: this.mode === 'coop' || count(1) <= count(2) ? 1 : 2, ready: false, connected: true, spectator: !!this.session, equipment: equipment ?? { classId: 'medic', primary: 'm4', secondary: 'usp' } });
    this.hostId ??= id;
    if (this.debug) {
      if (!this.session) {
        const battle = new Battle({ ...customMatch(this.mapId, this.mode), debug: true, allies: 0, enemies: 0 }, 'normal', 'm4', seededRandom(1), null, `${this.id}:${++this.round}`);
        battle.actors = [];
        this.session = new MatchSession(battle);
      }
      const player = this.players.get(id)!;
      player.spectator = false;
      this.session.battle.addDebugPlayer(id, player.name, player.team);
      this.session.bind(id, id);
      if (equipment) this.session.reconfigureDebugPlayer(id, equipment);
    }
  }
  configure(id: string, mapId: string, mode: import('./ModeRules').ModeId, preset: unknown = this.growthPreset) {
    if (this.rules === 'growth' && !['tdm', 'dom'].includes(mode)) throw Error('成长模式支持团队交火和据点争夺');
    if (id !== this.hostId || this.session) throw Error('Only lobby host can configure');
    const selected = validateGrowthPreset(preset);
    if(this.rules!=='growth'&&selected!=='standard')throw Error('实验短局仅限成长模式');
    customMatch(mapId, mode); this.mapId = mapId; this.mode = mode;
    this.growthPreset = selected;
    [...this.players.values()].forEach((player, i) => { player.ready = false; player.team = mode === 'coop' || i % 2 === 0 ? 1 : 2; });
  }
  ready(id: string, ready: boolean) {
    const player = this.players.get(id);
    if (!player || this.session || !player.connected) throw Error('Cannot ready');
    player.ready = ready;
  }
  equip(id: string, value: unknown) {
    if (this.rules === 'growth') throw Error('成长模式请使用四干员专属配装入口');
    const player = this.players.get(id);
    if (!player || !player.connected || this.session && !this.debug) throw Error('Cannot change equipment');
    const equipment = validateEquipment(value);
    if (this.session) this.session.reconfigureDebugPlayer(id, equipment);
    player.equipment = equipment; player.ready = false;
  }
  equipGrowth(id: string, value: unknown) {
    const player = this.players.get(id);
    if (this.rules !== 'growth' || !player?.connected || this.session) throw Error('Cannot change growth loadout');
    const loadout = validateGrowthLoadout(value);
    player.growthLoadout = loadout; player.ready = false;
  }
  start(id: string, seed: number) {
    if (id !== this.hostId || this.session || this.players.size < (this.mode === 'coop' || this.rules === 'growth' ? 1 : 2) || [...this.players.values()].some(p => !p.ready || !p.connected)) throw Error('Room not ready');
    const map = customMatch(this.mapId, this.mode);
    const roster = [...this.players.values()].sort((a, b) => a.team - b.team);
    const blue = roster.filter(p => p.team === 1).length, red = roster.length - blue;
    const soloGrowth = this.rules === 'growth' && roster.length === 1;
    // A lone returning spectator may be assigned red. Normalize the solo seat.
    if (soloGrowth) roster[0].team = 1;
    if (!soloGrowth && (!blue || (this.mode !== 'coop' && !red))) throw Error('Both teams required');
    const battle = new Battle({ ...map, ...(this.rules === 'growth' ? { growthPreset: this.growthPreset, seconds: GROWTH_V3_PRESETS[this.growthPreset].matchTicks / 30, goal: Number.MAX_SAFE_INTEGER } : {}), allies: soloGrowth ? 0 : blue - 1, enemies: soloGrowth ? 1 : red }, 'normal', 'm4', seededRandom(seed), null, `${this.id}:${++this.round}`);
    this.session = new MatchSession(battle);
    const growthBuilds: Record<string, GrowthLoadout> = {};
    roster.forEach((player, i) => { player.spectator = false; battle.actors[i].name = player.name;
      if (player.growthLoadout?.title && player.growthLoadout.title !== 'none') battle.actors[i].name += ` · ${GROWTH_ACHIEVEMENTS[player.growthLoadout.title].name.split(' · ')[1]}`;
      if (this.rules === 'growth') growthBuilds[battle.actors[i].id] = player.growthLoadout!; else battle.equipActor(battle.actors[i], player.equipment);
      this.session!.bind(player.id, battle.actors[i].id); });
    if (soloGrowth) {
      const bot = battle.actors[1], classId = (['assault', 'tank', 'sniper', 'medic'] as const)[(this.round - 1) % 4];
      bot.name = `${classId} 训练机器人`; growthBuilds[bot.id] = defaultGrowthLoadout(classId);
    }
    if (this.rules === 'growth') battle.enableGrowthV3(growthBuilds, GROWTH_V3_STAGE);
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
    if (actorId) { this.session?.battle.releaseObjective(actorId); this.session?.battle.forgetActorInput(actorId); }
    if (this.session) {
      if (actorId && this.session.battle.growthV3) this.session.battle.growthV3.retire(actorId);
      else this.session.battle.actors = this.session.battle.actors.filter(a => a.id !== actorId);
      this.session.battle.grenades = this.session.battle.grenades.filter(g => g.source.id !== actorId);
      this.session.battle.projectiles = this.session.battle.projectiles.filter(p => p.sourceId !== actorId);
    }
    this.session?.unbind(id);
    this.players.delete(id);
    if (this.debug && !this.players.size) this.session = null;
    if (this.hostId === id) this.hostId = this.players.keys().next().value ?? null;
    const teams = new Set([...this.players.values()].filter(p => !p.spectator).map(p => p.team));
    if (this.rules === 'growth' && this.session && teams.size) {
      for (const actor of this.session.battle.actors) if (!actor.human) teams.add(actor.team);
    }
    if (!this.debug && this.session && this.mode !== 'coop' && teams.size < 2) this.session.battle.endMatch(teams.size ? [...teams][0] : null, '对方队伍已全部离场');
    if (!this.debug && this.session && this.mode === 'coop' && !teams.size) this.session.battle.endMatch(2, '合作队伍已全部离场');
  }
  returnToLobby(id: string) {
    if (id !== this.hostId || !this.session?.battle.result) throw Error('Only host can return after match');
    for (const [key, player] of this.players) { if (!player.connected) this.players.delete(key); else { player.ready = false; player.spectator = false; } }
    this.session = null;
  }
  lobby() { return { id: this.id, rules: this.rules, growthPreset: this.rules === 'growth' ? this.growthPreset : undefined, debug: this.debug, instanceId: this.instanceId, round: this.round, hostId: this.hostId, mapId: this.mapId, mode: this.mode, phase: this.session ? 'playing' : 'lobby', players: [...this.players.values()].map(p => ({ ...p, growthLoadout: p.growthLoadout ? { classId: p.growthLoadout.classId, primary: p.growthLoadout.primary } : undefined, equipment: { ...p.equipment } })) }; }
}
