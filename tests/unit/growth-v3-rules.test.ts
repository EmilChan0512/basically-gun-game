import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { GROWTH_CLASS_IDS } from '../../src/shared/content/growth-v3/Core';
import { GROWTH_V3_WEAPONS, type GrowthWeaponId } from '../../src/shared/content/growth-v3/Weapons';
import { GROWTH_V3_ATTACHMENTS, growthReloadTicks, resolveGrowthWeapon, validateAttachments, type GrowthAttachmentId } from '../../src/shared/content/growth-v3/Attachments';
import { GROWTH_V3_ABILITIES, GROWTH_V3_OPERATORS } from '../../src/shared/content/growth-v3/Operators';
import { GROWTH_V3_GADGETS, resolveGadget } from '../../src/shared/content/growth-v3/Gadgets';
import { GROWTH_V3_CARDS, GROWTH_V3_EVOLUTIONS, legalGrowthCards } from '../../src/shared/content/growth-v3/Cards';
import { GROWTH_V3_PERKS } from '../../src/shared/content/growth-v3/Perks';
import { defaultGrowthLoadoutV3, validateGrowthLoadoutV3, changeGrowthAbility } from '../../src/shared/content/growth-v3/Loadout';
import { resolveAbility, abilityHealing } from '../../src/shared/simulation/growth-v3/AbilityRules';
import { GrowthArsenalV3, damageScaleAt, groupedShotDamage } from '../../src/shared/simulation/growth-v3/WeaponRules';
import { grantArmor, newArmor, resolveIncomingDamage, radialDamage } from '../../src/shared/simulation/growth-v3/DamageRules';
import { freshGrowthCareer } from '../../src/shared/content/GrowthCareer';
import { defaultGrowthLoadout } from '../../src/shared/content/GrowthCatalog';
import { migrateGrowthCareerV3, validateGrowthCareerV3 } from '../../src/shared/content/growth-v3/Career';

const pose = { moving: false, airborne: false, crouching: false, stationaryTicks: 0 };
describe('growth v3 specification content and loadout authority', () => {
  it('contains exactly the approved four operators and every numeric content row', () => {
    expect(Object.keys(GROWTH_V3_OPERATORS)).toEqual(GROWTH_CLASS_IDS);
    expect(Object.keys(GROWTH_V3_ABILITIES)).toHaveLength(8);
    expect(Object.keys(GROWTH_V3_GADGETS)).toHaveLength(12);
    expect(Object.keys(GROWTH_V3_CARDS)).toHaveLength(48);
    expect(Object.keys(GROWTH_V3_EVOLUTIONS)).toHaveLength(8);
    expect(Object.keys(GROWTH_V3_PERKS)).toHaveLength(12);
    expect(Object.keys(GROWTH_V3_WEAPONS)).toHaveLength(18);
    expect(Object.values(GROWTH_V3_WEAPONS).filter(gun => gun.stage === 2)).toHaveLength(10);
    expect(Object.keys(GROWTH_V3_ATTACHMENTS)).toHaveLength(36);
    expect(Object.values(GROWTH_V3_ATTACHMENTS).filter(part => part.stage === 2)).toHaveLength(18);
  });
  it('N17 rejects cross-class abilities/gadgets and unknown authority-owned fields', () => {
    for (const classId of GROWTH_CLASS_IDS) {
      const initial = defaultGrowthLoadoutV3(classId);
      expect(validateGrowthLoadoutV3(initial,2)).toEqual(initial);
      for (const [gadgetId, gadget] of Object.entries(GROWTH_V3_GADGETS)) {
        const request = { ...initial, gadgetId };
        if (gadget.classId === classId) expect(validateGrowthLoadoutV3(request,2).gadgetId).toBe(gadgetId);
        else expect(() => validateGrowthLoadoutV3(request,2)).toThrow('not_owner_class');
      }
      expect(() => validateGrowthLoadoutV3({ ...initial, charges: 99 },2)).toThrow('Unknown');
      expect(() => validateGrowthLoadoutV3({ ...initial, attachments: { ...initial.attachments, damage: 999 } },2)).toThrow('Unknown');
      expect(() => validateGrowthLoadoutV3({ ...initial, perks: ['pk_landing','pk_supplyrun','pk_dressing'] },2)).toThrow('perk');
    }
  });
  it('switches A/B pools to eight legal cards without changing the exclusive gadget', () => {
    for (const classId of GROWTH_CLASS_IDS) for (const ability of GROWTH_V3_OPERATORS[classId].abilities) {
      const base = defaultGrowthLoadoutV3(classId), next = changeGrowthAbility(base,ability);
      expect(legalGrowthCards(classId,ability)).toHaveLength(9);
      expect(next.pool).toHaveLength(8); expect(new Set(next.pool).size).toBe(8);
      expect(validateGrowthLoadoutV3(next,2).gadgetId).toBe(base.gadgetId);
    }
    const medic = defaultGrowthLoadoutV3('medic');
    expect(() => validateGrowthLoadoutV3({ ...medic, abilityId:'md_link' },2)).toThrow('legal cards');
    expect(() => changeGrowthAbility(medic,'tk_shield')).toThrow('not_owner_class');
  });
  it('gates P5 guns and parts, and rejects incompatible feeds and duplicate slots', () => {
    const assault = defaultGrowthLoadoutV3();
    expect(() => validateGrowthLoadoutV3({ ...assault, primary:'vector' },2)).toThrow('primary');
    expect(validateGrowthLoadoutV3({ ...assault, primary:'vector' },5).primary).toBe('vector');
    expect(() => validateAttachments('shotgun',['A01'],5)).toThrow('Incompatible');
    expect(() => validateAttachments('revolver',['A02'],5)).toThrow('Incompatible');
    expect(() => validateAttachments('m4',['B01','B02'],5)).toThrow('Incompatible');
    expect(() => validateAttachments('usp',['M02','O02'],5)).toThrow('Invalid');
    expect(() => validateAttachments('m4',['O02'],2)).toThrow('Incompatible');
  });
});

