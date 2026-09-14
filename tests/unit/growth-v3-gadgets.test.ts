import { expect, it } from 'vitest';
import { GadgetSimulation, type GadgetActor, type GadgetEvent, type GadgetWorldPort } from '../../src/shared/simulation/growth-v3/GadgetSimulation';
import { newArmor } from '../../src/shared/simulation/growth-v3/DamageRules';

function fixture() {
  const actors:GadgetActor[]=[
    {id:'blue',team:1,position:{x:300,y:567},feet:{x:300,y:600},alive:true,protected:false,hp:100000,maxHp:100000,armor:newArmor(),currentBaseTotalAmmo:120},
    {id:'red',team:2,position:{x:420,y:567},feet:{x:420,y:600},alive:true,protected:false,hp:100000,maxHp:100000,armor:newArmor(),currentBaseTotalAmmo:120},
  ];
  const events:GadgetEvent[]=[], awards:{id:string;xp:number}[]=[], supplies:{id:string;count:number}[]=[];
  let supplied=0;
  const port:GadgetWorldPort={width:1200,height:700,spawns:[{x:50,y:600},{x:1150,y:600}],objectives:[],actors:()=>actors,
    wall:(_x,y)=>y>=602,canUse:()=>true,interruptWeapon:()=>{},recoverUntil:()=>{},
    damage:(id,hp)=>{const a=actors.find(a=>a.id===id)!;a.hp=Math.max(0,a.hp-Math.round(hp*1000));a.alive=a.hp>0;},
    slow:()=>{},supply:(id,count)=>{supplies.push({id,count});return supplied;},
    support:(id,xp)=>awards.push({id,xp}),event:event=>events.push(event)};
  return {actors,port,events,awards,supplies,acceptSupply:(count:number)=>{supplied=count;}};
}

it.each([0,30,60,90,120,150,180,210,240,270,300,330])('clips a %s degree bot aim along its ray and releases at the predicted point',degrees=>{
  const f=fixture(),sim=new GadgetSimulation(f.port);sim.register('blue','medic','md_smoke');
  f.actors[0].position={x:30,y:567};f.actors[0].feet={x:30,y:600};
  const angle=degrees*Math.PI/180,aim=sim.throwAim('blue',angle)!;
  expect(aim).not.toBeNull();
  const center=f.actors[0].position,actual=Math.atan2(aim.y-center.y,aim.x-center.x);
  expect(Math.cos(actual)).toBeCloseTo(Math.cos(angle),10);expect(Math.sin(actual)).toBeCloseTo(Math.sin(angle),10);
  expect(aim.x).toBeGreaterThanOrEqual(0);expect(aim.x).toBeLessThanOrEqual(f.port.width);
  expect(aim.y).toBeGreaterThanOrEqual(0);expect(aim.y).toBeLessThanOrEqual(f.port.height);
  const predicted=sim.predictThrow('blue',aim)!;
  expect(sim.use('blue',aim,0)).toBe(true);
  for(let tick=0;tick<=30;tick++)sim.step(tick);
  const smoke=f.events.find(e=>e.kind==='smoke')!;
  expect(smoke).toBeDefined();
  expect(smoke.position!.x).toBeCloseTo(predicted.x,8);expect(smoke.position!.y).toBeCloseTo(predicted.y,8);
  expect(sim.inventory('blue').charges).toBe(1);
});

it('rejects the same out-of-map aim in prediction and use, without consuming inventory',()=>{
  const f=fixture(),sim=new GadgetSimulation(f.port);sim.register('blue','medic','md_smoke');
  const aim={x:300,y:1067},before=sim.checkpoint();
  expect(sim.predictThrow('blue',aim)).toBeNull();expect(sim.use('blue',aim,0)).toBe(false);
  expect(sim.checkpoint()).toEqual(before);
  f.actors[0].position={x:0,y:567};expect(sim.throwAim('blue',Math.PI)).toBeNull();
});

