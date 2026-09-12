import { GROWTH_ATTACHMENTS, GROWTH_ACHIEVEMENTS, GROWTH_TRAITS, type GrowthAttachment, type GrowthAchievement } from '../../shared/content/GrowthRecords';
import { GROWTH_CLASSES, GROWTH_PERKS, GROWTH_UPGRADES, GROWTH_ALTERNATIVES, defaultGrowthLoadout,
  type GrowthClassId, type GrowthLoadout, type GrowthPerkId, type GrowthUpgradeId } from '../../shared/content/GrowthCatalog';
import { growthLevel, masteryLevel, growthSlots, unlockedGrowthPerks, unlockedGrowthPool, type GrowthCareer } from '../../shared/content/GrowthCareer';

export class GrowthCareerPanel {
  private signature = '';
  private draft: GrowthLoadout = defaultGrowthLoadout();
  private slot = 0;
  private pending = false;
  private status = '';
  constructor(private root: HTMLElement, private send: (message: object) => void) {}
  saved() { this.finishSave('配装已由服务器保存。'); }
  failed(message: string) { if (this.pending) this.finishSave(`保存失败：${message}`); }
  private finishSave(message: string) {
    this.pending = false; this.status = message;
    const note = this.root.querySelector('[data-growth-save-status]'); if (note) note.textContent = message;
    const button = this.root.querySelector<HTMLButtonElement>('#growth-career-save');
    if (button) button.disabled = this.draft.perks!.length !== 3 || this.draft.pool!.length !== 8;
  }
  render(career: GrowthCareer | undefined, hidden: boolean) {
    this.root.hidden = !career || hidden;
    if (!career || hidden) { this.signature = ''; return; }
    const signature = JSON.stringify(career);
    if (this.signature === signature) return;
    this.signature = signature; this.slot = career.selectedSlot; this.draft = structuredClone(career.loadouts[this.slot]);
    this.draw(career);
  }
  private draw(career: GrowthCareer) {
    this.root.replaceChildren();
    const title = document.createElement('h2'); title.textContent = `成长构筑 · 账号 Lv.${growthLevel(career.xp)} · ${career.xp} XP`;
    const summary = document.createElement('p'); summary.textContent = `${career.matches}局 / ${career.wins}胜 · ${Object.entries(career.mastery).map(([id, xp]) => `${GROWTH_CLASSES[id as GrowthClassId].name}熟练度 Lv.${masteryLevel(xp)}`).join(' · ')}。等级解锁选择，不增加基础伤害或生命。`;
    const slots = document.createElement('div');
    for (let i = 0; i < growthSlots(career.xp); i++) {
      const button = document.createElement('button'); button.textContent = `配装 ${i + 1}${i === this.slot ? ' ✓' : ''}`; button.dataset.growthSlot = String(i);
      button.onclick = () => { this.slot = i; this.draft = structuredClone(career.loadouts[i] ?? defaultGrowthLoadout()); this.draw(career); }; slots.append(button);
    }
    const classes = document.createElement('select'); classes.id = 'career-growth-class'; classes.setAttribute('aria-label', '成长构筑职业');
    for (const [id, def] of Object.entries(GROWTH_CLASSES)) { const option = document.createElement('option'); option.value = id; option.textContent = def.name; classes.append(option); }
    classes.value = this.draft.classId;
    classes.onchange = () => { this.draft = defaultGrowthLoadout(classes.value as GrowthClassId); this.draw(career); };
    const weapons = document.createElement('select'); weapons.id = 'career-growth-weapon'; weapons.setAttribute('aria-label', '成长构筑主武器');
    for (const id of GROWTH_CLASSES[this.draft.classId].weapons) { const option = document.createElement('option'); option.value = id; option.textContent = id.toUpperCase(); weapons.append(option); }
    weapons.value = this.draft.primary; weapons.onchange = () => { this.draft.primary = weapons.value as GrowthLoadout['primary']; this.draft.attachment = 'none'; this.draw(career); };
    const attachments = document.createElement('select'); attachments.id = 'growth-attachment'; attachments.setAttribute('aria-label', '武器配件');
    const weaponXp = career.weaponXp[this.draft.primary] ?? 0;
    for (const [id, def] of Object.entries(GROWTH_ATTACHMENTS)) { const option = document.createElement('option'); option.value = id; option.textContent = `${def.name} · ${def.description}${weaponXp < def.xp ? `（需${def.xp}武器XP）` : ''}`; option.disabled = weaponXp < def.xp; attachments.append(option); }
    attachments.value = this.draft.attachment ?? 'none'; attachments.onchange = () => { this.draft.attachment = attachments.value as GrowthAttachment; };
    const mastery = document.createElement('p'); mastery.textContent = `${this.draft.primary.toUpperCase()}熟练度 ${weaponXp} XP；配件不提高单发基础伤害。`;
    const titleSelect = document.createElement('select'); titleSelect.id = 'growth-title'; titleSelect.setAttribute('aria-label', '成就称号');
    for (const id of ['none', ...career.achievements] as const) { const option = document.createElement('option'); option.value = id; option.textContent = id === 'none' ? '不展示称号' : GROWTH_ACHIEVEMENTS[id].name; titleSelect.append(option); }
    titleSelect.value = this.draft.title ?? 'none'; titleSelect.onchange = () => { this.draft.title = titleSelect.value as GrowthAchievement | 'none'; };
    const evolution = document.createElement('label'), evolve = document.createElement('input'); evolve.type = 'checkbox'; evolve.id = 'growth-evolutions'; evolve.checked = this.draft.evolutions ?? false; evolve.disabled = masteryLevel(career.mastery[this.draft.classId]) < 5 || this.draft.classId !== 'assault';
    evolve.onchange = () => { this.draft.evolutions = evolve.checked; }; evolution.append(evolve, document.createTextNode(' 开启追击进化路线：职业熟练度Lv.5，乘胜追击 → 强化追击 → 连杀奔袭，仍占四次选卡。'));
    const records = document.createElement('p'); records.textContent = `行为特质：${career.traits.map(id => GROWTH_TRAITS[id].name).join(' / ') || '继续探索不同打法'} · 移动击杀 ${career.metrics.movingKills} · 残血击杀 ${career.metrics.lowHealthKills} · 爆头击杀 ${career.metrics.headshotKills} · 武器切换 ${career.metrics.switches}`;
    const achievements = document.createElement('details'), heading = document.createElement('summary'); heading.textContent = '行为成就与特质条件'; achievements.append(heading);
    for (const [id, def] of Object.entries(GROWTH_ACHIEVEMENTS)) { const line = document.createElement('p'); line.textContent = `${career.achievements.includes(id as GrowthAchievement) ? '✓' : '○'} ${def.name}：${def.description}`; achievements.append(line); }
    for (const def of Object.values(GROWTH_TRAITS)) { const line = document.createElement('p'); line.textContent = `${def.name}：${def.description}`; achievements.append(line); }
    const perks = document.createElement('fieldset'), pool = document.createElement('fieldset');
    const legend = (element: HTMLElement, text: string) => { const legend = document.createElement('legend'); legend.textContent = text; element.append(legend); };
    legend(perks, `基础 Perk（${this.draft.perks?.length ?? 0}/3）`); legend(pool, `局内成长池（${this.draft.pool?.length ?? 0}/8）`);
    const availablePerks = unlockedGrowthPerks(career), availablePool = unlockedGrowthPool(career, this.draft.classId);
    const choice = (root: HTMLElement, id: string, title: string, description: string, checked: boolean, enabled: boolean, change: (checked: boolean) => void) => {
      const label = document.createElement('label'); label.style.cssText = 'display:block;margin:8px 0;line-height:1.5';
      const input = document.createElement('input'); input.type = 'checkbox'; input.checked = checked; input.disabled = !enabled; input.dataset.growthOption = id;
      input.onchange = () => change(input.checked); label.append(input, document.createTextNode(` ${title}${enabled ? '' : '（尚未解锁）'} — ${description}`)); root.append(label);
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
    const save = document.createElement('button'); save.id = 'growth-career-save'; save.textContent = '保存并设为出战配装';
    save.disabled = this.pending || this.draft.perks!.length !== 3 || this.draft.pool!.length !== 8;
    const saveStatus = document.createElement('p'); saveStatus.dataset.growthSaveStatus = ''; saveStatus.setAttribute('role', 'status');
    saveStatus.textContent = this.status;
    save.onclick = () => { this.pending = true; this.status = '正在保存…'; saveStatus.textContent = this.status; save.disabled = true; this.send({ type: 'growthSave', slot: this.slot, loadout: this.draft }); };
    const tip = document.createElement('p'); tip.textContent = '每职业熟练度Lv.2/Lv.4解锁两个替代升级；账号Lv.3/Lv.5解锁额外配装槽。进入成长房间会载入已保存配装。';
    this.root.append(title, summary, slots, classes, weapons, mastery, attachments, titleSelect, evolution, records, achievements, perks, pool, save, saveStatus, tip);
  }
}
