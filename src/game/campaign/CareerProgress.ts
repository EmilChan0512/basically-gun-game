import { CampaignProgress, SAVE_KEY, type SaveData, type SaveStorage } from './Progress';
import { MAX_XP, STARTER_WEAPONS, canEquipWeapon, CLASSES, SKILLS, WEAPONS, ITEMS, SPECIAL_OFFHANDS, isSpecialOffhand, canEquipOffhand, defaultLoadout, levelForXp, type ClassId, type ItemId, type Loadout, type SkillId, type SpecialOffhandId } from './Catalog';
import type { WeaponId } from '../combat/Combat';
import type { Battle } from './Battle';
import { MISSIONS } from './Missions';

export interface Career { selected: ClassId; credits: number; weapons: WeaponId[]; items: ItemId[]; classes: Record<ClassId, { xp: number; loadout: Loadout }>; settled: string[] }
export interface Reward { xp: number; credits: number; previousLevel: number; level: number; firstClear: boolean }
const ids = Object.keys(CLASSES) as ClassId[];
const integer = (value: unknown, max: number, fallback = 0) => typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(max, Math.trunc(value))) : fallback;
const fresh = (): Career => ({ selected: 'medic', credits: 350, weapons: [...STARTER_WEAPONS], items: ['medkit'], settled: [],
  classes: Object.fromEntries(ids.map(id => [id, { xp: 0, loadout: defaultLoadout(id) }])) as Career['classes'] });

