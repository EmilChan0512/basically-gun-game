import type { WeaponId } from '../../game/combat/Combat';
export type SimulationEvent = { id: number; tick: number;
  kind: 'shot' | 'damage' | 'death' | 'result' | 'objective-pickup' | 'objective-delivery' | 'objective-return'
    | 'reload' | 'reload-end' | 'swap' | 'empty' | 'respawn' | 'footstep' | 'jump' | 'land' | 'melee' | 'melee-hit' | 'block' | 'explosion' | 'skill' | 'item' | 'supply' | 'error';
  actorId?: string; targetId?: string; amount?: number; weapon?: WeaponId; ability?: string; duration?: number; position?: { x: number; y: number } };
/** Bounded presentation journal; simulation state never depends on whether events were read. */
export class EventJournal {
  private sequence = 0;
  private events: SimulationEvent[] = [];
  emit(event: Omit<SimulationEvent, 'id'>) {
    this.events.push({ ...event, id: ++this.sequence });
    if (this.events.length > 512) this.events.splice(0, this.events.length - 512);
  }
  since(cursor: number) { return this.events.filter(e => e.id > cursor).map(e => ({ ...e })); }
  get cursor() { return this.sequence; }
  checkpoint() { return { sequence: this.sequence, events: this.events.map(e => ({ ...e })) }; }
  restore(state: ReturnType<EventJournal['checkpoint']>) { this.sequence = state.sequence; this.events = state.events.map(e => ({ ...e })); }
}
