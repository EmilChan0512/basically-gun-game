import type { GrowthLoadoutV3 } from '../../content/growth-v3/Loadout';
import type { GrowthUpgradeId } from '../../content/growth-v3/Cards';
import { resolveAbility, abilityHealing, type ResolvedAbility } from './AbilityRules';
import type { CombatPoint, GadgetActor } from './GadgetSimulation';
import type { ContinuousHealSource } from './HealingRules';
import { healthUnits } from '../../content/growth-v3/Core';

export interface AbilityPort {
  actors():readonly GadgetActor[];
  canUse(id:string):boolean;
  visible(from:CombatPoint,to:CombatPoint,smoke:boolean):boolean;
  interruptWeapon(id:string):void;
  recoverUntil(id:string,tick:number):void;
  transfer(id:string,count:number):number;
  heal(id:string,targetId:string,mhp:number,castId:string):number;
  started(id:string,cast:ActiveAbility):void;
  finished(id:string,cast:ActiveAbility,reason:'expired'|'cancelled'|'broken'|'death',tick:number):void;
  error(id:string,reason:string):void;
}
interface PendingAbility { definition:ResolvedAbility; targetId:string|null; commitTick:number }
export interface ActiveAbility {
  id:string; definition:ResolvedAbility; targetId:string|null; startTick:number; endTick:number;
  selected:GrowthUpgradeId[];
  shieldBudget:number; absorbed:number; refundUsed:number; refundReady:number;
  pauseUntil:number; effectiveHealing:boolean;
}
export interface AbilityActorState {
  id:string; loadout:GrowthLoadoutV3; selected:GrowthUpgradeId[];
  charges:number; maxCharges:number; queue:number[]; useReadyTick:number;
  pending:PendingAbility|null; active:ActiveAbility|null;
}
export interface AbilityCheckpoint { actors:AbilityActorState[]; serial:number; lastTick:number; healTails:{ownerId:string;cast:ActiveAbility;notified:boolean}[] }
const dist=(a:CombatPoint,b:CombatPoint)=>Math.hypot(a.x-b.x,a.y-b.y);
const byId=(a:{id:string},b:{id:string})=>a.id<b.id?-1:a.id>b.id?1:0;