it('defensively caps restored flights at 32 and includes reserved throw windups in admission',()=>{
  const f=fixture(),sim=new GadgetSimulation(f.port);
  sim.register('blue','assault','as_frag');sim.register('red','assault','as_frag');
  expect(sim.use('blue',{x:600,y:500},0)).toBe(true);for(let t=0;t<=6;t++)sim.step(t);
  const state=sim.checkpoint(),flight=state.flying[0];
  // Synthetic restore boundary, not a claim that normal cooldowns allow 32 concurrent throws.
  state.flying=Array.from({length:31},(_,i)=>({...structuredClone(flight),id:`fixture-flight-${i}`}));
  state.actors.find(a=>a.id==='blue')!.readyTick=0;
  const restored=GadgetSimulation.restore(f.port,state);
  expect(restored.use('red',{x:600,y:500},7)).toBe(true);
  expect(restored.use('blue',{x:600,y:500},7)).toBe(false);
  expect(restored.inventory('blue').charges).toBe(1);
  expect(f.events.at(-1)).toMatchObject({kind:'error',reason:'capacity'});
  restored.cancelCast('red');expect(restored.use('blue',{x:600,y:500},7)).toBe(true);
  state.flying.push({...structuredClone(flight),id:'fixture-flight-31'});
  expect(GadgetSimulation.restore(f.port,state).flying()).toHaveLength(32);
  state.flying.push({...structuredClone(flight),id:'fixture-flight-32'});
  expect(()=>GadgetSimulation.restore(f.port,state)).toThrow('exceeds capacity');
});

it('eight owners can deploy eight covers but an extra charge cannot bypass the per-owner slot',()=>{
  const f=fixture(),sim=new GadgetSimulation(f.port);
  for(let i=2;i<8;i++)f.actors.push({...structuredClone(f.actors[0]),id:`tank-${i}`});
  f.actors.forEach((a,i)=>{a.team=1;a.position={x:200+i*100,y:567};a.feet={x:a.position.x,y:600};sim.register(a.id,'tank','tk_cover');});
  expect(()=>sim.register('ninth','tank','tk_cover')).toThrow();
  expect(sim.extraCharge('blue')).toBe(true);
  for(const a of f.actors)expect(sim.use(a.id,a.feet,0)).toBe(true);
  for(let t=0;t<=42;t++)sim.step(t);
  expect(sim.entities()).toHaveLength(8);expect(new Set(sim.entities().map(e=>e.sourceId)).size).toBe(8);
  expect(sim.use('blue',f.actors[0].feet,42)).toBe(false);expect(sim.inventory('blue').charges).toBe(1);
  expect(f.events.at(-1)).toMatchObject({kind:'error',reason:'existing_deployable'});
  const cover=sim.entities().find(e=>e.sourceId==='blue')!;
  sim.damageEntity(cover.id,120,2,42);expect(sim.entities()).toHaveLength(7);
  expect(sim.inventory('blue').charges).toBe(1);expect(sim.use('blue',f.actors[0].feet,42)).toBe(true);
  for(let t=43;t<=54;t++)sim.step(t);
  expect(sim.entities()).toHaveLength(8);expect(sim.inventory('blue').charges).toBe(0);
});

it('eight smoke slots count active regions, windups and flying throws without consuming a rejected charge',()=>{
  const f=fixture(),sim=new GadgetSimulation(f.port);
  for(let i=2;i<8;i++)f.actors.push({...structuredClone(f.actors[0]),id:`medic-${i}`});
  for(const a of f.actors)sim.register(a.id,'medic','md_smoke');
  const aim={x:600,y:500};
  for(const a of f.actors.slice(0,7))expect(sim.use(a.id,aim,0)).toBe(true);
  for(let t=0;t<=36;t++)sim.step(t);expect(sim.smoke()).toHaveLength(7);
  const last=f.actors[7].id;
  expect(sim.use(last,aim,36)).toBe(true);
  expect(sim.use('blue',aim,36)).toBe(false);expect(sim.inventory('blue').charges).toBe(1);
  sim.cancelCast(last);expect(sim.use('blue',aim,36)).toBe(true);
  for(let t=37;t<=42;t++)sim.step(t);expect(sim.flying()).toHaveLength(1);
  expect(sim.use(last,aim,42)).toBe(false);expect(sim.inventory(last).charges).toBe(2);
  for(let t=43;t<=66;t++)sim.step(t);expect(sim.smoke()).toHaveLength(8);
  expect(sim.use(last,aim,66)).toBe(false);expect(sim.inventory(last).charges).toBe(2);
  for(let t=67;t<=180;t++)sim.step(t);expect(sim.smoke()).toHaveLength(1);
  expect(sim.use(last,aim,180)).toBe(true);
  expect(f.events.filter(e=>e.kind==='error'&&e.reason==='capacity')).toHaveLength(3);
});

