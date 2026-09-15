import { growthIcon } from './GrowthIcons';
import { GROWTH_V3_OPERATORS as GROWTH_CLASSES, GROWTH_V3_ABILITIES as GROWTH_ABILITIES, GROWTH_V3_ULTIMATES as GROWTH_ULTIMATES } from '../../shared/content/growth-v3/Operators';
import { GROWTH_V3_GADGETS as GROWTH_GADGETS } from '../../shared/content/growth-v3/Gadgets';
import { GROWTH_V3_PERKS as GROWTH_PERKS } from '../../shared/content/growth-v3/Perks';
import { GROWTH_V3_RULES as GROWTH_RULES } from '../../shared/content/growth-v3/Core';
import { GROWTH_V3_CARDS, GROWTH_V3_EVOLUTIONS, type GrowthUpgradeId } from '../../shared/content/growth-v3/Cards';
const GROWTH_UPGRADES = Object.fromEntries(Object.entries({ ...GROWTH_V3_CARDS, ...GROWTH_V3_EVOLUTIONS }).map(([id, def]) => [id, {
  ...def, tag: def.group === 'C' ? 'Weapon' : def.group === 'G' ? 'Utility' : 'Ability',
}])) as unknown as Record<GrowthUpgradeId, { name: string; description: string; tag: string }>;
import type { StateMessage } from '../../shared/protocol/State';
import { operatorConcept, uiArt } from './UIArt';

const categories: Record<string, string> = { Ability: '技能强化', Mobility: '机动战术', Weapon: '武器操控', Defense: '生存防御', Utility: '战地支援' };

