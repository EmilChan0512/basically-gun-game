import { GROWTH_V3_RULES, clamp, healthUnits } from '../../content/growth-v3/Core';

export interface ArmorState { remaining: number; until: number; source: string | null }
export function newArmor(): ArmorState { return { remaining: 0, until: 0, source: null }; }
export function expireArmor(armor: ArmorState, tick: number) {
  if (tick >= armor.until) { armor.remaining = 0; armor.until = 0; armor.source = null; }
}
/** Amount is HP at the content boundary; the state stores only integer millihitpoints. */
export function grantArmor(armor: ArmorState, hp: number, duration: number, tick: number, source: string, requireIncrease = false) {
  if (!Number.isFinite(hp) || hp <= 0 || !Number.isSafeInteger(duration) || duration < 1 || !Number.isSafeInteger(tick) || tick < 0) throw Error('Invalid armor grant');
  expireArmor(armor, tick); const amount = healthUnits(Math.min(GROWTH_V3_RULES.armorCap, hp));
  if (amount < armor.remaining || requireIncrease && amount === armor.remaining) return false;
  if (amount > armor.remaining) { armor.remaining = amount; armor.until = tick + duration; armor.source = source; return true; }
  if (tick + duration > armor.until) { armor.until = tick + duration; armor.source = source; return true; }
  return false;
}
export interface DamageResolutionInput {
  /** Already grouped, including head/distance/type modifiers. HP, rounded once into internal mHP. */
  hp: number; tick: number; armor: ArmorState;
  environment?: boolean; spawnProtected?: boolean;
  personalReductions?: readonly number[];
  shield?: { budget: number; reduction: number; facing: boolean };
}
export function resolveIncomingDamage(input: DamageResolutionInput) {
  const { armor, tick } = input;
  if (!Number.isFinite(input.hp) || input.hp < 0 || !Number.isSafeInteger(tick) || tick < 0) throw Error('Invalid damage');
  const reductions = input.personalReductions ?? [];
  if (reductions.some(n => !Number.isFinite(n) || n < 0 || n > 1)) throw Error('Invalid reduction');
  expireArmor(armor, tick);
  const damage = healthUnits(input.hp);
  if (input.spawnProtected) return { life: 0, shield: 0, personal: 0, armor: 0 };
  if (input.environment) return { life: damage, shield: 0, personal: 0, armor: 0 };
  const shield = input.shield;
  if (shield && (!Number.isSafeInteger(shield.budget) || shield.budget < 0 || !Number.isFinite(shield.reduction) || shield.reduction < 0 || shield.reduction > .75)) throw Error('Invalid shield');
  const shieldBlocked = shield?.facing ? Math.min(damage * shield.reduction, shield.budget) : 0;
  const rate = clamp(Math.max(0, ...reductions), 0, GROWTH_V3_RULES.personalReductionCap);
  const personalBlocked = Math.min((damage - shieldBlocked) * rate, damage * GROWTH_V3_RULES.combinedReductionCap - shieldBlocked);
  const afterReduction = Math.round(damage - shieldBlocked - personalBlocked);
  // Budget and armor remain integers. Rounding is centralized here, never at each multiplier.
  const shieldUnits = Math.round(shieldBlocked);
  if (shield) shield.budget -= shieldUnits;
  const armorBlocked = Math.min(armor.remaining, afterReduction); armor.remaining -= armorBlocked;
  return { life: afterReduction - armorBlocked, shield: shieldUnits, personal: damage - shieldUnits - afterReduction, armor: armorBlocked };
}
export function radialDamage(max: number, min: number, radius: number, distance: number) {
  if (![max,min,radius,distance].every(Number.isFinite) || max < min || min < 0 || radius <= 0 || distance < 0) throw Error('Invalid radial damage');
  return distance > radius ? 0 : max - (max - min) * distance / radius;
}
