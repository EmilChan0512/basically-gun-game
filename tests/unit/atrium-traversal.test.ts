import {it,expect} from 'vitest';
import {customMatch} from '../../src/shared/content/Maps';
import {wallFor} from '../../src/game/campaign/Missions';
import {OriginalMovement} from '../../src/game/movement/OriginalMovement';
import {trackedWaypoint} from '../../src/game/campaign/Navigation';
import {traversalJump} from '../../src/shared/simulation/Traversal';
const origins=[{x:120,y:1439.5},{x:3480,y:1439.5},{x:1500,y:1103.5},{x:2100,y:1103.5}];
it.each([1,2])('team %i can carry a fourth-floor case back to its ground-floor spawn',team=>{
 const map=customMatch('atrium','ctf'),wall=wallFor(map),goal=map.deliveryZones![team-1],origin=map.deliveryBases![team===1?1:0];
 const m=new OriginalMovement(wall,map.stairTreads),route={};m.reset(origin.x,origin.y);
 let arrived=false;
 for(let tick=0;tick<1800;tick++){
  if(Math.abs(m.x-goal.x)<30&&Math.abs(m.y-goal.y)<30){arrived=true;break;}
  const p=trackedWaypoint(map.navigation,m,goal,route),dx=p.x-m.x;
  if(!m.shouldDescendStairs(goal)&&traversalJump(m,p,wall))m.jump();
  m.tick({left:dx< -8,right:dx>8,crouch:m.shouldDescendStairs(p)||m.shouldDescendStairs(goal)});
 }
 expect(arrived).toBe(true);
});
it('walks up the continuous right ramp without a jump command',()=>{
 const map=customMatch('atrium'),m=new OriginalMovement(wallFor(map),map.stairTreads);m.reset(2200,1439.5);
 for(let i=0;i<240&&m.x<2660;i++)m.tick({left:false,right:true,crouch:false});
 expect(m.x).toBeGreaterThan(2640);expect(m.y).toBeLessThan(1105);
});
it.each([1439.5,1103.5,767.5,431.5].flatMap(y=>origins.map(origin=>({origin,y}))))('routes $origin to floor $y through real stair and room collision',({origin,y})=>{
 const map=customMatch('atrium'),wall=wallFor(map),goal={x:1800,y},m=new OriginalMovement(wall,map.stairTreads),route={};m.reset(origin.x,origin.y);
 let arrived=false;
 for(let tick=0;tick<1200;tick++){
  if(Math.abs(m.x-goal.x)<60&&Math.abs(m.y-goal.y)<45){arrived=true;break;}
  const p=trackedWaypoint(map.navigation,m,goal,route),dx=p.x-m.x;
  if(!m.shouldDescendStairs(goal)&&traversalJump(m,p,wall))m.jump();
  m.tick({left:dx< -8,right:dx>8,crouch:m.shouldDescendStairs(p)||m.shouldDescendStairs(goal)});
 }
 expect(arrived).toBe(true);
});
it('S drops through staircase treads without dropping through solid storey floors',()=>{
 const map=customMatch('atrium'),m=new OriginalMovement(wallFor(map),map.stairTreads);m.reset(1095,1319.5);
 for(let t=0;t<60;t++)m.tick({left:false,right:false,crouch:true});
 expect(m.y).toBeGreaterThan(1439);expect(m.y).toBeLessThan(1441);
});