/** Volatile HUD values never replace the interactive choice buttons. */
export class GrowthMatchView {
  private deferred = false;
  private batch = '';
  private pendingBatch = '';
  private pendingUpgrade = '';
  private overviewKey = '';
  private choiceKey = '';
  private message: StateMessage | null = null;
  constructor(private root: HTMLElement, private send: (message: object) => void) {}
  requestFailed() { this.pendingBatch = ''; this.choiceKey = ''; this.render(this.message); }
  render(message: StateMessage | null) {
    this.message = message;
    const g = message?.growthV3;
    this.root.hidden = !message || !g;
    if (!message || !g) { this.root.replaceChildren(); this.batch = ''; this.pendingBatch = ''; this.choiceKey = ''; this.overviewKey = ''; delete this.root.dataset.growthBatch; return; }
    if (!this.root.firstElementChild) this.root.innerHTML = '<div class="growth-overview"></div><div class="growth-selection"></div>';
    const batch = `${message.roomId}:${message.round}:${g.offer?.batch}`;
    if (batch !== this.batch) { this.batch = batch; this.pendingBatch = ''; this.pendingUpgrade = ''; this.deferred = false; }
    this.root.dataset.growthBatch = batch;
    const pending = this.pendingBatch === batch;
    const overviewKey = JSON.stringify([g.classId, g.level, g.xp, g.selected, g.perks, g.ultimate, Math.ceil(g.armor), g.healingDone, g.healingXp, g.gadget.charges, g.preset]);
    if (overviewKey !== this.overviewKey) {
      this.overviewKey = overviewKey;
      const overview = this.root.querySelector<HTMLElement>('.growth-overview')!;
      const expanded = overview.querySelector('details')?.open;
      const lower = GROWTH_RULES.xpThresholds[g.level - 1], upper = GROWTH_RULES.xpThresholds[g.level] ?? lower;
      const progress = g.level === 5 ? 100 : Math.max(0, Math.min(100, (g.xp - lower) / (upper - lower) * 100));
      const ult = GROWTH_ULTIMATES[GROWTH_CLASSES[g.classId].ultimate];
      overview.innerHTML = `<div class="growth-command-strip"><img class="growth-avatar" src="${operatorConcept(g.classId)}" alt=""><div class="growth-rank"><small>MATCH PROGRESSION</small><h2>${GROWTH_CLASSES[g.classId].name} · Lv.${g.level}</h2></div><div class="growth-xp"><span>${g.xp} XP${g.level < 5 ? ` / ${upper}` : ' · 普通等级已满'}</span><div class="growth-xp-track" role="progressbar" aria-label="当前等级进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(progress)}"><i style="width:${progress}%"></i></div></div><div class="growth-picks"><small>已选升级</small><strong>${g.selected.length}<span> / 4</span></strong></div><div class="growth-awakening${g.ultimate ? ' is-awakened' : ''}"><small>${g.ultimate ? 'ULTIMATE ONLINE · 已觉醒' : `第${g.ultimateTick / 1800}分钟觉醒${g.preset === 'short' ? ' · 短局实验' : ''}`}</small><strong>${growthIcon(GROWTH_CLASSES[g.classId].ultimate)}${ult.name.split(' · ').at(-1)}</strong></div></div><div class="growth-build-line"><span>当前 Build</span>${g.selected.length ? g.selected.map(id => `<span class="growth-build-chip">${GROWTH_UPGRADES[id].name.split(' · ').at(-1)}</span>`).join('') : '<span class="growth-build-empty">尚未选择局内升级</span>'}<details${expanded ? ' open' : ''}><summary>技能与构筑详情</summary><div class="growth-build-details"><p>E ${GROWTH_ABILITIES[g.abilityId].name} · ${growthIcon(g.gadgetId)} G ${GROWTH_GADGETS[g.gadgetId].name}（可用${g.gadget.charges}次，用后${GROWTH_GADGETS[g.gadgetId].cooldown / 30}秒恢复）。比赛不因选卡暂停。</p><p>职业特化：${g.perks.map(id => GROWTH_PERKS[id].name).join(' / ')} · 临时护甲 ${Math.ceil(g.armor)}</p><p>${ult.name}：${ult.description}</p></div></details></div>${g.classId === 'medic' ? `<p class="growth-healing">队友治疗 ${g.healingDone} · 治疗经验 ${g.healingXp}。自疗、环境伤害及重复刷取不计经验。</p>` : ''}`;
    }
    const choiceKey = JSON.stringify([batch, g.offer?.cards, g.rerolls, this.deferred, pending, message.result]);
    if (choiceKey === this.choiceKey) return;
    this.choiceKey = choiceKey;
    const selection = this.root.querySelector<HTMLElement>('.growth-selection')!; selection.replaceChildren();
    if (message.result) {
      const result = document.createElement('div'); result.className = 'growth-match-result';
      const self = message.state.actors.find(a => a.id === message.actorId);
      const outcome = message.result.draw ? '平局' : self ? message.result.winner === self.team ? '行动胜利' : '行动结束' : '对局结束';
      const label = document.createElement('strong'); label.textContent = outcome;
      const note = document.createElement('p'); note.textContent = '对局结束。满足参与条件后，服务器自动发放账号与职业经验；返回大厅可查看解锁并调整构筑。';
      result.append(label, note); selection.append(result); return;
    }
    if (!g.offer) return;
    const heading = document.createElement('div'); heading.className = 'growth-choice-heading';
    const title = document.createElement('div'); title.innerHTML = `<small>TACTICAL UPGRADE / ${g.selected.length + 1} OF 4</small><h3>选择你的下一步战术</h3><p>三选一 · 比赛继续进行 · 死亡期间也可选择${g.level - 1 - g.selected.length > 1 ? ` · 还有 ${g.level - 2 - g.selected.length} 次选择待处理` : ''}</p>`;
    const toggle = document.createElement('button'); toggle.dataset.growthToggle = ''; toggle.textContent = this.deferred ? '展开待选升级' : '稍后选择';
    toggle.setAttribute('aria-expanded', String(!this.deferred)); toggle.onclick = () => { this.deferred = !this.deferred; this.render(this.message); };
    heading.append(title, toggle); selection.append(heading);
    if (this.deferred) return;
    const cards = document.createElement('div'); cards.className = 'growth-cards';
    g.offer.cards.forEach((id, index) => {
      const def = GROWTH_UPGRADES[id], card = document.createElement('button'); card.dataset.upgrade = id; card.dataset.category = def.tag.toLowerCase();
      card.classList.toggle('is-submitting', pending && id === this.pendingUpgrade);
      card.innerHTML = `<div class="growth-card-art"><img src="${uiArt(`category-${def.tag.toLowerCase()}`)}" alt=""><span class="growth-card-index">0${index + 1}</span><span class="growth-card-category">${categories[def.tag]}</span></div><div class="growth-card-copy"><small>${def.name.split(' · ')[0]}</small><strong>${def.name.split(' · ').at(-1)}</strong><span>${def.description}</span></div><div class="growth-card-action">${pending ? '等待服务器确认…' : '选择此升级'}<b aria-hidden="true">↗</b></div>`;
      card.setAttribute('aria-label', `${def.name}：${def.description}，选择此升级`); card.disabled = pending;
      card.onclick = () => { this.pendingBatch = batch; this.pendingUpgrade = id; this.render(this.message); this.send({ type: 'growthChoice', roomId: message.roomId, round: message.round, batch: g.offer!.batch, upgrade: id }); }; cards.append(card);
    });
    selection.append(cards);
    const footer = document.createElement('div'); footer.className = 'growth-choice-footer';
    const reroll = document.createElement('button'); reroll.dataset.growthReroll = ''; reroll.textContent = `刷新候选（剩余${g.rerolls}次）`; reroll.disabled = pending || !g.rerolls;
    reroll.onclick = () => { this.pendingBatch = batch; this.pendingUpgrade = ''; this.render(this.message); this.send({ type: 'growthReroll', roomId: message.roomId, round: message.round, batch: g.offer!.batch }); };
    const note = document.createElement('span'); note.textContent = pending ? '等待服务器确认…' : '升级保留至本局结束 · 下一局重新构筑'; note.setAttribute('role', 'status'); footer.append(note, reroll); selection.append(footer);
  }
}