it('predicts a released grenade impact before and after movement without changing its flight',()=>{
  const f=fixture(),sim=new GadgetSimulation(f.port);sim.register('blue','assault','as_frag');
  expect(sim.use('blue',{x:600,y:567},0)).toBe(true);
  for(let t=0;t<=12;t++)sim.step(t);
  const projectile=sim.flying()[0],before=sim.checkpoint();
  const predicted=sim.predictFlyingImpact(projectile.id)!;
  expect(sim.checkpoint()).toEqual(before);expect(sim.predictFlyingImpact('missing')).toBeNull();
  sim.beginTick(13);expect(sim.predictFlyingImpact(projectile.id)).toEqual(predicted);sim.finishMovement(13);
  expect(sim.predictFlyingImpact(projectile.id)).toEqual(predicted);
  for(let t=14;t<=33;t++)sim.step(t);
  expect(f.events.find(e=>e.kind==='explosion')!.position).toEqual(predicted);
});

it('exclusive registration and finite G inventory survive death/checkpoint and allow only one G1 charge grant',()=>{
  const f=fixture(),sim=new GadgetSimulation(f.port);
  expect(()=>sim.register('bad','assault','md_smoke')).toThrow('not_owner_class');
  sim.register('blue','medic','md_smoke');
  expect(sim.use('blue',{x:600,y:500},0)).toBe(true);
  for(let t=0;t<=6;t++)sim.step(t);
  expect(sim.inventory('blue').charges).toBe(1);
  f.actors[0].alive=false;sim.step(7);f.actors[0].alive=true;
  const restored=GadgetSimulation.restore(f.port,sim.checkpoint());
  expect(restored.inventory('blue').charges).toBe(1);
  expect(restored.extraCharge('blue')).toBe(true);expect(restored.extraCharge('blue')).toBe(false);
  expect(restored.inventory('blue').charges).toBe(2);
  const before=restored.checkpoint();expect(restored.use('blue',{x:NaN,y:500},8)).toBe(false);
  expect(restored.checkpoint()).toEqual(before);
});

it('deployment rechecks geometry at commit, rejects occupied slots, and never refunds destruction',()=>{
  const f=fixture(),sim=new GadgetSimulation(f.port);sim.register('blue','tank','tk_cover');
  expect(sim.use('blue',{x:340,y:600},0)).toBe(true);
  f.actors[0].position.x=700;
  for(let t=0;t<=12;t++)sim.step(t);
  expect(sim.inventory('blue').charges).toBe(1);expect(sim.entities()).toHaveLength(0);
  f.actors[0].position.x=300;
  expect(sim.use('blue',{x:340,y:600},13)).toBe(true);
  for(let t=13;t<=25;t++)sim.step(t);
  expect(sim.entities()).toHaveLength(1);expect(sim.inventory('blue').charges).toBe(0);
  sim.extraCharge('blue');
  for(let t=26;t<=55;t++)sim.step(t);
  expect(sim.use('blue',{x:350,y:600},55)).toBe(false);
  const e=sim.entities()[0];
  expect(sim.damageEntity(e.id,1000,1,55)).toBe(0);
  expect(sim.damageEntity(e.id,120,2,55)).toBe(120000);
  expect(sim.entities()).toHaveLength(0);expect(sim.inventory('blue').charges).toBe(1);
});

