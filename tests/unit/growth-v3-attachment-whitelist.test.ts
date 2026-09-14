import {expect,it} from 'vitest';
import {GROWTH_V3_WEAPONS,type GrowthWeaponId} from '../../src/shared/content/growth-v3/Weapons';
import {GROWTH_V3_ATTACHMENTS,validateAttachments,type GrowthAttachmentId} from '../../src/shared/content/growth-v3/Attachments';

// Independent transcription of development specification sections 5 and 6.
// Never obtain expected family, feed, slot or stage from the production catalog.
const AR=['m4','famas','burst_ar'],SMG=['mp5','vector','ump'];
const SG=['shotgun','auto_sg','slug_sg'],PREC=['scout','dmr','heavy_sniper'];
const LMG=['saw','heavy_lmg','compact_lmg'],SIDE=['usp','revolver','burst_pistol'];
const primary=[...AR,...SMG,...SG,...PREC,...LMG],all=[...primary,...SIDE];
const box=all.filter(id=>!['shotgun','slug_sg','revolver'].includes(id));
const whitelist:Record<GrowthAttachmentId,string[]>={
  M01:[...AR,...SMG,...LMG],M02:all,M03:[...AR,...SMG,...PREC,...SIDE],M04:[...AR,...SMG,...LMG,...SIDE],M05:['shotgun','auto_sg'],M06:['shotgun','auto_sg'],
  B01:primary,B02:primary,B03:[...AR,...PREC,'slug_sg'],B04:[...AR,...SMG,...PREC,...LMG,'auto_sg'],B05:primary,B06:[...AR,...SMG,...LMG],
  G01:[...AR,...SMG,...LMG,'auto_sg'],G02:[...AR,...SMG,...PREC,...LMG,'auto_sg'],G03:primary,G04:[...AR,...SMG,...LMG],G05:[...PREC,...LMG],G06:all,
  S01:primary,S02:primary,S03:[...AR,...PREC,...LMG],S04:primary,S05:primary,S06:[...AR,...SMG,'shotgun','auto_sg','compact_lmg'],
  A01:box,A02:box,A03:box,A04:[...AR,...SMG],A05:LMG,A06:box,
  O01:all,O02:all,O03:primary,O04:[...AR,...PREC,...LMG],O05:PREC,O06:[...AR,...PREC,...LMG],
};
const ids=Object.keys(whitelist) as GrowthAttachmentId[];

it('matches all 648 specification weapon/part permissions at both content stages',()=>{
  expect(Object.keys(GROWTH_V3_WEAPONS).sort()).toEqual([...all].sort());
  expect(Object.keys(GROWTH_V3_ATTACHMENTS).sort()).toEqual([...ids].sort());
  for(const weapon of all)for(const id of ids)for(const stage of [2,5] as const){
    const expected=whitelist[id].includes(weapon)&&(stage===5||'MBA'.includes(id[0]));
    const validate=()=>validateAttachments(weapon as GrowthWeaponId,[id],stage);
    if(expected)expect(validate(),`${weapon}/${id}/P${stage}`).toEqual([id]);
    else expect(validate,`${weapon}/${id}/P${stage}`).toThrow();
  }
});

it('rejects every duplicate slot and enforces primary/sidearm capacity independently',()=>{
  for(const weapon of all){
    const legal=ids.filter(id=>whitelist[id].includes(weapon));
    for(const a of legal)for(const b of legal){
      const validate=()=>validateAttachments(weapon as GrowthWeaponId,[a,b],5);
      if(a[0]===b[0]||SIDE.includes(weapon))expect(validate,`${weapon}/${a}/${b}`).toThrow();
      else expect(validate()).toEqual([a,b].sort());
    }
    if(primary.includes(weapon)){
      // Each primary accepts these three separate slots, but never a fourth.
      expect(validateAttachments(weapon as GrowthWeaponId,['M02','B01','O01'],5)).toEqual(['B01','M02','O01']);
      expect(()=>validateAttachments(weapon as GrowthWeaponId,['M02','B01','O01','G06'],5)).toThrow();
    }
  }
});
