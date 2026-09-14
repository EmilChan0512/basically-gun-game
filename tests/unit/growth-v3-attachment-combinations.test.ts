import {expect,it} from 'vitest';
import {mkdirSync,writeFileSync} from 'node:fs';
import {GROWTH_V3_WEAPONS,type GrowthWeaponId} from '../../src/shared/content/growth-v3/Weapons';
import {GROWTH_V3_ATTACHMENTS,resolveGrowthWeapon,validateAttachments,type GrowthAttachmentId,type WeaponConditions} from '../../src/shared/content/growth-v3/Attachments';
import {defaultGrowthLoadoutV3} from '../../src/shared/content/growth-v3/Loadout';
import {GrowthArsenalV3} from '../../src/shared/simulation/growth-v3/WeaponRules';
import {CONTENT_VERSION} from '../../src/shared/protocol/ContentVersion';

it('enumerates every compatible attachment subset and conserves ammunition through actual weapon operations',()=>{
  const counts:Record<string,number>={},pose={moving:false,airborne:false,crouching:false,stationaryTicks:0};
  const parts=Object.keys(GROWTH_V3_ATTACHMENTS) as GrowthAttachmentId[];
  // Reachable pose partitions, including both sides of the brace/focus thresholds.
  const poses=[
    {moving:false,airborne:false,crouching:false,stationaryTicks:0,braceTicks:0},
    {moving:true,airborne:false,crouching:false,stationaryTicks:0,braceTicks:0},
    {moving:false,airborne:true,crouching:false,stationaryTicks:0,braceTicks:0},
    {moving:false,airborne:false,crouching:true,stationaryTicks:23,braceTicks:23},
    {moving:false,airborne:false,crouching:true,stationaryTicks:24,braceTicks:24},
    {moving:false,airborne:false,crouching:false,stationaryTicks:29,braceTicks:0},
    {moving:false,airborne:false,crouching:false,stationaryTicks:30,braceTicks:0},
    {moving:false,airborne:false,crouching:true,stationaryTicks:30,braceTicks:30},
  ];
  const conditions:WeaponConditions[]=poses.flatMap(p=>[false,true].flatMap(first=>[false,true].map(empty=>({...p,first,empty}))));
  let conditionalResolutions=0;
  for(const id of Object.keys(GROWTH_V3_WEAPONS) as GrowthWeaponId[]){
    const side=id==='usp'||id==='revolver'||id==='burst_pistol',limit=side?1:3,base=GROWTH_V3_WEAPONS[id];counts[id]=0;
    const visit=(chosen:GrowthAttachmentId[],from:number)=>{
      let legal=true;try{validateAttachments(id,chosen,5);}catch{legal=false;}
      if(legal){
        counts[id]++;
        const d=resolveGrowthWeapon(id,chosen);
        const fail=(condition:boolean,label:string)=>{if(!condition)throw Error(`${id} ${chosen.join(',')}: ${label}`);};
        fail(d.magazine>=1&&d.magazine<=d.totalAmmo,'magazine bounds');
        fail(d.speedScale>=.9&&d.speedScale<=1.06,'speed cap');
        fail(d.maxRange>=base.maxRange*.7&&d.maxRange<=base.maxRange*1.25,'range cap');
        fail(d.spread>=base.spread*.7&&d.visualKick>=base.visualKick*.5&&d.prepare>=base.prepare*.65,'handling floors');
        fail(d.damage===base.damage&&d.interval===base.interval&&d.headMultiplier===base.headMultiplier,'forbidden damage/rate modifiers');
        for(const condition of conditions){
          const resolved=resolveGrowthWeapon(id,chosen,condition);conditionalResolutions++;
          const check=(ok:boolean,label:string)=>fail(ok,`${label} ${JSON.stringify(condition)}`);
          check(resolved.spread>=base.spread*.7&&resolved.bloomPerShot>=base.bloomPerShot*.7&&resolved.bloomCap>=base.bloomCap*.7,'conditional accuracy floors');
          check(resolved.reload>=base.reload*.7&&resolved.emptyReload>=base.emptyReload*.7&&resolved.prepare>=base.prepare*.65,'conditional timer floors');
          check(resolved.visualKick>=base.visualKick*.5&&resolved.hitKickScale>=.5,'conditional visual floors');
          check(resolved.speedScale>=.9&&resolved.speedScale<=1.06,'conditional speed limits');
          const rangeScale=resolved.maxRange/base.maxRange;
          check(rangeScale>=.7-1e-12&&rangeScale<=1.25+1e-12,'conditional range limits');
          check(Math.abs(resolved.falloffStart/base.falloffStart-rangeScale)<1e-12&&Math.abs(resolved.falloffEnd/base.falloffEnd-rangeScale)<1e-12,'all range endpoints scale together');
          check(resolved.falloffStart<resolved.falloffEnd&&resolved.falloffEnd<resolved.maxRange,'range ordering');
          check(Number.isInteger(resolved.magazine)&&Number.isInteger(resolved.totalAmmo)&&resolved.magazine>=1&&resolved.magazine<=resolved.totalAmmo,'conditional ammunition bounds');
          check(resolved.damage===base.damage&&resolved.interval===base.interval&&resolved.headMultiplier===base.headMultiplier,'conditional forbidden damage/rate modifiers');
        }
        const build=defaultGrowthLoadoutV3();
        if(id==='usp'||id==='revolver'||id==='burst_pistol'){build.secondary=id;build.attachments.secondary=chosen;}else{build.primary=id;build.attachments.primary=chosen;}
        const gun=new GrowthArsenalV3(build);let tick=0;
        if(side){gun.swap(0);while(tick<gun.readyTick)gun.step(tick++,false,pose,()=>.5);}
        fail(gun.current.ammo+gun.current.reserve===d.totalAmmo,'initial total');
        fail(!!gun.step(tick++,true,pose,()=>.5),'first shot');gun.interrupt();
        fail(gun.current.ammo+gun.current.reserve===d.totalAmmo-1,'shot consumption');
        while(tick<gun.readyTick)gun.step(tick++,false,pose,()=>.5);
        fail(gun.reload(tick),'reload accepted');const end=gun.current.reloadUntil;
        while(tick<=end)gun.step(tick++,false,pose,()=>.5);
        fail(gun.current.ammo===d.magazine&&gun.current.ammo+gun.current.reserve===d.totalAmmo-1,'reload conservation');
        fail(gun.supply(1000000)===1,'supply clamps');fail(gun.supply(1000000)===0,'full supply');
        fail(gun.current.ammo+gun.current.reserve===d.totalAmmo,'final total');
      }
      // Invalid subsets cannot become valid by adding another attachment.
      if(legal&&chosen.length<limit)for(let i=from;i<parts.length;i++)visit([...chosen,parts[i]],i+1);
    };
    visit([],0);
  }
  expect(Object.keys(counts)).toHaveLength(18);expect(Object.values(counts).every(n=>n>1)).toBe(true);
  expect(conditionalResolutions).toBe(Object.values(counts).reduce((a,b)=>a+b,0)*32);
  mkdirSync('artifacts/qa',{recursive:true});writeFileSync('artifacts/qa/growth-attachment-combinations.json',JSON.stringify({content:CONTENT_VERSION,counts,total:Object.values(counts).reduce((a,b)=>a+b,0),conditionalResolutions,conditions,scope:'Stage5 compatible subsets, primary up to3 / secondary up to1; 32 condition partitions check spec floors, caps, range scaling and forbidden modifiers. Actual one-shot/reload/supply conservation uses neutral pose. Production validator enumerates subsets; independent whitelist/slot/stage/capacity evidence is in attachment-whitelist.test.ts. Condition activation timing is separately tested in attachment integration.'},null,2));
},60000);
