import { PVE_SCENARIOS, validateScenario, type PvEScenario } from '../content/PvEScenarios';
export interface WaveStatus {
  scenario: PvEScenario;
  phase: 'intermission' | 'wave' | 'won' | 'lost'; wave: number; remaining: number;
  cooldown: number; revives: number; reserved: string[]; serial: number;
  spawnBlocked: boolean;
  activeCap: number;
}
/** Finite cooperative waves. Difficulty is chosen at each wave boundary;
 * disconnects cannot reduce the active wave's already committed enemy budget. */
export class WaveDirector {
  private state: WaveStatus;
  constructor(players: number, scenario: PvEScenario = PVE_SCENARIOS[0]) {
    if (!Number.isInteger(players) || players < 1 || players > 8) throw Error('Coop requires 1–8 players');
    this.state = { scenario: structuredClone(validateScenario(scenario)), phase: 'intermission', wave: 0, remaining: 0,
      cooldown: scenario.warmupTicks, revives: players * scenario.revivesPerPlayer, reserved: [], serial: 0, spawnBlocked: false, activeCap: 0 };
  }
  reserveRevive(id: string) {
    if (this.state.reserved.includes(id)) return true;
    if (!this.state.revives) return false;
    this.state.revives--; this.state.reserved.push(id); return true;
  }
  canRevive(id: string) { return this.state.reserved.includes(id); }
  revived(id: string) { this.state.reserved = this.state.reserved.filter(p => p !== id); }
  advance(players: { id: string; alive: boolean }[], enemies: number) {
    const s = this.state;
    s.spawnBlocked = false;
    if (s.phase === 'won' || s.phase === 'lost') return false;
    s.reserved = s.reserved.filter(id => players.some(p => p.id === id));
    if (!players.some(p => p.alive) && !s.reserved.length) { s.phase = 'lost'; return false; }
    if (s.phase === 'intermission') {
      if (--s.cooldown > 0) return false;
      const tier = players.length <= 2 ? 1 : players.length <= 4 ? 2 : 3;
      s.wave++; s.remaining = s.scenario.waves[s.wave - 1].budgets[tier - 1];
      const wave = s.scenario.waves[s.wave - 1];
      s.activeCap = wave.activeCaps?.[tier - 1] ?? wave.activeCap;
      s.phase = 'wave'; s.cooldown = 0;
    }
    if (!s.remaining && !enemies) {
      if (s.wave === s.scenario.waves.length) s.phase = 'won';
      else { s.phase = 'intermission'; s.cooldown = s.scenario.intermissionTicks; }
      return false;
    }
    if (s.cooldown > 0) s.cooldown--;
    return s.remaining > 0 && enemies < s.activeCap && s.cooldown === 0;
  }
  blocked() { this.state.spawnBlocked = true; }
  spawned() { this.state.spawnBlocked = false; this.state.remaining--; this.state.cooldown = this.state.scenario.waves[this.state.wave - 1].spawnIntervalTicks; return ++this.state.serial; }
  snapshot(): WaveStatus { return structuredClone(this.state); }
  restore(state: WaveStatus) { validateScenario(state.scenario); this.state = structuredClone(state); }
}
