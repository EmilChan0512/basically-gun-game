import { CLASSES, WEAPONS, ITEMS, SKILLS, SPECIAL_OFFHANDS, canEquipOffhand, levelForXp, type ClassId } from '../../game/campaign/Catalog';
import { starterEquipment, type OnlineProfile } from '../../shared/content/OnlineProgress';
import type { EquipmentLoadout } from '../../shared/content/Equipment';

export function renderOnlineArmory(root: HTMLElement, value: EquipmentLoadout, profile: OnlineProfile | null, debug: boolean,
  change: (equipment: Required<EquipmentLoadout>) => void, purchase?: (kind: string, id: string) => void) {
  root.replaceChildren();
  const equipment = { ...starterEquipment(value.classId), ...value }, classId = equipment.classId;
  const level = profile ? levelForXp(profile.classes[classId].xp) : 1;
  const note = document.createElement('p');
  note.textContent = debug ? '调试配装：全部开放，切换立即生效并重置生命、弹药和技能。调试不获得金币或经验。'
    : `${CLASSES[classId].name} Lv.${level} · ${profile?.classes[classId].xp ?? 0} XP · 刀仅限刺客，盾仅限重装兵；技能与刀盾随职业等级解锁。`;
  root.append(note);
  const controls = document.createElement('div'); controls.id = 'online-loadout'; controls.className = 'loadout'; root.append(controls);
  const selects = {} as Record<keyof Required<EquipmentLoadout>, HTMLSelectElement>;
  const make = (key: keyof Required<EquipmentLoadout>, id: string, labelText: string) => {
    const label = document.createElement('label'); label.textContent = labelText;
    const select = document.createElement('select'); select.id = id; select.setAttribute('aria-label', labelText);
    label.append(select); controls.append(label); selects[key] = select; return select;
  };
  const option = (select: HTMLSelectElement, id: string, name: string, required = 1, owned = true) => {
    const element = document.createElement('option'); element.value = id;
    element.disabled = !debug && (required > level || !owned);
    element.textContent = name + (debug ? '' : required > level ? `（Lv.${required}解锁）` : !owned ? '（需购买）' : ''); select.append(element);
  };
  const role = make('classId', 'online-class', '职业');
  for (const [id, entry] of Object.entries(CLASSES)) option(role, id, entry.name);
  const primary = make('primary', 'online-primary', '主武器'), secondary = make('secondary', 'online-secondary', '副手');
  for (const [id, entry] of Object.entries(WEAPONS)) option(entry.slot === 'primary' ? primary : secondary, id, entry.name, entry.level, profile ? profile.weapons.includes(id as keyof typeof WEAPONS) : ['m4', 'usp'].includes(id));
  for (const [id, entry] of Object.entries(SPECIAL_OFFHANDS)) if (canEquipOffhand(classId, id as keyof typeof SPECIAL_OFFHANDS)) option(secondary, id, entry.name, entry.level);
  const skill = make('skill', 'online-skill', '技能');
  for (const id of CLASSES[classId].skills) option(skill, id, SKILLS[id].name, SKILLS[id].level);
  const item = make('item', 'online-item', '战术道具');
  for (const [id, entry] of Object.entries(ITEMS)) option(item, id, entry.name, entry.level, profile ? profile.items.includes(id as keyof typeof ITEMS) : id === 'medkit');
  for (const key of Object.keys(selects) as (keyof typeof selects)[]) {
    selects[key].value = equipment[key];
    selects[key].onchange = () => {
      if (key === 'classId') {
        const nextClass = role.value as ClassId;
        change(debug ? { ...equipment, classId: nextClass, secondary: 'usp', skill: CLASSES[nextClass].skills[0] }
          : profile?.classes[nextClass].equipment ?? starterEquipment(nextClass));
      } else change(Object.fromEntries(Object.entries(selects).map(([key, select]) => [key, select.value])) as Required<EquipmentLoadout>);
    };
  }
  if (purchase && profile && !debug) {
    const shop = document.createElement('details'); shop.id = 'online-shop';
    const title = document.createElement('summary'); title.textContent = '军械库 · 购买装备'; shop.append(title);
    for (const [kind, catalog, owned] of [['weapon', WEAPONS, profile.weapons], ['item', ITEMS, profile.items]] as const) {
      for (const [id, entry] of Object.entries(catalog)) {
        const button = document.createElement('button'); button.id = `buy-${id}`;
        const purchased = (owned as readonly string[]).includes(id);
        button.textContent = `${entry.name} · ${purchased ? '已拥有' : `${entry.price}金币 · Lv.${entry.level}`}`;
        button.disabled = purchased || entry.level > level || profile.credits < entry.price;
        button.onclick = () => { button.disabled = true; purchase(kind, id); }; shop.append(button);
      }
    }
    root.append(shop);
  }
}
