import {expect,it} from 'vitest';
import {MAPS,customMatch} from '../../src/shared/content/Maps';
import {wallFor} from '../../src/game/campaign/Missions';
import {OriginalMovement} from '../../src/game/movement/OriginalMovement';
import {trackedWaypoint} from '../../src/game/campaign/Navigation';
import {traversalJump} from '../../src/shared/simulation/Traversal';

it.each(MAPS.map(m=>m.id))('%s objective can be entered from both horizontal sides using actual collision',id=>{
  const map=customMatch(id,'dom'),wall=wallFor(map),goal=map.objective;
  const arrivals=new Set<number>();
  for(const origin of map.navigation){
    if(arrivals.size===2)break;
    if(Math.abs(origin.x-goal.x)<100)continue;
    const movement=new OriginalMovement(wall,map.stairTreads);movement.reset(origin.x,origin.y);const route={};
    let priorX=movement.x;
    for(let t=0;t<1800;t++){
      if(Math.abs(movement.x-goal.x)<=60&&Math.abs(movement.y-goal.y)<45){
        arrivals.add(Math.sign(priorX-goal.x));break;
      }
      if(Math.abs(movement.x-goal.x)>60)priorX=movement.x;
      const waypoint=trackedWaypoint(map.navigation,movement,goal,route),dx=waypoint.x-movement.x;
      if(!movement.shouldDescendStairs(goal)&&traversalJump(movement,waypoint,wall))movement.jump();
      movement.tick({left:dx< -8,right:dx>8,crouch:movement.shouldDescendStairs(waypoint)||movement.shouldDescendStairs(goal)});
      if(movement.y>(map.killY??(map.height??700)+140))break;
    }
  }
  expect([...arrivals].sort(),id).toEqual([-1,1]);
});
