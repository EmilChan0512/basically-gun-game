import { hitRegionAt, type BulletTrace, type Point, type UnitHitbox } from '../../../game/combat/Ballistics';
import type { GadgetEntity } from './GadgetSimulation';
import { GROWTH_V3_RULES } from '../../content/growth-v3/Core';

/** Fixed range, no extra RNG; physical structures are independent of character navigation. */
export function traceGrowthBullet(source:string,team:1|2,origin:Point,angle:number,range:number,
  units:readonly UnitHitbox[],entities:readonly GadgetEntity[],wall:(x:number,y:number)=>boolean) {
  const trace:BulletTrace={origin:{...origin},end:{...origin},maxDistance:range,steps:0,hit:null,preSteps:0,initialHit:null,headMarked:false};
  let structureId:string|undefined;
  const ordered=[...units].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
  const structures=[...entities].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
  // Two-pixel collision sampling prevents the narrow new deployment models being skipped.
  const step=GROWTH_V3_RULES.bulletStep;
  for(let travelled=step;travelled<=range+step-.000001;travelled+=step) {
    const distance=Math.min(range,travelled);
    trace.end={x:origin.x+Math.cos(angle)*distance,y:origin.y+Math.sin(angle)*distance};trace.steps++;
    if(wall(trace.end.x,trace.end.y)){trace.hit={type:'wall'};break;}
    const entity=structures.find(e=>(e.gadgetId==='tk_cover'||e.team!==team)
      &&Math.abs(e.position.x-trace.end.x)<e.definition.width/2&&Math.abs(e.position.y-trace.end.y)<e.definition.height/2);
    if(entity){trace.hit={type:'wall'};structureId=entity.id;break;}
    for(const unit of ordered) {
      if(unit.id===source||!unit.alive||unit.team===team)continue;
      const region=hitRegionAt(trace.end,unit);
      if(region){trace.hit={type:'unit',target:unit.id,region};trace.headMarked=region==='head';break;}
    }
    if(trace.hit||distance===range)break;
  }
  return {trace,structureId,distance:Math.hypot(trace.end.x-origin.x,trace.end.y-origin.y)};
}
