import { customMatch } from '../src/shared/content/Maps';
import { wallFor } from '../src/game/campaign/Missions';
import { OriginalMovement } from '../src/game/movement/OriginalMovement';
import { trackedWaypoint } from '../src/game/campaign/Navigation';
import { traversalJump } from '../src/shared/simulation/Traversal';
import { writeFileSync } from 'node:fs';
const map=customMatch('hijack'), wall=wallFor(map); const results=[];
for(let from=0;from<16;from++) for(let to=0;to<16;to++) {
 if(from===to)continue;
 const m=new OriginalMovement(wall);m.reset(map.navigation[from].x,map.navigation[from].y);const state={};let reached=false;
 for(let t=0;t<1800;t++){
 const target=map.navigation[to];if(Math.abs(m.x-target.x)<35&&Math.abs(m.y-target.y)<45){reached=true;break;}
 const p=trackedWaypoint(map.navigation,m,target,state),dx=p.x-m.x;
 if(traversalJump(m,p,wall))m.jump();m.tick({left:dx< -8,right:dx>8,crouch:false});if(m.y>map.height!+140)break;
 }
 results.push({from,to,reached});
}
writeFileSync('artifacts/qa/hijack-routes.json',JSON.stringify(results,null,2));console.log({passed:results.filter(r=>r.reached).length,total:results.length});
