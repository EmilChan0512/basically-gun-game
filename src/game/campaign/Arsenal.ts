import { COMBAT_FRAME_MS, GunController, type ShotClock, type WeaponId } from '../combat/Combat';
import { traceBulletLine, type Point, type RandomSource, type UnitHitbox, type BulletTrace } from '../combat/Ballistics';
import { Recoil, type ShootingPose } from '../combat/Recoil';
import { WEAPONS } from './Catalog';

/** Multi-actor adapter around the same gun timers and ballistics used in the sandbox. */
export class Arsenal {
  private clock: ShotClock = { remainingFrames: 0, phaseMs: 0 };
  private guns: Map<WeaponId, GunController>;
  readonly primary: WeaponId;
  readonly secondary: WeaponId;
  selected: WeaponId;
  private latched = false;
  private held = false;
  recoil: Recoil;
  shots = 0;
  constructor(selected: WeaponId = 'm4', primary?: WeaponId, secondary: WeaponId = 'usp', readonly ammoMultiplier = 0.9) {
    this.primary = primary ?? (WEAPONS[selected].slot === 'primary' ? selected : 'm4');
    this.secondary = secondary;
    this.guns = new Map([...new Set([this.primary, this.secondary])].map(id => [id, new GunController(WEAPONS[id].config, this.clock, ammoMultiplier)]));
    this.selected = this.guns.has(selected) ? selected : this.primary;
    this.recoil = new Recoil(this.gun.weapon.recoil);
  }
  get gun() { return this.guns.get(this.selected)!; }
  checkpoint() {
    return { primary: this.primary, secondary: this.secondary, selected: this.selected, ammoMultiplier: this.ammoMultiplier,
      clock: { ...this.clock }, latched: this.latched, held: this.held, shots: this.shots,
      recoil: { base: this.recoil.base, dynamic: this.recoil.dynamic, upper: this.recoil.upper },
      guns: [...this.guns].map(([id, gun]) => ({ id, state: gun.checkpoint() })) };
  }
  static restore(state: ReturnType<Arsenal['checkpoint']>) {
    const arsenal = new Arsenal(state.selected, state.primary, state.secondary, state.ammoMultiplier);
    Object.assign(arsenal.clock, state.clock);
    arsenal.latched = state.latched; arsenal.held = state.held; arsenal.shots = state.shots;
    Object.assign(arsenal.recoil, state.recoil);
    for (const gun of state.guns) arsenal.guns.get(gun.id)!.restore(gun.state);
    return arsenal;
  }
  get empty() { return [...this.guns.values()].every(gun => gun.ammo === 0 && gun.reserveAmmo === 0); }
  setTrigger(held: boolean) { this.held = held; if (!held) this.latched = false; }
  swap() {
    this.gun.cancelReload(); this.selected = this.selected === this.primary ? this.secondary : this.primary;
    this.recoil.switchWeapon(this.gun.weapon.recoil); this.latched = this.held;
    this.gun.checkReload();
  }
  resupply() {
    // Our supply boxes restore reserves; reload is still required to fill the magazine.
    let changed = false;
    for (const gun of this.guns.values()) {
      const reserve = Math.ceil(gun.weapon.magazineSize * (gun.weapon.spareMagazines + 1) * this.ammoMultiplier) - gun.weapon.magazineSize;
      if (gun.reserveAmmo < reserve) { gun.reserveAmmo = reserve; changed = true; }
    }
    this.gun.checkReload(); return changed;
  }
  tick(source: string, team: number, origin: Point, aim: Point, pose: ShootingPose,
    units: UnitHitbox[], wall: (x: number, y: number) => boolean, random: RandomSource, spreadScale = 1): BulletTrace[] {
    const traces: BulletTrace[] = [];
    this.gun.tick(COMBAT_FRAME_MS, () => {
      if (this.held && !this.latched && this.gun.canFire) {
        const angle = Math.atan2(aim.y - origin.y, aim.x - origin.x) + this.recoil.sampleDegrees(random) * spreadScale * Math.PI / 180;
        const weapon = this.gun.weapon;
        const definition = WEAPONS[weapon.id];
        for (let i = 0; i < definition.pellets; i++) {
          const pelletAngle = angle + (definition.pellets === 1 ? 0 : (i / (definition.pellets - 1) - 0.5) * definition.spread * Math.PI / 180);
          traces.push(traceBulletLine({ source, sourceTeam: team, origin, aim: { x: origin.x + Math.cos(pelletAngle) * 1000, y: origin.y + Math.sin(pelletAngle) * 1000 },
            units, rangeUnits: weapon.rangeUnits, random, isOpaqueWall: p => wall(p.x, p.y), muzzle: { xOff: weapon.xOff, yOff: weapon.yOff, facing: aim.x >= origin.x ? 1 : -1 } }));
        }
        this.gun.fire(source, null, 0); this.shots++; this.recoil.afterShot();
        if (!weapon.automatic) this.latched = true;
      }
      this.recoil.tick(pose);
    });
    return traces;
  }
}
