import type { SimulationEvent } from '../../shared/simulation/Events';
import { WEAPONS } from '../../game/campaign/Catalog';
import type { OffhandView } from '../../shared/simulation/Offhand';

export interface FeedbackActor {
  id: string; team: number; x: number; y: number; maxHealth: number; weapon: string; ammo: number; reserve: number; reload: number;
  life: { alive: boolean; health: number; respawnFrames: number; regenDelay: number };
  offhand?: OffhandView; deathInfo?: { sourceName: string; cause: string };
  growthV3?: { magazine: number; healing: boolean };
}
export function ammoWarning(actor: FeedbackActor) {
  if (!actor.life.alive || actor.offhand?.equipped && actor.offhand.kind !== 'firearm') return '';
  if (actor.reserve === 0) return 'NO RESERVE AMMO · 无备用弹药';
  if (actor.reload) return '';
  const size = actor.growthV3?.magazine ?? WEAPONS[actor.weapon as keyof typeof WEAPONS]?.config.magazineSize ?? 1;
  return actor.ammo / size < .25 ? 'LOW MAGAZINE · 弹匣不足 25% · R 换弹' : '';
}

/** Presentation state only. Server ticks own life and respawn; hit effects never stack. */
export class CombatFeedback {
  private actionError = ''; private actionErrorUntil = -1;
  private scope = ''; private cursor = 0; private tick = 0;
  private hitUntil = -1; private suppressedUntil = -1; private deathTick = -1;
  private wasAlive = true; private hits = new Map<string, { until: number; direction: number }>();
  direction?: number; dead = false; frozen = false; canObserve = false; seconds = 0;
  stage = ''; ammo = ''; killer = ''; cause = ''; observing = 0; noRevive = false;
  get hitStrength() { return Math.max(0, Math.min(1, (this.hitUntil - this.tick) / 8)); }
  get punch() { return this.hitStrength * 9; }
  reset() { this.actionError = ''; this.actionErrorUntil = -1; this.scope = ''; this.cursor = 0; this.hitUntil = this.suppressedUntil = this.deathTick = -1; this.wasAlive = true; this.hits.clear(); this.observing = 0; this.canObserve = false; }
  accept(scope: string, tick: number, events: SimulationEvent[], self?: FeedbackActor, noRevive = false) {
    const newScope = this.scope !== scope;
    if (newScope) { this.reset(); this.scope = scope; this.cursor = Math.max(0, ...events.map(e => e.id)); }
    this.tick = tick;
    for (const [id, hit] of this.hits) if (hit.until <= tick) this.hits.delete(id);
    for (const event of events) if (event.id > this.cursor && tick - event.tick >= 0 && tick - event.tick <= 8) {
      if (event.kind === 'error' && event.actorId === self?.id) {
        const messages: Record<string,string> = {
          no_charge:'次数已用尽',busy:'当前动作尚未结束',not_ready:'尚未冷却完成',
          beacon_placement:'信标需要附近地面，请离开出生区、据点或墙边再部署',
          invalid_target:'目标或部署位置无效',existing_deployable:'已有部署物，请等待其消失',
          no_effect:'当前没有可生效的目标',not_owner_class:'该装备不属于当前干员',room_locked:'本局配装已锁定',
        };
        this.actionError = messages[event.cause ?? ''] ?? '操作未生效';
        this.actionErrorUntil = event.tick + 60;
      }
      if (event.kind === 'damage' && event.targetId) {
        this.hits.set(event.targetId, { until: event.tick + 8, direction: event.direction ?? 0 });
        if (event.targetId === self?.id) { this.hitUntil = event.tick + 8; this.suppressedUntil = event.tick + 36; this.direction = event.direction; }
      }
    }
    this.cursor = Math.max(this.cursor, ...events.map(e => e.id));
    this.dead = !!self && !self.life.alive; this.noRevive = noRevive;
    if (this.dead && this.wasAlive) {
      // Recover elapsed death time on reconnect without replaying the freeze.
      this.deathTick = tick - (newScope ? Math.max(0, 150 - self!.life.respawnFrames) : 0);
      this.killer = self?.deathInfo?.sourceName ?? '未知来源'; this.cause = self?.deathInfo?.cause ?? '战斗伤害';
      this.observing = 0;
    }
    if (!this.dead) { this.deathTick = -1; this.observing = 0; }
    this.wasAlive = !this.dead;
    this.frozen = this.dead && tick - this.deathTick < 9;
    const couldObserve = this.canObserve;
    this.canObserve = this.dead && tick - this.deathTick >= 60;
    if (this.canObserve && !couldObserve) this.observing = 1;
    this.seconds = self ? Math.min(5, Math.max(0, Math.ceil(self.life.respawnFrames / 30))) : 0;
    this.ammo = self ? ammoWarning(self) : '';
    this.stage = !self || this.dead ? '' : tick < this.suppressedUntil ? '受压 · 寻找掩体'
      : self.growthV3 ? self.growthV3.healing ? '治疗生效 · 保持掩护' : self.life.health / self.maxHealth <= .3 ? '危险 · 寻求医疗支援' : '状态正常'
      : self.life.health / self.maxHealth <= .3 && self.life.regenDelay > 0 ? '危险 · 生命低于 30%'
      : self.life.health < self.maxHealth && self.life.regenDelay === 0 ? '恢复中 · 保持掩护'
      : self.life.health / self.maxHealth <= .3 ? '危险 · 寻找补给' : '状态正常';
    if (self && !this.dead && tick < this.actionErrorUntil) this.stage = this.actionError;
  }
  flinch(id: string) {
    const hit = this.hits.get(id); if (!hit) return 0;
    return -Math.sign(Math.cos(hit.direction * Math.PI / 180) || 1) * Math.max(0, (hit.until - this.tick) / 8);
  }
  cycle() { if (this.canObserve) this.observing++; }
  follow<T extends { id: string; team: number; life: { alive: boolean } }>(self: T, actors: T[]) {
    if (!this.canObserve || !this.observing) return self;
    const allies = actors.filter(a => a.id !== self.id && a.team === self.team && a.life.alive);
    return allies[(this.observing - 1) % (allies.length + 1)] ?? self;
  }
}
