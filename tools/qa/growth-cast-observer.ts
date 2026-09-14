import type { Battle } from '../../src/game/campaign/Battle';

const fresh = () => ({ attempts:0,rejected:0,acceptedCasts:0,acceptedCancel:0,acceptedDetonation:0,
  submitted:0,enqueueRejected:0,coalesced:0,queued:0,evaluatedFromQueue:0,arbitrationSkipped:0,ownerUnavailable:0,unprocessed:0,
  committed:0,revalidationFailed:0,deathInterrupted:0,ownerEndedBeforeCommit:0,damageInterrupted:0,cancelledBeforeCommit:0,
  spentCharges:0,exhaustionTicks:[] as number[],
  rejectedWhileProtected:0,
  rejectionReasons:{} as Record<string,number>,activeEndReasons:{} as Record<string,number> });
/** QA-only observation of evaluated requests. Does not alter state or checkpoint data. */
export function observeGrowthCastRequests(battle: Battle) {
  const runtime=battle.growthV3!;
  const counts = Object.fromEntries([...runtime.participants.keys()].map(id=>[id,{E:fresh(),G:fresh()}]));
  if(battle.frame!==0||[...runtime.participants.keys()].some(id=>runtime.abilities.actorState(id).pending||runtime.abilities.actorState(id).active||runtime.gadgets.inventory(id).cast))throw Error('Install cast observer at match start before casting');
  const tracked=new WeakSet<object>(),settled=new WeakSet<object>();
  const original={abilityStep:runtime.abilities.step,commitReady:runtime.abilities.commitReady,onDeath:runtime.abilities.onDeath,
    gadgetBegin:runtime.gadgets.beginTick,cancelCast:runtime.gadgets.cancelCast,onLifeDamage:runtime.gadgets.onLifeDamage,emit:battle.journal.emit,
    enqueue:runtime.enqueue,step:runtime.step};
  type Channel='E'|'G';
  const queued=new Map<string,{id:string;channel:Channel}>();
  let evaluatingRequest=false;
  let requestError:{id:string;reason?:string}|null=null;
  const reject=(counter:ReturnType<typeof fresh>,reason:string)=>{counter.rejected++;counter.rejectionReasons[reason]=(counter.rejectionReasons[reason]??0)+1;};
  runtime.enqueue=(id,action,aim)=>{
    const channel=action==='skill'?'E':action==='item'?'G':null;
    const result=original.enqueue.call(runtime,id,action,aim);
    if(channel&&counts[id]){
      const c=counts[id][channel],key=`${id}:${channel}`;c.submitted++;
      if(!result)c.enqueueRejected++;
      else if(queued.has(key))c.coalesced++;
      else {c.queued++;queued.set(key,{id,channel});}
    }
    return result;
  };
  runtime.step=(inputs,frames)=>{
    original.step.call(runtime,inputs,frames);
    for(const {id,channel} of queued.values()){
      const actor=battle.actors.find(a=>a.id===id),c=counts[id][channel];
      if(!actor?.life.alive||runtime.participant(id).retired)c.ownerUnavailable++;
      else c.unprocessed++;
    }
    queued.clear();
  };
  const evaluated=(id:string,channel:Channel)=>{
    if(queued.delete(`${id}:${channel}`))counts[id][channel].evaluatedFromQueue++;
  };
  const pending=(id:string,channel:Channel)=>channel==='E'?runtime.abilities.actorState(id).pending:runtime.gadgets.inventory(id).cast;
  const around=(channel:Channel,work:()=>void,reason:'revalidationFailed'|'ownerEndedBeforeCommit'|'damageInterrupted'|'cancelledBeforeCommit')=>{
    const before=Object.keys(counts).map(id=>({id,cast:pending(id,channel),charges:runtime.gadgets.inventory(id).charges}));
    work();
    for(const {id,cast,charges} of before){
      if(!cast||!tracked.has(cast)||settled.has(cast)||pending(id,channel)===cast)continue;
      settled.add(cast);const counter=counts[id][channel],active=runtime.abilities.actorState(id).active;
      if(channel==='E'?!!active:runtime.gadgets.inventory(id).charges<charges){
        counter.committed++;
        if(channel==='G'){
          const remaining=runtime.gadgets.inventory(id).charges;
          counter.spentCharges+=charges-remaining;
          if(remaining===0)counter.exhaustionTicks.push(battle.frame);
        }
      } else {
        const life=battle.actors.find(a=>a.id===id)?.life;
        // Damage callbacks precede the alive=false assignment, but HP is already authoritative.
        if(!life?.alive||life.health<=0)counter.deathInterrupted++;
        else counter[reason]++;
      }
    }
  };
  runtime.abilities.step=tick=>around('E',()=>original.abilityStep.call(runtime.abilities,tick),'revalidationFailed');
  runtime.abilities.commitReady=tick=>around('E',()=>original.commitReady.call(runtime.abilities,tick),'revalidationFailed');
  runtime.abilities.onDeath=(id,tick)=>around('E',()=>original.onDeath.call(runtime.abilities,id,tick),'ownerEndedBeforeCommit');
  runtime.gadgets.beginTick=tick=>around('G',()=>original.gadgetBegin.call(runtime.gadgets,tick),'revalidationFailed');
  runtime.gadgets.cancelCast=id=>around('G',()=>original.cancelCast.call(runtime.gadgets,id),'cancelledBeforeCommit');
  runtime.gadgets.onLifeDamage=id=>around('G',()=>original.onLifeDamage.call(runtime.gadgets,id),'damageInterrupted');
  battle.journal.emit=event=>{
    if(requestError&&event.kind==='error'&&event.actorId===requestError.id)requestError.reason=event.cause??'unknown';
    if(!evaluatingRequest&&event.kind==='error'&&event.cause==='busy'&&event.actorId&&queued.delete(`${event.actorId}:G`))counts[event.actorId].G.arbitrationSkipped++;
    // End events have actor/ability rather than cast ID. All observation begins before the match's first cast.
    if(event.kind==='abilityEnd'&&event.actorId&&counts[event.actorId]){
      const reasons=counts[event.actorId].E.activeEndReasons,key=event.cause??'unknown';reasons[key]=(reasons[key]??0)+1;
    }
    original.emit.call(battle.journal,event);
  };
  const abilityUse=runtime.abilities.use.bind(runtime.abilities),gadgetUse=runtime.gadgets.use.bind(runtime.gadgets);
  runtime.abilities.use=(id,aim,tick)=>{
    evaluated(id,'E');
    const counter=counts[id].E,wasActive=!!runtime.abilities.actorState(id).active;
    counter.attempts++;
    let accepted:boolean;const context={id,reason:undefined as string|undefined};evaluatingRequest=true;requestError=context;
    try {accepted=abilityUse(id,aim,tick);} finally {evaluatingRequest=false;requestError=null;}
    if(!accepted){reject(counter,context.reason??'unreported');if(battle.actors.find(a=>a.id===id)!.life.spawnProtectionFrames>0)counter.rejectedWhileProtected++;}
    else if(wasActive)counter.acceptedCancel++;
    else { counter.acceptedCasts++;const cast=pending(id,'E');if(cast)tracked.add(cast); }
    return accepted;
  };
  runtime.gadgets.use=(id,aim,tick)=>{
    evaluated(id,'G');
    const counter=counts[id].G,charge=runtime.gadgets.entities().some(e=>e.sourceId===id&&e.gadgetId==='as_charge');
    counter.attempts++;
    let accepted:boolean;const context={id,reason:undefined as string|undefined};evaluatingRequest=true;requestError=context;
    try {accepted=gadgetUse(id,aim,tick);} finally {evaluatingRequest=false;requestError=null;}
    if(!accepted){reject(counter,context.reason??'unreported');if(battle.actors.find(a=>a.id===id)!.life.spawnProtectionFrames>0)counter.rejectedWhileProtected++;}
    else if(charge)counter.acceptedDetonation++;
    else { counter.acceptedCasts++;const cast=pending(id,'G');if(cast)tracked.add(cast); }
    return accepted;
  };
  return {
    report:()=>Object.fromEntries(Object.entries(counts).map(([id,channels])=>[id,Object.fromEntries(
      Object.entries(channels).map(([channel,c])=>[channel,{...c,
        activeEndReasons:{...c.activeEndReasons},
        rejectionReasons:{...c.rejectionReasons},
        exhaustionTicks:[...c.exhaustionTicks],
        queuedPending:[...queued.values()].filter(item=>item.id===id&&item.channel===channel).length,
        pendingCasts:c.acceptedCasts-c.committed-c.revalidationFailed-c.deathInterrupted-c.ownerEndedBeforeCommit-c.damageInterrupted-c.cancelledBeforeCommit,
        precommitFailureRate:c.acceptedCasts?(c.revalidationFailed+c.deathInterrupted+c.ownerEndedBeforeCommit+c.damageInterrupted+c.cancelledBeforeCommit)/c.acceptedCasts:null,
        activeCancelRate:c.committed?(c.activeEndReasons.cancelled??0)/c.committed:null,
        invalidRequestRate:c.attempts?c.rejected/c.attempts:null,
        acceptedCancelRequestRate:c.attempts?c.acceptedCancel/c.attempts:null}]))])),
    detach:()=>{runtime.abilities.use=abilityUse;runtime.gadgets.use=gadgetUse;
      runtime.abilities.step=original.abilityStep;runtime.abilities.commitReady=original.commitReady;runtime.abilities.onDeath=original.onDeath;
      runtime.gadgets.beginTick=original.gadgetBegin;runtime.gadgets.cancelCast=original.cancelCast;runtime.gadgets.onLifeDamage=original.onLifeDamage;
      runtime.enqueue=original.enqueue;runtime.step=original.step;
      battle.journal.emit=original.emit;},
  };
}
