import type { Actor, Battle } from '../../game/campaign/Battle';
import type { RandomSource } from '../../game/combat/Ballistics';
import { clearSight } from '../../game/campaign/Navigation';
import { GROWTH_CLASSES } from '../content/GrowthCatalog';
import { awardGrowth } from './Growth';
import { growthReserve } from './GrowthCombat';

/** Called by the authority only. Health restored and XP credit are deliberately separate. */
export function medicPulse(battle: Battle, medic: Actor, random: RandomSource) {
  const g = medic.growth!, has = (id: typeof g.selected[number]) => g.selected.includes(id);
  const radius = has('widePulse') ? 260 : 180;
  const targets = battle.actors.filter(ally => ally.team === medic.team && ally.life.alive && ally.growth
    && ally.life.health < ally.life.maxHealth && Math.hypot(ally.movement.x - medic.movement.x, ally.movement.y - medic.movement.y) <= radius
    && clearSight({ x: medic.movement.x, y: medic.movement.y - 32 }, { x: ally.movement.x, y: ally.movement.y - 32 }, battle.wall));
  if (!targets.length) return false;
  medic.skillCooldown = Math.ceil(GROWTH_CLASSES.medic.cooldown * (has('rapidAid') ? 80 : 100) * (has('mobileClinic') ? 110 : 100) / 10000);
  medic.skillFrames = GROWTH_CLASSES.medic.duration;
  if (battle.frame - g.healingWindowStart >= 900) { g.healingWindowStart = battle.frame; g.healingWindowXp = 0; }
  for (const ally of targets) {
    const state = ally.growth!, missing = ally.life.maxHealth - ally.life.health;
    const amount = 25 - (has('widePulse') ? 5 : 0) - (has('rapidAid') ? 5 : 0)
      + (has('triage') && ally.life.health < ally.life.maxHealth * .3 ? 10 : 0) + (ally === medic && has('selfCare') ? 8 : 0);
    const restored = Math.min(missing, amount), creditHealth = Math.min(restored, state.healableDamage, missing);
    state.healableDamage = Math.max(0, Math.min(state.healableDamage, missing) - restored);
    ally.life.health += restored;
    if (ally !== medic) {
      g.metrics.healingDone += Math.floor(restored);
      // Per recipient shared cooldown prevents several medics farming the same wound or death cycle.
      const xp = Math.min(20, 40 - g.healingWindowXp, Math.floor(creditHealth / 2));
      if (xp > 0 && battle.frame >= (state.cooldowns.healingCredit ?? 0)) {
        state.cooldowns.healingCredit = battle.frame + 900; g.healingWindowXp += xp;
        const states = battle.actors.flatMap(a => a.growth ? [a.growth] : []);
        const average = states.reduce((sum, s) => sum + s.level, 0) / states.length;
        const credited = Math.round(xp * (average - g.level >= 2 ? 1.1 : 1));
        awardGrowth(g, credited, random, battle.frame); g.metrics.healingXp += credited;
      }
      if (has('rescueSprint')) g.momentumUntil = battle.frame + 90;
      if (has('sharedSupplies')) growthReserve(ally, 4);
      if (has('protectiveAid')) { state.armor = Math.max(state.armor, 10); state.armorUntil = Math.max(state.armorUntil, battle.frame + 60); }
      if (g.ultimate && battle.frame >= (state.cooldowns.lifeline ?? 0)) {
        state.armor = Math.max(state.armor, 15); state.armorUntil = Math.max(state.armorUntil, battle.frame + 90); state.cooldowns.lifeline = battle.frame + 600;
      }
    }
    battle.journal.emit({ tick: battle.frame, kind: 'skill', actorId: medic.id, targetId: ally.id, ability: 'medicPulse', amount: restored });
    battle.bursts.push({ x: ally.movement.x, y: ally.movement.y - 30, frame: battle.frame, radius: 55, color: 0x66eeaa });
  }
  return true;
}
