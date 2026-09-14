import { GROWTH_V3_RULES, healthUnits, type GrowthClassId } from '../../content/growth-v3/Core';
import { GROWTH_V3_GADGETS, resolveGadget, type GadgetDefinition, type GrowthGadgetId } from '../../content/growth-v3/Gadgets';
import type { ArmorState } from './DamageRules';
import { grantArmor, radialDamage } from './DamageRules';
import type { ContinuousHealSource } from './HealingRules';

export interface CombatPoint { x:number; y:number }
export interface GadgetActor {
  id:string; team:1|2; position:CombatPoint; feet:CombatPoint; alive:boolean; protected:boolean;
  hp:number; maxHp:number; armor:ArmorState; currentBaseTotalAmmo:number;
}
export interface GadgetEvent {
  kind:'cast'|'released'|'created'|'damaged'|'destroyed'|'intercept'|'explosion'|'emp'|'emp-burst'|'smoke'|'smoke-ended'|'intel'|'decoy'|'supply'|'armor'|'error';
  tick:number; sourceId:string; gadgetId:GrowthGadgetId; entityId?:string; targetId?:string;
  position?:CombatPoint; radius?:number; expiresTick?:number; amount?:number; reason?:string; team?:1|2;
}
export interface GadgetWorldPort {
  width:number; height:number; spawns:readonly CombatPoint[]; objectives:readonly CombatPoint[];
  actors():readonly GadgetActor[];
  wall(x:number,y:number):boolean;
  /** Checks E-specific gadget lock, room state and action ordering. */
  canUse(actorId:string):boolean;
  interruptWeapon(actorId:string):void;
  recoverUntil(actorId:string,tick:number):void;
  damage(targetId:string,hp:number,sourceId:string,origin:CombatPoint,gadgetId:GrowthGadgetId):void;
  queueStructureDamage?(entityId:string,hp:number,sourceTeam:1|2,sourceId:string,gadgetId:GrowthGadgetId,origin:CombatPoint):void;
  slow(targetId:string,scale:number,duration:number,sourceId:string):void;
  supply(targetId:string,count:number):number;
  support(sourceId:string,xp:number,eventId:string,expiresTick:number):void;
  event(event:GadgetEvent):void;
}
interface GadgetCast { target:CombatPoint; commitTick:number; definition:GadgetDefinition }
export interface GadgetActorState {
  id:string; classId:GrowthClassId; gadgetId:GrowthGadgetId; charges:number; readyTick:number;
  upgraded:boolean; extraGranted:boolean; cast:GadgetCast|null;
}
export interface FlyingGadget {
  id:string; sourceId:string; team:1|2; gadgetId:GrowthGadgetId; definition:GadgetDefinition;
  position:CombatPoint; vx:number; vy:number; detonateTick:number;
}
export interface GadgetEntity {
  id:string; sourceId:string; team:1|2; gadgetId:GrowthGadgetId; definition:GadgetDefinition;
  position:CombatPoint; bornTick:number; armedTick:number; expiresTick:number;
  health:number; stoppedUntil:number; interceptions:number; interceptReady:number;
  healBudget:number; recipients:string[];
}
export interface SmokeArea { id:string; sourceId:string; team:1|2; gadgetId:'md_smoke'; position:CombatPoint; radius:number; expiresTick:number }
export interface GadgetCheckpoint {
  actors:GadgetActorState[]; flying:FlyingGadget[]; entities:GadgetEntity[]; smoke:SmokeArea[]; serial:number; lastTick:number; finishedTick:number;
}
const pointValid=(p:CombatPoint)=>!!p&&Number.isFinite(p.x)&&Number.isFinite(p.y);
const distance=(a:CombatPoint,b:CombatPoint)=>Math.hypot(a.x-b.x,a.y-b.y);
const byId=(a:{id:string},b:{id:string})=>a.id<b.id?-1:a.id>b.id?1:0;

