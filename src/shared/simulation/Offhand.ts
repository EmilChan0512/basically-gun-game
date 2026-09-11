import type { Point } from '../../game/combat/Ballistics';
import { MeleeSwing, type MeleeState, type MeleeTarget } from './Melee';
import type { ShieldState } from './Shield';

export type OffhandKind = 'firearm' | 'melee' | 'shield';
export interface OffhandView { kind: OffhandKind; equipped: boolean; age: number; facing: Point; durability: number; deployed: boolean }
export const SHIELD_RULES = { durability: 120, deployTicks: 6 } as const;
export interface OffhandCheckpoint {
  kind: OffhandKind;
  selected: boolean;
  held: boolean;
  deployAge: number;
  shield: ShieldState;
  melee: MeleeState;
}
export interface OffhandFrame {
  alive: boolean;
  fire: boolean;
  sourceId: string;
  team: 1 | 2;
  origin: Point;
  aim: Point;
  targets: readonly MeleeTarget[];
  wall: (x: number, y: number) => boolean;
}

/** Equipment behavior only; firearm ballistics remain owned by Arsenal.
 * Tick every simulation frame, including while stowed, to preserve recovery. */
export class OffhandController {
  private selected = false;
  private held = false;
  private deployAge = 0;
  private melee = new MeleeSwing();
  readonly shield: ShieldState = { durability: SHIELD_RULES.durability, deployed: false };
  constructor(readonly kind: OffhandKind) {}
  get equipped() { return this.selected; }
  view(): OffhandView { const swing = this.melee.checkpoint(); return { kind: this.kind, equipped: this.selected,
    age: swing.age, facing: swing.facing, durability: this.shield.durability, deployed: this.shield.deployed }; }
  get triggerHeld() { return this.held; }
  get attackSerial() { return this.melee.checkpoint().serial; }
  releaseTrigger() { this.held = false; this.deployAge = 0; this.shield.deployed = false; }
  get canSwitch() { return !this.melee.busy; }
  get permitsGunfire() { return !this.melee.busy && (!this.selected || this.kind === 'firearm'); }

  /** Forced lifecycle/objective changes may stow, but never erase recovery.
   * Pass the current trigger to avoid interpreting held fire as a fresh press. */
  select(selected: boolean, triggerHeld: boolean, force = false) {
    if (selected === this.selected) return true;
    if (!force && !this.canSwitch) return false;
    this.selected = selected;
    this.held = triggerHeld;
    this.deployAge = 0;
    this.shield.deployed = false;
    return true;
  }

  tick(frame: OffhandFrame) {
    const pressed = frame.fire && !this.held;
    this.held = frame.fire;
    const active = this.selected && frame.alive;
    if (active && this.kind === 'melee' && pressed) this.melee.start(frame.origin, frame.aim);
    // A forced stow cancels further hits while the original recovery keeps running.
    const hits = this.melee.tick(frame.sourceId, frame.team, frame.origin,
      active && this.kind === 'melee' ? frame.targets : [], frame.wall);
    if (active && this.kind === 'shield' && frame.fire && this.shield.durability > 0) {
      this.deployAge = Math.min(SHIELD_RULES.deployTicks, this.deployAge + 1);
      this.shield.deployed = this.deployAge === SHIELD_RULES.deployTicks;
    } else {
      this.deployAge = 0;
      this.shield.deployed = false;
    }
    return hits;
  }

  checkpoint(): OffhandCheckpoint {
    return { kind: this.kind, selected: this.selected, held: this.held,
      deployAge: this.deployAge, shield: { ...this.shield }, melee: this.melee.checkpoint() };
  }
  static restore(state: OffhandCheckpoint) {
    if (!['firearm', 'melee', 'shield'].includes(state.kind)
      || typeof state.selected !== 'boolean' || typeof state.held !== 'boolean'
      || !Number.isInteger(state.deployAge) || state.deployAge < 0 || state.deployAge > SHIELD_RULES.deployTicks
      || !Number.isFinite(state.shield.durability) || state.shield.durability < 0 || state.shield.durability > SHIELD_RULES.durability
      || typeof state.shield.deployed !== 'boolean'
      || (state.kind !== 'shield' && (state.deployAge !== 0 || state.shield.deployed))
      || (state.shield.deployed && (!state.selected || !state.held || state.deployAge !== SHIELD_RULES.deployTicks || state.shield.durability === 0))
      || (state.kind !== 'melee' && state.melee.age !== -1)) throw Error('Invalid offhand checkpoint');
    const controller = new OffhandController(state.kind);
    controller.melee.restore(state.melee);
    controller.selected = state.selected;
    controller.held = state.held;
    controller.deployAge = state.deployAge;
    Object.assign(controller.shield, state.shield);
    return controller;
  }
}
