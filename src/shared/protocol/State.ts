import type { Battle } from '../../game/campaign/Battle';
import type { MatchResult } from '../simulation/ModeRules';
import type { SimulationEvent } from '../simulation/Events';
import type { OriginalMovement } from '../../game/movement/OriginalMovement';
export interface StateMessage {
  growth?: ReturnType<typeof import('../simulation/Growth').growthView>;
  type: 'state'; roomId: string; round: number; actorId: string | null; mapId: string; mode: import('../simulation/ModeRules').ModeId;
  state: ReturnType<Battle['snapshot']>; result: MatchResult | null; ack: number;
  poses: { id: string; name: string; aim: { x: number; y: number } }[];
  effects: Battle['effects']; bursts: Battle['bursts'];
  grenades: { x: number; y: number }[];
  projectiles?: { x: number; y: number; vx: number; vy: number }[];
  events: SimulationEvent[];
  movement?: ReturnType<OriginalMovement['checkpoint']>;
  jumpHeld?: boolean;
}
