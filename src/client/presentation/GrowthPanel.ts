import { GROWTH_PERKS, GROWTH_RULES, GROWTH_UPGRADES, GROWTH_ULTIMATES, GROWTH_CLASSES, type GrowthLoadout } from '../../shared/content/GrowthCatalog';
import type { StateMessage } from '../../shared/protocol/State';

/** Keep DOM stable between snapshots, so a 15Hz update cannot steal card clicks/focus. */
export class GrowthPanel {
  private signature = '';
  private deferred = false;
  private batch = '';
  private pendingBatch = '';
  private lastMessage: StateMessage | null = null;
  constructor(private readonly root: HTMLElement, private readonly send: (message: object) => void) {}
  requestFailed() { this.pendingBatch = ''; this.signature = ''; this.render(this.lastMessage); }
  render(message: StateMessage | null) {
    this.lastMessage = message;
    const g = message?.growth;
    this.root.hidden = !g;
    if (!message || !g) { this.root.replaceChildren(); this.signature = ''; this.batch = ''; this.pendingBatch = ''; delete this.root.dataset.growthBatch; return; }
    const batch = `${message.roomId}:${message.round}:${g.offer?.batch}`;
    if (batch !== this.batch) { this.batch = batch; this.deferred = false; this.pendingBatch = ''; }
    this.root.dataset.growthBatch = batch;
    const pending = this.pendingBatch === batch;
    const signature = JSON.stringify([message.roomId, message.round, g, !!message.result, this.deferred, pending]);
    if (signature === this.signature) return;
    this.signature = signature; this.root.replaceChildren();
    const title = document.createElement('h2'); title.textContent = `${GROWTH_CLASSES[g.classId].name} · Lv.${g.level} · ${g.xp} XP${g.level < 5 ? ` / ${GROWTH_RULES.xpThresholds[g.level]}` : ' · 普通等级已满'}`;
    const help = document.createElement('p'); help.textContent = GROWTH_CLASSES[g.classId].description + ' G 手雷。比赛不因选卡暂停。';
    const base = document.createElement('p'); base.textContent = `基础Perk：${g.perks.map(id => GROWTH_PERKS[id].name).join(' / ')} · 临时护甲 ${Math.ceil(g.armor)}`;
    const build = document.createElement('p'); build.textContent = `当前 Build：${g.selected.map(id => GROWTH_UPGRADES[id].name.split(' · ')[1]).join(' + ') || '尚未选择局内升级'}`;
    const ultimate = document.createElement('p'); ultimate.textContent = `${g.ultimate ? '已觉醒' : '第12分钟觉醒'} · ${GROWTH_ULTIMATES[g.classId].name}：${GROWTH_ULTIMATES[g.classId].description}`;
    this.root.append(title, help, base, build, ultimate);
    if (g.classId === 'medic') { const healing = document.createElement('p'); healing.textContent = `队友治疗 ${g.healingDone} · 治疗经验 ${g.healingXp}。自疗、环境伤害及重复刷取不计经验。`; this.root.append(healing); }
    if (message.result) { const note = document.createElement('p'); note.textContent = '对局结束。满足参与条件后，服务器自动发放账号与职业经验；返回大厅可查看解锁并调整构筑。'; this.root.append(note); return; }
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
      card.disabled = pending;
      card.onclick = () => { this.pendingBatch = batch; this.render(message); this.send({ type: 'growthChoice', roomId: message.roomId, round: message.round, batch: g.offer!.batch, upgrade: id }); };
      cards.append(card);
    }
    const reroll = document.createElement('button'); reroll.dataset.growthReroll = ''; reroll.textContent = `刷新候选（剩余${g.rerolls}次）`; reroll.disabled = pending || !g.rerolls;
    reroll.onclick = () => { this.pendingBatch = batch; this.render(message); this.send({ type: 'growthReroll', roomId: message.roomId, round: message.round, batch: g.offer!.batch }); };
    this.root.append(cards, reroll);
    if (pending) { const status = document.createElement('p'); status.setAttribute('role', 'status'); status.textContent = '等待服务器确认…'; this.root.append(status); }
  }
}

export function renderGrowthLoadout(root: HTMLElement, loadout: GrowthLoadout, send: (loadout: GrowthLoadout) => void) {
  const classes = document.createElement('select'); classes.id = 'growth-class'; classes.setAttribute('aria-label', '成长职业');
  for (const [id, def] of Object.entries(GROWTH_CLASSES)) { const option = document.createElement('option'); option.value = id; option.textContent = `${def.name} · HP ${def.health}`; classes.append(option); }
  classes.value = loadout.classId;
  const weapons = document.createElement('select'); weapons.id = 'growth-weapon'; weapons.setAttribute('aria-label', '成长主武器');
  for (const id of GROWTH_CLASSES[loadout.classId].weapons) { const option = document.createElement('option'); option.value = id; option.textContent = id.toUpperCase(); weapons.append(option); }
  weapons.value = loadout.primary;
  classes.onchange = () => { const classId = classes.value as GrowthLoadout['classId']; send({ classId, primary: GROWTH_CLASSES[classId].primary }); };
  weapons.onchange = () => send({ ...loadout, primary: weapons.value as GrowthLoadout['primary'] });
  const note = document.createElement('p'); note.textContent = GROWTH_CLASSES[loadout.classId].description + ' 更换配装后需重新准备。所有基础武器免费开放。';
  const guide = document.createElement('details'); guide.id = 'growth-room-guide';
  const summary = document.createElement('summary'); summary.textContent = '第一次玩成长模式：规则与职业路线'; guide.append(summary);
  const routes: Record<GrowthLoadout['classId'], string[]> = {
    assault: ['边移动边换弹：乘胜追击、移动换弹、翻滚装填、拾荒者。', '站位控枪：稳定射击、战术换弹、背水一战、手雷袋。'],
    tank: ['推进吸引火力：移动掩护、应急装甲、战地回收、掩护换弹。', '蹲守据点：稳固支撑、防爆衬垫、阵地修复、压制握持。'],
    sniper: ['守线精准射击：稳定瞄准、首发精准、精准循环、计划换弹。', '击杀后转移：转移阵地、快速专注、副手应战、机动换弹。'],
    medic: ['贴近队友救援：紧急分诊、广域救援、救援奔袭、救援弹药。', '机动自保：快速急救、随队自保、稳健持枪、救援整备。'],
  };
  for (const text of [
    '击杀、助攻和据点贡献获得局内经验；Medic 实际治疗队友也可获得有限经验。Lv.1→Lv.5 共四次三选一，每局可刷新一次。',
    '选卡不暂停战斗，可以稍后选择，也可以死亡时选。多个升级依次处理；提交后等待服务器确认。死亡保留成长，下一局全部重置。',
    '第12分钟自动开放职业 Ultimate，不占四次选卡；15分钟结算。单人可对战机器人，多人开局由真人席位组队。',
    '在房间外展开“成长配装与解锁”，设置3个基础 Perk 和8张成长池。账号/职业熟练度只解锁替代选择与配装槽；同一配装不会因账号等级增加伤害或生命。',
    ...routes[loadout.classId],
    '这些路线用于比较打法，不保证每局都能抽齐。结合当局候选、武器和战况选择。',
  ]) { const line = document.createElement('p'); line.textContent = text; guide.append(line); }
  root.append(classes, weapons, note, guide);
}
