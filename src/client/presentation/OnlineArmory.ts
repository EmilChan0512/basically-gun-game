import { MAX_LEVEL, canEquipWeapon, CLASSES, WEAPONS, ITEMS, SKILLS, SPECIAL_OFFHANDS, canEquipOffhand, levelForXp, type ClassId } from '../../game/campaign/Catalog';
import type { WeaponId } from '../../game/combat/Combat';
import { starterEquipment, type OnlineProfile } from '../../shared/content/OnlineProgress';
import type { EquipmentLoadout } from '../../shared/content/Equipment';
import { loadoutArt, operatorArt } from './LoadoutArt';

type Slot = 'primary' | 'secondary' | 'skill' | 'item';
const slots: Record<Slot, string> = { primary: '主武器', secondary: '副手', skill: '职业技能', item: '战术道具' };
const viewState = new WeakMap<HTMLElement, { slot: Slot }>();
const names = { ...WEAPONS, ...SPECIAL_OFFHANDS, ...SKILLS, ...ITEMS };
const nameOf = (id: string) => names[id as keyof typeof names].name;

export function renderOnlineLoadoutSummary(root: HTMLElement, value: EquipmentLoadout) {
  const equipment = { ...starterEquipment(value.classId), ...value };
  root.innerHTML = `<div class="loadout-brief"><img src="/assets/characters/${equipment.classId}-head.svg" alt="${CLASSES[equipment.classId].name}"><div><small>当前出战配装</small><strong>${CLASSES[equipment.classId].name}</strong><p>${Object.keys(slots).map(key => nameOf(equipment[key as Slot])).join(' · ')}</p></div><a href="#loadout" class="loadout-edit">编辑配装 →</a></div>`;
}

