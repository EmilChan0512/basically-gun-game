import { GROWTH_V3_RULES, clamp, healthUnits } from '../../content/growth-v3/Core';
import { GROWTH_V3_WEAPONS, type GrowthWeaponId } from '../../content/growth-v3/Weapons';
import { growthReloadTicks, resolveGrowthWeapon, type GrowthAttachmentId, type ResolvedGrowthWeapon, type WeaponConditions } from '../../content/growth-v3/Attachments';
import type { GrowthLoadoutV3 } from '../../content/growth-v3/Loadout';

export function damageScaleAt(weapon: Pick<ResolvedGrowthWeapon, 'falloffStart' | 'falloffEnd' | 'maxRange' | 'minDamageScale'>, distance: number) {
  if (!Number.isFinite(distance) || distance < 0) throw Error('Invalid hit distance');
  if (distance > weapon.maxRange) return 0;
  if (distance <= weapon.falloffStart) return 1;
  if (distance >= weapon.falloffEnd) return weapon.minDamageScale;
  return 1 - (1 - weapon.minDamageScale) * (distance - weapon.falloffStart) / (weapon.falloffEnd - weapon.falloffStart);
}
/** Returns millihitpoints; shotgun targets aggregate unrounded pellet HP before final rounding. */
export function pelletDamageHp(weapon: ResolvedGrowthWeapon, distance: number, head: boolean) {
  return weapon.damage * damageScaleAt(weapon, distance) * (head ? weapon.headMultiplier : 1);
}
export function groupedShotDamage(weapon: ResolvedGrowthWeapon, hits: readonly { distance: number; head: boolean }[]) {
  if (hits.length > weapon.pellets) throw Error('Too many pellet hits for one target');
  return healthUnits(hits.reduce((sum, hit) => sum + pelletDamageHp(weapon, hit.distance, hit.head), 0));
}
export function postureScale(c: WeaponConditions) {
  return c.airborne ? 1.4 : c.crouching ? c.moving ? 1.05 : .8 : c.moving ? 1.15 : 1;
}
export function shotSpread(weapon: ResolvedGrowthWeapon, bloom: number, conditions: WeaponConditions, benefits: readonly number[] = []) {
  if (benefits.some(v => !Number.isFinite(v) || v <= 0) || !Number.isFinite(bloom) || bloom < 0) throw Error('Invalid spread modifier');
  return Math.max(GROWTH_V3_WEAPONS[weapon.id].spread * .25, (weapon.spread + bloom) * postureScale(conditions) * Math.min(1, ...benefits));
}
export interface GrowthGunState {
  ammo: number; reserve: number; reloadUntil: number; lastShotTick: number; bloom: number;
  reloadStartedTick: number; reloadDuration: number;
}
export interface GrowthWeaponCheckpoint {
  primary: GrowthWeaponId; secondary: GrowthWeaponId; selected: 'primary' | 'secondary';
  attachments: { primary: GrowthAttachmentId[]; secondary: GrowthAttachmentId[] };
  guns: { primary: GrowthGunState; secondary: GrowthGunState };
  shootReadyTick: number; prepareReadyTick: number; lastTick: number;
  held: boolean; requireRelease: boolean; burstRemaining: number; burstNextTick: number;
  shotSerial: number;
}
export interface GrowthShot {
  serial: number; tick: number; weaponId: GrowthWeaponId; slot: 'primary' | 'secondary';
  /** One center RNG draw per trigger emission. Fan offsets are deterministic. */
  offsetsDegrees: number[]; definition: ResolvedGrowthWeapon;
}
const validTick = (tick: number) => { if (!Number.isSafeInteger(tick) || tick < 0) throw Error('Invalid tick'); };

