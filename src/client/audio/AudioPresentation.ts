import type { SimulationEvent } from '../../shared/simulation/Events';
import { gameAudio, type AudioService } from './AudioService';
export interface AudioActor { id: string; x: number; y: number; weapon: string; classId?: string | null; reload: number; reserve?: number; life: { alive: boolean }; team: number }
/** Advance even when muted/backgrounded; seed new sessions without historical playback. */
export class AudioEventCursor {
  private scope = ''; private cursor = 0;
  accept(scope: string, tick: number, events: SimulationEvent[]) {
    if (scope !== this.scope) { this.scope = scope; this.cursor = Math.max(0, ...events.map(e => e.id)); return []; }
    const fresh = events.filter(e => e.id > this.cursor && tick - e.tick >= 0 && tick - e.tick <= 6);
    this.cursor = Math.max(this.cursor, ...events.map(e => e.id)); return fresh;
  }
  reset() { this.scope = ''; this.cursor = 0; }
}
export class AudioPresentation {
  private reloading = new Set<string>();
  private audible = true;
  private recentCombat = -Infinity; private lastTacticalVoice = -Infinity; private lastKill = -Infinity;
  private cursor = new AudioEventCursor(); private cooldown = new Map<string, number>(); private scope = ''; private classId = '';
  constructor(private audio: AudioService = gameAudio) {}
  reset() { this.cursor.reset(); this.cooldown.clear(); this.reloading.clear(); this.scope = ''; this.classId = ''; this.audio.stop(); }
  accept(scope: string, tick: number, events: SimulationEvent[], actors: AudioActor[], listenerId?: string | null, winner?: number | null, audible = true) {
    if (scope !== this.scope) { this.audio.stop(); this.scope = scope; this.cooldown.clear(); this.reloading.clear(); this.classId = ''; this.recentCombat = this.lastTacticalVoice = this.lastKill = -Infinity; }
    if (!audible && this.audible) this.audio.stop();
    this.audible = audible;
    const listener = actors.find(a => a.id === listenerId) ?? actors[0], fresh = this.cursor.accept(`${scope}:${this.audio.resumeGeneration}`, tick, events);
    if (!listener || !audible) return;
    if (listener.life.alive && listener.id === listenerId && listener.classId && listener.classId !== this.classId && this.audio.voice(listener.classId)) this.classId = listener.classId;
    for (const id of this.reloading) {
      const actor = actors.find(a => a.id === id);
      if (!actor?.life.alive || !actor.reload) { this.audio.stop(`reload:${id}`); this.reloading.delete(id); }
    }
    for (const event of fresh) {
      if ((event.kind === 'shot' && event.actorId === listenerId) || (event.kind === 'damage' && event.targetId === listenerId)) this.recentCombat = event.tick;
      const actor = actors.find(a => a.id === (['damage','death','melee-hit','block'].includes(event.kind) ? event.targetId ?? event.actorId : event.actorId));
      const point = event.position ?? actor, options = point ? { dx: point.x - listener.x, dy: point.y - listener.y } : {};
      const key = `${event.actorId}:${event.kind}`, interval = event.kind === 'empty' ? 12 : ['damage','block','melee-hit'].includes(event.kind) ? 3 : 0;
      if (tick - (this.cooldown.get(key) ?? -Infinity) < interval) continue;
      this.cooldown.set(key, tick);
      if (event.kind === 'shot' || event.kind === 'reload') {
        const source = actors.find(a => a.id === event.actorId), weapon = event.weapon ?? source?.weapon;
        if (event.kind === 'reload' && event.actorId) {
          if (!source?.life.alive || !source.reload || source.weapon !== weapon) continue;
          this.reloading.add(event.actorId);
        }
        if (weapon) this.audio.weapon(weapon, event.kind, { ...options, ...(event.kind === 'reload' ? { tag: `reload:${event.actorId}`, duration: event.duration ? event.duration / 30 : undefined } : {}) });
        if (event.kind === 'reload' && event.actorId === listenerId && event.emptyMagazine && tick - this.recentCombat <= 150 && tick - this.lastTacticalVoice >= 450) {
          if (this.audio.voice('reload')) this.lastTacticalVoice = tick;
        }
      } else if (event.kind === 'reload-end' || event.kind === 'swap') {
        this.audio.stop(`reload:${event.actorId}`); if (event.kind === 'swap') this.audio.cue('swap', options);
      } else if (event.kind === 'damage') {
        if (event.targetId === listenerId) this.audio.cue('hurt'); else if (event.actorId === listenerId) this.audio.cue('hit');
      } else if (event.kind === 'death') {
        if (event.targetId === listenerId) this.audio.stop();
        this.audio.cue('death', options);
        if (event.actorId === listenerId && event.targetId !== listenerId) {
          // First elimination after a quiet period, or a quick follow-up; never each kill.
          const keyKill = !Number.isFinite(this.lastKill) || tick - this.lastKill >= 600 || tick - this.lastKill <= 90;
          if (listener.life.alive && keyKill && tick - this.lastTacticalVoice >= 450 && this.audio.voice('kill')) this.lastTacticalVoice = tick;
          this.lastKill = tick;
        }
      } else if (event.kind === 'empty') {
        const source = actors.find(a => a.id === event.actorId);
        this.audio.cue('empty', { ...options, rate: source?.reserve === 0 ? .55 : 1 });
      } else if (event.kind === 'result') {
        this.audio.stop(); this.audio.cue(winner === listener.team ? 'win' : 'lose');
      } else if (event.kind === 'skill' || event.kind === 'item') {
        this.audio.cue(['heal','regenerate','medkit'].includes(event.ability ?? '') ? 'heal' : ['supply','ammo'].includes(event.ability ?? '') ? 'supply' : event.kind, options);
        if (event.actorId === listenerId && event.ability === 'regenerate') this.audio.voice('regenerate');
      } else if (event.kind !== 'error' || event.actorId === listenerId) this.audio.cue(event.kind, options);
    }
    if (this.cooldown.size > 2048) this.cooldown.clear();
  }
}