/** Additive migration: old campaign saves remain valid and retain all mission unlocks. */
export class CareerProgress extends CampaignProgress {
  declare data: SaveData & { career: Career };
  constructor(storage?: SaveStorage) {
    super(storage); this.data.career = fresh();
    try {
      const raw = JSON.parse(storage?.getItem(SAVE_KEY) ?? 'null');
      const c = raw?.career; if (!c || typeof c !== 'object') return;
      const career = this.data.career;
      if (ids.includes(c.selected)) career.selected = c.selected;
      career.credits = integer(c.credits, 10000000, 350);
      if (Array.isArray(c.weapons)) career.weapons = [...new Set<WeaponId>([...STARTER_WEAPONS, ...c.weapons.filter((w: string) => Object.hasOwn(WEAPONS, w))])];
      if (Array.isArray(c.items)) career.items = [...new Set<ItemId>(['medkit', ...c.items.filter((i: string) => Object.hasOwn(ITEMS, i))])];
      if (Array.isArray(c.settled)) career.settled = c.settled.filter((id: unknown) => typeof id === 'string');
      for (const id of ids) {
        const saved = c.classes?.[id]; if (!saved) continue;
        const current = career.classes[id]; current.xp = integer(saved.xp, MAX_XP);
        const l = saved.loadout, level = levelForXp(current.xp); current.loadout.level = level;
        if (!l) continue;
        for (const slot of ['primary', 'secondary'] as const) {
          const weapon = l[slot] as WeaponId;
          if (career.weapons.includes(weapon) && canEquipWeapon(id, weapon) && WEAPONS[weapon].slot === slot && WEAPONS[weapon].level <= level) current.loadout[slot] = weapon;
        }
        // Starter offhands are freely available; legacy gun IDs keep their existing ownership checks.
        const secondary: unknown = l.secondary;
        if (isSpecialOffhand(secondary) && canEquipOffhand(id, secondary) && SPECIAL_OFFHANDS[secondary].level <= level) current.loadout.secondary = secondary;
        if (CLASSES[id].skills.includes(l.skill) && SKILLS[l.skill as SkillId].level <= level) current.loadout.skill = l.skill;
        if (career.items.includes(l.item) && ITEMS[l.item as ItemId].level <= level) current.loadout.item = l.item;
        current.loadout.training.vitality = Math.min(integer(l.training?.vitality, 3), level - 1);
        current.loadout.training.handling = Math.min(integer(l.training?.handling, 3), level - 1 - current.loadout.training.vitality);
      }
    } catch { /* Preserve valid base campaign data and use a fresh career. */ }
  }
  get current() { return this.data.career.classes[this.data.career.selected]; }
  get loadout() { return structuredClone(this.current.loadout); }
  get trainingPoints() { return this.current.loadout.level - 1 - this.current.loadout.training.vitality - this.current.loadout.training.handling; }
  selectClass(id: ClassId) { if (!Object.hasOwn(CLASSES, id)) return false; this.data.career.selected = id; this.save(); return true; }
  buyWeapon(id: WeaponId) {
    const item = WEAPONS[id]; if (!item || !canEquipWeapon(this.data.career.selected, id) || this.data.career.weapons.includes(id) || this.current.loadout.level < item.level || this.data.career.credits < item.price) return false;
    this.data.career.credits -= item.price; this.data.career.weapons.push(id); this.save(); return true;
  }
  equipWeapon(id: WeaponId) {
    const item = WEAPONS[id]; if (!item || !canEquipWeapon(this.data.career.selected, id) || !this.data.career.weapons.includes(id) || this.current.loadout.level < item.level) return false;
    this.current.loadout[item.slot] = id; this.data.weapon = this.current.loadout.primary; this.save(); return true;
  }
  equipOffhand(id: SpecialOffhandId) {
    if (!isSpecialOffhand(id) || !canEquipOffhand(this.data.career.selected, id) || this.current.loadout.level < SPECIAL_OFFHANDS[id].level) return false;
    this.current.loadout.secondary = id; this.save(); return true;
  }
  buyItem(id: ItemId) {
    const item = ITEMS[id]; if (!item || this.data.career.items.includes(id) || this.current.loadout.level < item.level || this.data.career.credits < item.price) return false;
    this.data.career.credits -= item.price; this.data.career.items.push(id); this.save(); return true;
  }
  equipItem(id: ItemId) {
    if (!this.data.career.items.includes(id) || this.current.loadout.level < ITEMS[id].level) return false;
    this.current.loadout.item = id; this.save(); return true;
  }
  equipSkill(id: SkillId) {
    if (!CLASSES[this.data.career.selected].skills.includes(id) || this.current.loadout.level < SKILLS[id].level) return false;
    this.current.loadout.skill = id; this.save(); return true;
  }
  train(kind: 'vitality' | 'handling') {
    if (!['vitality', 'handling'].includes(kind) || this.trainingPoints < 1 || this.current.loadout.training[kind] >= 3) return false;
    this.current.loadout.training[kind]++; this.save(); return true;
  }
  settle(battle: Battle): Reward | null {
    const index = MISSIONS.findIndex(m => m.id === battle.mission.id);
    if (battle.phase === 'running' || !this.canPlay(index) || this.data.career.settled.includes(battle.id)) return null;
    const career = this.data.career.classes[battle.loadout?.classId ?? 'medic'], won = battle.phase === 'won';
    const firstClear = won && !this.data.completed.includes(battle.mission.id);
    const xp = (won ? 130 : 35) + Math.min(30, battle.player.kills) * 10 + (firstClear ? 80 : 0);
    const credits = (won ? 180 : 40) + Math.min(30, battle.player.kills) * 12 + (firstClear ? 100 : 0);
    const previousLevel = levelForXp(career.xp);
    career.xp = Math.min(MAX_XP, career.xp + xp); career.loadout.level = levelForXp(career.xp);
    this.data.career.credits += credits; this.data.career.settled.push(battle.id);
    if (won) {
      const stars = 1 + Number(battle.player.life.deaths === 0) + Number(battle.frame <= battle.mission.seconds * 15);
      if (!this.data.completed.includes(battle.mission.id)) this.data.completed.push(battle.mission.id);
      this.data.best[battle.mission.id] = Math.max(this.data.best[battle.mission.id] ?? 0, stars);
    }
    this.save(); return { xp, credits, previousLevel, level: career.loadout.level, firstClear };
  }
}