describe('growth v3 weapon and damage specification assertions', () => {
  it('matches all eighteen spread, recovery, visual kick and pellet fan rows to specification 5.1',()=>{
    const spec=readFileSync('docs/COMBAT_DEVELOPMENT_SPEC_V1.md','utf8').split('### 5.1')[1].split('### 5.2')[0];
    const rows=spec.split('\n').filter(line=>/^\| \w+ \| [\d.]+ \|/.test(line));
    expect(rows).toHaveLength(18);const seen=new Set<string>();
    for(const row of rows){
      const cells=row.split('|').slice(1,-1).map(s=>s.trim()),id=cells[0];seen.add(id);
      const [bloomPerShot,bloomCap]=cells[2].split('/').map(Number);
      const [recoverWait,recoverPerTick]=cells[3].split('/').map(Number);
      expect(GROWTH_V3_WEAPONS[id as GrowthWeaponId],id).toMatchObject({spread:Number(cells[1]),bloomPerShot,bloomCap,
        recoverWait,recoverPerTick,visualKick:Number(cells[4]),fanDegrees:Number(cells[5])});
    }
    expect([...seen].sort()).toEqual(Object.keys(GROWTH_V3_WEAPONS).sort());
  });
  it('matches every basic weapon column against the approved development document',()=>{
    const spec=readFileSync('docs/COMBAT_DEVELOPMENT_SPEC_V1.md','utf8');
    const rows=spec.split('\n').filter(line=>/^\| \w+ \/ (AR|SMG|SG|PREC|LMG|SIDE) \/ P[25] \|/.test(line));
    expect(rows).toHaveLength(18);const seen=new Set<string>();
    for(const row of rows){
      const cells=row.split('|').slice(1,-1).map(s=>s.trim());
      const [id,family,stage]=cells[0].split(' / ');seen.add(id);
      const [damage,pellets,headMultiplier]=cells[1].match(/[\d.]+/g)!.map(Number);
      const timing=cells[2].match(/\d+/g)!.map(Number),mode=cells[2].startsWith('三连发')?'burst':cells[2].startsWith('自动')?'auto':'semi';
      const [magazine,totalAmmo]=cells[3].split('/').map(Number),[reload,emptyReload]=cells[4].split('/').map(Number);
      const [falloffStart,falloffEnd,maxRange,minDamageScale]=cells[5].match(/[\d.]+/g)!.map(Number);
      expect(GROWTH_V3_WEAPONS[id as GrowthWeaponId],id).toMatchObject({family,stage:Number(stage.slice(1)),damage,pellets,headMultiplier,
        mode,interval:timing[0],burstGap:mode==='burst'?timing[1]:0,magazine,totalAmmo,reload,emptyReload,
        falloffStart,falloffEnd,maxRange,minDamageScale,prepare:Number(cells[6])});
    }
    expect([...seen].sort()).toEqual(Object.keys(GROWTH_V3_WEAPONS).sort());
  });
  it.each([['m4',10,36],['famas',13,36],['burst_ar',9,38]] as const)('N01-N03 uses actual %s trigger scheduling', (weaponId, count, killTick) => {
    const loadout = { ...defaultGrowthLoadoutV3(), primary: weaponId }, gun = new GrowthArsenalV3(loadout);
    let health = 100000; const shots: number[] = [];
    for (let tick=0; tick<=killTick; tick++) {
      const shot = gun.step(tick,weaponId === 'burst_ar' ? tick % 16 === 0 : true,pose,() => .5);
      if (shot) { shots.push(tick); health -= groupedShotDamage(shot.definition,[{ distance:0,head:false }]); }
      if (tick < killTick) expect(health).toBeGreaterThan(0);
    }
    expect(shots).toHaveLength(count); expect(shots.at(-1)).toBe(killTick); expect(health).toBeLessThanOrEqual(0);
    if (weaponId === 'burst_ar') expect(shots).toEqual([0,3,6,16,19,22,32,35,38]);
  });
  it('N04-N06 implements fixed range falloff, head thresholds and grouped shotgun damage', () => {
    const m4 = resolveGrowthWeapon('m4',[]);
    expect(damageScaleAt(m4,505)).toBeCloseTo(.825);
    expect(groupedShotDamage(m4,[{distance:505,head:false}])).toBe(8250);
    expect(damageScaleAt(m4,900)).toBe(.65); expect(damageScaleAt(m4,901)).toBe(0);
    const sniper = resolveGrowthWeapon('heavy_sniper',[]);
    expect(groupedShotDamage(sniper,[{distance:0,head:false}])).toBe(72000);
    expect(groupedShotDamage(sniper,[{distance:0,head:true}])).toBe(104400);
    const shotgun = resolveGrowthWeapon('shotgun',[]);
    expect(groupedShotDamage(shotgun,Array.from({length:7},()=>({distance:0,head:false})))).toBe(70000);
    expect(() => groupedShotDamage(shotgun,Array.from({length:8},()=>({distance:0,head:false})))).toThrow('Too many');
  });
  it('N07-N09 caps combined mitigation and never extends a strong armor plate with a weak source', () => {
    const shield = { budget:120000,reduction:.65,facing:true };
    expect(resolveIncomingDamage({ hp:100,tick:0,armor:newArmor(),shield,personalReductions:[.4] })).toEqual({life:25000,shield:65000,personal:10000,armor:0});
    expect(shield.budget).toBe(55000);
    const armor = newArmor(); grantArmor(armor,15,120,0,'plate');
    expect(resolveIncomingDamage({hp:100,tick:1,armor,shield:{budget:20000,reduction:.65,facing:true},personalReductions:[.35]})).toEqual({life:37000,shield:20000,personal:28000,armor:15000});
    grantArmor(armor,25,30,1,'ultimate');
    expect(grantArmor(armor,10,120,2,'medic')).toBe(false); expect(armor).toEqual({remaining:25000,until:31,source:'ultimate'});
    expect(resolveIncomingDamage({hp:10,tick:31,armor})).toEqual({life:10000,shield:0,personal:0,armor:0});
  });
  it('N10 resolves additive parts and rounds reload only after all conditions', () => {
    const parts: GrowthAttachmentId[] = ['B01','A01','M02'];
    const gun = resolveGrowthWeapon('m4',parts);
    expect(gun.magazine).toBe(24); expect(gun.totalAmmo).toBe(120); expect(gun.damage).toBe(10); expect(gun.interval).toBe(4);
    expect(growthReloadTicks('m4',parts,false,[.8])).toBe(24);
    expect(growthReloadTicks('m4',parts,false,[.8,.75])).toBe(23);
    expect(gun.spread).toBeCloseTo(.96); expect(gun.visualKick).toBeCloseTo(.96);
    expect(gun.prepare).toBeCloseTo(8.8); expect(gun.speedScale).toBeCloseTo(.96);
    expect(resolveGrowthWeapon('m4',[...parts].reverse())).toEqual(gun);
  });
  it('N11-N12 validates plate no-effect and exact explosion boundary', () => {
    const armor=newArmor(); grantArmor(armor,20,90,0,'old');
    expect(grantArmor(armor,15,120,1,'plate',true)).toBe(false);
    expect(armor.remaining).toBe(20000); expect(armor.until).toBe(90);
    expect([0,120,121].map(d=>radialDamage(50,10,120,d))).toEqual([50,10,0]);
    const frag=resolveGadget('as_frag',true);
    expect(frag.radius).toBe(138); expect(frag.damageMax).toBe(42.5); expect(frag.structureDamageMax).toBe(75);
  });
  it('keeps ammo conserved through transfer, locked reload, swap, and checkpoint resume', () => {
    const loadout=defaultGrowthLoadoutV3(); loadout.attachments.primary=['B01','A01','M02'];
    const a=new GrowthArsenalV3(loadout);
    for(let tick=0;tick<8;tick++) a.step(tick,tick===0,pose,()=>.5);
    expect(a.current.ammo).toBe(23); expect(a.transfer(4)).toBe(1); expect(a.current.reserve).toBe(95);
    expect(a.transfer(4)).toBe(0);
    a.step(8,true,pose,()=>.5);
    for(let tick=9;tick<12;tick++) a.step(tick,false,pose,()=>.5);
    expect(a.reload(12,[.8])).toBe(true); expect(a.current.reloadUntil).toBe(36);
    const b=GrowthArsenalV3.restore(a.checkpoint());
    for(let tick=12;tick<=36;tick++) {
      expect(a.step(tick,false,pose,()=>.25)).toEqual(b.step(tick,false,pose,()=>.25));
      expect(a.checkpoint()).toEqual(b.checkpoint());
    }
    expect(a.current.ammo+a.current.reserve).toBe(118);
    a.swap(37); expect(a.selectedId).toBe('usp'); expect(a.readyTick).toBeGreaterThanOrEqual(43);
  });
  it('cannot skip a burst delay by swapping or cancelling an unfinished group', () => {
    const a=new GrowthArsenalV3({...defaultGrowthLoadoutV3(),primary:'burst_ar'});
    a.step(0,true,pose,()=>.5); a.swap(1); expect(a.readyTick).toBeGreaterThanOrEqual(10);
    for(let tick=1;tick<10;tick++) expect(a.step(tick,tick%2===0,pose,()=>.5)).toBe(null);
    expect(a.checkpoint().guns.primary.ammo).toBe(26);
    a.swap(10); expect(a.readyTick).toBeGreaterThanOrEqual(19);
  });
  it('enforces semi-auto edge input, fan symmetry, and invalid checkpoint constraints', () => {
    const a=new GrowthArsenalV3({...defaultGrowthLoadoutV3(),primary:'shotgun'}), shots=[];
    for(let tick=0;tick<50;tick++) { const shot=a.step(tick,true,pose,()=>.5); if(shot)shots.push(shot); }
    expect(shots).toHaveLength(1); shots[0].offsetsDegrees.forEach((angle,index)=>expect(angle).toBeCloseTo(-6+2*index));
    const bad=a.checkpoint(); bad.guns.primary.reserve=1000;
    expect(()=>GrowthArsenalV3.restore(bad)).toThrow('Invalid gun state');
    expect(()=>a.step(50,false,pose,()=>.5)).not.toThrow();
    expect(()=>a.step(50,false,pose,()=>.5)).toThrow('exactly once');
  });
});

