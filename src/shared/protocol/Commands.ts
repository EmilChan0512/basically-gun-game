import type { BattleInput } from '../../game/campaign/Battle';

export type PlayerAction = 'swap' | 'reload' | 'skill' | 'item';
export interface PlayerCommand { sequence: number; input: BattleInput; actions: PlayerAction[] }
/** Treat the transport boundary as untrusted, including local adapters. */
export function validCommand(value: PlayerCommand): boolean {
  const input = value?.input;
  return Number.isSafeInteger(value?.sequence) && value.sequence >= 0 && !!input
    && ['left', 'right', 'crouch', 'jump', 'fire'].every(key => typeof input[key as keyof BattleInput] === 'boolean')
    && !!input.aim && Number.isFinite(input.aim.x) && Number.isFinite(input.aim.y)
    && Math.abs(input.aim.x) <= 100000 && Math.abs(input.aim.y) <= 100000
    && Array.isArray(value.actions) && value.actions.length <= 4
    && new Set(value.actions).size === value.actions.length
    && value.actions.every(action => ['swap', 'reload', 'skill', 'item'].includes(action));
}
/** V3 actions carry no gadget/ability identity. The roster loadout is the sole authority. */
export function validGrowthCommand(value: PlayerCommand): boolean {
  return validCommand(value) && Object.keys(value).every(k => ['sequence', 'input', 'actions'].includes(k))
    && Object.keys(value.input).every(k => ['left', 'right', 'crouch', 'jump', 'fire', 'aim'].includes(k))
    && Object.keys(value.input.aim).every(k => ['x', 'y'].includes(k));
}
