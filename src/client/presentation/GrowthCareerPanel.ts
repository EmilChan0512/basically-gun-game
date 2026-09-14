import { operatorConcept } from './UIArt';
import { growthAbilityDescription, growthGadgetDescription } from './GrowthDescriptions';
import { growthIcon } from './GrowthIcons';
import { growthRangeView } from './GrowthRangeView';
import { loadoutArt } from './LoadoutArt';
import { GROWTH_ACHIEVEMENTS } from '../../shared/content/GrowthRecords';
import { growthLevel, masteryLevel, growthSlots } from '../../shared/content/GrowthCareer';
import type { GrowthCareerV3 } from '../../shared/content/growth-v3/Career';
import { GROWTH_V3_STAGE, GROWTH_CLASS_IDS } from '../../shared/content/growth-v3/Core';
import { defaultGrowthLoadoutV3, validateGrowthLoadoutV3, changeGrowthAbility, type GrowthLoadoutV3 } from '../../shared/content/growth-v3/Loadout';
import { GROWTH_V3_OPERATORS, GROWTH_V3_ABILITIES, GROWTH_V3_PASSIVES, GROWTH_V3_ULTIMATES } from '../../shared/content/growth-v3/Operators';
import { GROWTH_V3_GADGETS } from '../../shared/content/growth-v3/Gadgets';
import { GROWTH_V3_WEAPONS, GROWTH_V3_SIDEARMS, growthPrimaryPool } from '../../shared/content/growth-v3/Weapons';
import { GROWTH_V3_ATTACHMENTS, growthReloadTicks, resolveGrowthWeapon, validateAttachments, type GrowthAttachmentId, type ModifierStat } from '../../shared/content/growth-v3/Attachments';
import { GROWTH_V3_PERKS, GROWTH_V3_PERK_GROUPS, type GrowthPerkId } from '../../shared/content/growth-v3/Perks';
import { GROWTH_V3_CARDS, GROWTH_V3_EVOLUTIONS, legalGrowthCards } from '../../shared/content/growth-v3/Cards';

const node = <K extends keyof HTMLElementTagNameMap>(tag: K, text = '', cls = '') => {
  const e = document.createElement(tag); e.textContent = text; if (cls) e.className = cls; return e;
};
const statNames: Record<ModifierStat, string> = { spread:'散布', bloomPerShot:'连射扩散', bloomCap:'扩散上限', recoverPerTick:'稳定恢复',
  visualKick:'视觉后坐', hitKick:'受击视觉上跳', range:'射程', prepare:'切入耗时', reload:'换弹耗时', magazine:'弹匣', totalAmmo:'携弹',
  speed:'持枪移速', fanDegrees:'霰弹扇形', noise:'枪声距离', radar:'雷达暴露时间', flash:'枪口光强' };
const slotNames = { muzzle:'枪口', barrel:'枪管', grip:'握把', stock:'枪托', ammo:'供弹', optic:'瞄具' };
const whenNames = { always:'', moving:'移动时', stationary:'静止时', first:'首发', stationaryFirst:'静止首发', movingFirst:'移动首发',
  braced:'蹲伏稳定后', focusedFirst:'稳定瞄准首发', loaded:'非空仓', empty:'空仓' };

