import { describe, expect, it } from 'vitest';
import { applyDamage, GunController, respawn, USP, type Combatant } from '../../src/game/combat/Combat';
describe('Phase 2 gun loop', () => { const target = (): Combatant => ({ id: 'bot', health: 30, maxHealth: 30, alive: true, respawnAtMs: null });
 it('fires USP with ammo and cooldown', () => { const gun = new GunController(); const bot = target(); expect(gun.fire('p1', bot, 0)?.amount).toBe(15); expect(gun.ammo).toBe(11); expect(gun.fire('p1', bot, 1)).toBeNull(); gun.tick(250); expect(gun.fire('p1', bot, 250)?.amount).toBe(15); });
 it('kills and respawns through DamageEvent', () => { const bot = target(); const gun = new GunController(); const e = gun.fire('p1', bot, 0)!; expect(applyDamage(bot, e)).toBe(false); gun.tick(250); const e2 = gun.fire('p1', bot, 250)!; expect(applyDamage(bot, e2)).toBe(true); expect(bot.alive).toBe(false); expect(respawn(bot, 5249)).toBe(false); expect(respawn(bot, 5250)).toBe(true); });
 it('matches extracted USP facts', () => { expect(USP.damage).toBe(15); expect(USP.magazineSize).toBe(12); expect(USP.automatic).toBe(false); }); });
