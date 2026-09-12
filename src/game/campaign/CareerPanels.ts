import { CareerProgress } from './CareerProgress';
import { MAX_LEVEL, canEquipWeapon, CLASSES, SKILLS, WEAPONS, ITEMS, SPECIAL_OFFHANDS, canEquipOffhand, loadoutStats, type ClassId, type ItemId, type SkillId, type SpecialOffhandId } from './Catalog';
import type { WeaponId } from '../combat/Combat';

export const escapeHtml = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);

export function renderArmory(root: HTMLElement, progress: CareerProgress, onBack: () => void, onChange: () => void) {
  const render = () => {
    const c = progress.data.career, l = progress.loadout, stats = loadoutStats(l), definition = CLASSES[c.selected];
    const ownedLabel = (owned: boolean, equipped: boolean, locked: boolean, price: number) => equipped ? '已装备' : locked ? '等级未解锁' : owned ? '装备' : `${price} 军资 · 购买`;
    root.innerHTML = `<div class="armory-panel"><div class="armory-heading"><div><p class="eyebrow">职业 / 军械库 / 养成</p><h2>为下一次行动做准备。</h2></div><button id="armory-back" class="primary">返回任务</button></div><div id="career-wallet">军资 ${c.credits} · ${definition.name} Lv.${l.level} · 经验 ${progress.current.xp} / ${l.level < MAX_LEVEL ? l.level * 160 : 'MAX'}</div><div class="class-tabs">${(Object.keys(CLASSES) as ClassId[]).map(id => `<button data-class="${id}" class="${c.selected === id ? 'active' : ''}">${CLASSES[id].name}<small>Lv.${c.classes[id].loadout.level}</small></button>`).join('')}</div><div class="class-summary"><strong>生命 ${stats.health} · 瞄准 ${stats.aim.toFixed(2)} · 弹药 ×${stats.ammo.toFixed(2)}</strong><span>${definition.passive}</span></div><div class="training"><span>可用训练点：${progress.trainingPoints}</span><button data-train="vitality" ${progress.trainingPoints < 1 || l.training.vitality >= 3 ? 'disabled' : ''}>体能 ${l.training.vitality}/3 · +8生命</button><button data-train="handling" ${progress.trainingPoints < 1 || l.training.handling >= 3 ? 'disabled' : ''}>控枪 ${l.training.handling}/3 · +0.1瞄准</button></div><h3>职业技能 <small>主动按 E · 被动自动触发 · 每次装备一个</small></h3><div class="skill-grid">${definition.skills.map(id => {
      const s = SKILLS[id], equipped = id === l.skill, locked = l.level < s.level;
      return `<article class="gear-card"><strong>${s.name} <small>Lv.${s.level}</small></strong><p>${s.description} · ${s.passive ? '被动技能 · 装备后自动触发' : `主动技能 · 冷却${s.cooldown / 30}秒`}</p><button data-skill="${id}" ${equipped || locked ? 'disabled' : ''}>${equipped ? '已装备' : locked ? `职业Lv.${s.level}解锁` : '装备技能'}</button></article>`;
    }).join('')}</div><h3>枪械 <small>主武器按职业成长；副枪全职业共享</small></h3><div class="weapon-grid">${(Object.keys(WEAPONS) as WeaponId[]).filter(id => canEquipWeapon(c.selected, id)).sort((a, b) => WEAPONS[a].level - WEAPONS[b].level).map(id => {
      const w = WEAPONS[id], owned = c.weapons.includes(id), equipped = l[w.slot] === id, locked = l.level < w.level;
      return `<article class="gear-card ${equipped ? 'equipped' : ''}"><div class="weapon-art"><img src="/assets/characters/${id}.svg" alt="${w.name}" /></div><strong>${w.name} <small>Lv.${w.level} · ${w.slot === 'primary' ? '主武器' : '副武器'}</small></strong><p>${w.description}</p><span>伤害 ${w.config.damage}${w.pellets > 1 ? '×' + w.pellets : ''} · 弹匣 ${w.config.magazineSize} · 射程≈${w.config.rangeUnits * 10}</span><button data-weapon="${id}" ${equipped || locked || !owned && c.credits < w.price ? 'disabled' : ''}>${ownedLabel(owned, equipped, locked, w.price)}</button></article>`;
    }).join('')}</div><h3>特殊副手 <small>替换副枪 · Q切换 · 按职业等级免费解锁</small></h3><div class="item-grid">${(Object.keys(SPECIAL_OFFHANDS) as SpecialOffhandId[]).filter(id => canEquipOffhand(c.selected, id)).map(id => {
      const item = SPECIAL_OFFHANDS[id], equipped = l.secondary === id, locked = l.level < item.level;
      return `<article class="gear-card ${equipped ? 'equipped' : ''}"><img src="/assets/reference/${id}.png" width="112" height="68" alt="${item.name}" /><strong>${item.name} <small>Lv.${item.level}</small></strong><p>${item.description}</p><button data-offhand="${id}" ${equipped || locked ? 'disabled' : ''}>${equipped ? '已装备' : locked ? `职业Lv.${item.level}解锁` : '装备副手'}</button></article>`;
    }).join('') || '<p class="brief-tip">刀类仅限刺客，盾牌仅限重装兵；当前职业可装备上方副枪。</p>'}</div><h3>战术道具 <small>G 使用 · 许可证永久，每次出战补充2份</small></h3><div class="item-grid">${(Object.keys(ITEMS) as ItemId[]).map(id => {
      const item = ITEMS[id], owned = c.items.includes(id), equipped = l.item === id, locked = l.level < item.level;
      return `<article class="gear-card"><strong>${item.name} <small>Lv.${item.level}</small></strong><p>${item.description}</p><button data-item="${id}" ${equipped || locked || !owned && c.credits < item.price ? 'disabled' : ''}>${ownedLabel(owned, equipped, locked, item.price)}</button></article>`;
    }).join('')}</div><p class="brief-tip">完成任务与击杀可获得经验、军资；失败也有少量奖励。每个职业独立升级，每级获得1个训练点。训练点不跨职业共享。</p></div>`;
    root.querySelector<HTMLButtonElement>('#armory-back')!.onclick = onBack;
    const refresh = () => { onChange(); render(); };
    root.querySelectorAll<HTMLButtonElement>('[data-class]').forEach(b => b.onclick = () => { progress.selectClass(b.dataset.class as ClassId); refresh(); });
    root.querySelectorAll<HTMLButtonElement>('[data-train]').forEach(b => b.onclick = () => { progress.train(b.dataset.train as 'vitality' | 'handling'); refresh(); });
    root.querySelectorAll<HTMLButtonElement>('[data-skill]').forEach(b => b.onclick = () => { progress.equipSkill(b.dataset.skill as SkillId); refresh(); });
    root.querySelectorAll<HTMLButtonElement>('[data-weapon]').forEach(b => b.onclick = () => { const id = b.dataset.weapon as WeaponId; if (c.weapons.includes(id) || progress.buyWeapon(id)) progress.equipWeapon(id); refresh(); });
    root.querySelectorAll<HTMLButtonElement>('[data-item]').forEach(b => b.onclick = () => { const id = b.dataset.item as ItemId; if (c.items.includes(id) || progress.buyItem(id)) progress.equipItem(id); refresh(); });
    root.querySelectorAll<HTMLButtonElement>('[data-offhand]').forEach(b => b.onclick = () => { progress.equipOffhand(b.dataset.offhand as SpecialOffhandId); refresh(); });
  };
  render();
}
