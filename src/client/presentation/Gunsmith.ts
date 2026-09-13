import { GROWTH_ATTACHMENTS, type GrowthAttachment } from '../../shared/content/GrowthRecords';
import { growthWeaponConfigs, type GrowthLoadout } from '../../shared/content/GrowthCatalog';
import { loadoutArt } from './LoadoutArt';
import './Gunsmith.css';

function partArt(id: GrowthAttachment) { return `<img class="smith-part-texture" src="/assets/gunsmith/v1/${id}.png" alt="${GROWTH_ATTACHMENTS[id].name}配件贴图" width="768" height="512" draggable="false">`; }

/** A local preview is applied to the parent draft only by explicit confirmation. */
export function gunsmith(loadout: GrowthLoadout, xp: number, apply: (id: GrowthAttachment) => void, back: () => void) {
  const root = document.createElement('section'); root.className = 'gunsmith'; root.setAttribute('aria-label', '枪械改装台');
  let selected = loadout.attachment ?? 'none', category = 'all';
  const original = selected;
  const draw = () => {
    const preview = growthWeaponConfigs({ ...loadout, attachment: selected })[loadout.primary];
    const base = growthWeaponConfigs({ ...loadout, attachment: 'none' })[loadout.primary];
    const def = GROWTH_ATTACHMENTS[selected], locked = xp < def.xp;
    const stat = (name: string, a: number, b: number, unit: string, lower = false) => {
      const delta = b - a, good = lower ? delta < 0 : delta > 0;
      return `<div class="smith-stat"><span>${name}</span><span>${Number(a.toFixed(2))}${unit} → <b>${Number(b.toFixed(2))}${unit}</b></span><small data-tone="${delta === 0 ? 'neutral' : good ? 'good' : 'bad'}">${delta === 0 ? '不变' : `${delta > 0 ? '+' : ''}${Number(delta.toFixed(2))}${unit}`}</small></div>`;
    };
    root.innerHTML = `<header class="smith-header"><div><p>ARMORY / GUNSMITH</p><h1>枪械改装台 <span>${loadout.primary.toUpperCase()}</span></h1></div><button data-smith-back>← 返回出战配装</button></header><div class="smith-layout"><div class="smith-bench"><div class="smith-label"><span>02 / SIDE PROFILE</span><span>预览 · ${def.name}</span></div><div class="smith-gun">${loadoutArt(loadout.primary, loadout.primary.toUpperCase())}<button class="smith-point barrel" data-smith-category="barrel">＋ 枪管</button><button class="smith-point magazine" data-smith-category="magazine">＋ 弹匣</button></div><div class="smith-installed">当前草稿 <b>${GROWTH_ATTACHMENTS[original].name}</b><span>→</span>正在预览 <b>${def.name}</b></div><p class="smith-footnote">枪械使用游戏内侧视素材，配件使用专用 2D 美术。每把武器可装配一项改装，选择新配件会替换原改装。</p></div><aside class="smith-inspector"><p>PERFORMANCE / 相对标准配置</p><h2>${def.name}</h2><div class="smith-selected-art">${partArt(selected)}</div><p>${def.description}</p>${stat('单发伤害', base.damage, preview.damage, '')}${stat('弹匣容量', base.magazineSize, preview.magazineSize, ' 发')}${stat('换弹时间', base.reloadFrames / 30, preview.reloadFrames / 30, ' 秒', true)}${stat('散布', base.recoil, preview.recoil, '', true)}${stat('有效射程', base.rangeUnits, preview.rangeUnits, '')}${stat('移动倍率', 100, selected === 'heavy' ? 95 : selected === 'short' ? 105 : 100, '%')}<div class="smith-unlock"><span>武器熟练度 ${xp} XP</span><progress max="${Math.max(1, def.xp)}" value="${Math.min(xp, Math.max(1, def.xp))}"></progress><small>${locked ? `还需 ${def.xp - xp} XP 解锁；可预览性能` : '已解锁 · 可装配'}</small></div></aside></div><nav class="smith-categories" aria-label="配件分类">${[['all','全部配件'],['barrel','枪管组件'],['magazine','弹匣组件']].map(([id,name]) => `<button data-smith-category="${id}" aria-pressed="${category === id}">${name}</button>`).join('')}</nav><div class="smith-parts">${(Object.keys(GROWTH_ATTACHMENTS) as GrowthAttachment[]).filter(id => category === 'all' || id === 'none' || (category === 'barrel' ? id === 'heavy' || id === 'short' : id === 'quickmag')).map(id => `<button data-smith-part="${id}" aria-pressed="${selected === id}">${partArt(id)}<strong>${GROWTH_ATTACHMENTS[id].name}</strong><span>${xp < GROWTH_ATTACHMENTS[id].xp ? `未解锁 · ${GROWTH_ATTACHMENTS[id].xp} XP` : id === original ? '当前草稿已装配' : '已解锁'}</span></button>`).join('')}</div><footer class="smith-footer"><span>确认装配后返回配装页，保存或应用到房间后生效。</span><button data-smith-reset>恢复标准配置</button><button data-smith-apply ${locked ? 'disabled' : ''}>${locked ? '配件尚未解锁' : '确认装配并返回'}</button></footer>`;
    root.querySelector<HTMLElement>('[data-smith-back]')!.onclick = back;
    root.querySelector<HTMLElement>('[data-smith-reset]')!.onclick = () => { selected = 'none'; draw(); };
    root.querySelector<HTMLElement>('[data-smith-apply]')!.onclick = () => { if (!locked) apply(selected); };
    root.querySelectorAll<HTMLElement>('[data-smith-part]').forEach(button => button.onclick = () => { selected = button.dataset.smithPart as GrowthAttachment; draw(); root.querySelector<HTMLElement>(`[data-smith-part="${selected}"]`)?.focus({ preventScroll: true }); });
    root.querySelectorAll<HTMLElement>('[data-smith-category]').forEach(button => button.onclick = () => { category = button.dataset.smithCategory!; draw(); });
  };
  draw(); return root;
}
