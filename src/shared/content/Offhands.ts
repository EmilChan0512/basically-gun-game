/** SFH1 Stats_Guns names, base melee damage/reach and shield reflection chances.
 * Class levels and stronger shield reductions are this game's balance choices. */
const melee = (name: string, source: string, damage: number, reach: number, style: 'knife' | 'sword', level: number) => ({
  kind: 'melee' as const, classId: 'assassin' as const, name, source, damage, reach, style, level, price: 0,
  windup: style === 'knife' ? 3 : 4, active: 2, recovery: style === 'knife' ? 7 : 9,
  description: `刺客专属 · 伤害${damage} · 距离${reach} · ${style === 'knife' ? '快速刺击' : '大幅挥砍'}；攻击期间不能切枪`,
});
const shield = (name: string, source: string, reduction: number, reflect: number, level: number, explosionMultiplier = 1) => ({
  kind: 'shield' as const, classId: 'tank' as const, name, source, reduction, reflect, explosionMultiplier, level, price: 0,
  description: `重装兵专属 · 正面减伤${Math.round(reduction * 100)}% · 子弹反弹${Math.round(reflect * 100)}%${explosionMultiplier < 1 ? ' · 额外防爆' : ''}；按住攻击举盾，鼠标控制朝向`,
});
export const SPECIAL_OFFHANDS = {
  knife: melee('战术刀', 'Knife', 50, 60, 'knife', 1),
  bat: melee('棒球棍', 'Bat', 85, 80, 'sword', 2),
  baton: melee('警棍', 'Baton', 65, 60, 'knife', 3),
  'nine-iron': melee('九号铁杆', 'Nine Iron', 110, 80, 'sword', 4),
  machete: melee('砍刀', 'Machete', 90, 60, 'knife', 5),
  katana: melee('武士刀', 'Katana', 150, 80, 'sword', 6),
  shield: shield('防弹盾', 'Riot', 0.75, 0.1, 1),
  'police-shield': shield('警用盾', 'Police', 0.8, 0.05, 2),
  'blast-shield': shield('防爆盾', 'Blast', 0.78, 0, 3, 0.3),
  buckler: shield('轻型圆盾', 'Pointy', 0.72, 0, 4),
  'meat-shield': shield('重型肉盾', 'Meat', 0.9, 0, 5),
  siegius: shield('角斗士盾', 'Siegius', 0.7, 0.3, 6),
} as const;
export type SpecialOffhandId = keyof typeof SPECIAL_OFFHANDS;
export type MeleeDefinition = ReturnType<typeof melee>;
export type ShieldDefinition = ReturnType<typeof shield>;
export function isSpecialOffhand(id: unknown): id is SpecialOffhandId {
  return typeof id === 'string' && Object.hasOwn(SPECIAL_OFFHANDS, id);
}
export function canEquipOffhand(classId: string, id: SpecialOffhandId) { return SPECIAL_OFFHANDS[id].classId === classId; }
