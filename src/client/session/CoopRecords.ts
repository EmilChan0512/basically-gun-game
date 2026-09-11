import type { StateMessage } from '../../shared/protocol/State';
export const COOP_RECORDS_KEY = 'project-strike-coop-results-v1';
interface Storage { getItem(key: string): string | null; setItem(key: string, value: string): void }
export interface CoopRecord {
  id: string; mapId: string; scenarioId: string; outcome: 'won' | 'lost';
  wave: number; totalWaves: number; kills: number; deaths: number; ticks: number; completedAt: string;
}
function valid(value: unknown): value is CoopRecord {
  if (!value || typeof value !== 'object') return false;
  const r = value as CoopRecord;
  return ['id', 'mapId', 'scenarioId', 'completedAt'].every(k => typeof r[k as keyof CoopRecord] === 'string' && String(r[k as keyof CoopRecord]).length <= 300)
    && !!r.id && ['won', 'lost'].includes(r.outcome)
    && [r.wave, r.totalWaves, r.kills, r.deaths, r.ticks].every(n => Number.isSafeInteger(n) && n >= 0)
    && r.wave <= r.totalWaves && r.totalWaves <= 100 && Number.isFinite(Date.parse(r.completedAt));
}
/** Device-local history, separate from career currency and online identity. */
export class CoopRecords {
  private entries: CoopRecord[] = [];
  persistent = true;
  constructor(private storage?: Storage) { this.read(); }
  private read() {
    if (!this.storage) { this.persistent = false; return; }
    try {
      const raw = this.storage.getItem(COOP_RECORDS_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data?.version === 1 && Array.isArray(data.entries)) {
        // A failed write leaves newer results only in memory. Never replace them
        // with the older persisted list when the next terminal snapshot arrives.
        const merged = new Map<string, CoopRecord>();
        for (const entry of [...this.entries, ...data.entries.filter(valid)]) {
          if (!merged.has(entry.id)) merged.set(entry.id, entry);
        }
        this.entries = [...merged.values()].sort((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt)).slice(0, 50);
      }
    } catch { this.persistent = false; }
  }
  list() { return structuredClone(this.entries); }
  record(roomInstance: string, state: StateMessage) {
    if (state.mode !== 'coop' || !state.result || !state.state.waves || !state.actorId || !roomInstance) return false;
    const actor = state.state.actors.find(a => a.id === state.actorId);
    if (!actor || actor.team !== 1) return false;
    this.read();
    const id = `${roomInstance}:${state.round}`;
    if (this.entries.some(r => r.id === id)) return false;
    const waves = state.state.waves;
    const entry: CoopRecord = { id, mapId: state.mapId, scenarioId: waves.scenario.id,
      outcome: state.result.winner === 1 ? 'won' : 'lost', wave: waves.wave, totalWaves: waves.scenario.waves.length,
      kills: actor.kills, deaths: actor.life.deaths, ticks: state.result.tick, completedAt: new Date().toISOString() };
    if (!valid(entry)) return false;
    this.entries = [entry, ...this.entries].slice(0, 50);
    try { if (this.storage) { this.storage.setItem(COOP_RECORDS_KEY, JSON.stringify({ version: 1, entries: this.entries })); this.persistent = true; } }
    catch { this.persistent = false; }
    return true;
  }
}