describe('growth v3 abilities, cards and migration', () => {
  it('N25 stacks pulse tradeoffs additively and scopes cards to the selected E', () => {
    const d=resolveAbility('md_pulse',['md_A1','md_A2','md_A3']);
    expect(d.heal).toBe(15); expect(d.radius).toBe(240); expect(d.cooldown).toBe(378); expect(d.speed).toBe(1);
    expect(abilityHealing(d,false,25,100,['md_C1'])).toBe(25);
    expect(()=>resolveAbility('md_pulse',['md_B1'])).toThrow('Invalid ability build');
    expect(()=>resolveAbility('as_roll',['as_EV_A'])).toThrow('Invalid evolution build');
    const roll=resolveAbility('as_roll',['as_A1','as_A2','as_EV_A']);
    expect([roll.maxCharges,roll.cooldown,roll.chargeGap,roll.transfer,roll.speed]).toEqual([2,360,60,3,1.35]);
    const link=resolveAbility('md_link',['md_C4','md_B1','md_B3']);
    expect([link.selfHeal,link.heal,link.radius,link.pulseInterval,link.duration]).toEqual([3,4,300,10,60]);
  });
  it('N22 migrates the real released schema without resetting career metrics or silently retaining incompatible parts', () => {
    const previous=freshGrowthCareer(); previous.xp=1600; previous.mastery.tank=3000; previous.weaponXp.shotgun=1000;
    previous.loadouts=[{...defaultGrowthLoadout('tank'),primary:'shotgun',attachment:'quickmag'}];
    const original=structuredClone(previous), next=migrateGrowthCareerV3(previous);
    expect(previous).toEqual(original); expect(next.version).toBe(3); expect(next.mastery).toEqual(previous.mastery);
    expect(next.weaponXp).toEqual(previous.weaponXp); expect(next.metrics).toEqual(previous.metrics);
    expect(next.loadouts[0].attachments.primary).toEqual([]);
    expect(next.loadouts[0].gadgetId).toBe('tk_cover'); expect(next.loadouts[0].pool).toHaveLength(8);
    expect(next.legacyLoadoutArchive[0].original).toEqual(original.loadouts[0]);
    expect(next.legacyLoadoutArchive[0].notices.join('')).toContain('不兼容');
    expect(migrateGrowthCareerV3(next)).toEqual(next); expect(()=>validateGrowthCareerV3(next)).not.toThrow();
    const corrupt=structuredClone(next); corrupt.loadouts[0].gadgetId='md_smoke';
    expect(()=>migrateGrowthCareerV3(corrupt)).toThrow('not_owner_class');
  });
  it('migrates a v1 three-class career through the existing validated v2 migration', () => {
    const legacy=freshGrowthCareer() as unknown as Record<string,unknown>; legacy.version=1;
    const mastery=legacy.mastery as Record<string,number>; delete mastery.medic;
    const metrics=legacy.metrics as Record<string,number>; delete metrics.healingDone; delete metrics.healingXp;
    const next=migrateGrowthCareerV3(legacy);
    expect(next.mastery.medic).toBe(0); expect(next.metrics.healingDone).toBe(0); expect(next.version).toBe(3);
  });
});

