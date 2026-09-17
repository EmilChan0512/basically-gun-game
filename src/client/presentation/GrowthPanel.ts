import { GROWTH_CLASSES, type GrowthLoadout } from '../../shared/content/GrowthCatalog';
export { GrowthMatchView as GrowthPanel } from './GrowthMatchView';

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
  root.append(classes, weapons, note);
  renderGrowthGuide(root, loadout);
}

export function renderGrowthGuide(root: HTMLElement, loadout: GrowthLoadout) {
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
    '第12分钟自动开放职业 Ultimate，不占四次选卡；15分钟结算。单人可对战机器人，多人可由房主添加机器人补齐4v4。',
    '在“出战配装”的成长对战页设置3个基础 Perk 和8张成长池。账号/职业熟练度只解锁替代选择与配装槽；同一配装不会因账号等级增加伤害或生命。',
    ...routes[loadout.classId],
    '这些路线用于比较打法，不保证每局都能抽齐。结合当局候选、武器和战况选择。',
  ]) { const line = document.createElement('p'); line.textContent = text; guide.append(line); }
  root.append(guide);
}
