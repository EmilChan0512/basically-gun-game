import { gunsmith } from './Gunsmith';
import { GROWTH_ATTACHMENTS, GROWTH_ACHIEVEMENTS, GROWTH_TRAITS, type GrowthAchievement } from '../../shared/content/GrowthRecords';
import { uiArt, operatorConcept } from './UIArt';
import { loadoutArt } from './LoadoutArt';
import { renderGrowthGuide } from './GrowthPanel';
import { GROWTH_ULTIMATES, GROWTH_WEAPONS } from '../../shared/content/GrowthCatalog';
import { GROWTH_CLASSES, GROWTH_PERKS, GROWTH_UPGRADES, GROWTH_ALTERNATIVES, defaultGrowthLoadout, validateGrowthLoadout,
  type GrowthClassId, type GrowthLoadout, type GrowthPerkId, type GrowthUpgradeId } from '../../shared/content/GrowthCatalog';
import { growthLevel, masteryLevel, growthSlots, unlockedGrowthPerks, unlockedGrowthPool, type GrowthCareer } from '../../shared/content/GrowthCareer';

export class GrowthCareerPanel {
  private signature = '';
  private draft: GrowthLoadout = defaultGrowthLoadout();
  private slot = 0;
  private pending = false;
  private status = '';
  private tab = 'weapons';
  private smithOpen = false;
  private room: { id: string; loadout: GrowthLoadout } | undefined;
  private submitted = '';
  constructor(private root: HTMLElement, private send: (message: object) => void) {}
  saved() { this.finishSave('配装已由服务器保存。'); }
  failed(message: string) { if (this.pending) this.finishSave(`保存失败：${message}`); }
  private finishSave(message: string) {
    this.pending = false; this.status = message;
    const note = this.root.querySelector('[data-growth-save-status]'); if (note) note.textContent = message;
    const button = this.root.querySelector<HTMLButtonElement>('#growth-career-save');
    if (button) button.disabled = this.draft.perks!.length !== 3 || this.draft.pool!.length !== 8;
  }
  render(career: GrowthCareer | undefined, hidden: boolean, room?: { id: string; loadout: GrowthLoadout }) {
    this.root.hidden = !career || hidden;
    if (!career) { this.signature = ''; this.pending = false; this.status = ''; return; }
    if (room && this.pending && this.submitted === JSON.stringify(validateGrowthLoadout(room.loadout))) this.finishSave('本房间配装已确认，请重新准备。');
    if (hidden) return;
    const signature = JSON.stringify([career, room]);
    if (this.signature === signature) return;
    if (this.room?.id !== room?.id) { this.status = ''; this.pending = false; }
    this.room = room;
    this.signature = signature; this.slot = career.selectedSlot; this.draft = structuredClone(room?.loadout ?? career.loadouts[this.slot]);
    this.draw(career);
  }
  private draw(career: GrowthCareer) {
    this.root.replaceChildren();
    this.root.className = 'visual-armory growth-armory';
    if (this.smithOpen) {
      this.root.append(gunsmith(this.draft, career.weaponXp[this.draft.primary] ?? 0, id => {
        this.draft.attachment = id; this.status = '枪械改装已写入草稿，请保存后出战。'; this.smithOpen = false; this.draw(career);
      }, () => { this.smithOpen = false; this.draw(career); }));
      return;
    }
    const title = document.createElement('h1'); title.textContent = '出战配装';
    const summary = document.createElement('p'); summary.textContent = `${career.matches}局 / ${career.wins}胜 · ${Object.entries(career.mastery).map(([id, xp]) => `${GROWTH_CLASSES[id as GrowthClassId].name}熟练度 Lv.${masteryLevel(xp)}`).join(' · ')}。等级解锁选择，不增加基础伤害或生命。`;
    const slots = document.createElement('div');
    slots.className = 'growth-build-slots';
    for (let i = 0; i < growthSlots(career.xp); i++) {
      const button = document.createElement('button'); button.textContent = `配装 ${i + 1}${i === this.slot ? ' ✓' : ''}`; button.dataset.growthSlot = String(i);
      button.onclick = () => { this.slot = i; this.draft = structuredClone(career.loadouts[i] ?? defaultGrowthLoadout()); this.status = '已载入配装，请确认后应用。'; this.draw(career); }; slots.append(button);
    }
    const classes = document.createElement('select'); classes.id = 'career-growth-class'; classes.setAttribute('aria-label', '成长构筑职业');
    for (const [id, def] of Object.entries(GROWTH_CLASSES)) { const option = document.createElement('option'); option.value = id; option.textContent = def.name; classes.append(option); }
    classes.value = this.draft.classId;
    classes.onchange = () => { this.draft = defaultGrowthLoadout(classes.value as GrowthClassId); this.status = '有未保存的修改，请保存后出战。'; this.draw(career); };
    const weapons = document.createElement('select'); weapons.id = 'career-growth-weapon'; weapons.setAttribute('aria-label', '成长构筑主武器');
    for (const id of GROWTH_CLASSES[this.draft.classId].weapons) { const option = document.createElement('option'); option.value = id; option.textContent = id.toUpperCase(); weapons.append(option); }
    weapons.value = this.draft.primary; weapons.onchange = () => { this.draft.primary = weapons.value as GrowthLoadout['primary']; this.draft.attachment = 'none'; this.status = '有未保存的修改，请保存后出战。'; this.draw(career); };
    const weaponXp = career.weaponXp[this.draft.primary] ?? 0;
    const mastery = document.createElement('p'); mastery.textContent = `${this.draft.primary.toUpperCase()}熟练度 ${weaponXp} XP；配件不提高单发基础伤害。`;
    const titleSelect = document.createElement('select'); titleSelect.id = 'growth-title'; titleSelect.setAttribute('aria-label', '成就称号');
    for (const id of ['none', ...career.achievements] as const) { const option = document.createElement('option'); option.value = id; option.textContent = id === 'none' ? '不展示称号' : GROWTH_ACHIEVEMENTS[id].name; titleSelect.append(option); }
    titleSelect.value = this.draft.title ?? 'none'; titleSelect.onchange = () => { this.draft.title = titleSelect.value as GrowthAchievement | 'none'; };
    const evolution = document.createElement('label'), evolve = document.createElement('input'); evolve.type = 'checkbox'; evolve.id = 'growth-evolutions'; evolve.checked = this.draft.evolutions ?? false; evolve.disabled = masteryLevel(career.mastery[this.draft.classId]) < 5 || this.draft.classId !== 'assault';
    evolve.onchange = () => { this.draft.evolutions = evolve.checked; }; evolution.append(evolve, document.createTextNode(' 开启追击进化路线：职业熟练度Lv.5，乘胜追击 → 强化追击 → 连杀奔袭，仍占四次选卡。'));
    const records = document.createElement('p'); records.textContent = `行为特质：${career.traits.map(id => GROWTH_TRAITS[id].name).join(' / ') || '继续探索不同打法'} · 移动击杀 ${career.metrics.movingKills} · 残血击杀 ${career.metrics.lowHealthKills} · 爆头击杀 ${career.metrics.headshotKills} · 武器切换 ${career.metrics.switches}`;
    const achievements = document.createElement('details'), achievementHeading = document.createElement('summary'); achievementHeading.textContent = '行为成就与特质条件'; achievements.append(achievementHeading);
    for (const [id, def] of Object.entries(GROWTH_ACHIEVEMENTS)) { const line = document.createElement('p'); line.textContent = `${career.achievements.includes(id as GrowthAchievement) ? '✓' : '○'} ${def.name}：${def.description}`; achievements.append(line); }
    for (const def of Object.values(GROWTH_TRAITS)) { const line = document.createElement('p'); line.textContent = `${def.name}：${def.description}`; achievements.append(line); }
    const perks = document.createElement('fieldset'), pool = document.createElement('fieldset');
    const legend = (element: HTMLElement, text: string) => { const legend = document.createElement('legend'); legend.textContent = text; element.append(legend); };
    legend(perks, `基础 Perk（${this.draft.perks?.length ?? 0}/3）`); legend(pool, `局内成长池（${this.draft.pool?.length ?? 0}/8）`);
    const availablePerks = unlockedGrowthPerks(career), availablePool = unlockedGrowthPool(career, this.draft.classId);
    const choice = (root: HTMLElement, id: string, title: string, description: string, checked: boolean, enabled: boolean, change: (checked: boolean) => void) => {
      const label = document.createElement('label'); label.className = `growth-option-card${checked ? ' is-equipped' : ''}${enabled ? '' : ' is-locked'}`;
      const art = document.createElement('img'); art.src = uiArt(`category-${id in GROWTH_UPGRADES ? GROWTH_UPGRADES[id as GrowthUpgradeId].tag.toLowerCase() : 'utility'}`); art.alt = ''; art.loading = 'lazy'; label.append(art);
      const input = document.createElement('input'); input.type = 'checkbox'; input.checked = checked; input.disabled = !enabled; input.dataset.growthOption = id;
      input.onchange = () => { this.status = '有未保存的修改，请保存后出战。'; change(input.checked); };
      const copy = document.createElement('span'), name = document.createElement('strong'), detail = document.createElement('small'); name.textContent = `${title}${enabled ? '' : '（尚未解锁）'}`; detail.textContent = description; copy.append(name, detail);
      label.append(input, copy); root.append(label);
    };
    for (const [id, def] of Object.entries(GROWTH_PERKS)) choice(perks, id, def.name, def.description,
      this.draft.perks!.includes(id as GrowthPerkId), availablePerks.includes(id as GrowthPerkId), checked => {
        this.draft.perks = checked ? [...this.draft.perks!, id as GrowthPerkId] : this.draft.perks!.filter(v => v !== id); this.draw(career);
      });
    const allPool = [...new Set([...availablePool, ...GROWTH_ALTERNATIVES[this.draft.classId]])];
    for (const id of allPool) choice(pool, id, GROWTH_UPGRADES[id].name, GROWTH_UPGRADES[id].description,
      this.draft.pool!.includes(id), availablePool.includes(id), checked => {
        this.draft.pool = checked ? [...this.draft.pool!, id as GrowthUpgradeId] : this.draft.pool!.filter(v => v !== id); this.draw(career);
      });
    const save = document.createElement('button'); save.id = 'growth-career-save'; save.textContent = this.room ? '应用到本房间' : '保存并设为出战配装';
    save.disabled = this.pending || this.draft.perks!.length !== 3 || this.draft.pool!.length !== 8;
    const saveStatus = document.createElement('p'); saveStatus.dataset.growthSaveStatus = ''; saveStatus.setAttribute('role', 'status');
    saveStatus.textContent = this.status;
    save.onclick = () => { this.pending = true; this.status = '正在保存…'; saveStatus.textContent = this.status; save.disabled = true; this.submitted = JSON.stringify(validateGrowthLoadout(this.draft)); this.send(this.room ? { type: 'growthEquip', loadout: structuredClone(this.draft) } : { type: 'growthSave', slot: this.slot, loadout: structuredClone(this.draft) }); };
    const tip = document.createElement('p'); tip.textContent = this.room ? '当前修改只应用到本房间，更换配装后需重新准备。离开房间后可保存长期出战配装。' : '每职业熟练度Lv.2/Lv.4解锁两个替代升级；账号Lv.3/Lv.5解锁额外配装槽。进入成长房间会载入已保存配装。';
    const heading = document.createElement('div'); heading.className = 'arsenal-title';
    const headingCopy = document.createElement('div'), eyebrow = document.createElement('p'); eyebrow.className = 'arsenal-eyebrow'; eyebrow.textContent = 'GROWTH / BUILD YOUR NEXT RUN'; headingCopy.append(eyebrow, title);
    const rank = document.createElement('div'); rank.className = 'arsenal-balance'; rank.textContent = `账号 Lv.${growthLevel(career.xp)} · ${career.xp} XP`; heading.append(headingCopy, rank);
    const workbench = document.createElement('div'); workbench.className = 'arsenal-workbench';
    const roster = document.createElement('aside'); roster.className = 'operator-roster'; roster.setAttribute('aria-label', '成长职业');
    for (const [id, def] of Object.entries(GROWTH_CLASSES)) {
      const button = document.createElement('button'); button.className = `operator-card${id === this.draft.classId ? ' is-active' : ''}`; button.dataset.growthClass = id; button.setAttribute('aria-pressed', String(id === this.draft.classId));
      button.innerHTML = `<img src="${operatorConcept(id)}" alt=""><span><strong>${def.name}</strong><small>熟练度 Lv.${masteryLevel(career.mastery[id as GrowthClassId])}</small></span>`;
      button.onclick = () => { this.draft = defaultGrowthLoadout(id as GrowthClassId); this.status = '有未保存的修改，请保存后出战。'; this.draw(career); }; roster.append(button);
    }
    classes.className = 'growth-class-select'; roster.append(classes, slots);
    const definition = GROWTH_CLASSES[this.draft.classId], stage = document.createElement('div'); stage.className = 'operator-stage';
    stage.innerHTML = `<div class="operator-stage-heading"><span>OPERATOR / ${this.draft.classId.toUpperCase()}</span><span>成长规则</span></div><div class="operator-pedestal"><img class="generated-operator" src="${operatorConcept(this.draft.classId)}" alt="${definition.name} 作战概念像"></div><div class="operator-caption"><h2>${definition.name}</h2><p>${definition.description}</p><div class="operator-stats"><span><small>生命</small><b>${definition.health}</b></span><span><small>移动</small><b>×${definition.speed}</b></span><span><small>主动技能</small><b>E</b></span></div></div>`;
    const equipped = document.createElement('aside'); equipped.className = 'equipped-slots';
    for (const [tab, label, text, art] of [['weapons', '主武器与配件', this.draft.primary.toUpperCase(), loadoutArt(this.draft.primary, this.draft.primary)], ['skills', '职业主动技能', definition.ability, ''], ['perks', '基础 Perk', `${this.draft.perks!.length} / 3 已装配`, ''], ['pool', '局内成长池', `${this.draft.pool!.length} / 8 已装配`, '']]) {
      const button = document.createElement('button'); button.className = `equipped-slot${this.tab === tab ? ' is-active' : ''}`; button.innerHTML = `<span><small>${label}</small><strong>${text}</strong></span>${art}`; button.onclick = () => { this.tab = tab; this.draw(career); }; equipped.append(button);
    }
    workbench.append(roster, stage, equipped);
    const tabs = document.createElement('div'); tabs.className = 'arsenal-tabs growth-inventory-tabs'; tabs.setAttribute('aria-label', '成长配装分类');
    for (const [id, name] of [['weapons', '武器与配件'], ['skills', '职业技能'], ['perks', '基础 Perk'], ['pool', '成长池与进化'], ['records', '成就与称号']]) {
      const button = document.createElement('button'); button.id = `growth-tab-${id}`; button.textContent = name; button.setAttribute('aria-pressed', String(this.tab === id)); button.onclick = () => { this.tab = id; this.draw(career); }; tabs.append(button);
    }
    const inventory = document.createElement('div'); inventory.className = 'growth-inventory';
    if (this.tab === 'weapons') {
      const grid = document.createElement('div'); grid.className = 'growth-weapon-grid';
      for (const id of definition.weapons) {
        const gun = GROWTH_WEAPONS[id], card = document.createElement('button');
        card.className = 'growth-weapon-card'; card.dataset.growthWeapon = id; card.setAttribute('aria-pressed', String(id === this.draft.primary));
        card.innerHTML = `${loadoutArt(id, id.toUpperCase())}<strong>${id.toUpperCase()}</strong><span>伤害 ${gun.damage} · 弹匣 ${gun.magazineSize} · 换弹 ${(gun.reloadFrames / 30).toFixed(1)}秒</span><small>${id === this.draft.primary ? '已装配' : '选择武器'}</small>`;
        card.onclick = () => { this.draft.primary = id; this.draft.attachment = 'none'; this.status = '有未保存的修改，请保存后出战。'; this.draw(career); }; grid.append(card);
      }
      const customize = document.createElement('button'); customize.className = 'smith-entry'; customize.id = 'growth-open-gunsmith';
      customize.innerHTML = `<strong>枪械改装台 →</strong><span>${this.draft.primary.toUpperCase()} · ${GROWTH_ATTACHMENTS[this.draft.attachment ?? 'none'].name} · 图片选件 / 性能对比</span>`;
      customize.onclick = () => { this.smithOpen = true; this.draw(career); this.root.scrollIntoView({ block: 'start' }); };
      inventory.append(grid, weapons, mastery, customize);
      const attachmentHelp = document.createElement('p'); attachmentHelp.textContent = GROWTH_ATTACHMENTS[this.draft.attachment ?? 'none'].description; inventory.append(attachmentHelp);
    }
    if (this.tab === 'skills') {
      for (const [name, description, art] of [[definition.ability, definition.description, 'ability'], [GROWTH_ULTIMATES[this.draft.classId].name, GROWTH_ULTIMATES[this.draft.classId].description, 'defense']]) {
        const card = document.createElement('article'); card.className = 'growth-skill-card'; card.innerHTML = `<img src="${uiArt(`category-${art}`)}" alt=""><div><h2>${name}</h2><p>${description}</p></div>`; inventory.append(card);
      }
      const help = document.createElement('p'); help.textContent = '成长规则的主动技能随职业确定；基础 Perk 和局内成长池会改变它的使用方式。经典规则的技能选择位于上方“经典配装”。'; inventory.append(help);
      renderGrowthGuide(inventory, this.draft);
    }
    if (this.tab === 'perks') inventory.append(perks);
    if (this.tab === 'pool') inventory.append(pool, evolution);
    if (this.tab === 'records') inventory.append(titleSelect, records, achievements);
    const footer = document.createElement('footer'); footer.className = 'arsenal-footer'; const saved = document.createElement('div'); saved.append(saveStatus, tip); const back = document.createElement('a'); back.href = '#lobby'; back.className = 'arsenal-back'; back.textContent = '返回大厅 →'; footer.append(saved, save, back);
    this.root.append(heading, summary, workbench, tabs, inventory, footer);
    this.root.onchange = () => {
      if (!this.pending) {
        this.status = '有未保存的修改，请保存后出战。';
        const note = this.root.querySelector('[data-growth-save-status]');
        if (note) note.textContent = this.status;
      }
    };
  }
}
