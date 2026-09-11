import { MISSIONS } from './Missions';
import type { Difficulty } from './Battle';
import type { WeaponId } from '../combat/Combat';

export const SAVE_KEY = 'project-strike-campaign-v1';
export interface SaveData { version: 1; completed: string[]; difficulty: Difficulty; weapon: WeaponId; best: Record<string, number> }
export interface SaveStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }
const fresh = (): SaveData => ({ version: 1, completed: [], difficulty: 'normal', weapon: 'm4', best: {} });

export class CampaignProgress {
  data = fresh();
  storageAvailable = true;
  constructor(private readonly storage?: SaveStorage) {
    try {
      if (!storage) { this.storageAvailable = false; return; }
      const raw: unknown = JSON.parse(storage.getItem(SAVE_KEY) ?? 'null');
      if (!raw || typeof raw !== 'object' || !('version' in raw) || raw.version !== 1) return;
      const saved = raw as Partial<SaveData>;
      if (['easy', 'normal', 'hard'].includes(saved.difficulty ?? '')) this.data.difficulty = saved.difficulty!;
      if (saved.weapon === 'm4' || saved.weapon === 'usp') this.data.weapon = saved.weapon;
      // Only accept a sequential campaign. Corrupt saves cannot create inaccessible holes.
      for (const mission of MISSIONS) {
        if (!Array.isArray(saved.completed) || !saved.completed.includes(mission.id)) break;
        this.data.completed.push(mission.id);
        const best = saved.best?.[mission.id];
        if (Number.isInteger(best) && best! >= 1 && best! <= 3) this.data.best[mission.id] = best!;
      }
    } catch { this.storageAvailable = false; }
  }
  get unlocked() { return Math.min(MISSIONS.length - 1, this.data.completed.length); }
  get finished() { return this.data.completed.length === MISSIONS.length; }
  canPlay(index: number) { return Number.isInteger(index) && index >= 0 && index <= this.unlocked; }
  complete(index: number, stars: number) {
    if (!this.canPlay(index)) throw new RangeError('Mission is locked');
    const id = MISSIONS[index].id;
    if (!this.data.completed.includes(id)) this.data.completed.push(id);
    this.data.best[id] = Math.max(this.data.best[id] ?? 0, Math.max(1, Math.min(3, Math.trunc(stars) || 1)));
    this.save();
  }
  save() {
    try { if (!this.storage) throw Error('No local storage'); this.storage.setItem(SAVE_KEY, JSON.stringify(this.data)); this.storageAvailable = true; }
    catch { this.storageAvailable = false; }
  }
}