export class GrowthCareerPanel {
  private signature = ''; private draft = defaultGrowthLoadoutV3(); private slot = 0; private pending = false; private status = '';
  private tab = 'weapons'; private smithSlot: 'primary' | 'secondary' | null = null;
  private room?: { id:string; loadout:GrowthLoadoutV3 }; private submitted = '';
  constructor(private root: HTMLElement, private send: (message: object) => void, private local = false) {}
  saved() { this.finishSave(this.local ? '离线配装已保存在本机。' : '配装已由服务器保存。'); }
  failed(message: string) { if (this.pending) this.finishSave('保存失败：' + message); }
  private valid() { try { validateGrowthLoadoutV3(this.draft, GROWTH_V3_STAGE); return true; } catch { return false; } }
  private finishSave(message: string) {
    this.pending = false; this.status = message;
    const note = this.root.querySelector('[data-growth-save-status]'); if (note) note.textContent = message;
    const save = this.root.querySelector<HTMLButtonElement>('#growth-career-save'); if (save) save.disabled = !this.valid();
  }
  render(career: GrowthCareerV3 | undefined, hidden: boolean, room?: { id:string; loadout:GrowthLoadoutV3 }) {
    this.root.hidden = hidden || !career;
    if (!career) { this.signature = ''; this.pending = false; return; }
    if (this.pending && room && this.submitted === JSON.stringify(room.loadout)) this.finishSave('本房间配装已确认，请重新准备。');
    if (hidden) return;
    const signature = JSON.stringify([career, room]); if (signature === this.signature) return;
    this.signature = signature; this.room = room; this.slot = career.selectedSlot;
    this.draft = structuredClone(room?.loadout ?? career.loadouts[this.slot]); this.draw(career);
  }
  private draw(career: GrowthCareerV3) {
    this.root.replaceChildren(); this.root.className = 'visual-armory growth-armory growth-armory-v3';
    const dirty = () => { this.status = '有未保存的修改，请保存后出战。'; this.draw(career); };
    const button = (label: string, action: () => void, active = false) => {
      const e = node('button', label); e.setAttribute('aria-pressed', String(active)); e.onclick = action; return e;
    };
    const definition = GROWTH_V3_OPERATORS[this.draft.classId], title = node('div', '', 'arsenal-title');
    title.append(node('h1', this.smithSlot ? '枪械改装台' : '四干员出战配装'), node('p', this.local ? '离线训练 · 全部战斗选项开放 · 配装仅保存在本机' : '账号 Lv.' + growthLevel(career.xp) + ' · ' + career.matches + '局 / ' + career.wins + '胜'));
    this.root.append(title);
    if (!this.smithSlot) {
      const roster = node('div', '', 'operator-roster');
      for (const id of GROWTH_CLASS_IDS) {
        const pick = button('', () => { this.draft = defaultGrowthLoadoutV3(id); dirty(); }, id === this.draft.classId);
        pick.dataset.growthClass = id; pick.className = 'operator-card' + (id === this.draft.classId ? ' is-active' : '');
        const image = node('img'); image.src = operatorConcept(id); image.alt = '';
        pick.append(image, node('strong', GROWTH_V3_OPERATORS[id].name), node('small', '熟练度 Lv.' + masteryLevel(career.mastery[id]))); roster.append(pick);
      }
      const stats = node('div', '', 'operator-stats');
      stats.append(node('span', definition.health + ' 生命'), node('span', '移速 ×' + definition.speed), node('span', GROWTH_V3_PASSIVES[definition.passive].description));
      const slots = node('div', '', 'growth-build-slots');
      for (let i = 0; i < growthSlots(career.xp); i++) {
        const pick = button('配装 ' + (i + 1), () => { this.slot = i; this.draft = structuredClone(career.loadouts[i] ?? defaultGrowthLoadoutV3()); dirty(); }, i === this.slot);
        pick.dataset.growthSlot = String(i); slots.append(pick);
      }
      const tabs = node('div', '', 'arsenal-tabs');
      for (const [id, label] of [['weapons','主副武器'],['skills','技能与专属道具'],['perks','基础 Perk'],['pool','成长池与进化'],['records','记录与称号']]) {
        const pick = button(label, () => { this.tab = id; this.draw(career); }, this.tab === id); pick.id = 'growth-tab-' + id; tabs.append(pick);
      }
      this.root.append(roster, stats, slots, tabs);
    }
    const inventory = node('div', '', 'growth-inventory'); this.root.append(inventory);
    if (this.smithSlot) {
      const slot = this.smithSlot, id = this.draft[slot], parts = this.draft.attachments[slot], resolved = resolveGrowthWeapon(id, parts), base = GROWTH_V3_WEAPONS[id];
      inventory.append(button('← 返回武器', () => { this.smithSlot = null; this.draw(career); }));
      const image = node('div', '', 'growth-weapon-card'); image.innerHTML = loadoutArt(base.artId, base.name); inventory.append(image);
      const preview = node('div'); preview.dataset.growthWeaponPreview = id;
      preview.append(node('h2', base.name + ' · ' + parts.length + '/' + (slot === 'primary' ? 3 : 1) + '件'),
        node('p', '伤害 ' + resolved.damage + ' × ' + resolved.pellets + ' · 发射间隔 ' + resolved.interval + ' tick · 弹匣 ' + base.magazine + ' → ' + resolved.magazine + ' · 备弹 ' + (resolved.totalAmmo - resolved.magazine)),
        node('p', '非空 / 空仓换弹 ' + growthReloadTicks(id, parts, false) + ' / ' + growthReloadTicks(id, parts, true) + ' tick · 切入 ' + Math.ceil(resolved.prepare) + ' tick'),
        node('p', '有效射程 ' + Math.round(resolved.falloffStart) + ' px · 最远 ' + Math.round(resolved.maxRange) + ' px · 散布 ±' + resolved.spread.toFixed(2) + '° · 持枪移速 ×' + resolved.speedScale.toFixed(2)));
      const range=button('进入实弹靶场 →',()=>{
        this.root.replaceChildren(growthRangeView(structuredClone(this.draft),slot,()=>this.draw(career)));
      });range.id='growth-open-range';
      inventory.append(preview, button('移除全部配件', () => { this.draft.attachments[slot] = []; dirty(); }),range);
      const grid = node('div', '', 'growth-weapon-grid');
      for (const [key, part] of Object.entries(GROWTH_V3_ATTACHMENTS)) {
        if (part.stage > GROWTH_V3_STAGE || !part.weapons.includes(id)) continue;
        const partId = key as GrowthAttachmentId, selected = parts.includes(partId);
        const next = selected ? parts.filter(p => p !== partId) : [...parts.filter(p => GROWTH_V3_ATTACHMENTS[p].slot !== part.slot), partId];
        const pick = button('', () => { this.draft.attachments[slot] = validateAttachments(id, next, GROWTH_V3_STAGE); dirty(); }, selected);
        pick.dataset.growthAttachment = key; pick.className = 'growth-option-card';
        pick.append(node('strong', slotNames[part.slot] + ' · ' + part.name));
        for (const m of part.modifiers) pick.append(node('small', whenNames[m.when] + statNames[m.stat] + ' ' + (m.bp > 0 ? '+' : '') + m.bp / 100 + '%'));
        try { validateAttachments(id, next, GROWTH_V3_STAGE); } catch { pick.disabled = true; pick.append(node('small', '先移除另一槽配件')); }
        grid.append(pick);
      }
      inventory.append(grid);
    } else if (this.tab === 'weapons') {
      for (const slot of ['primary','secondary'] as const) {
        inventory.append(node('h2', slot === 'primary' ? '主武器 · 最多三件改装' : '副武器 · 最多一件改装'));
        const ids = slot === 'primary' ? growthPrimaryPool(this.draft.classId, GROWTH_V3_STAGE) : GROWTH_V3_SIDEARMS.filter(id => GROWTH_V3_WEAPONS[id].stage <= GROWTH_V3_STAGE);
        const grid = node('div', '', 'growth-weapon-grid');
        for (const id of ids) {
          const gun = GROWTH_V3_WEAPONS[id];
          const pick = button('', () => { if (slot === 'primary') this.draft.primary = id; else this.draft.secondary = id as GrowthLoadoutV3['secondary']; this.draft.attachments[slot] = []; dirty(); }, this.draft[slot] === id);
          pick.className = 'growth-weapon-card'; pick.dataset.growthWeapon = id; pick.dataset.weaponSlot = slot;
          pick.innerHTML = loadoutArt(gun.artId, gun.name); pick.append(node('strong', gun.name), node('small', '伤害 ' + gun.damage + ' × ' + gun.pellets + ' · 弹匣 ' + gun.magazine + ' · 换弹 ' + (gun.reload / 30).toFixed(2) + '秒')); grid.append(pick);
        }
        const smith = button('改装 ' + GROWTH_V3_WEAPONS[this.draft[slot]].name + ' →', () => { this.smithSlot = slot; this.draw(career); });
        smith.id = slot === 'primary' ? 'growth-open-gunsmith' : 'growth-open-secondary-gunsmith'; inventory.append(grid, smith);
      }
    } else if (this.tab === 'skills') {
      inventory.append(node('h2', 'E 技能二选一'));
      for (const id of definition.abilities) {
        const e = GROWTH_V3_ABILITIES[id], pick = button('', () => { this.draft = changeGrowthAbility(this.draft, id); dirty(); }, id === this.draft.abilityId);
        pick.dataset.growthAbility = id; pick.className = 'growth-option-card';
        pick.append(node('strong', e.name), node('span', '前摇 ' + (e.cast / 30).toFixed(2) + '秒 · 持续 ' + e.duration / 30 + '秒 · 冷却 ' + e.cooldown / 30 + '秒'),
          node('small', '移动 ×' + e.speed + (e.heal ? ' · 治疗 ' + e.heal : '') + (e.transfer ? ' · 转入 ' + e.transfer + ' 发备弹' : '') + (e.reduction ? ' · 减伤 ' + e.reduction * 100 + '%' : '') + (e.spread < 1 ? ' · 散布 ×' + e.spread : '')));
        pick.append(node('small', growthAbilityDescription(id)));
        inventory.append(pick);
      }
      inventory.append(node('h2', definition.name + '专属 G · 三选一'));
      for (const id of definition.gadgets) {
        const g = GROWTH_V3_GADGETS[id], pick = button('', () => { this.draft.gadgetId = id; dirty(); }, id === this.draft.gadgetId);
        pick.dataset.growthGadget = id; pick.className = 'growth-option-card';
        const symbol=node('span');symbol.innerHTML=growthIcon(id);pick.append(symbol);
        pick.append(node('strong', g.name), node('span', '每局 ' + g.charges + '份 · 前摇 ' + (g.cast / 30).toFixed(2) + '秒' + (g.radius ? ' · 范围 ' + g.radius + 'px' : '')),
          node('small', (g.damageMax ? '对人 ' + g.damageMax + '—' + g.damageMin + '伤害；' : '') + (g.health ? g.health + '耐久；' : '') + (g.duration ? '持续 ' + g.duration / 30 + '秒；' : '') + '死亡、重连和弹药补给不补回。'),
          node('small', growthGadgetDescription(id))); inventory.append(pick);
      }
      const awakening=node('p', '', 'growth-awakening-preview');awakening.innerHTML=growthIcon(definition.ultimate);
      awakening.append(document.createTextNode('标准局第12分钟 / 短局第7分钟觉醒：' + GROWTH_V3_ULTIMATES[definition.ultimate].description));inventory.append(awakening);
    } else if (this.tab === 'perks') {
      for (const group of GROWTH_V3_PERK_GROUPS) {
        inventory.append(node('h2', { mobility:'机动', handling:'操控', survival:'生存' }[group] + ' · 四选一'));
        for (const [key, perk] of Object.entries(GROWTH_V3_PERKS)) if (perk.group === group) {
          const id = key as GrowthPerkId, pick = button(perk.name + '：' + perk.description, () => { this.draft.perks = [...this.draft.perks.filter(p => GROWTH_V3_PERKS[p].group !== group), id]; dirty(); }, this.draft.perks.includes(id));
          pick.dataset.growthOption = id; pick.className = 'growth-option-card'; inventory.append(pick);
        }
      }
    } else if (this.tab === 'pool') {
      inventory.append(node('h2', '局内成长池 ' + this.draft.pool.length + '/8'), node('p', '从当前技能路线的九张普通卡中选八张；每局四次三选一。'));
      for (const id of definition.abilities) inventory.append(button('载入 ' + GROWTH_V3_ABILITIES[id].name + ' 路线', () => { this.draft = changeGrowthAbility({ ...this.draft, pool: [] }, id); dirty(); }, this.draft.abilityId === id));
      for (const id of legalGrowthCards(this.draft.classId, this.draft.abilityId)) {
        const card = GROWTH_V3_CARDS[id], selected = this.draft.pool.includes(id);
        const pick = button((selected ? '✓ ' : '') + card.name + '：' + card.description, () => { this.draft.pool = selected ? this.draft.pool.filter(c => c !== id) : [...this.draft.pool, id]; dirty(); }, selected);
        pick.dataset.growthOption = id; pick.className = 'growth-option-card'; inventory.append(pick);
      }
      for (const evo of Object.values(GROWTH_V3_EVOLUTIONS)) if (evo.classId === this.draft.classId)
        inventory.append(node('p', evo.name + '：' + evo.description + ' · 前置 ' + evo.requires.map(id => GROWTH_V3_CARDS[id].name).join(' + ') + '，第4次选择可出现。'));
    } else {
      const titles = node('select'); titles.id = 'growth-title'; titles.setAttribute('aria-label', '成就称号');
      for (const id of ['none', ...career.achievements] as const) { const option = node('option', id === 'none' ? '不展示称号' : GROWTH_ACHIEVEMENTS[id].name); option.value = id; titles.append(option); }
      titles.value = this.draft.title; titles.onchange = () => { this.draft.title = titles.value as GrowthLoadoutV3['title']; dirty(); }; inventory.append(titles);
      inventory.append(node('p', '移动击杀 ' + career.metrics.movingKills + ' · 爆头击杀 ' + career.metrics.headshotKills + ' · 队友治疗 ' + career.metrics.healingDone));
      for (const archive of career.legacyLoadoutArchive) for (const note of archive.notices) inventory.append(node('p', '旧配装 ' + (archive.slot + 1) + '：' + note));
    }
    const footer = node('footer', '', 'arsenal-footer'), status = node('p', this.status); status.dataset.growthSaveStatus = ''; status.setAttribute('role', 'status');
    const save = button(this.room ? '应用到本房间' : '保存并设为出战配装', () => {
      const loadout = validateGrowthLoadoutV3(this.draft, GROWTH_V3_STAGE); this.pending = true; this.status = this.local ? '正在保存本机配装…' : '正在等待服务器确认…'; this.submitted = JSON.stringify(loadout);
      this.draw(career); this.send(this.room ? { type:'growthEquip', loadout } : { type:'growthSave', slot:this.slot, loadout });
    });
    save.id = 'growth-career-save'; save.disabled = this.pending || !this.valid();
    footer.append(status, node('p', 'E、G和整套配装进入对局后锁定。账号等级仅解锁配装槽；战斗选项按当前装备池开放。'), save);
    if (!this.valid()) footer.append(node('p', '请保持成长池恰好八张、每类 Perk 一项，并检查配件数量。'));
    this.root.append(footer);
  }
}
