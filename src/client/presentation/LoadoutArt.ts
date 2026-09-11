import { WEAPONS, SPECIAL_OFFHANDS, CLASSES, type ClassId } from '../../game/campaign/Catalog';
import frames from './offhand-frames.json';
import type { EquipmentLoadout } from '../../shared/content/Equipment';

const source = (id: string) => `/assets/reference/${id}.png`;
const icons: Record<string, string> = {
  heal: '<path d="M25 12h14v13h13v14H39v13H25V39H12V25h13z"/>',
  regenerate: '<path d="M49 24a20 20 0 1 0 1 16M49 10v14H35"/><path d="M32 23v18m-9-9h18"/>',
  focus: '<circle cx="32" cy="32" r="17"/><circle cx="32" cy="32" r="5"/><path d="M32 6v13m0 26v13M6 32h13m26 0h13"/>',
  cloak: '<path d="M8 32s9-16 24-16 24 16 24 16-9 16-24 16S8 32 8 32zM12 55 52 9"/><path d="M38 26a9 9 0 0 0-12 12"/>',
  supply: '<path d="M10 24h44v30H10zM6 24 14 12h36l8 12M26 12v12m12-12v12M32 31v16m-8-8h16"/>',
  overdrive: '<path d="m36 6-22 30h16l-4 22 24-32H34z"/>',
  barrier: '<path d="m32 6 22 9v17c0 12-22 26-22 26S10 44 10 32V15zM32 16v30"/>',
  iron: '<path d="m32 7 21 9v17c0 10-21 24-21 24S11 43 11 33V16zM20 29l9 10 16-19"/>',
  medkit: '<rect x="9" y="20" width="46" height="34" rx="5"/><path d="M22 20v-9h20v9M32 28v18m-9-9h18"/>',
  frag: '<path d="m25 22-3-9 16-5 4 10-4 5M38 9l13 7v10"/><path d="M19 29c-8 13-5 24 7 27 13 3 23-6 22-17-1-9-8-17-15-17-6 0-10 2-14 7zM19 35l26-7M16 44l32-6M22 54l23-8M26 25l4 30M35 24l4 27"/>',
  ammo: '<path d="M9 49h46v9H9zM13 49V22l5-12 5 12v27M27 49V18l5-12 5 12v31M41 49V22l5-12 5 12v27M13 30h10m4-4h10m4 4h10"/>',
};

/** Presentation-only SVGs reuse the exact equipment frame seen in the game. */
export function loadoutArt(id: string, label: string, className = ''): string {
  if (Object.hasOwn(icons, id)) return `<svg class="loadout-art ability-art ${className}" viewBox="0 0 64 64" role="img" aria-label="${label}"><g fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">${icons[id]}</g></svg>`;
  const crop = Object.hasOwn(frames, id) ? frames[id as keyof typeof frames] : WEAPONS[id as keyof typeof WEAPONS]?.artFrame;
  if (crop) return `<svg class="loadout-art ${Object.hasOwn(SPECIAL_OFFHANDS, id) ? 'offhand-art' : ''} ${className}" viewBox="${crop.join(' ')}" role="img" aria-label="${label}"><image href="${source(id)}"/></svg>`;
  return `<img class="loadout-art ${className}" src="${source(id)}" alt="${label}" draggable="false">`;
}

/** A static paper-doll using the same proportions and layering as ReferenceArt. */
export function operatorArt(role: ClassId, equipment: EquipmentLoadout) {
  const part = (id: string, x: number, y: number, w: number, h: number, angle = 0) =>
    `<image href="${source(`${role}-${id}`)}" x="${x - w / 2}" y="${y - h / 2}" width="${w}" height="${h}" preserveAspectRatio="none" transform="rotate(${angle} ${x} ${y})"/>`;
  const gun = WEAPONS[equipment.primary], height = gun.artFrame ? Math.min(23, gun.length * gun.artFrame[3] / gun.artFrame[2]) : 15;
  return `<svg class="operator-art" viewBox="-48 -82 132 100" role="img" aria-label="${CLASSES[role].name}角色与${gun.name}配装预览">
    ${part('leg', -7, -15, 10, 25, 6)}${part('boot', -7, -4, 14, 10)}${part('leg', 7, -15, 10, 25, -6)}${part('boot', 10, -4, 14, 10)}
    ${part('torso', 0, -32, 26, 30)}${part('head', 2, -54, 29, 29)}
    <svg x="${17 - gun.length / 2}" y="${-42 - height / 2}" width="${gun.length}" height="${height}" ${gun.artFrame ? `viewBox="${gun.artFrame.join(' ')}"` : 'viewBox="0 0 112 68"'}><image href="${source(equipment.primary)}" ${gun.artFrame ? '' : 'width="112" height="68" preserveAspectRatio="none"'}/></svg>
    ${part('arm', 5, -33, 12, 24, -90)}${part('arm', 19, -36, 9, 20, -90)}
  </svg>`;
}
