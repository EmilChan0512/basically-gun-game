import { SKILLS, type SkillId } from '../../game/campaign/Catalog';
import { STEALTH_DELAY } from '../../shared/simulation/Stealth';

export function skillStatus(actor: { skill?: SkillId | null; skillFrames: number; skillCooldown: number; stealthFrames?: number }) {
  if (!actor.skill) return '';
  const skill = SKILLS[actor.skill];
  if (skill.passive) return `被动 ${skill.name} · ${(actor.stealthFrames ?? 0) >= STEALTH_DELAY ? '已生效' : `站定 ${((actor.stealthFrames ?? 0) / 30).toFixed(1)}/5s`}`;
  return `E ${skill.name} · ${actor.skillFrames > 0 ? '生效中' : actor.skillCooldown > 0 ? (actor.skillCooldown / 30).toFixed(1) + 's' : '就绪'}`;
}
