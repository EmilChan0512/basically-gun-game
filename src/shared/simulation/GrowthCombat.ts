import type { Actor } from '../../game/campaign/Battle';
import { GROWTH_CLASSES } from '../content/GrowthCatalog';

export function growthSpeed(actor: Actor, tick: number) {
  const g = actor.growth!;
  const active = actor.skillFrames ? g.classId === 'assault' ? 1.5 : g.classId === 'tank' ? g.selected.includes('mobileCover') ? .95 : .75 : g.classId === 'medic' ? g.selected.includes('mobileClinic') ? 1 : .9 : .8 : 1;
  const momentum = g.selected.includes('killingSpree') ? Math.min(1.35, 1.2 + g.killStreak * .05) : g.selected.includes('momentumII') ? 1.25 : 1.2;
  return GROWTH_CLASSES[g.classId].speed * (g.attachment === 'heavy' ? .95 : g.attachment === 'short' ? 1.05 : 1) * Math.max(active, g.momentumUntil > tick ? momentum : 0,
    g.selected.includes('evasiveReload') && actor.arsenal.gun.reloadFrames > 0 ? 1.15 : 0);
}
export function growthSpread(actor: Actor, tick = Infinity) {
  const g = actor.growth!, m = actor.movement, has = (id: typeof g.selected[number]) => g.selected.includes(id);
  return Math.min(
    g.perks.includes('steadyLanding') && g.landingUntil > tick ? .8 : 1,
    actor.skillFrames && g.classId === 'sniper' ? .35 : 1,
    actor.skillFrames && has('clinicalGrip') ? .7 : 1,
    has('controlledBurst') && m.crouching && m.vx === 0 ? .65 : 1,
    has('lastStand') && actor.life.health < actor.life.maxHealth * .25 ? .6 : 1,
    has('suppressiveGrip') && m.vx === 0 && !m.jumping ? .65 : 1,
    has('steadyAim') && g.stationaryTicks >= 30 ? .6 : 1,
    has('firstShot') && actor.arsenal.gun.ammo === actor.arsenal.gun.weapon.magazineSize ? .5 : 1,
    has('sidearmReady') && actor.arsenal.selected === 'usp' && m.vx !== 0 ? .65 : 1);
}
export function growthReloadScale(actor: Actor) {
  const g = actor.growth!, gun = actor.arsenal.gun;
  return Math.min(g.selected.includes('tacticalReload') && gun.ammo > 0 ? .8 : 1,
    g.selected.includes('aidReload') && actor.skillFrames > 0 ? .75 : 1,
    g.selected.includes('guardReload') && actor.movement.crouching ? .8 : 1,
    g.selected.includes('measuredReload') && gun.ammo > 0 && gun.ammo < gun.weapon.magazineSize / 2 ? .75 : 1) * (g.perks.includes('cautiousReload') ? 1.1 : 1);
}
export function growthReserve(actor: Actor, amount: number) {
  const gun = actor.arsenal.gun;
  const max = Math.ceil(gun.weapon.magazineSize * (gun.weapon.spareMagazines + 1) * actor.arsenal.ammoMultiplier) - gun.weapon.magazineSize;
  gun.reserveAmmo = Math.min(max, gun.reserveAmmo + amount);
}
/** Called only for real, unprotected hostile hits. Environment bypasses this. */
export function growthIncoming(actor: Actor, amount: number, explosive: boolean, tick: number) {
  const g = actor.growth!;
  if (amount <= 0) return amount;
  if (g.classId === 'tank' && actor.skillFrames) amount *= .65;
  if (g.perks.includes('cautiousReload') && actor.arsenal.gun.reloadFrames > 0) amount *= .9;
  if (actor.skillFrames && g.selected.includes('coolant') && tick >= (g.cooldowns.coolant ?? 0)) { actor.skillCooldown = Math.max(0, actor.skillCooldown - 30); g.cooldowns.coolant = tick + 30; }
  if (g.selected.includes('brace') && actor.movement.crouching && actor.movement.vx === 0) amount *= .85;
  if (g.selected.includes('blastPadding') && explosive && !actor.movement.jumping) amount *= .7;
  const plate = (id: string, enabled: boolean, threshold: number, armor: number, duration: number) => {
    if (!enabled || actor.life.health >= actor.life.maxHealth * threshold || tick < (g.cooldowns[id] ?? 0)) return;
    g.cooldowns[id] = tick + 600; g.armor = Math.max(g.armor, armor); g.armorUntil = Math.max(g.armorUntil, tick + duration);
  };
  if (tick >= g.armorUntil) g.armor = 0;
  plate('emergencyPlate', g.selected.includes('emergencyPlate'), .25, 15, 90);
  plate('juggernaut', g.classId === 'tank' && g.ultimate, .3, 25, 150);
  const absorbed = Math.min(g.armor, amount); g.armor -= absorbed;
  return amount - absorbed;
}