/** Authority-only entity and finite-inventory simulation, independent of rendering and account data. */
export class GadgetSimulation {
  private state:GadgetCheckpoint={actors:[],flying:[],entities:[],smoke:[],serial:0,lastTick:-1,finishedTick:-1};
  constructor(private readonly world:GadgetWorldPort) {}
  register(id:string,classId:GrowthClassId,gadgetId:GrowthGadgetId) {
    if(!id||this.state.actors.length>=8||this.state.actors.some(a=>a.id===id)||!Object.hasOwn(GROWTH_V3_GADGETS,gadgetId)||GROWTH_V3_GADGETS[gadgetId].classId!==classId)throw Error('not_owner_class');
    this.state.actors.push({id,classId,gadgetId,charges:GROWTH_V3_GADGETS[gadgetId].charges,readyTick:0,upgraded:false,extraGranted:false,cast:null});
    this.state.actors.sort(byId);
  }
  inventory(id:string) { const state=this.state.actors.find(a=>a.id===id); if(!state)throw Error('Unknown gadget actor');return state; }
  checkpoint():GadgetCheckpoint { return structuredClone(this.state); }
  static restore(world:GadgetWorldPort,state:GadgetCheckpoint) {
    if(!state||!Number.isSafeInteger(state.serial)||state.serial<0||!Number.isSafeInteger(state.lastTick)||state.lastTick< -1
      ||!Number.isSafeInteger(state.finishedTick)||state.finishedTick< -1
      ||state.finishedTick>state.lastTick||state.lastTick-state.finishedTick>1)throw Error('Invalid gadget checkpoint');
    const result=new GadgetSimulation(world);
    for(const a of state.actors) {
      result.register(a.id,a.classId,a.gadgetId);
      if(!Number.isSafeInteger(a.charges)||a.charges<0||a.charges>3||!Number.isSafeInteger(a.readyTick)||a.readyTick<0
        ||typeof a.extraGranted!=='boolean'||typeof a.upgraded!=='boolean')throw Error('Invalid gadget inventory');
    }
    const ids=new Set<string>();
    for(const e of [...state.flying,...state.entities,...state.smoke]) {
      if(!e.id||ids.has(e.id)||!pointValid(e.position)||!state.actors.some(a=>a.id===e.sourceId))throw Error('Invalid gadget entity');
      ids.add(e.id);
    }
    if(state.entities.length>8||state.smoke.length>8||state.flying.length>32)throw Error('Gadget checkpoint exceeds capacity');
    result.state=structuredClone(state);return result;
  }
  extraCharge(id:string) {
    const state=this.inventory(id);if(state.extraGranted)return false;
    state.extraGranted=true;state.charges=Math.min(3,state.charges+1);return true;
  }
  upgrade(id:string) { this.inventory(id).upgraded=true; }
  cancelCast(id:string) { const state=this.inventory(id);state.cast=null; }
  remove(id:string,tick:number) {
    this.cancelCast(id);
    for(const e of [...this.state.entities])if(e.sourceId===id)this.destroy(e,tick,'owner_left');
    // Keep the participant inventory while an already released projectile resolves, preserving attribution.
    // Smoke lasts to expiry; departure never refunds or transfers its resource slot.
  }
  private actor(id:string) { return this.world.actors().find(a=>a.id===id); }
  private identity() { return `g3-${++this.state.serial}`; }
  private fail(state:GadgetActorState,tick:number,reason:string) {
    this.world.event({kind:'error',tick,sourceId:state.id,gadgetId:state.gadgetId,reason});return false;
  }
  clearRay(a:CombatPoint,b:CombatPoint,smoke=false) {
    const steps=Math.max(1,Math.ceil(distance(a,b)/2));
    for(let i=0;i<=steps;i++)if(this.world.wall(a.x+(b.x-a.x)*i/steps,a.y+(b.y-a.y)*i/steps))return false;
    return !smoke||!this.smokeBlocks(a,b);
  }
  smokeBlocks(a:CombatPoint,b:CombatPoint) {
    const dx=b.x-a.x,dy=b.y-a.y,length=dx*dx+dy*dy;
    return this.state.smoke.some(area=>{
      const t=length===0?0:Math.max(0,Math.min(1,((area.position.x-a.x)*dx+(area.position.y-a.y)*dy)/length));
      return Math.hypot(a.x+dx*t-area.position.x,a.y+dy*t-area.position.y)<area.radius;
    });
  }
  /** Read-only prediction for authority bots; shares bounce physics with actual released throws. */
  throwAim(id:string,angle:number):CombatPoint|null {
    const center=this.actor(id)?.position;
    if(!center||!this.validAim(center)||!Number.isFinite(angle))return null;
    const dx=Math.cos(angle),dy=Math.sin(angle);
    // Clip distance along the ray, not x/y independently: preserve launch angle.
    const xLimit=dx>0?(this.world.width-center.x)/dx:dx<0?-center.x/dx:Infinity;
    const yLimit=dy>0?(this.world.height-center.y)/dy:dy<0?-center.y/dy:Infinity;
    const length=Math.min(500,xLimit,yLimit)*.999999;
    if(length<.001)return null;
    return {x:center.x+dx*length,y:center.y+dy*length};
  }
  private validAim(aim:CombatPoint) {
    return pointValid(aim)&&aim.x>=0&&aim.x<=this.world.width&&aim.y>=0&&aim.y<=this.world.height;
  }
  predictThrow(id:string,aim:CombatPoint):CombatPoint|null {
    const actor=this.actor(id),state=this.inventory(id),definition=resolveGadget(state.gadgetId,state.upgraded);
    if(!actor||!this.validAim(aim)||definition.kind!=='throw')return null;
    const angle=Math.atan2(aim.y-actor.position.y,aim.x-actor.position.x);
    let position:CombatPoint|null=null;
    for(let i=2;i<=16;i+=2){const p={x:actor.position.x+Math.cos(angle)*i,y:actor.position.y+Math.sin(angle)*i};if(!this.world.wall(p.x,p.y)){position=p;break;}}
    if(!position)return null;
    const f:FlyingGadget={id:'prediction',sourceId:id,team:actor.team,gadgetId:state.gadgetId,definition,
      position,vx:Math.cos(angle)*13,vy:Math.sin(angle)*13-5,detonateTick:definition.fuse};
    // Release tick itself moves once, then every tick through the fuse boundary.
    for(let i=0;i<=definition.fuse;i++)this.move(f);
    return {...f.position};
  }
  canPlace(id:string,target:CombatPoint) {
    const actor=this.actor(id),s=this.inventory(id),def=resolveGadget(s.gadgetId,s.upgraded);
    return !!actor&&def.kind==='deploy'&&this.validPlacement(actor,target,def);
  }
  /** Predict only an existing observed projectile; never advances authoritative state. */
  predictFlyingImpact(entityId:string):CombatPoint|null {
    const existing=this.state.flying.find(f=>f.id===entityId);if(!existing)return null;
    const predicted={...existing,position:{...existing.position}};
    for(let tick=this.state.finishedTick+1;tick<=predicted.detonateTick;tick++)this.move(predicted);
    return {...predicted.position};
  }
  hasDeploymentReservation(id:string) {
    return this.state.entities.some(e=>e.sourceId===id)||this.state.flying.some(e=>e.sourceId===id&&e.definition.reservesDeploySlot)
      ||this.state.actors.some(a=>a.id===id&&a.cast?.definition.reservesDeploySlot);
  }
  private smokeCount() {
    return this.state.smoke.length+this.state.flying.filter(e=>e.definition.reservesSmokeSlot).length
      +this.state.actors.filter(a=>a.cast?.definition.reservesSmokeSlot).length;
  }
  private validPlacement(actor:GadgetActor,target:CombatPoint,def:GadgetDefinition) {
    if(!pointValid(target)||distance(actor.position,target)>80||target.x-def.width/2<0||target.x+def.width/2>this.world.width||target.y-def.height<0||target.y>this.world.height)return false;
    if(this.world.spawns.some(p=>distance(p,target)<120)||this.world.objectives.some(p=>distance(p,target)<60))return false;
    if(!this.clearRay(actor.position,{x:target.x,y:target.y-def.height/2}))return false;
    for(let x=target.x-def.width/2;x<=target.x+def.width/2;x+=2)for(let y=target.y-def.height;y<target.y;y+=2)if(this.world.wall(x,y))return false;
    if(!this.world.wall(target.x,target.y+2))return false;
    return !this.state.entities.some(e=>Math.abs(e.position.x-target.x)<(e.definition.width+def.width)/2
      &&Math.abs(e.position.y-(target.y-def.height/2))<(e.definition.height+def.height)/2);
  }
  /** A human crosshair selects the nearby side; placement still uses authority geometry. */
  private beaconPlacement(actor:GadgetActor,aim:CombatPoint,def:GadgetDefinition):CombatPoint|null {
    if(this.validPlacement(actor,aim,def))return aim;
    const x=actor.feet.x+Math.max(-48,Math.min(48,aim.x-actor.feet.x));
    // Search only around the current floor, never down through an entire storey.
    for(let offset=0;offset<=32;offset++)for(const sign of (offset?[1,-1]:[1])) {
      const target={x,y:actor.feet.y+offset*sign};
      if(this.validPlacement(actor,target,def))return target;
    }
    return null;
  }
  /** seq deduplication belongs to the owning PlayerCommand boundary. Never accepts a client gadgetId. */
  use(id:string,target:CombatPoint,tick:number) {
    const state=this.inventory(id), actor=this.actor(id);
    if(!Number.isSafeInteger(tick)||tick<0||!actor?.alive||actor.protected||!this.world.canUse(id)||state.cast)return this.fail(state,tick,'busy');
    if(!this.validAim(target))return this.fail(state,tick,'invalid_target');
    const charge=this.state.entities.find(e=>e.sourceId===id&&e.gadgetId==='as_charge');
    if(charge) {
      if(tick<charge.armedTick)return this.fail(state,tick,'not_ready');
      this.explode(charge,tick);this.destroy(charge,tick,'detonated');return true;
    }
    if(tick<state.readyTick)return this.fail(state,tick,'not_ready');
    if(state.charges<=0)return this.fail(state,tick,'no_charge');
    const def=resolveGadget(state.gadgetId,state.upgraded);
    if(def.reservesDeploySlot&&this.hasDeploymentReservation(id))return this.fail(state,tick,'existing_deployable');
    if(def.reservesSmokeSlot&&this.smokeCount()>=8)return this.fail(state,tick,'capacity');
    if(def.kind==='throw'&&this.state.flying.length+this.state.actors.filter(a=>a.cast?.definition.kind==='throw').length>=32)return this.fail(state,tick,'capacity');
    if(state.gadgetId==='sn_beacon') {
      const placement=this.beaconPlacement(actor,target,def);
      if(!placement)return this.fail(state,tick,'beacon_placement');
      target=placement;
    }
    if(def.kind==='deploy'&&!this.validPlacement(actor,target,def))return this.fail(state,tick,'invalid_target');
    if(def.kind==='self'&&actor.armor.until>tick&&actor.armor.remaining>=healthUnits(def.armor))return this.fail(state,tick,'no_effect');
    this.world.interruptWeapon(id);state.cast={target:{...target},commitTick:tick+def.cast,definition:def};
    this.world.event({kind:'cast',tick,sourceId:id,gadgetId:state.gadgetId});return true;
  }
  /** Damage to real life cancels self-use only. Throw/deploy casts are interrupted by death or Q through the host. */
  onLifeDamage(id:string) { const s=this.inventory(id);if(s.cast?.definition.kind==='self')s.cast=null; }
  private commitCast(state:GadgetActorState,tick:number) {
    const cast=state.cast,actor=this.actor(state.id);if(!cast)return;
    if(!actor?.alive){state.cast=null;return;}
    if(tick<cast.commitTick)return;
    const def=cast.definition;state.cast=null;
    if(def.kind==='deploy'&&!this.validPlacement(actor,cast.target,def)){this.fail(state,tick,'invalid_target');return;}
    if(def.kind==='self') {
      if(!grantArmor(actor.armor,def.armor,def.armorTicks,tick,state.id,true)){this.fail(state,tick,'no_effect');return;}
      this.world.event({kind:'armor',tick,sourceId:state.id,gadgetId:state.gadgetId,amount:def.armor});
    } else if(def.kind==='deploy') this.createEntity(state.id,actor.team,state.gadgetId,def,{x:cast.target.x,y:cast.target.y-def.height/2},tick);
    else {
      const angle=Math.atan2(cast.target.y-actor.position.y,cast.target.x-actor.position.x);
      // Find the first free point within 16px along aim; do not spawn a grenade inside an opaque wall.
      let origin:CombatPoint|null=null;
      for(let i=2;i<=16;i+=2){const p={x:actor.position.x+Math.cos(angle)*i,y:actor.position.y+Math.sin(angle)*i};if(!this.world.wall(p.x,p.y)){origin=p;break;}}
      if(!origin){this.fail(state,tick,'invalid_target');return;}
      this.state.flying.push({id:this.identity(),sourceId:state.id,team:actor.team,gadgetId:state.gadgetId,definition:def,
        position:origin,vx:Math.cos(angle)*13,vy:Math.sin(angle)*13-5,detonateTick:tick+def.fuse});
      this.world.event({kind:'released',tick,sourceId:state.id,gadgetId:state.gadgetId,position:{...origin}});
    }
    state.charges--;state.readyTick=tick+30;this.world.recoverUntil(state.id,tick+def.recovery);
  }
  private createEntity(sourceId:string,team:1|2,gadgetId:GrowthGadgetId,def:GadgetDefinition,position:CombatPoint,tick:number) {
    const entity:GadgetEntity={id:this.identity(),sourceId,team,gadgetId,definition:structuredClone(def),position:{...position},bornTick:tick,
      armedTick:tick+def.arm,expiresTick:tick+def.duration,health:healthUnits(def.health),stoppedUntil:0,
      interceptions:def.intercepts,interceptReady:0,healBudget:healthUnits(def.healBudget),recipients:[]};
    this.state.entities.push(entity);this.world.event({kind:'created',tick,sourceId,gadgetId,entityId:entity.id,position:{...position}});return entity;
  }
  private destroy(entity:GadgetEntity,tick:number,reason:string) {
    this.state.entities=this.state.entities.filter(e=>e.id!==entity.id);
    this.world.event({kind:'destroyed',tick,sourceId:entity.sourceId,gadgetId:entity.gadgetId,entityId:entity.id,position:{...entity.position},reason});
  }
  damageEntity(entityId:string,hp:number,sourceTeam:1|2,tick:number) {
    const e=this.state.entities.find(e=>e.id===entityId);if(!e||e.team===sourceTeam)return 0;
    if(!Number.isFinite(hp)||hp<0)throw Error('Invalid entity damage');
    const amount=Math.min(e.health,healthUnits(hp));e.health-=amount;
    if(amount>0)this.world.event({kind:'damaged',tick,sourceId:e.sourceId,gadgetId:e.gadgetId,entityId:e.id,position:{...e.position},amount:amount/1000});
    if(e.health===0)this.destroy(e,tick,'destroyed');return amount;
  }
  private explode(source:Pick<FlyingGadget,'sourceId'|'team'|'gadgetId'|'definition'|'position'>,tick:number) {
    const d=source.definition;
    this.world.event({kind:'explosion',tick,sourceId:source.sourceId,gadgetId:source.gadgetId,position:{...source.position},radius:d.radius});
    for(const target of [...this.world.actors()].sort(byId)) {
      const dist=distance(source.position,target.position);
      if(!target.alive||target.protected||dist>d.radius||target.team===source.team&&target.id!==source.sourceId||!this.clearRay(source.position,target.position))continue;
      const hp=radialDamage(d.damageMax,d.damageMin,d.radius,dist)*(target.id===source.sourceId ? .5 : 1);
      if(hp>0)this.world.damage(target.id,hp,source.sourceId,source.position,source.gadgetId);
      if(d.slow&&target.team!==source.team)this.world.slow(target.id,d.slow,d.slowTicks,source.sourceId);
    }
    for(const entity of [...this.state.entities].sort(byId))if(entity.team!==source.team&&this.clearRay(source.position,entity.position)) {
      const dist=distance(source.position,entity.position);
      if(dist<=d.radius&&d.structureDamageMax>0) {
        const amount=radialDamage(d.structureDamageMax,d.structureDamageMin,d.radius,dist);
        if(this.world.queueStructureDamage)this.world.queueStructureDamage(entity.id,amount,source.team,source.sourceId,source.gadgetId,source.position);
        else this.damageEntity(entity.id,amount,source.team,tick);
      }
    }
  }
  private move(f:FlyingGadget) {
    const n=Math.max(1,Math.ceil(Math.hypot(f.vx,f.vy)/2));
    const blocked=(x:number,y:number)=>x<2||x>this.world.width-2||y<2||y>this.world.height-2
      ||this.world.wall(x-2,y)||this.world.wall(x+2,y)||this.world.wall(x,y-2)||this.world.wall(x,y+2);
    for(let i=0;i<n;i++) {
      const nx=f.position.x+f.vx/n,ny=f.position.y+f.vy/n;
      if(blocked(nx,f.position.y))f.vx*= -.5;else f.position.x=nx;
      if(blocked(f.position.x,ny)){f.vy= -Math.abs(f.vy)*.4;f.vx*=.8;}else f.position.y=ny;
    }
    f.vy+=.5;
    if(Math.abs(f.vy)<.5&&blocked(f.position.x,f.position.y+1))f.vy=0;
  }
  private detonate(f:FlyingGadget,tick:number) {
    if(f.gadgetId==='md_smoke') {
      const area:SmokeArea={id:this.identity(),sourceId:f.sourceId,team:f.team,gadgetId:'md_smoke',position:{...f.position},radius:f.definition.radius,expiresTick:tick+f.definition.duration};
      this.state.smoke.push(area);this.world.event({kind:'smoke',tick,sourceId:f.sourceId,gadgetId:f.gadgetId,entityId:area.id,position:{...area.position},radius:area.radius,expiresTick:area.expiresTick});
    } else if(f.gadgetId==='sn_decoy')this.createEntity(f.sourceId,f.team,f.gadgetId,f.definition,f.position,tick);
    else if(f.gadgetId==='sn_emp') {
      this.world.event({kind:'emp-burst',tick,sourceId:f.sourceId,gadgetId:f.gadgetId,position:{...f.position},radius:f.definition.radius});
      for(const e of this.state.entities)if(e.team!==f.team&&e.definition.electronic&&distance(e.position,f.position)<=f.definition.radius&&this.clearRay(e.position,f.position)) {
        e.stoppedUntil=Math.max(e.stoppedUntil,tick+f.definition.empTicks);
        this.world.event({kind:'emp',tick,sourceId:f.sourceId,gadgetId:f.gadgetId,entityId:e.id,position:{...e.position},expiresTick:e.stoppedUntil});
      }
    } else this.explode(f,tick);
  }
  /** Expiry and existing cast commits precede actor movement. */
  beginTick(tick:number) {
    if(!Number.isSafeInteger(tick)||tick!==this.state.lastTick+1)throw Error('Gadget simulation must advance exactly once per tick');
    if(this.state.finishedTick!==this.state.lastTick)throw Error('Finish the prior gadget tick first');
    this.state.lastTick=tick;
    for(const e of [...this.state.entities])if(tick>=e.expiresTick)this.destroy(e,tick,'expired');
    for(const smoke of this.state.smoke)if(tick>=smoke.expiresTick)
      this.world.event({kind:'smoke-ended',tick,sourceId:smoke.sourceId,gadgetId:smoke.gadgetId,entityId:smoke.id,position:{...smoke.position},radius:smoke.radius});
    this.state.smoke=this.state.smoke.filter(s=>tick<s.expiresTick);
    for(const a of this.state.actors)this.commitCast(a,tick);
  }
  /** After all actors move: projectile movement, interception, then queued detonations. */
  finishMovement(tick:number) {
    if(tick!==this.state.lastTick||this.state.finishedTick===tick)throw Error('Invalid gadget movement phase');
    this.state.finishedTick=tick;
    for(const f of this.state.flying)this.move(f);
    for(const e of [...this.state.entities].sort(byId)) {
      if(e.gadgetId!=='tk_interceptor'||tick<e.armedTick||tick<e.stoppedUntil||tick<e.interceptReady||e.interceptions<=0)continue;
      const f=this.state.flying.filter(f=>f.team!==e.team&&distance(f.position,e.position)<=e.definition.radius&&this.clearRay(e.position,f.position))
        .sort((a,b)=>distance(a.position,e.position)-distance(b.position,e.position)||byId(a,b))[0];
      if(!f)continue;e.interceptions--;e.interceptReady=tick+15;
      this.state.flying=this.state.flying.filter(other=>other.id!==f.id);
      this.world.support(e.sourceId,10,`intercept:${f.id}`,tick+900);
      this.world.event({kind:'intercept',tick,sourceId:e.sourceId,gadgetId:e.gadgetId,entityId:e.id,position:{...f.position}});
    }
    for(const f of [...this.state.flying])if(tick>=f.detonateTick){this.detonate(f,tick);this.state.flying=this.state.flying.filter(other=>other.id!==f.id);}
    for(const e of [...this.state.entities].sort(byId)) {
      if(tick<e.armedTick||tick<e.stoppedUntil)continue;
      if(e.gadgetId==='sn_beacon'&&(tick-e.armedTick)%e.definition.interval===0) {
        for(const target of this.world.actors())if(target.alive&&target.team!==e.team&&distance(target.position,e.position)<=e.definition.radius&&this.clearRay(e.position,target.position,true))
          this.world.event({kind:'intel',tick,sourceId:e.sourceId,gadgetId:e.gadgetId,targetId:target.id,position:{...target.position},expiresTick:tick+e.definition.markTicks,team:e.team});
      }
      if(e.gadgetId==='sn_decoy'&&(tick-e.armedTick)%e.definition.interval===0)
        this.world.event({kind:'decoy',tick,sourceId:e.sourceId,gadgetId:e.gadgetId,entityId:e.id,position:{...e.position},radius:e.definition.noiseRadius,expiresTick:tick+e.definition.radarTicks});
      if(e.gadgetId==='md_ammo')for(const target of [...this.world.actors()].sort(byId)) {
        if(!target.alive||target.team!==e.team||e.recipients.includes(target.id)||distance(target.position,e.position)>e.definition.radius||!this.clearRay(target.position,e.position))continue;
        const amount=this.world.supply(target.id,Math.max(1,Math.floor(target.currentBaseTotalAmmo*e.definition.ammoScale)));
        if(amount>0){e.recipients.push(target.id);this.world.event({kind:'supply',tick,sourceId:e.sourceId,gadgetId:e.gadgetId,targetId:target.id,amount});}
      }
    }
  }
  /** Standalone harness convenience; Battle uses the split phases. */
  step(tick:number) { this.beginTick(tick);this.finishMovement(tick); }
  /** Continuous station candidates join E treatment sources in the shared healer arbiter. */
  healingSources(tick:number):ContinuousHealSource[] {
    const targets=[...this.world.actors()].sort((a,b)=>a.hp*b.maxHp-b.hp*a.maxHp||byId(a,b)), sources:ContinuousHealSource[]=[];
    for(const target of targets)for(const e of this.state.entities) {
      if(e.gadgetId!=='md_station'||e.healBudget<=0||!target.alive||target.hp>=target.maxHp||target.team!==e.team)continue;
      sources.push({id:e.id,ownerId:e.sourceId,targetId:target.id,amount:Math.min(healthUnits(e.definition.heal),e.healBudget),interval:e.definition.interval,
        firstPulseTick:e.armedTick+e.definition.interval,lastPulseTick:e.expiresTick-1,
        eligible:tick>=e.armedTick&&tick>=e.stoppedUntil&&distance(e.position,target.position)<=e.definition.radius&&this.clearRay(e.position,target.position,true)});
    }
    return sources;
  }
  consumeHealing(entityId:string,amount:number,tick:number) {
    const e=this.state.entities.find(e=>e.id===entityId);
    if(!e||e.gadgetId!=='md_station'||!Number.isSafeInteger(amount)||amount<0||amount>e.healBudget)throw Error('Invalid station healing');
    e.healBudget-=amount;if(e.healBudget===0)this.destroy(e,tick,'budget_spent');
  }
  /** Collision adapter can query these rectangles without changing character navigation. */
  entities() { return this.state.entities as readonly GadgetEntity[]; }
  flying() { return this.state.flying as readonly FlyingGadget[]; }
  smoke() { return this.state.smoke as readonly SmokeArea[]; }
}
