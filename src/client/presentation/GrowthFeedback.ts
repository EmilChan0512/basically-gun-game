import type { StateMessage } from '../../shared/protocol/State';
import { GROWTH_V3_CARDS, GROWTH_V3_EVOLUTIONS } from '../../shared/content/growth-v3/Cards';
import { GROWTH_V3_OPERATORS, GROWTH_V3_ULTIMATES } from '../../shared/content/growth-v3/Operators';

type Actor = StateMessage['state']['actors'][number];
export interface DamageFloat {
  target: string; x: number; y: number; life: number; armor: number; shield: number; structure: number;
  headshot: boolean; started: number; until: number;
}
/** Receipts are authority-owned; only their bounded, transient presentation lives here. */
export class GrowthFeedback {
  private scope = ''; private cursor = 0; private active = false;
  private previous?: { level: number; selected: string[]; ultimate: boolean; reload: number; cooldown: number; charges: number };
  private lastKill = -Infinity; private streak = 0;
  floats: DamageFloat[] = [];
  bars = new Map<string, { until: number; before: number; hitAt: number }>();
  marker = ''; markerUntil = 0;
  kill = ''; killUntil = 0;
  notice = ''; noticeUntil = 0;
  private noticePriority = 0;
  cues: { clip: string; rate: number; gain: number }[] = [];
  accept(message: StateMessage, now: number, generation: string, active: boolean) {
    const self = message.state.actors.find(a => a.id === message.actorId), g = message.growthV3;
    const scope = `${message.roomId}:${message.round}:${generation}`;
    this.cues = [];
    const previous = this.previous;
    const snapshot = g && self ? { level: g.level, selected: [...g.selected], ultimate: g.ultimate,
      reload: self.reload, cooldown: self.skillCooldown, charges: g.gadget.charges } : undefined;
    this.previous = snapshot;
    if (scope !== this.scope || !active || !this.active || !g || !self) {
      this.scope = scope; this.active = active;
      this.cursor = Math.max(0, ...message.events.map(e => e.id));
      this.floats = []; this.bars.clear(); this.markerUntil = this.killUntil = this.noticeUntil = 0;
      this.lastKill = -Infinity; this.streak = 0;
      return;
    }
    const visible = new Set(message.state.actors.map(a => a.id));
    for (const entity of message.state.growthWorld?.entities ?? []) visible.add(entity.id);
    this.floats = this.floats.filter(f => f.until > now && (visible.has(f.target) || f.structure > 0));
    for (const [id, bar] of this.bars) if (bar.until <= now || !visible.has(id)) this.bars.delete(id);
    for (const event of message.events) {
      if (event.id <= this.cursor || message.state.frame - event.tick < 0 || message.state.frame - event.tick > 15) continue;
      if (event.actorId === self.id && event.targetId !== self.id && event.impact && event.targetId && (visible.has(event.targetId) || event.impact.structure > 0 && event.position)) {
        const target = message.state.actors.find(a => a.id === event.targetId);
        const point = target ?? event.position;
        if (!point || target?.team === self.team) continue;
        const impact = event.impact;
        let f = this.floats.find(f => f.target === event.targetId && now - f.started < 120);
        if (!f) {
          f = { target: event.targetId, x: point.x, y: point.y - 78, life: 0, armor: 0, shield: 0, structure: 0, headshot: false, started: now, until: now + 800 };
          this.floats.push(f);
        }
        f.life += impact.life; f.armor += impact.armor; f.shield += impact.shield; f.structure += impact.structure; f.headshot ||= impact.headshot;
        if (target) this.bars.set(target.id, { until: now + 2000, before: Math.min(target.maxHealth, target.life.health + impact.life), hitAt: now });
        this.marker = impact.life > 0 ? impact.headshot ? '爆头' : '命中' : impact.armor > 0 ? '护甲' : impact.structure > 0 ? '部署物' : '格挡';
        this.markerUntil = now + 180;
      }
      if (event.kind === 'death' && event.actorId === self.id && event.targetId !== self.id) {
        this.streak = now - this.lastKill <= 3000 ? this.streak + 1 : 1; this.lastKill = now;
        const name = message.poses.find(p => p.id === event.targetId)?.name ?? '敌人';
        this.kill = `${this.streak > 1 ? `${this.streak} 连杀 · ` : ''}击杀 ${name}`; this.killUntil = now + 1500;
        this.marker = '击杀'; this.markerUntil = now + 300;
        this.cue('S_Medal', 1.65, .65);
      }
      if (event.actorId === self.id && event.kind === 'error') {
        const reason: Record<string,string> = { no_charge: '道具次数已用尽', not_ready: '尚未冷却完成', busy: '当前动作尚未结束', no_effect: '没有可生效的目标' };
        this.show(reason[event.cause ?? ''] ?? '操作未生效，请检查目标与部署位置', now);
      }
    }
    this.cursor = Math.max(this.cursor, ...message.events.map(e => e.id));
    this.floats = this.floats.slice(-24);
    if (previous && snapshot) {
      if (previous.reload > 0 && snapshot.reload === 0 && self.life.alive && self.ammo > 0) { this.show('换弹完成', now, 900, 1); this.cue('S_Equip', 1.2, .35); }
      if (previous.cooldown > 0 && snapshot.cooldown === 0 && self.life.alive) { this.show('E · 技能已就绪', now, 1200, 1); this.cue('S_Beep', 1.4, .3); }
      if (previous.charges > 0 && snapshot.charges === 0) this.show('G · 道具次数已用尽', now, 1400, 1);
      if (snapshot.level > previous.level) { this.show(`升至 Lv.${snapshot.level} · U 选择升级`, now); this.cue('S_Powerup', 1.2, .65); }
      const added = snapshot.selected.filter(id => !previous.selected.includes(id));
      if (added.length) {
        const cards = { ...GROWTH_V3_CARDS, ...GROWTH_V3_EVOLUTIONS };
        this.show(`强化已生效 · ${added.map(id => cards[id as keyof typeof cards]?.name ?? id).join('、')}`, now);
        this.cue('S_Equip', 1, .55);
      }
      if (snapshot.ultimate && !previous.ultimate) {
        const ult = GROWTH_V3_ULTIMATES[GROWTH_V3_OPERATORS[g.classId].ultimate];
        this.show(`已觉醒 · ${ult.name}：${ult.description}`, now, 3500); this.cue('S_Powerup', .8, .75);
      }
    }
  }
  private cue(clip: string, rate: number, gain: number) { this.cues.push({ clip, rate, gain }); }
  private show(text: string, now: number, duration = 2000, priority = 2) {
    if (now < this.noticeUntil && priority < this.noticePriority) return;
    this.notice = text; this.noticeUntil = now + duration; this.noticePriority = priority;
  }
  healthTrail(actor: Actor, now: number) {
    const bar = this.bars.get(actor.id);
    return bar ? actor.life.health + Math.max(0, bar.before - actor.life.health) * Math.max(0, 1 - (now - bar.hitAt) / 500) : actor.life.health;
  }
}
