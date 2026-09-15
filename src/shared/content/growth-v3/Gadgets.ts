import type { GrowthClassId } from './Core';

export interface GadgetDefinition {
  classId: GrowthClassId; name: string; kind: 'throw' | 'deploy' | 'self';
  cooldown: number; charges: number; cast: number; recovery: number; fuse: number; arm: number;
  duration: number; radius: number; width: number; height: number; health: number;
  damageMax: number; damageMin: number; structureDamageMax: number; structureDamageMin: number;
  slow: number; slowTicks: number; armor: number; armorTicks: number;
  intercepts: number; interval: number; heal: number; healBudget: number; ammoScale: number;
  markTicks: number; noiseRadius: number; radarTicks: number; empTicks: number;
  electronic: boolean; reservesDeploySlot: boolean; reservesSmokeSlot: boolean;
}
function gadget(classId: GrowthClassId, name: string, kind: GadgetDefinition['kind'], charges: number,
  values: Partial<GadgetDefinition>): GadgetDefinition {
  return { classId, name, kind, charges, cooldown: 1800, cast: kind === 'deploy' ? 12 : 6, recovery: 6,
    fuse: 0, arm: 0, duration: 0, radius: 0, width: 0, height: 0, health: 0,
    damageMax: 0, damageMin: 0, structureDamageMax: 0, structureDamageMin: 0,
    slow: 0, slowTicks: 0, armor: 0, armorTicks: 0, intercepts: 0, interval: 0,
    heal: 0, healBudget: 0, ammoScale: 0, markTicks: 0, noiseRadius: 0, radarTicks: 0,
    empTicks: 0, electronic: false, reservesDeploySlot: kind === 'deploy', reservesSmokeSlot: false, ...values };
}
export const GROWTH_V3_GADGETS = {
  as_frag: gadget('assault','破片雷','throw',2,{ fuse: 27, radius: 120, damageMax: 50, damageMin: 10, structureDamageMax: 75, structureDamageMin: 15 }),
  as_concussion: gadget('assault','震荡雷','throw',2,{ fuse: 24, radius: 100, damageMax: 10, damageMin: 10, structureDamageMax: 10, structureDamageMin: 10, slow: .2, slowTicks: 30 }),
  as_charge: gadget('assault','定向爆破包','deploy',1,{ arm: 30, radius: 100, damageMax: 30, damageMin: 10, structureDamageMax: 90, structureDamageMin: 30, width: 12, height: 10, health: 20, duration: 240 }),
  tk_cover: gadget('tank','折叠掩体','deploy',1,{ width: 16, height: 52, health: 120, duration: 360 }),
  tk_interceptor: gadget('tank','投掷拦截器','deploy',1,{ arm: 15, width: 20, height: 20, health: 40, duration: 300, radius: 140, intercepts: 2, interval: 15, electronic: true }),
  tk_plate: gadget('tank','应急装甲包','self',2,{ cast: 30, armor: 15, armorTicks: 120 }),
  sn_beacon: gadget('sniper','侦察信标','deploy',1,{ arm: 15, width: 16, height: 24, health: 35, duration: 2400, cooldown: 2700, radius: 880, interval: 60, markTicks: 30, electronic: true }),
  sn_emp: gadget('sniper','EMP弹','throw',2,{ fuse: 24, radius: 160, empTicks: 90 }),
  sn_decoy: gadget('sniper','声光诱饵','throw',2,{ fuse: 15, width: 12, height: 12, health: 15, duration: 150, interval: 30, noiseRadius: 480, radarTicks: 15, electronic: true, reservesDeploySlot: true }),
  md_smoke: gadget('medic','救援烟雾','throw',2,{ fuse: 24, radius: 150, duration: 150, reservesSmokeSlot: true }),
  md_station: gadget('medic','急救站','deploy',1,{ arm: 15, width: 24, height: 24, health: 60, duration: 300, radius: 140, interval: 30, heal: 3, healBudget: 90, electronic: true }),
  md_ammo: gadget('medic','弹药投送','deploy',1,{ arm: 15, width: 24, height: 20, health: 50, duration: 300, radius: 60, ammoScale: .20 }),
} as const;
export type GrowthGadgetId = keyof typeof GROWTH_V3_GADGETS;
export function isGadgetId(value: unknown): value is GrowthGadgetId {
  return typeof value === 'string' && Object.hasOwn(GROWTH_V3_GADGETS, value);
}
/** G2 changes only the equipped operator's three exclusive tools. */
export function resolveGadget(id: GrowthGadgetId, upgraded: boolean): GadgetDefinition {
  const def = { ...GROWTH_V3_GADGETS[id] };
  if (!upgraded) return def;
  switch (id) {
    case 'as_frag': case 'as_concussion': case 'as_charge': def.radius *= 1.15; def.damageMax *= .85; def.damageMin *= .85; break;
    case 'tk_cover': def.health = 150; def.duration = 300; break;
    case 'tk_interceptor': def.health = 55; def.duration = 240; break;
    case 'tk_plate': def.armor = 20; def.armorTicks = 90; break;
    case 'sn_beacon': def.radius *= 1.25; def.markTicks = 24; break;
    case 'sn_emp': def.radius = 190; def.empTicks = 60; break;
    case 'sn_decoy': def.noiseRadius = 600; def.duration = 120; break;
    case 'md_smoke': def.radius = 180; def.duration = 120; break;
    case 'md_station': def.radius = 180; def.healBudget = 72; break;
    case 'md_ammo': def.radius = 100; def.ammoScale = .15; break;
  }
  return def;
}