/** Independent growth weapon state machine. No classic catalog or GunController timing dependence. */
export class GrowthArsenalV3 {
  private state: GrowthWeaponCheckpoint;
  constructor(loadout: Pick<GrowthLoadoutV3, 'primary' | 'secondary' | 'attachments'>) {
    const fresh = (slot: 'primary' | 'secondary'): GrowthGunState => {
      const def = resolveGrowthWeapon(loadout[slot], loadout.attachments[slot]);
      return { ammo: def.magazine, reserve: def.totalAmmo - def.magazine, reloadUntil: 0,
        lastShotTick: -1000000000, bloom: 0, reloadStartedTick: 0, reloadDuration: 0 };
    };
    this.state = { primary: loadout.primary, secondary: loadout.secondary, selected: 'primary', attachments: structuredClone(loadout.attachments),
      guns: { primary: fresh('primary'), secondary: fresh('secondary') }, shootReadyTick: 0, prepareReadyTick: 0, lastTick: -1,
      held: false, requireRelease: false, burstRemaining: 0, burstNextTick: 0, shotSerial: 0 };
  }
  get selectedSlot() { return this.state.selected; }
  get selectedId() { return this.state[this.state.selected]; }
  get current() { return this.state.guns[this.state.selected]; }
  get readyTick() { return Math.max(this.state.shootReadyTick, this.state.prepareReadyTick); }
  get shotCount() { return this.state.shotSerial; }
  checkpoint(): GrowthWeaponCheckpoint { return structuredClone(this.state); }
  static restore(state: GrowthWeaponCheckpoint) {
    if (!state || !['primary','secondary'].includes(state.selected)) throw Error('Invalid weapon checkpoint');
    const arsenal = new GrowthArsenalV3({ primary: state.primary, secondary: state.secondary as GrowthLoadoutV3['secondary'], attachments: state.attachments });
    for (const slot of ['primary','secondary'] as const) {
      const gun = state.guns?.[slot], def = resolveGrowthWeapon(state[slot], state.attachments[slot]);
      if (!gun || !Number.isSafeInteger(gun.ammo) || gun.ammo < 0 || gun.ammo > def.magazine
        || !Number.isSafeInteger(gun.reserve) || gun.reserve < 0 || gun.ammo + gun.reserve > def.totalAmmo
        || !Number.isFinite(gun.bloom) || gun.bloom < 0 || !Number.isSafeInteger(gun.lastShotTick)) throw Error('Invalid gun state');
      for (const key of ['reloadUntil','reloadStartedTick','reloadDuration'] as const) validTick(gun[key]);
    }
    for (const key of ['shootReadyTick','prepareReadyTick','burstNextTick','shotSerial','burstRemaining'] as const) validTick(state[key]);
    if (!Number.isSafeInteger(state.lastTick) || state.lastTick < -1 || state.burstRemaining > 2
      || typeof state.held !== 'boolean' || typeof state.requireRelease !== 'boolean') throw Error('Invalid weapon timing');
    arsenal.state = structuredClone(state); return arsenal;
  }
  cancelReload() { this.current.reloadUntil = 0; this.current.reloadDuration = 0; }
  cancelBurst() {
    if (this.state.burstRemaining > 0) {
      const def = GROWTH_V3_WEAPONS[this.selectedId];
      this.state.shootReadyTick = Math.max(this.state.shootReadyTick, this.current.lastShotTick + def.burstGap);
      this.state.burstRemaining = 0;
    }
  }
  interrupt() { this.cancelReload(); this.cancelBurst(); }
  blockUntil(tick: number) { validTick(tick); this.state.prepareReadyTick = Math.max(this.state.prepareReadyTick, tick); }
  swap(tick: number, prepareBenefits: readonly number[] = []) {
    validTick(tick); this.interrupt(); this.state.selected = this.state.selected === 'primary' ? 'secondary' : 'primary';
    const def = resolveGrowthWeapon(this.selectedId, this.state.attachments[this.state.selected]);
    if (prepareBenefits.some(v => !Number.isFinite(v) || v <= 0)) throw Error('Invalid preparation modifier');
    this.blockUntil(tick + Math.max(1, Math.ceil(def.prepare * Math.min(1, ...prepareBenefits))));
    this.state.requireRelease = this.state.held;
  }
  reload(tick: number, benefits: readonly number[] = [], penalties: readonly number[] = []) {
    validTick(tick); const gun = this.current;
    const def = resolveGrowthWeapon(this.selectedId, this.state.attachments[this.state.selected]);
    if (gun.reloadUntil !== 0 || gun.ammo >= def.magazine || gun.reserve <= 0 || tick < this.readyTick) return false;
    this.cancelBurst();
    gun.reloadDuration = growthReloadTicks(this.selectedId, this.state.attachments[this.state.selected], gun.ammo === 0, benefits, penalties);
    gun.reloadStartedTick = tick; gun.reloadUntil = tick + gun.reloadDuration; return true;
  }
  transfer(count: number, slot: 'primary' | 'secondary' = this.state.selected) {
    if (!Number.isSafeInteger(count) || count < 0) throw Error('Invalid transfer');
    const def = resolveGrowthWeapon(this.state[slot], this.state.attachments[slot]), gun = this.state.guns[slot];
    const moved = Math.min(count, def.magazine - gun.ammo, gun.reserve); gun.ammo += moved; gun.reserve -= moved; return moved;
  }
  supply(count: number, slot: 'primary' | 'secondary' = this.state.selected) {
    if (!Number.isSafeInteger(count) || count < 0) throw Error('Invalid supply');
    const def = resolveGrowthWeapon(this.state[slot], this.state.attachments[slot]), gun = this.state.guns[slot];
    const moved = Math.min(count, def.totalAmmo - gun.ammo - gun.reserve); gun.reserve += moved; return moved;
  }
  resupply() { return this.supply(1000000, 'primary') + this.supply(1000000, 'secondary'); }
  /** Call once per authority tick, after movement/inputs and before damage resolution. */
  step(tick: number, held: boolean, conditions: Omit<WeaponConditions, 'first' | 'empty'>,
    random: () => number, spreadBenefits: readonly number[] = [], blocked = false): GrowthShot | null {
    validTick(tick);
    if (tick !== this.state.lastTick + 1) throw Error('Weapon simulation must advance exactly once per tick');
    this.state.lastTick = tick;
    for (const slot of ['primary','secondary'] as const) {
      const gun = this.state.guns[slot];
      if (gun.reloadUntil && tick >= gun.reloadUntil) {
        this.transfer(1000000, slot); gun.reloadUntil = 0; gun.reloadDuration = 0;
      }
      const def = resolveGrowthWeapon(this.state[slot], this.state.attachments[slot]);
      if (tick - gun.lastShotTick >= def.recoverWait) gun.bloom = Math.max(0, gun.bloom - def.recoverPerTick);
    }
    const edge = held && !this.state.held; this.state.held = held;
    if (!held) this.state.requireRelease = false;
    if (blocked) { this.cancelBurst(); return null; }
    const gun = this.current, slot = this.state.selected;
    if (tick < this.readyTick || gun.reloadUntil > tick || gun.ammo === 0) return null;
    const c: WeaponConditions = { ...conditions, first: tick - gun.lastShotTick >= GROWTH_V3_RULES.firstShotTicks, empty: gun.ammo === 0 };
    const def = resolveGrowthWeapon(this.selectedId, this.state.attachments[slot], c);
    const continuing = this.state.burstRemaining > 0 && tick >= this.state.burstNextTick;
    const requested = !this.state.requireRelease && (def.mode === 'auto' ? held : edge);
    if (!continuing && !requested) return null;
    if (this.state.burstRemaining > 0 && !continuing) return null;
    // Validate the RNG before mutating ammunition/timers, including non-finite hostile inputs.
    const unit = random(); if (!Number.isFinite(unit) || unit < 0 || unit >= 1) throw Error('Invalid random source');
    const center = (unit * 2 - 1) * shotSpread(def, gun.bloom, c, spreadBenefits);
    const offsetsDegrees = Array.from({ length: def.pellets }, (_, i) => center + (def.pellets === 1 ? 0 : (i / (def.pellets - 1) - .5) * def.fanDegrees));
    if (def.mode === 'burst' && !continuing) this.state.burstRemaining = Math.min(3, gun.ammo);
    gun.ammo--; gun.lastShotTick = tick;
    gun.bloom = clamp(gun.bloom + def.bloomPerShot, 0, def.bloomCap);
    if (def.mode === 'burst') {
      this.state.burstRemaining--;
      const delay = this.state.burstRemaining > 0 ? def.interval : def.burstGap;
      this.state.burstNextTick = tick + delay; this.state.shootReadyTick = tick + delay;
    } else this.state.shootReadyTick = tick + def.interval;
    this.state.shotSerial++;
    return { serial: this.state.shotSerial, tick, slot, weaponId: this.selectedId, offsetsDegrees, definition: def };
  }
}