export class AbilitySimulation {
  private state:AbilityCheckpoint={actors:[],serial:0,lastTick:-1,healTails:[]};
  constructor(private readonly world:AbilityPort) {}
  register(id:string,loadout:GrowthLoadoutV3) {
    if(this.state.actors.some(a=>a.id===id))throw Error('Duplicate ability actor');
    this.state.actors.push({id,loadout:structuredClone(loadout),selected:[],charges:1,maxCharges:1,queue:[],useReadyTick:0,pending:null,active:null});
    this.state.actors.sort(byId);
  }
  actorState(id:string) { const s=this.state.actors.find(a=>a.id===id);if(!s)throw Error('Unknown ability actor');return s; }
  castState(id:string) { return this.state.actors.find(s=>s.active?.id===id)?.active ?? this.state.healTails.find(t=>t.cast.id===id)?.cast; }
  private actor(id:string) { return this.world.actors().find(a=>a.id===id); }
  checkpoint():AbilityCheckpoint { return structuredClone(this.state); }
  static restore(world:AbilityPort,state:AbilityCheckpoint) {
    if(!state||!Number.isSafeInteger(state.serial)||state.serial<0||!Number.isSafeInteger(state.lastTick)||state.lastTick< -1)throw Error('Invalid ability checkpoint');
    const sim=new AbilitySimulation(world);
    for(const a of state.actors) {
      sim.register(a.id,a.loadout);resolveAbility(a.loadout.abilityId,a.selected,a.loadout.perks);
      if(![1,2].includes(a.maxCharges)||!Number.isSafeInteger(a.charges)||a.charges<0||a.charges>a.maxCharges||a.charges+a.queue.length!==a.maxCharges
        ||a.queue.some((tick,index)=>!Number.isSafeInteger(tick)||tick<0||index>0&&tick<=a.queue[index-1]))throw Error('Invalid charge queue');
    }
    sim.state=structuredClone(state);return sim;
  }
  private refresh(s:AbilityActorState,tick:number) { while(s.queue.length&&tick>=s.queue[0]){s.queue.shift();s.charges++;} }
  updateBuild(id:string,selected:readonly GrowthUpgradeId[],tick:number) {
    const s=this.actorState(id);this.refresh(s,tick);const next=resolveAbility(s.loadout.abilityId,selected,s.loadout.perks);
    if(next.maxCharges>s.maxCharges) {
      // Evolution never refreshes a cooling-down charge or changes an already active cast.
      if(s.charges>0)s.queue.push(tick+next.cooldown);
      else s.queue.push(s.queue[s.queue.length-1]+next.cooldown);
      s.maxCharges=next.maxCharges;
    }
    if(next.maxCharges<s.maxCharges)throw Error('Cannot remove an in-match evolution');
    s.selected=[...selected];
  }
  private reject(id:string,reason:string) { this.world.error(id,reason);return false; }
  private pulseTargets(actor:GadgetActor,def:ResolvedAbility) {
    return this.world.actors().filter(a=>a.alive&&a.team===actor.team&&a.hp<a.maxHp&&dist(a.position,actor.position)<=def.radius&&this.world.visible(actor.position,a.position,false)).sort(byId);
  }
  private linkTarget(actor:GadgetActor,def:ResolvedAbility,aim:CombatPoint) {
    const target=this.world.actors().filter(a=>a.id!==actor.id&&a.alive&&a.team===actor.team&&a.hp<a.maxHp&&dist(a.position,actor.position)<=def.radius
      &&dist(a.position,aim)<=48&&this.world.visible(actor.position,a.position,true)).sort((a,b)=>dist(a.position,aim)-dist(b.position,aim)||byId(a,b))[0];
    return target??(actor.hp<actor.maxHp?actor:undefined);
  }
  use(id:string,aim:CombatPoint,tick:number) {
    const s=this.actorState(id),actor=this.actor(id);this.refresh(s,tick);
    if(!Number.isSafeInteger(tick)||tick<0||!aim||!Number.isFinite(aim.x)||!Number.isFinite(aim.y))return this.reject(id,'invalid_target');
    if(!actor?.alive||actor.protected||s.pending||!this.world.canUse(id))return this.reject(id,'busy');
    if(s.active) {
      if(!s.active.definition.cancellable)return this.reject(id,'busy');
      this.finish(s,'cancelled',tick);return true;
    }
    if(s.charges===0||tick<s.useReadyTick)return this.reject(id,'not_ready');
    const def=resolveAbility(s.loadout.abilityId,s.selected,s.loadout.perks);
    if(def.id==='md_pulse'&&!this.pulseTargets(actor,def).length)return this.reject(id,'no_effect');
    const target=def.id==='md_link'?this.linkTarget(actor,def,aim):undefined;
    if(def.id==='md_link'&&!target)return this.reject(id,'no_effect');
    this.world.interruptWeapon(id);s.pending={definition:def,targetId:target?.id??null,commitTick:tick+def.cast};return true;
  }
  private finish(s:AbilityActorState,reason:'expired'|'cancelled'|'broken'|'death',tick:number) {
    const cast=s.active;if(!cast)return;s.active=null;
    if(reason!=='death')this.world.recoverUntil(s.id,tick+cast.definition.recovery);
    if(!(reason==='expired'&&cast.definition.id==='md_link'&&this.state.healTails.some(t=>t.cast.id===cast.id)))this.world.finished(s.id,cast,reason,tick);
  }
  private commit(s:AbilityActorState,tick:number) {
    const pending=s.pending,actor=this.actor(s.id);if(!pending||tick<pending.commitTick)return;
    s.pending=null;if(!actor?.alive)return;
    const def=pending.definition;
    const target=pending.targetId?this.actor(pending.targetId):undefined;
    if(def.id==='md_pulse'&&!this.pulseTargets(actor,def).length){this.reject(s.id,'no_effect');return;}
    if(def.id==='md_link'&&(!target?.alive||target.team!==actor.team||target.hp>=target.maxHp||dist(actor.position,target.position)>def.radius||!this.world.visible(actor.position,target.position,true))){this.reject(s.id,'no_effect');return;}
    s.charges--;s.queue.push(Math.max(tick,s.queue[s.queue.length-1]??tick)+def.cooldown);s.useReadyTick=tick+def.chargeGap;
    const cast:ActiveAbility={id:`e3-${++this.state.serial}`,definition:structuredClone(def),selected:[...s.selected],targetId:pending.targetId,startTick:tick,endTick:tick+def.duration,
      shieldBudget:healthUnits(def.shieldBudget),absorbed:0,refundUsed:0,refundReady:0,pauseUntil:0,effectiveHealing:false};
    s.active=cast;
    if(def.transfer)this.world.transfer(s.id,def.transfer);
    if(def.id==='md_pulse')for(const ally of this.pulseTargets(actor,def)) {
      const amount=healthUnits(abilityHealing(def,actor.id===ally.id,ally.hp/1000,ally.maxHp/1000,s.selected));
      if(this.world.heal(s.id,ally.id,amount,cast.id)>0)cast.effectiveHealing=true;
    }
    this.world.started(s.id,cast);
  }
  /** Commit zero-cast abilities accepted during this tick's input phase without advancing clocks twice. */
  commitReady(tick:number) { for(const s of this.state.actors)this.commit(s,tick); }
  onDeath(id:string,tick:number) { const s=this.actorState(id);s.pending=null;this.finish(s,'death',tick); }
  onLifeDamage(id:string,tick:number) {
    const s=this.actorState(id),cast=s.active;if(cast?.definition.id!=='md_link')return;
    if(cast.definition.pauseOnDamage)cast.pauseUntil=tick+cast.definition.pauseTicks;
    else this.finish(s,'broken',tick);
  }
  private refund(s:AbilityActorState,tick:number) {
    const cast=s.active;if(!cast||!cast.definition.refundPerHit||tick<cast.refundReady||cast.refundUsed>=cast.definition.refundCap||!s.queue.length)return;
    const amount=Math.min(cast.definition.refundPerHit,cast.definition.refundCap-cast.refundUsed), before=s.queue[0];
    s.queue[0]=Math.min(before,Math.max(cast.startTick+Math.ceil(cast.definition.cooldown*.5),s.queue[0]-amount));
    const difference=before-s.queue[0];
    for(let i=1;i<s.queue.length;i++)s.queue[i]-=difference;
    cast.refundUsed+=difference;cast.refundReady=tick+cast.definition.refundGap;
  }
  onAbsorbed(id:string,amount:number,tick:number) {
    const s=this.actorState(id);if(!s.active||amount<=0)return;s.active.absorbed+=amount;
    if(s.active.definition.id==='tk_barrier')this.refund(s,tick);
    if(s.active.definition.id==='tk_shield'&&s.active.shieldBudget<=0)this.finish(s,'expired',tick);
  }
  onHeadDamage(id:string,tick:number) { const s=this.actorState(id);if(s.active?.definition.id==='sn_focus')this.refund(s,tick); }
  /** Beginning-of-tick phase: ordinary effects expire; final link pulse is retained separately. */
  step(tick:number) {
    if(!Number.isSafeInteger(tick)||tick!==this.state.lastTick+1)throw Error('Ability simulation must advance exactly once per tick');
    if(this.state.healTails.some(t=>!t.notified))throw Error('Finish the previous healing phase before advancing');
    this.state.lastTick=tick;this.state.healTails=[];
    for(const s of this.state.actors) {
      this.refresh(s,tick);const actor=this.actor(s.id);
      if(!actor?.alive){this.onDeath(s.id,tick);continue;}
      if(s.active?.definition.id==='md_link') {
        const target=s.active.targetId?this.actor(s.active.targetId):undefined;
        if(!target?.alive||target.team!==actor.team||dist(actor.position,target.position)>s.active.definition.radius||!this.world.visible(actor.position,target.position,true))this.finish(s,'broken',tick);
      }
      if(s.active&&tick>=s.active.endTick) {
        if(s.active.definition.id==='md_link')this.state.healTails.push({ownerId:s.id,cast:structuredClone(s.active),notified:false});
        this.finish(s,'expired',tick);
      }
      this.commit(s,tick);
    }
  }
  healingSources(tick:number):ContinuousHealSource[] {
    const casts=[...this.state.actors.flatMap(s=>s.active?.definition.id==='md_link'?[{ownerId:s.id,cast:s.active}]:[]),...this.state.healTails];
    return casts.flatMap(({ownerId,cast})=>{
      const actor=this.actor(ownerId),target=cast.targetId?this.actor(cast.targetId):undefined,d=cast.definition;
      if(!actor?.alive||!target?.alive)return [];
      return [{id:cast.id,ownerId,targetId:target.id,amount:healthUnits(abilityHealing(d,ownerId===target.id,target.hp/1000,target.maxHp/1000,cast.selected)),
        interval:d.pulseInterval,firstPulseTick:cast.startTick+d.pulseInterval,lastPulseTick:cast.endTick,
        eligible:tick>=cast.pauseUntil&&target.team===actor.team&&dist(actor.position,target.position)<=d.radius&&this.world.visible(actor.position,target.position,true)}];
    });
  }
  markHealing(sourceId:string,amount:number) {
    if(amount<=0)return;
    for(const s of this.state.actors)if(s.active?.id===sourceId)s.active.effectiveHealing=true;
    for(const tail of this.state.healTails)if(tail.cast.id===sourceId)tail.cast.effectiveHealing=true;
  }
  /** Call after damage and continuous healing. Natural link finish buffs include the final pulse. */
  finishHealingPhase(tick:number) {
    for(const tail of this.state.healTails)if(!tail.notified) {
      tail.notified=true;
      this.world.finished(tail.ownerId,tail.cast,this.actor(tail.ownerId)?.alive?'expired':'death',tick);
    }
  }
  /** True means commands or weapon emission must stay locked at this tick. */
  locks(id:string,tick:number) {
    const s=this.actorState(id),c=s.active,elapsed=c?tick-c.startTick:0;
    return { fire:!!s.pending||!!c&&elapsed<c.definition.fireLock, gadget:!!s.pending||!!c&&elapsed<c.definition.gadgetLock,
      swap:!!s.pending||!!c&&c.definition.swapLock, reload:!!s.pending||!!c&&c.definition.reloadLock,
      moveScale:s.pending ? .75 : c?.definition.speed??1 };
  }
}
