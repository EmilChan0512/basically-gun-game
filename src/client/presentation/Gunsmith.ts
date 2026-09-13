import { GROWTH_ATTACHMENTS, type GrowthAttachment } from '../../shared/content/GrowthRecords';
import { growthWeaponConfigs, type GrowthLoadout } from '../../shared/content/GrowthCatalog';
import components from './gunsmith-components.json';
import './Gunsmith.css';

type SmithWeapon = keyof typeof components.weapons;
function partArt(id: GrowthAttachment, gun: SmithWeapon) {
  const data = components.weapons[gun];
  const src = id === 'none' ? data.source : `/assets/gunsmith/v2/${data.parts[id].file}`;
  return `<img class="smith-part-texture" src="${src}" alt="${gun.toUpperCase()} ${GROWTH_ATTACHMENTS[id].name}组件" draggable="false">`;
}
export function gunsmithProfile(gun: SmithWeapon, part: GrowthAttachment) {
  const data = components.weapons[gun], component = part === 'none' ? null : data.parts[part];
  const mask = `smith-mask-${gun}-${part}`;
  const region = component?.replace;
  const target = component?.target;
  const width = Math.max(data.width, target ? target[0] + target[2] : 0);
  return `<svg class="loadout-art smith-composite" viewBox="-12 -12 ${width + 24} ${data.height + 24}" role="img" aria-label="${gun.toUpperCase()} ${GROWTH_ATTACHMENTS[part].name}装配预览" data-component="${part}"><defs><mask id="${mask}" maskUnits="userSpaceOnUse" x="-12" y="-12" width="${width + 24}" height="${data.height + 24}"><rect x="-12" y="-12" width="${width + 24}" height="${data.height + 24}" fill="white"/>${region ? `<rect x="${region[0]}" y="${region[1]}" width="${region[2]}" height="${region[3]}" fill="black"/>` : ''}</mask></defs><image class="smith-original-layer" href="${data.source}" width="${data.width}" height="${data.height}" mask="url(#${mask})"/>${component && target ? `<image class="smith-component-layer" href="/assets/gunsmith/v2/${component.file}" x="${target[0]}" y="${target[1]}" width="${target[2]}" height="${target[3]}" preserveAspectRatio="none"/>` : ''}</svg>`;
}

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
    root.innerHTML = `<header class="smith-header"><div><p>ARMORY / GUNSMITH</p><h1>枪械改装台 <span>${loadout.primary.toUpperCase()}</span></h1></div><button data-smith-back>← 返回出战配装</button></header><div class="smith-layout"><div class="smith-bench"><div class="smith-label"><span>02 / SIDE PROFILE</span><span>预览 · ${def.name}</span></div><div class="smith-gun">${gunsmithProfile(loadout.primary as SmithWeapon, selected)}<button class="smith-point barrel" data-smith-category="barrel">＋ 枪管</button><button class="smith-point magazine" data-smith-category="magazine">＋ 弹匣</button></div><div class="smith-installed">当前草稿 <b>${GROWTH_ATTACHMENTS[original].name}</b><span>→</span>正在预览 <b>${def.name}</b></div><p class="smith-footnote">以原枪械美术为参考生成的透明组件，已按安装位置叠加预览。每把武器可装配一项改装，选择新配件会替换原改装。</p></div><aside class="smith-inspector"><p>PERFORMANCE / 相对标准配置</p><h2>${def.name}</h2><div class="smith-selected-art">${partArt(selected, loadout.primary as SmithWeapon)}</div><p>${def.description}</p>${stat('单发伤害', base.damage, preview.damage, '')}${stat('弹匣容量', base.magazineSize, preview.magazineSize, ' 发')}${stat('换弹时间', base.reloadFrames / 30, preview.reloadFrames / 30, ' 秒', true)}${stat('散布', base.recoil, preview.recoil, '', true)}${stat('有效射程', base.rangeUnits, preview.rangeUnits, '')}${stat('移动倍率', 100, selected === 'heavy' ? 95 : selected === 'short' ? 105 : 100, '%')}<div class="smith-unlock"><span>武器熟练度 ${xp} XP</span><progress max="${Math.max(1, def.xp)}" value="${Math.min(xp, Math.max(1, def.xp))}"></progress><small>${locked ? `还需 ${def.xp - xp} XP 解锁；可预览性能` : '已解锁 · 可装配'}</small></div></aside></div><nav class="smith-categories" aria-label="配件分类">${[['all','全部配件'],['barrel','枪管组件'],['magazine','弹匣组件']].map(([id,name]) => `<button data-smith-category="${id}" aria-pressed="${category === id}">${name}</button>`).join('')}</nav><div class="smith-parts">${(Object.keys(GROWTH_ATTACHMENTS) as GrowthAttachment[]).filter(id => category === 'all' || id === 'none' || (category === 'barrel' ? id === 'heavy' || id === 'short' : id === 'quickmag')).map(id => `<button data-smith-part="${id}" aria-pressed="${selected === id}">${partArt(id, loadout.primary as SmithWeapon)}<strong>${GROWTH_ATTACHMENTS[id].name}</strong><span>${xp < GROWTH_ATTACHMENTS[id].xp ? `未解锁 · ${GROWTH_ATTACHMENTS[id].xp} XP` : id === original ? '当前草稿已装配' : '已解锁'}</span></button>`).join('')}</div><footer class="smith-footer"><span>确认装配后返回配装页，保存或应用到房间后生效。</span><button data-smith-reset>恢复标准配置</button><button data-smith-apply ${locked ? 'disabled' : ''}>${locked ? '配件尚未解锁' : '确认装配并返回'}</button></footer>`;
    root.querySelector<HTMLElement>('[data-smith-back]')!.onclick = back;
    root.querySelector<HTMLElement>('[data-smith-reset]')!.onclick = () => { selected = 'none'; draw(); };
    root.querySelector<HTMLElement>('[data-smith-apply]')!.onclick = () => { if (!locked) apply(selected); };
    root.querySelectorAll<HTMLElement>('[data-smith-part]').forEach(button => button.onclick = () => { selected = button.dataset.smithPart as GrowthAttachment; draw(); root.querySelector<HTMLElement>(`[data-smith-part="${selected}"]`)?.focus({ preventScroll: true }); });
    root.querySelectorAll<HTMLElement>('[data-smith-category]').forEach(button => button.onclick = () => { category = button.dataset.smithCategory!; draw(); });
  };
  draw(); return root;
}
