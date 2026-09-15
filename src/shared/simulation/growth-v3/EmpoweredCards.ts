import { GROWTH_V3_ABILITIES } from '../../content/growth-v3/Operators';
import type { GrowthUpgradeId } from '../../content/growth-v3/Cards';
import type { ResolvedAbility } from './AbilityRules';

/** Current class builds use these card values; archived generic builds retain their original resolver. */
export function empowerAbility(d: ResolvedAbility, selected: readonly GrowthUpgradeId[]) {
  const has = (id: GrowthUpgradeId) => selected.includes(id);
  Object.assign(d, GROWTH_V3_ABILITIES[d.id], { empowered: true, maxCharges: 1, chargeGap: 0,
    refundPerHit: 0, refundGap: 0, refundCap: 0, pauseOnDamage: false, pauseTicks: 0 });
  switch (d.id) {
    case 'as_roll':
      if (has('as_A1')) d.transfer = 1000000;
      if (has('as_A2')) { d.cooldown = 144; d.speed = 1.8; }
      if (has('as_EV_A')) { d.maxCharges = 2; d.cooldown = 180; d.chargeGap = 15; }
      break;
    case 'as_reloadrush':
      if (has('as_B1')) d.transfer = 1000000;
      if (has('as_B2')) { d.duration = 30; d.speed = 1.6; }
      if (has('as_EV_B')) d.cooldown = 198;
      d.fireLock = d.gadgetLock = d.duration;
      break;
    case 'tk_barrier':
      if (has('tk_A1')) d.speed = 1.15;
      if (has('tk_A2')) { d.refundPerHit = 60; d.refundGap = 15; d.refundCap = 180; }
      if (has('tk_EV_A')) { d.speed = 1.2; d.reduction = .45; d.duration = 180; }
      break;
    case 'tk_shield':
      if (has('tk_B1')) d.shieldBudget = 300;
      if (has('tk_B2')) { d.cast = 0; d.recovery = 0; d.duration = 120; }
      d.fireLock = d.gadgetLock = d.duration;
      break;
    case 'sn_focus':
      if (has('sn_A1')) { d.cooldown = 216; d.duration = 120; }
      if (has('sn_A2')) { d.refundPerHit = 60; d.refundGap = 15; d.refundCap = 180; }
      if (has('sn_A3')) d.transfer = 1000000;
      if (has('sn_EV_A')) { d.duration = 180; d.stationarySpread = .15; }
      break;
    case 'sn_relocate':
      if (has('sn_B1')) { d.duration = 90; d.cooldown = 288; }
      if (has('sn_B2')) d.transfer = 1000000;
      if (has('sn_B3')) { d.noiseScale = .1; d.speed = 1.4; }
      if (has('sn_EV_B')) d.fireLock = 0;
      break;
    case 'md_pulse':
      if (has('md_C4')) d.selfHeal += 25;
      if (has('md_A1')) { d.radius = 300; d.heal += 15; d.selfHeal += 15; }
      if (has('md_A2')) d.cooldown = 252;
      if (has('md_A3')) d.speed = 1.2;
      break;
    case 'md_link':
      if (has('md_C4')) d.selfHeal += 4;
      if (has('md_B1')) { d.radius = 420; d.heal += 3; d.selfHeal += 2; }
      if (has('md_B2')) { d.pauseOnDamage = true; d.pauseTicks = 0; d.duration = 120; }
      if (has('md_B3')) d.pulseInterval = 6;
      d.fireLock = d.gadgetLock = d.duration;
      if (has('md_EV_B')) { d.fireLock = 0; d.swapLock = false; d.reloadLock = false; }
      break;
  }
}
