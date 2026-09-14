import type { MapGeometry, Terrain, Waypoint } from '../MapTypes';

export const ATRIUM_FLOORS = [1440, 1104, 768, 432];
export const ATRIUM_SHAFTS = [960, 2220];
export const ATRIUM_ROOMS = [[48, 500], [500, 960], [1380, 1800], [1800, 2220], [2640, 3080], [3080, 3552]];
export const ATRIUM_COVERS = [{x:280,width:80,height:48},{x:730,width:80,height:56},{x:1510,width:96,height:48},
  {x:2020,width:64,height:64},{x:2800,width:80,height:48},{x:3280,width:80,height:56}];
export const ATRIUM_STAIRS = ATRIUM_FLOORS.slice(0,-1).flatMap((floor,level)=>ATRIUM_SHAFTS.map(x=>({x,floor,right:level%2===0})));
const terrain: Terrain[] = [{x:0,y:96,width:48,height:1440},{x:3552,y:96,width:48,height:1440},{x:0,y:96,width:3600,height:24}];
const navigation: Waypoint[] = [];
const stairTreads:Terrain[]=[];
const connect=(a:number,b:number)=>{if(a===b)return;navigation[a].links.push(b);navigation[b].links.push(a);};
const rows:number[][]=[];
for(const [level,floor] of ATRIUM_FLOORS.entries()) {
  const gaps=level ? ATRIUM_SHAFTS.map(x=>({x:x+((level-1)%2===0?300:0),width:120})) : [];
  let start=0;
  for(const gap of [...gaps,{x:3600,width:0}]) {
    terrain.push({x:start,y:floor,width:gap.x-start,height:level?24:96});start=gap.x+gap.width;
  }
  // Door lintels divide rooms while retaining 112px of clear walking space.
  for(const x of [500,1800,3080])terrain.push({x:x-12,y:floor-312,width:24,height:200});
  for(const cover of ATRIUM_COVERS)terrain.push({...cover,y:floor-cover.height});
  const xs=[...new Set([...Array.from({length:29},(_,i)=>120+i*120),...ATRIUM_COVERS.map(c=>c.x+c.width/2),
    ...gaps.flatMap(g=>[g.x-36,g.x+g.width+36])])].sort((a,b)=>a-b);
  const row:number[]=[];
  for(const x of xs) {
    if(gaps.some(g=>x>=g.x&&x<g.x+g.width))continue;
    const cover=ATRIUM_COVERS.find(c=>x>=c.x&&x<c.x+c.width);
    row.push(navigation.length);navigation.push({x,y:floor-(cover?.height??0)-.5,links:[]});
  }
  for(let i=1;i<row.length;i++)connect(row[i-1],row[i]);rows.push(row);
}
for(const stair of ATRIUM_STAIRS) {
  const level=ATRIUM_FLOORS.indexOf(stair.floor),direction=stair.right?1:-1;
  const near=(row:number[],x:number)=>row.reduce((a,b)=>Math.abs(navigation[a].x-x)<Math.abs(navigation[b].x-x)?a:b);
  let previous=near(rows[level],stair.x+(stair.right?-36:456));
  for(let step=1;step<=14;step++) {
    const x=stair.x+(stair.right?step-1:14-step)*30,y=stair.floor-step*24;
    stairTreads.push({x,y,width:30,height:24});
    const node=navigation.length;navigation.push({x:x+15,y:y-.5,links:[]});connect(previous,node);previous=node;
  }
  connect(previous,near(rows[level+1],stair.x+(direction===1?456:-36)));
}
export const ATRIUM_TERRAIN=[...terrain,...stairTreads];
// Row runs keep structural walls and floors cheap for authority raycasts and movement.
const rowsMask=Array.from({length:1536},(_,y)=>{
  const spans=terrain.filter(t=>y>=t.y&&y<t.y+t.height).map(t=>[t.x,t.x+t.width]).sort((a,b)=>a[0]-b[0]);
  const row:number[]=[];
  for(const [left,right] of spans){if(row.length&&left<=row[row.length-1])row[row.length-1]=Math.max(right,row[row.length-1]);else row.push(left,right);}
  return row;
});
export const ATRIUM_GEOMETRY:MapGeometry={width:3600,height:1536,killY:1640,terrain:[],stairTreads,minimapTerrain:ATRIUM_TERRAIN,collisionMask:{x:0,y:0,width:3600,height:1536,rows:rowsMask},navigation,
  spawns:[[120,200,380,440].map(x=>({x,y:1439.5})),[3480,3400,3200,3120].map(x=>({x,y:1439.5}))],
  objective:{x:1800,y:1103.5},palette:{sky:0x101c29,wall:0x354958,trim:0x90c8cd}};