export function renderOnlineArmory(root: HTMLElement, value: EquipmentLoadout, profile: OnlineProfile | null, debug: boolean,
  change: (equipment: Required<EquipmentLoadout>) => void, purchase?: (kind: string, id: string) => void) {
  const ui = viewState.get(root) ?? { slot: 'primary' as Slot }; viewState.set(root, ui);
  const equipment = { ...starterEquipment(value.classId), ...value }, classId = equipment.classId;
  const definition = CLASSES[classId], xp = profile?.classes[classId].xp ?? 0, level = levelForXp(xp);
  const active = document.activeElement instanceof HTMLElement && root.contains(document.activeElement) ? document.activeElement.id : '';
  const color = '#' + definition.color.toString(16).padStart(6, '0');
  const classIds = Object.keys(CLASSES) as ClassId[];
  const saved = profile && Object.entries(equipment).every(([key, id]) => profile.classes[classId].equipment[key as keyof typeof equipment] === id) && profile.selected === classId;
  const render = () => renderOnlineArmory(root, equipment, profile, debug, change, purchase);
  const cards = (slot: Slot) => {
    const catalog = slot === 'primary' ? Object.entries(WEAPONS).filter(([id, entry]) => entry.slot === 'primary' && canEquipWeapon(classId, id as WeaponId))
      : slot === 'secondary' ? [...Object.entries(WEAPONS).filter(([, entry]) => entry.slot === 'secondary'), ...Object.entries(SPECIAL_OFFHANDS).filter(([id]) => canEquipOffhand(classId, id as keyof typeof SPECIAL_OFFHANDS))]
      : slot === 'skill' ? definition.skills.map(id => [id, SKILLS[id]] as const) : Object.entries(ITEMS);
    return catalog.sort((a, b) => a[1].level - b[1].level).map(([id, entry]) => {
      const owned = debug || slot === 'skill' || Object.hasOwn(SPECIAL_OFFHANDS, id) || (slot === 'item' ? profile?.items.includes(id as keyof typeof ITEMS) ?? id === 'medkit' : profile?.weapons.includes(id as WeaponId) ?? [starterEquipment(classId).primary, 'usp'].includes(id));
      const locked = !debug && entry.level > level, selected = equipment[slot] === id;
      const price = 'price' in entry ? entry.price : 0;
      const canBuy = !owned && !locked && !!purchase && !!profile && profile.credits >= price;
      const status = selected ? '已装备' : locked ? `Lv.${entry.level} 解锁` : owned ? '可装备' : '未拥有';
      const action = selected ? '已装备' : locked ? `职业 Lv.${entry.level} 解锁` : owned ? '装备' : !profile ? '登录后购买' : !purchase ? '返回进房前配装购买' : profile.credits < price ? `金币不足 · ${price}` : `${price} 金币 · 购买`;
      const metric = 'config' in entry ? `伤害 ${entry.config.damage}${entry.pellets > 1 ? ' × ' + entry.pellets : ''}　弹匣 ${entry.config.magazineSize}　射程 ${entry.config.rangeUnits * 10}`
        : 'cooldown' in entry ? `冷却 ${entry.cooldown / 30} 秒${entry.duration ? `　持续 ${entry.duration / 30} 秒` : ''}`
          : 'charges' in entry ? `每次出战 ${entry.charges} 份　永久许可证` : `职业 Lv.${entry.level}　免费解锁`;
      return `<article class="arsenal-card ${selected ? 'is-equipped' : ''} ${locked ? 'is-locked' : ''}" data-gear="${id}"><div class="arsenal-card-meta"><span>${status}</span><small>${slot === 'secondary' && Object.hasOwn(SPECIAL_OFFHANDS, id) ? CLASSES[classId].name + '专属' : slots[slot]}</small></div><div class="arsenal-card-art">${loadoutArt(id, entry.name)}</div><div class="arsenal-card-copy"><h3>${entry.name}</h3><p>${entry.description}</p><small>${metric}</small></div><button id="${owned || locked ? 'equip' : 'buy'}-${id}" data-${owned ? 'equip' : 'buy'}="${id}" data-slot="${slot}" ${selected || locked || !owned && !canBuy ? 'disabled' : ''} aria-pressed="${selected}">${action}${!selected && !locked && owned ? ' <span aria-hidden="true">↗</span>' : ''}</button></article>`;
    }).join('');
  };
  root.innerHTML = `<div class="visual-armory" id="online-loadout" style="--role-color:${color}">
    <div class="arsenal-title"><div><p class="arsenal-eyebrow">ARMORY / ONLINE OPERATIONS</p><h1>出战配装<span>为下一次行动做好准备。</span></h1></div><div class="arsenal-balance"><small>可用金币</small><strong>${profile?.credits ?? '—'}</strong><span>${debug ? '调试 · 全装备开放' : profile ? '联机账号独立成长' : '登录后保存成长'}</span></div></div>
    <div class="arsenal-workbench"><aside class="operator-roster" aria-label="选择职业"><p class="arsenal-section-label">01 / 作战职业</p>${classIds.map((id, index) => `<button id="class-${id}" data-class="${id}" aria-pressed="${id === classId}" class="operator-card ${id === classId ? 'is-active' : ''}"><span class="operator-number">0${index + 1}</span><img src="/assets/characters/${id}-head.svg" alt="${CLASSES[id].name}" draggable="false"><span><strong>${CLASSES[id].name}</strong><small>${debug ? '调试可用' : `Lv.${levelForXp(profile?.classes[id].xp ?? 0)}`}</small></span><span class="operator-selected" aria-hidden="true">${id === classId ? '●' : '○'}</span></button>`).join('')}</aside>
    <div class="operator-stage"><div class="operator-stage-heading"><span>OPERATOR / 0${classIds.indexOf(classId) + 1}</span><span>${debug ? 'LIVE TEST' : `LEVEL ${String(level).padStart(2, '0')}`}</span></div><div class="operator-pedestal">${operatorArt(classId, equipment)}<span class="stage-line" aria-hidden="true"></span></div><div class="operator-caption"><h2>${definition.name}</h2><p>${definition.passive}</p><div class="operator-stats"><span><small>生命</small><b>${definition.health}</b></span><span><small>瞄准</small><b>${Math.round(definition.aim * 100)}%</b></span><span><small>弹药</small><b>×${definition.ammo}</b></span></div></div></div>
    <aside class="equipped-slots" aria-label="当前装备"><p class="arsenal-section-label">02 / 当前装备</p>${(Object.entries(slots) as [Slot, string][]).map(([slot, label], index) => `<button id="slot-${slot}" data-slot-tab="${slot}" aria-pressed="${ui.slot === slot}" class="equipped-slot ${ui.slot === slot ? 'is-active' : ''}"><span><small>0${index + 1} / ${label}</small><strong>${nameOf(equipment[slot])}</strong></span>${loadoutArt(equipment[slot], nameOf(equipment[slot]))}<span class="slot-arrow" aria-hidden="true">↗</span></button>`).join('')}<div class="operator-xp"><div><span>${debug ? '无等级限制' : `职业经验 ${xp}`}</span><span>${debug ? '∞' : level < MAX_LEVEL ? `${level * 160} XP` : 'MAX'}</span></div><progress max="160" value="${debug || level >= MAX_LEVEL ? 160 : xp % 160}" aria-label="职业升级进度"></progress></div></aside></div>
    <div class="arsenal-inventory"><div class="arsenal-inventory-heading"><div><p class="arsenal-section-label">03 / 装备陈列</p><h2>${slots[ui.slot]}<small>${ui.slot === 'secondary' ? '刀仅限刺客 · 盾仅限重装兵' : ui.slot === 'skill' ? 'E 施放 · 随职业等级解锁' : ui.slot === 'item' ? 'G 使用 · 每次出战补充' : '职业专属主武器 · 按原作等级成长'}</small></h2></div><div class="arsenal-tabs" aria-label="装备分类">${Object.entries(slots).map(([slot, label]) => `<button id="tab-${slot}" data-slot-tab="${slot}" aria-pressed="${ui.slot === slot}">${label}</button>`).join('')}</div></div><div class="arsenal-grid" id="online-gear-grid">${cards(ui.slot)}</div></div>
    <footer class="arsenal-footer"><p id="loadout-save-state"><span aria-hidden="true">●</span> ${debug ? '调试切换立即生效，重置生命、弹药及技能。' : profile ? saved ? '配装已同步至联机账号。' : '正在同步配装…' : '预览配装 · 登录联机账号后可保存和购买。'}</p><a href="#lobby" class="arsenal-back">${debug ? '返回调试房间' : profile ? '完成配装 · 返回大厅' : '前往大厅登录'} <span aria-hidden="true">→</span></a></footer></div>`;
  root.querySelectorAll<HTMLButtonElement>('[data-class]').forEach(button => button.onclick = () => {
    const next = button.dataset.class as ClassId;
    change(debug ? starterEquipment(next) : profile?.classes[next].equipment ?? starterEquipment(next));
  });
  root.querySelectorAll<HTMLButtonElement>('[data-slot-tab]').forEach(button => button.onclick = () => { ui.slot = button.dataset.slotTab as Slot; render(); });
  root.querySelectorAll<HTMLButtonElement>('[data-equip]').forEach(button => button.onclick = () => change({ ...equipment, [button.dataset.slot!]: button.dataset.equip! }));
  root.querySelectorAll<HTMLButtonElement>('[data-buy]').forEach(button => button.onclick = () => { button.disabled = true; purchase?.(button.dataset.slot === 'item' ? 'item' : 'weapon', button.dataset.buy!); });
  if (active) root.querySelector<HTMLElement>(`#${active}`)?.focus({ preventScroll: true });
}
