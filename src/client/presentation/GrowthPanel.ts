import { GROWTH_RULES, GROWTH_UPGRADES, GROWTH_ULTIMATE } from '../../shared/content/GrowthCatalog';
import type { StateMessage } from '../../shared/protocol/State';

/** Keep DOM stable between snapshots, so a 15Hz update cannot steal card clicks/focus. */
export class GrowthPanel {
  private signature = '';
  private deferred = false;
  private batch = '';
  constructor(private readonly root: HTMLElement, private readonly send: (message: object) => void) {}
  render(message: StateMessage | null) {
    const g = message?.growth;
    this.root.hidden = !g;
    if (!message || !g) { this.root.replaceChildren(); this.signature = ''; this.batch = ''; return; }
    const batch = `${message.roomId}:${message.round}:${g.offer?.batch}`;
    if (batch !== this.batch) { this.batch = batch; this.deferred = false; }
    const signature = JSON.stringify([message.roomId, message.round, g, !!message.result, this.deferred]);
    if (signature === this.signature) return;
    this.signature = signature; this.root.replaceChildren();
    const title = document.createElement('h2'); title.textContent = `Assault · Lv.${g.level} · ${g.xp} XP${g.level < 5 ? ` / ${GROWTH_RULES.xpThresholds[g.level]}` : ' · 普通等级已满'}`;
    const help = document.createElement('p'); help.textContent = 'E 战斗翻滚：0.4秒移动加速50%，期间不能开火，冷却8秒。G 手雷。比赛不因选卡暂停。';
    const build = document.createElement('p'); build.textContent = `当前 Build：${g.selected.map(id => GROWTH_UPGRADES[id].name.split(' · ')[1]).join(' + ') || '基础突击兵'}`;
    const ultimate = document.createElement('p'); ultimate.textContent = `${g.ultimate ? '已觉醒' : '第12分钟觉醒'} · ${GROWTH_ULTIMATE.name}：${GROWTH_ULTIMATE.description}`;
    this.root.append(title, help, build, ultimate);
    if (message.result) { const note = document.createElement('p'); note.textContent = 'P1试玩结束。本模式暂不发放账号成长；返回大厅可尝试不同升级组合。'; this.root.append(note); return; }
    if (!g.offer) return;
    const toggle = document.createElement('button'); toggle.textContent = this.deferred ? '展开待选升级' : '稍后选择'; toggle.dataset.growthToggle = '';
    toggle.onclick = () => { this.deferred = !this.deferred; this.render(message); }; this.root.append(toggle);
    if (this.deferred) return;
    const cards = document.createElement('div'); cards.className = 'growth-cards';
    for (const id of g.offer.cards) {
      const card = document.createElement('button'), def = GROWTH_UPGRADES[id]; card.dataset.upgrade = id;
      const heading = document.createElement('strong'); heading.textContent = def.name;
      const description = document.createElement('span'); description.textContent = def.description;
      card.append(heading, description);
      card.onclick = () => this.send({ type: 'growthChoice', roomId: message.roomId, round: message.round, batch: g.offer!.batch, upgrade: id });
      cards.append(card);
    }
    const reroll = document.createElement('button'); reroll.dataset.growthReroll = ''; reroll.textContent = `刷新候选（剩余${g.rerolls}次）`; reroll.disabled = !g.rerolls;
    reroll.onclick = () => this.send({ type: 'growthReroll', roomId: message.roomId, round: message.round, batch: g.offer!.batch });
    this.root.append(cards, reroll);
  }
}