// Enumerate the same complete build space once, then give each weapon an independent test.
const legalWeaponBuilds = (Object.keys(GROWTH_V3_WEAPONS) as GrowthWeaponId[]).map(id => {
  const base=GROWTH_V3_WEAPONS[id], parts=(Object.keys(GROWTH_V3_ATTACHMENTS) as GrowthAttachmentId[]).filter(key=>GROWTH_V3_ATTACHMENTS[key].weapons.includes(id));
  const maximum=base.family==='SIDE'?1:3;
  const builds: GrowthAttachmentId[][] = [];
  const visit=(chosen:GrowthAttachmentId[], start:number) => {
    builds.push(chosen);
    if(chosen.length===maximum)return;
    for(let i=start;i<parts.length;i++) if(!chosen.some(key=>GROWTH_V3_ATTACHMENTS[key].slot===GROWTH_V3_ATTACHMENTS[parts[i]].slot)) visit([...chosen,parts[i]],i+1);
  };
  visit([],0);
  return { id, builds };
});

it('covers more than 10000 legal builds across all 18 weapons', () => {
  expect(legalWeaponBuilds).toHaveLength(18);
  expect(legalWeaponBuilds.reduce((total, weapon) => total + weapon.builds.length, 0)).toBeGreaterThan(10000);
});

it.each(legalWeaponBuilds)('exhaustively preserves damage/fire rate/ammo bounds for $id legal builds', ({ id, builds }) => {
  const base=GROWTH_V3_WEAPONS[id];
  for(const chosen of builds) {
    const resolved=resolveGrowthWeapon(id,chosen);
    expect(resolved.damage).toBe(base.damage); expect(resolved.interval).toBe(base.interval); expect(resolved.headMultiplier).toBe(base.headMultiplier);
    expect(resolved.totalAmmo).toBeLessThanOrEqual(base.totalAmmo); expect(resolved.magazine).toBeLessThanOrEqual(resolved.totalAmmo);
    expect(resolved.speedScale).toBeGreaterThanOrEqual(.9); expect(resolved.speedScale).toBeLessThanOrEqual(1.06);
    expect(resolved.falloffStart).toBeLessThan(resolved.falloffEnd); expect(resolved.falloffEnd).toBeLessThan(resolved.maxRange);
  }
});
