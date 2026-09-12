import { WEAPONS, SPECIAL_OFFHANDS, CLASSES, type ClassId } from '../../game/campaign/Catalog';
import frames from './offhand-frames.json';
import { CHARACTER_ART, characterAsset, characterPose, IDLE_CYCLE_FRAMES } from './CharacterPose';
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
  if (Object.hasOwn(CHARACTER_ART, id)) return `<img class="loadout-art ${className}" src="${characterAsset(id)}" alt="${label}" draggable="false">`;
  const crop = Object.hasOwn(frames, id) ? frames[id as keyof typeof frames] : WEAPONS[id as keyof typeof WEAPONS]?.artFrame;
  if (crop) return `<svg class="loadout-art ${Object.hasOwn(SPECIAL_OFFHANDS, id) ? 'offhand-art' : ''} ${className}" viewBox="${crop.join(' ')}" role="img" aria-label="${label}"><image href="${source(id)}"/></svg>`;
  return `<img class="loadout-art ${className}" src="${source(id)}" alt="${label}" draggable="false">`;
}

/** Exactly the same joints, vectors and weapon grip used by the battle rig. */
export function operatorArt(role: ClassId, equipment: EquipmentLoadout) {
  const pose = characterPose(role, equipment.primary);
  const frames = Array.from({ length: IDLE_CYCLE_FRAMES / 3 + 1 }, (_, frame) => characterPose(role, equipment.primary, { frame: frame * 3 }));
  const names = pose.parts.map((_, i) => `operator-${role}-${equipment.primary}-${i}`);
  const styles = names.map((name, i) => `@keyframes ${name}{${frames.map((frame, n) => `${n / (frames.length - 1) * 100}%{transform:matrix(${frame.parts[i].matrix.join(',')})}`).join('')}}`).join('');
  return `<svg class="operator-art" viewBox="-35 -78 112 90" role="img" aria-label="${CLASSES[role].name}角色与${WEAPONS[equipment.primary].name}配装预览"><style>${styles}@media(prefers-reduced-motion:reduce){.operator-art image{animation:none!important}}</style>${pose.parts.map((part, i) => {
    const box = CHARACTER_ART[part.id];
    return `<image href="${characterAsset(part.id)}" x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" transform="matrix(${part.matrix.join(' ')})" style="animation:${names[i]} ${IDLE_CYCLE_FRAMES / 30}s linear infinite"/>`;
  }).join('')}</svg>`;
}