it('N13 intercepts an EMP before same-tick detonation, but a stopped interceptor cannot work',()=>{
  const f=fixture(),sim=new GadgetSimulation(f.port);
  sim.register('blue','tank','tk_interceptor');sim.register('red','sniper','sn_emp');
  sim.use('blue',{x:340,y:600},0);sim.use('red',{x:300,y:500},0);
  for(let t=0;t<=26;t++)sim.step(t);
  const checkpoint=sim.checkpoint();expect(checkpoint.entities).toHaveLength(1);expect(checkpoint.flying).toHaveLength(1);
  // Controlled arrival fixture; the EMP came from the real casting/consumption path above.
  checkpoint.flying[0].position={x:350,y:550};checkpoint.flying[0].vx=0;checkpoint.flying[0].vy=0;checkpoint.flying[0].detonateTick=27;
  const active=GadgetSimulation.restore(f.port,checkpoint);active.step(27);
  expect(active.flying()).toHaveLength(0);expect(active.entities()[0].interceptions).toBe(1);expect(active.entities()[0].stoppedUntil).toBe(0);
  expect(f.awards).toEqual([{id:'blue',xp:10}]);
  checkpoint.entities[0].stoppedUntil=100;
  const stopped=GadgetSimulation.restore(f.port,checkpoint);stopped.step(27);
  expect(stopped.entities()[0].interceptions).toBe(2);expect(stopped.entities()[0].stoppedUntil).toBe(117);
});

it('N18 smoke blocks later beacon observations without changing previously emitted last-position events',()=>{
  const f=fixture(),sim=new GadgetSimulation(f.port);
  sim.register('blue','sniper','sn_beacon');sim.register('red','medic','md_smoke');
  sim.use('blue',{x:340,y:600},0);
  for(let t=0;t<=27;t++)sim.step(t);
  const ping=f.events.find(e=>e.kind==='intel')!;
  expect(ping.position).toEqual({x:420,y:567});expect(ping.expiresTick).toBe(57);
  const cp=sim.checkpoint();cp.smoke.push({id:'smoke-fixture',sourceId:'red',team:2,gadgetId:'md_smoke',position:{x:420,y:560},radius:150,expiresTick:200});
  const blocked=GadgetSimulation.restore(f.port,cp);f.actors[1].position.x=460;
  for(let t=28;t<=87;t++)blocked.step(t);
  expect(f.events.filter(e=>e.kind==='intel')).toHaveLength(1);expect(ping.position).toEqual({x:420,y:567});
  expect(blocked.smokeBlocks({x:340,y:588},{x:460,y:567})).toBe(true);
});

it('N21 ammo eligibility is consumed only by a real grant, and persists through death and restore',()=>{
  const f=fixture(),sim=new GadgetSimulation(f.port);sim.register('blue','medic','md_ammo');
  sim.use('blue',{x:330,y:600},0);
  for(let t=0;t<=27;t++)sim.step(t);
  expect(sim.entities()[0].recipients).toEqual([]);expect(f.supplies.at(-1)).toEqual({id:'blue',count:24});
  f.acceptSupply(12);sim.step(28);expect(sim.entities()[0].recipients).toEqual(['blue']);
  const count=f.supplies.length;f.actors[0].alive=false;sim.step(29);f.actors[0].alive=true;
  const restored=GadgetSimulation.restore(f.port,sim.checkpoint());restored.step(30);
  expect(f.supplies).toHaveLength(count);expect(restored.inventory('blue').charges).toBe(0);
});

it('self-use damage interruption and stronger armor at commit do not spend the plate',()=>{
  const f=fixture(),sim=new GadgetSimulation(f.port);sim.register('blue','tank','tk_plate');
  sim.use('blue',{x:300,y:567},0);sim.onLifeDamage('blue');sim.step(0);
  expect(sim.inventory('blue').charges).toBe(2);expect(sim.inventory('blue').cast).toBeNull();
  sim.use('blue',{x:300,y:567},1);
  f.actors[0].armor={remaining:25000,until:100,source:'test'};
  for(let t=1;t<=31;t++)sim.step(t);
  expect(sim.inventory('blue').charges).toBe(2);expect(f.actors[0].armor.until).toBe(100);
});
